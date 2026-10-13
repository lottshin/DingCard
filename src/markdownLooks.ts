// The page furniture of the designed Markdown looks (theme.ts `look`): what
// the running head, folio and date read on each card, and which words and
// faces the look letters itself, so an export embeds their glyphs as well as
// the article's. The looks' styles are in markdownLooks.css.

import type { MarkdownLookId } from './theme'

const PLAYFAIR = "'Playfair Display', serif"
const ARCHIVO = "'Archivo Black', sans-serif"
const SERIF = "'Noto Serif SC', serif"
const KAI = "'LXGW WenKai TC', cursive"

interface MarkdownLookSpec {
  /** How the page number reads, given the page (from 1) and the page count. */
  folio: (page: number, count: number) => string
  /** Today's date in the chrome: a note's timestamp, a journal's entry. */
  date?: (now: Date) => string
  /** Faces the chrome is set in besides the card's own font. */
  fonts?: readonly string[]
  /** Words the stylesheet writes itself (`content:`). */
  words?: string
}

const pad = (value: number, digits = 2) => String(value).padStart(digits, '0')
const digitsFor = (count: number) => Math.max(2, String(count).length)
const fraction = (page: number, count: number) => `${pad(page, digitsFor(count))} / ${pad(count, digitsFor(count))}`
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 1 → 壹, 12 → 拾贰, 30 → 叁拾: the numerals a seal is cut in. */
export function formalNumeral(value: number): string {
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const n = Math.max(1, Math.min(99, Math.floor(value)))
  if (n < 10) return digits[n]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return `${tens === 1 ? '' : digits[tens]}拾${ones === 0 ? '' : digits[ones]}`
}

const LOOKS: Record<MarkdownLookId, MarkdownLookSpec> = {
  column: { folio: fraction, fonts: [PLAYFAIR], words: '“”■' },
  memo: {
    folio: (page, count) => `${page} / ${count}`,
    date: (now) => `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    words: '‹备忘录⋯✓',
  },
  letter: { folio: (page, count) => `第 ${page} 页 · 共 ${count} 页`, fonts: [KAI] },
  night: { folio: (page) => pad(page), fonts: [PLAYFAIR], words: '“' },
  aurora: { folio: fraction },
  doc: { folio: (page, count) => `${page} / ${count}`, words: 'i✓' },
  xuan: { folio: (page) => formalNumeral(page), fonts: [SERIF], words: '「」完零壹贰叁肆伍陆柒捌玖拾' },
  swiss: { folio: (page) => pad(page), fonts: [ARCHIVO], words: '/' },
  journal: {
    folio: (page) => `P.${pad(page)}`,
    date: (now) => `${pad(now.getMonth() + 1)}.${pad(now.getDate())} 周${WEEKDAYS[now.getDay()]}`,
    fonts: [KAI],
    words: '周日一二三四五六✓',
  },
}

export interface MarkdownChromeText {
  folio: string
  date: string | null
}

export function markdownChromeText(look: MarkdownLookId, pageIndex: number, pageCount: number, now = new Date()): MarkdownChromeText {
  const spec = LOOKS[look]
  const count = Number.isFinite(pageCount) && pageCount > 0 ? Math.floor(pageCount) : 1
  const page = Math.min(count, Math.max(1, Number.isFinite(pageIndex) ? Math.floor(pageIndex) + 1 : 1))
  return { folio: spec.folio(page, count), date: spec.date?.(now) ?? null }
}

/**
 * The article's title for a running head: its first `#` or `##` heading,
 * without the Markdown marks. Empty when the article starts without one.
 */
export function markdownRunningTitle(source: string): string {
  const line = source.split('\n').find((candidate) => /^#{1,2}\s+\S/.test(candidate.trim()))
  if (!line) return ''
  return line.trim()
    .replace(/^#{1,2}\s+/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .trim()
}

/**
 * What an export embeds for a card: the faces and the text each one draws.
 * The card's font covers the article plus the chrome (numbers, dates, the
 * look's own words); a chrome face covers only the chrome.
 */
export function markdownFontPlan(look: MarkdownLookId | null, source: string, fontFamily: string): Array<{ fontFamily: string; text: string }> {
  if (!look) return [{ fontFamily, text: source }]
  const spec = LOOKS[look]
  const chrome = `0123456789/·:.年月日第页共 ${spec.words ?? ''}`
  const plan = [{ fontFamily, text: `${source}${chrome}` }]
  for (const face of spec.fonts ?? []) {
    if (face !== fontFamily) plan.push({ fontFamily: face, text: `${markdownRunningTitle(source)}${chrome}` })
  }
  return plan
}
