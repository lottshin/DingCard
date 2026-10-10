// The browser half of the release eval: every brief composes (proved offline
// by eval.test.ts), then check_document counts its issues and the first page
// of each result becomes one tile of a contact sheet. Run it with
// `npm run eval` inside mcp/ (a built dist/ and system Chrome are needed);
// it writes report.json and sheet.html into mcp/eval-out/.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { checkDocument } from '../render/check'
import { renderPreviews } from '../render/renderer'
import { composeDeck } from '../core/compose'
import { createDocumentFromOutline } from '../core/outline'
import { composePoster } from '../core/poster'
import type { FreeformDocument } from '../../../src/freeform/types'
import { EVAL_PROMPTS, type EvalPrompt } from './prompts'

function composeOf(prompt: EvalPrompt): { ok: true; document: FreeformDocument } {
  const composed = prompt.kind === 'deck'
    ? composeDeck(prompt.templateId, prompt.content)
    : prompt.kind === 'outline'
      ? createDocumentFromOutline(prompt.outline, prompt.templateId)
      : composePoster(prompt.templateId, prompt.content)
  expect(composed.ok).toBe(true)
  if (!composed.ok) throw new Error(composed.error)
  return { ok: true, document: composed.document }
}

test(
  'eval: check every brief and draw the contact sheet',
  async () => {
    const outDir = path.resolve(__dirname, '../../eval-out')
    mkdirSync(outDir, { recursive: true })
    const rows: Array<{
      id: string
      kind: EvalPrompt['kind']
      templateId: string
      pages: number
      issueCount: number
      byKind: Record<string, number>
      thumb: string
    }> = []
    for (const prompt of EVAL_PROMPTS) {
      const { document } = composeOf(prompt)
      const checked = await checkDocument(document)
      expect(checked.ok).toBe(true)
      if (!checked.ok) throw new Error(checked.error)
      const previews = await renderPreviews(document)
      expect(previews.length).toBeGreaterThan(0)
      rows.push({
        id: prompt.id,
        kind: prompt.kind,
        templateId: prompt.templateId,
        pages: document.slides.length,
        issueCount: checked.issues.length,
        byKind: Object.fromEntries(Object.entries(checked.summary.byKind)),
        thumb: previews[0].dataUrl,
      })
    }
    const totalIssues = rows.reduce((sum, row) => sum + row.issueCount, 0)
    writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), items: rows.map(({ thumb, ...rest }) => rest), totalIssues }, null, 2)}\n`)
    const tiles = rows.map((row) => `
      <figure class="tile">
        <img src="${row.thumb}" alt="${row.id}">
        <figcaption><b>${row.id}</b><span>${row.pages} 页 · ${row.issueCount} 个问题</span></figcaption>
      </figure>`).join('')
    writeFileSync(path.join(outDir, 'sheet.html'), `<!doctype html><html><head><meta charset="utf-8"><title>叮卡评测总表</title><style>
      body { font-family: -apple-system, "PingFang SC", sans-serif; margin: 24px; background: #f6f6f7; }
      h1 { font-size: 20px; } .meta { color: #52525b; margin-bottom: 20px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
      .tile { margin: 0; background: #fff; border-radius: 12px; padding: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
      .tile img { width: 100%; display: block; border-radius: 8px; }
      .tile figcaption { padding: 6px 4px 2px; display: flex; justify-content: space-between; font-size: 12px; color: #3f3f46; }
      .tile span { color: #71717a; }
    </style></head><body>
      <h1>叮卡评测总表</h1>
      <p class="meta">${rows.length} 个题目 · 共 ${totalIssues} 个问题（check_document）</p>
      <div class="grid">${tiles}</div>
    </body></html>\n`)
    // The point of the run is the artefacts; the assertion keeps the count honest.
    expect(rows).toHaveLength(EVAL_PROMPTS.length)
  },
  900_000,
)
