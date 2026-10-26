// check_document: lay a deck out the way the export does and list what a
// reader would trip over. With fix, overflowing text is set to the size the
// render page found it fits at, and the deck is checked again.

import { reduceFreeformDocument } from '../../../src/freeform/document'
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import type { FreeformDocument } from '../../../src/freeform/types'
import { layoutIssues, type LayoutIssue, type LayoutIssueKind } from '../core/layoutIssues'
import { inspectLayout } from './renderer'
import type { FontFallback } from './webFonts'

export interface CheckSuccess {
  ok: true
  issues: LayoutIssue[]
  summary: {
    slideCount: number
    issueCount: number
    byKind: Partial<Record<LayoutIssueKind, number>>
  }
  /** Present with fix: the deck with overflowing text resized and near-misses snapped, and what changed. */
  document?: FreeformDocument
  fixed?: Array<{ page: number; slideId: string; node: string | null; fontSize: number }>
  /** Present with fix: the edges that were snapped onto their neighbours. */
  snapped?: Array<{ page: number; slideId: string; node: string | null; axis: 'x' | 'y'; from: number; to: number }>
  /** Present when web fonts couldn't be loaded: the words were measured in a system font. */
  fonts?: FontFallback
}

export type CheckResult = CheckSuccess | { ok: false; error: string }

function summarize(document: FreeformDocument, issues: LayoutIssue[]): CheckSuccess['summary'] {
  const byKind: Partial<Record<LayoutIssueKind, number>> = {}
  for (const issue of issues) byKind[issue.kind] = (byKind[issue.kind] ?? 0) + 1
  return { slideCount: document.slides.length, issueCount: issues.length, byKind }
}

export async function checkDocument(value: unknown, options: { fix?: boolean } = {}): Promise<CheckResult> {
  const document = normalizeFreeformDocument(value)
  if (!document) return { ok: false, error: '文档未通过自由画布文档校验，先用 validate_document 看原因。' }
  try {
    const inspected = await inspectLayout(document)
    const issues = layoutIssues(document, inspected.slides)
    const fonts = inspected.fonts ? { fonts: inspected.fonts } : {}
    if (!options.fix) return { ok: true, issues, summary: summarize(document, issues), ...fonts }

    let fixedDocument = document
    const fixed: NonNullable<CheckSuccess['fixed']> = []
    const snapped: NonNullable<CheckSuccess['snapped']> = []
    for (const issue of issues) {
      if (issue.kind === 'text-overflow' && issue.fitFontSize && issue.path) {
        const next = reduceFreeformDocument(fixedDocument, {
          type: 'node/update-style',
          slideId: issue.slideId,
          updates: [{ path: issue.path, patch: { fontSize: issue.fitFontSize } }],
        })
        if (next === fixedDocument) continue
        fixedDocument = next
        fixed.push({ page: issue.page, slideId: issue.slideId, node: issue.node, fontSize: issue.fitFontSize })
        continue
      }
      // Near-miss edges snap onto their neighbour, one axis per move.
      if (issue.kind === 'misalignment' && issue.alignment) {
        for (const move of issue.alignment.moves) {
          const patch = issue.alignment.axis === 'x' ? { x: move.to } : { y: move.to }
          const next = reduceFreeformDocument(fixedDocument, {
            type: 'node/update-geometry',
            slideId: issue.slideId,
            updates: [{ path: move.path, patch }],
          })
          if (next === fixedDocument) continue
          fixedDocument = next
          snapped.push({
            page: issue.page,
            slideId: issue.slideId,
            node: move.nodeId,
            axis: issue.alignment.axis,
            from: Math.round(move.from),
            to: Math.round(move.to),
          })
        }
      }
    }
    if (fixed.length === 0 && snapped.length === 0) {
      return { ok: true, issues, summary: summarize(document, issues), document, fixed, snapped, ...fonts }
    }
    const again = await inspectLayout(fixedDocument)
    const remaining = layoutIssues(fixedDocument, again.slides)
    return {
      ok: true,
      issues: remaining,
      summary: summarize(fixedDocument, remaining),
      document: fixedDocument,
      fixed,
      ...(snapped.length > 0 ? { snapped } : {}),
      ...(again.fonts ? { fonts: again.fonts } : {}),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
