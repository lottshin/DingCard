// check_document: lay a deck out the way the export does and list what a
// reader would trip over. With fix, overflowing text is set to the size the
// render page found it fits at, and the deck is checked again.

import { reduceFreeformDocument } from '../../../src/freeform/document'
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import type { FreeformDocument } from '../../../src/freeform/types'
import { layoutIssues, type LayoutIssue, type LayoutIssueKind } from '../core/layoutIssues'
import { inspectLayout } from './renderer'

export interface CheckSuccess {
  ok: true
  issues: LayoutIssue[]
  summary: {
    slideCount: number
    issueCount: number
    byKind: Partial<Record<LayoutIssueKind, number>>
  }
  /** Present with fix: the deck with overflowing text resized, and what changed. */
  document?: FreeformDocument
  fixed?: Array<{ page: number; slideId: string; node: string | null; fontSize: number }>
}

export type CheckResult = CheckSuccess | { ok: false; error: string }

function summarize(document: FreeformDocument, issues: LayoutIssue[]): CheckSuccess['summary'] {
  const byKind: Partial<Record<LayoutIssueKind, number>> = {}
  for (const issue of issues) byKind[issue.kind] = (byKind[issue.kind] ?? 0) + 1
  return { slideCount: document.slides.length, issueCount: issues.length, byKind }
}

export async function checkDocument(value: unknown, options: { fix?: boolean } = {}): Promise<CheckResult> {
  const document = normalizeFreeformDocument(value)
  if (!document) return { ok: false, error: '文档未通过自由画布 v15 校验，先用 validate_document 看原因。' }
  try {
    const issues = layoutIssues(document, await inspectLayout(document))
    if (!options.fix) return { ok: true, issues, summary: summarize(document, issues) }

    let fixedDocument = document
    const fixed: NonNullable<CheckSuccess['fixed']> = []
    for (const issue of issues) {
      if (issue.kind !== 'text-overflow' || !issue.fitFontSize || !issue.path) continue
      const next = reduceFreeformDocument(fixedDocument, {
        type: 'node/update-style',
        slideId: issue.slideId,
        updates: [{ path: issue.path, patch: { fontSize: issue.fitFontSize } }],
      })
      if (next === fixedDocument) continue
      fixedDocument = next
      fixed.push({ page: issue.page, slideId: issue.slideId, node: issue.node, fontSize: issue.fitFontSize })
    }
    if (fixed.length === 0) return { ok: true, issues, summary: summarize(document, issues), document, fixed }
    const remaining = layoutIssues(fixedDocument, await inspectLayout(fixedDocument))
    return { ok: true, issues: remaining, summary: summarize(fixedDocument, remaining), document: fixedDocument, fixed }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
