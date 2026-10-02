// Text fitting without a browser: a conservative estimate of how much room a
// text node's words need in the render page's text box (8px padding, 1.18
// line height unless the node sets its own, pre-wrap with break-word), used
// to pick a font size that keeps filled-in copy inside the box the template
// drew for it. check_document measures the real layout afterwards.

import type { FreeformTextElement } from '../../../src/freeform/types'

const PADDING = 8
const DEFAULT_LINE_HEIGHT = 1.18
/** Copy may shrink to this share of the template's size before it is left to overflow. */
export const MIN_FIT_SCALE = 0.72
/** Slack against glyph-width guesses: assume lines run this much longer. */
const WIDTH_SAFETY = 1.06

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦　-〿—…“”‘’]/
const UPPER = /[A-Z0-9]/

function glyphEm(char: string): number {
  if (WIDE.test(char)) return 1
  if (char === ' ') return 0.3
  if (UPPER.test(char)) return 0.66
  return 0.56
}

/** How wide `text` sets, in ems of its font size (a CJK character is one). */
export function emWidth(text: string): number {
  return [...text].reduce((sum, char) => sum + glyphEm(char), 0)
}

/** Words that wrap as a unit: a run of narrow characters, or one wide character. */
function tokens(paragraph: string): string[] {
  const result: string[] = []
  let word = ''
  for (const char of paragraph) {
    if (WIDE.test(char) || char === ' ') {
      if (word) result.push(word)
      word = ''
      result.push(char)
    } else {
      word += char
    }
  }
  if (word) result.push(word)
  return result
}

function lineCount(
  paragraph: string,
  available: number,
  fontSize: number,
  spacing: number,
  weight: number,
  tight: boolean,
): number {
  // Tight drops the slack: bold widens Latin letters, not CJK, and no line runs long.
  const glyph = (char: string) => glyphEm(char) * fontSize
    * (tight && WIDE.test(char) ? 1 : weight) * (tight ? 1 : WIDTH_SAFETY)
  const width = (token: string) => [...token].reduce((sum, char) => sum + glyph(char) + spacing, 0)
  let lines = 1
  let used = 0
  for (const token of tokens(paragraph)) {
    const size = width(token)
    if (used + size <= available) {
      used += size
      continue
    }
    if (token === ' ') continue
    if (size <= available) {
      lines += 1
      used = size
      continue
    }
    // A word wider than the line breaks wherever it runs out (break-word).
    for (const char of token) {
      const charSize = width(char)
      if (used + charSize > available && used > 0) {
        lines += 1
        used = 0
      }
      used += charSize
    }
  }
  return lines
}

/**
 * The room `text` needs at `fontSize` in `node`'s box: lines along the flow
 * and their total depth. `tight` drops the safety slack, for a count close to
 * how the words really lay out rather than the most they might need.
 */
export function measureText(
  node: FreeformTextElement,
  text: string,
  fontSize: number,
  tight = false,
): { lines: number; depth: number } {
  const along = (node.vertical ? node.height : node.width) - PADDING * 2
  const spacing = node.letterSpacing ?? 0
  const weight = node.fontWeight === 'bold' ? 1.04 : 1
  const lines = text.split('\n').reduce(
    (sum, paragraph) => sum + lineCount(paragraph, Math.max(1, along), fontSize, spacing, weight, tight),
    0,
  )
  return { lines, depth: lines * fontSize * (node.lineHeight ?? DEFAULT_LINE_HEIGHT) }
}

/**
 * Whether `text` fits `node`'s box at `fontSize`. Templates sometimes draw
 * boxes a hair tighter than their own sample's line box (the glyphs still
 * show); `sample` lends the box that much room, so copy no longer than the
 * sample is never shrunk. The sample is measured tight: it lends only the
 * lines it really fills, never one the box can't show.
 */
export function textFits(node: FreeformTextElement, text: string, fontSize: number, sample?: string): boolean {
  const across = (node.vertical ? node.width : node.height) - PADDING * 2
  const room = sample === undefined ? across : Math.max(across, measureText(node, sample, node.fontSize, true).depth)
  return measureText(node, text, fontSize).depth <= room + 0.5
}

/**
 * The largest font size, from the node's own down to MIN_FIT_SCALE of it,
 * at which `text` fits the box; null when even the smallest doesn't.
 */
export function fittingFontSize(
  node: FreeformTextElement,
  text: string,
  sample?: string,
  minScale = MIN_FIT_SCALE,
): number | null {
  const floor = Math.max(10, Math.floor(node.fontSize * minScale))
  for (let size = node.fontSize; size >= floor; size -= 1) {
    if (textFits(node, text, size, sample)) return size
  }
  return null
}

/** Characters a line may not start with (closing punctuation) or end with (opening marks). */
const NO_LINE_START = /^[，。、；：！？）」』》〉,.;:!?)\]}%…—]/
const NO_LINE_END = /[（「『《〈(\[{“‘]$/
const PAUSE = /[，、；：,;:]$/

/**
 * A heading that takes two or three lines, broken where they come out most
 * even ("先把睡眠时间\n固定下来" rather than a lone "下来" under a full line):
 * at word boundaries, never starting a line with closing punctuation or ending
 * one with an opening mark, longer lines first on a tie, and preferring breaks
 * after a pause (，、；：). A heading with its own line breaks, one that fits a
 * line, or one that needs more than three is left as it is.
 */
export function balancedHeading(node: FreeformTextElement, text: string, fontSize: number): string {
  if (text.includes('\n') || node.vertical) return text
  const lines = measureText(node, text, fontSize, true).lines
  if (lines < 2 || lines > 3) return text
  // Room for the longest line, kept a little short of the box so it never wraps again.
  const available = (node.width - PADDING * 2) / WIDTH_SAFETY
  const spacing = node.letterSpacing ?? 0
  const width = (part: string) => [...part].reduce((sum, char) => sum + glyphEm(char) * fontSize + spacing, 0)
  const words = [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(text)].map((part) => part.segment)
  if (words.length < lines || words.length > 40) return text
  const splits: number[][] = []
  for (let first = 1; first < words.length; first += 1) {
    if (lines === 2) splits.push([first])
    else for (let second = first + 1; second < words.length; second += 1) splits.push([first, second])
  }
  let best = text
  let bestScore = Infinity
  for (const cuts of splits) {
    const bounds = [0, ...cuts, words.length]
    const parts = bounds.slice(1).map((end, index) => words.slice(bounds[index], end).join('').trim())
    if (parts.some((part, index) => !part || (index > 0 && NO_LINE_START.test(part)) || (index < parts.length - 1 && NO_LINE_END.test(part)))) continue
    const widths = parts.map(width)
    const longest = Math.max(...widths)
    if (longest > available) continue
    // Evenest wins: the longest line first, then how ragged the rest are. A later line longer
    // than the one before it costs a little, a pause at a break earns a little.
    const ragged = widths.reduce((sum, value) => sum + ((longest - value) / longest) ** 2, 0)
    const rising = widths.slice(1).filter((value, index) => value > widths[index]).length
    const pauses = parts.slice(0, -1).filter((part) => PAUSE.test(part)).length
    const score = longest + (ragged * 0.5 + rising * 0.25 - pauses * 0.5) * fontSize
    if (score < bestScore) {
      best = parts.join('\n')
      bestScore = score
    }
  }
  return best
}
