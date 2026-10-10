// The eval set's own guard: every brief must still compose. This is the
// offline half of the release eval (see eval.render.test.ts for the browser
// half); when a generator change breaks a brief, this fails before release.

import { describe, expect, test } from 'vitest'
import { composeDeck } from '../core/compose'
import { createDocumentFromOutline } from '../core/outline'
import { composePoster } from '../core/poster'
import { EVAL_PROMPTS, type EvalPrompt } from './prompts'

function composeOf(prompt: EvalPrompt): { ok: boolean; error?: string; document?: unknown } {
  if (prompt.kind === 'deck') return composeDeck(prompt.templateId, prompt.content)
  if (prompt.kind === 'outline') return createDocumentFromOutline(prompt.outline, prompt.templateId)
  return composePoster(prompt.templateId, prompt.content)
}

describe('the release eval set', () => {
  test('is thirty briefs with unique ids and a deliberate mix', () => {
    expect(EVAL_PROMPTS).toHaveLength(30)
    const ids = new Set(EVAL_PROMPTS.map((prompt) => prompt.id))
    expect(ids.size).toBe(EVAL_PROMPTS.length)
    const byKind = (kind: EvalPrompt['kind']) => EVAL_PROMPTS.filter((prompt) => prompt.kind === kind).length
    expect(byKind('deck')).toBeGreaterThanOrEqual(10)
    expect(byKind('outline')).toBeGreaterThanOrEqual(2)
    expect(byKind('poster')).toBeGreaterThanOrEqual(15)
    // The new data elements have their seats at the table.
    const dataElementPages = EVAL_PROMPTS.flatMap((prompt) => (
      prompt.kind === 'deck' && typeof prompt.content === 'object' && prompt.content !== null
        ? Object.values(prompt.content as Record<string, unknown>)
        : []
    )).flatMap((value) => (Array.isArray(value) ? value : []))
      .filter((page): page is Record<string, unknown> => typeof page === 'object' && page !== null)
      .filter((page) => ['chart', 'table', 'timeline', 'progress'].some((key) => key in page))
    expect(dataElementPages.length).toBeGreaterThanOrEqual(5)
    // An outline brief carries a Markdown table.
    expect(EVAL_PROMPTS.some((prompt) => prompt.kind === 'outline' && prompt.outline.includes('| --- |'))).toBe(true)
  })

  test('every brief still composes a document', () => {
    const broken: string[] = []
    for (const prompt of EVAL_PROMPTS) {
      const composed = composeOf(prompt) as { ok: boolean; error?: string }
      if (!composed.ok) broken.push(`${prompt.id}: ${composed.error}`)
    }
    expect(broken).toEqual([])
  })
})
