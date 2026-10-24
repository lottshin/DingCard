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
/** A CJK character sets in one em, bold or not: measured close, it gets only this much slack. */
const WIDE_SLACK = 1.01

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
/** A pause a title is read in two halves at (周末去哪儿：城郊三条徒步线): the line breaks after it if it can. */
const STRONG_PAUSE = /[：；！？—｜:;!?|]$/
/** A dot set between a title's halves (年终好价节 · 全场五折起): a line that breaks at it drops it. */
const SEPARATOR_START = /^[·・•]\s*/
const SEPARATOR_END = /\s*[·・•]$/

/** A title's lines without the separator dots they break at, and how many breaks fell at one. */
function unseparated(parts: readonly string[]): { lines: string[]; separated: number } {
  let separated = 0
  const lines = parts.map((part, index) => {
    let line = part
    if (index > 0 && SEPARATOR_START.test(line)) {
      line = line.replace(SEPARATOR_START, '')
      separated += 1
    }
    if (index < parts.length - 1 && SEPARATOR_END.test(line)) {
      line = line.replace(SEPARATOR_END, '')
      separated += 1
    }
    return line
  })
  return { lines, separated }
}

/**
 * A heading that takes two or three lines (up to `maxLines`), broken where
 * they come out most even ("先把睡眠时间\n固定下来" rather than a lone "下来"
 * under a full line): at word boundaries, never starting a line with closing
 * punctuation or ending one with an opening mark, lines that break well
 * first (breaksWell), longer lines first on a tie, and preferring breaks
 * after a pause (，、；：). A heading with its own line breaks, one that fits
 * a line, one that needs more lines, or one with no break between words that
 * fits is left as it is.
 */
export function balancedHeading(
  node: FreeformTextElement,
  text: string,
  fontSize: number,
  { maxLines = 3, close = false }: { maxLines?: number; close?: boolean } = {},
): string {
  if (text.includes('\n') || node.vertical) return text
  const lines = measureText(node, text, fontSize, true).lines
  if (lines < 2 || lines > maxLines) return text
  // Room for the longest line, kept a little short of the box so it never wraps again;
  // measured `close`, a CJK character is the em it sets in and only Latin gets the slack.
  const spacing = node.letterSpacing ?? 0
  const weight = node.fontWeight === 'bold' ? 1.04 : 1
  const available = close ? node.width - PADDING * 2 : (node.width - PADDING * 2) / WIDTH_SAFETY
  const glyph = close
    ? (char: string) => (WIDE.test(char) ? fontSize * WIDE_SLACK : glyphEm(char) * fontSize * weight * WIDTH_SAFETY)
    : (char: string) => glyphEm(char) * fontSize
  const width = (part: string) => [...part].reduce((sum, char) => sum + glyph(char) + spacing, 0)
  const words = displayWords(text)
  if (words.length < lines || words.length > 40) return text
  // Every way to cut the words into that many lines, no line but the last wider than the room.
  const splits: number[][] = []
  const cut = (start: number, cuts: number[]) => {
    if (cuts.length === lines - 1) {
      splits.push(cuts)
      return
    }
    for (let end = start + 1; end <= words.length - (lines - 1 - cuts.length); end += 1) {
      if (width(words.slice(start, end).join('').trim()) > available) break
      cut(end, [...cuts, end])
    }
  }
  cut(0, [])
  let best = text
  let bestScore = Infinity
  let bestWell = false
  for (const cuts of splits) {
    const bounds = [0, ...cuts, words.length]
    const { lines: parts, separated } = unseparated(bounds.slice(1).map((end, index) => words.slice(bounds[index], end).join('').trim()))
    if (parts.some((part, index) => !part || (index > 0 && NO_LINE_START.test(part)) || (index < parts.length - 1 && NO_LINE_END.test(part)))) continue
    const widths = parts.map(width)
    const longest = Math.max(...widths)
    if (longest > available) continue
    // Lines that break well first (breaksWell: no 的 starting one, no 每 or 越 ending one, no
    // lone character); then the evenest: the longest line first, then how ragged the rest
    // are. A later line longer than the one before it costs a little, a pause at a break
    // earns a little.
    const well = breaksWell(parts)
    const ragged = widths.reduce((sum, value) => sum + ((longest - value) / longest) ** 2, 0)
    const rising = widths.slice(1).filter((value, index) => value > widths[index]).length
    const pauses = parts.slice(0, -1).filter((part) => PAUSE.test(part)).length + separated
    const strong = parts.slice(0, -1).filter((part) => STRONG_PAUSE.test(part)).length
    const score = longest + (ragged * 0.5 + rising * 0.25 - pauses * 0.5 - strong * 1) * fontSize
    if ((well && !bestWell) || (well === bestWell && score < bestScore)) {
      best = parts.join('\n')
      bestScore = score
      bestWell = well
    }
  }
  return best
}

/**
 * A paragraph set at display size (a statement's claim, a closing sentence):
 * on two lines it breaks after the pause nearest its middle when both halves
 * fit a line, as a reader would read it out; otherwise as a heading breaks.
 */
export function balancedSentence(node: FreeformTextElement, text: string, fontSize: number): string {
  if (text.includes('\n') || node.vertical) return text
  if (measureText(node, text, fontSize, true).lines !== 2) return balancedHeading(node, text, fontSize)
  const available = (node.width - PADDING * 2) / WIDTH_SAFETY
  const spacing = node.letterSpacing ?? 0
  const width = (part: string) => [...part].reduce((sum, char) => sum + glyphEm(char) * fontSize + spacing, 0)
  const chars = [...text]
  let best: { at: number; distance: number } | null = null
  for (let index = 0; index < chars.length - 1; index += 1) {
    if (!/[，、；：。！？,;:!?]/.test(chars[index])) continue
    const first = chars.slice(0, index + 1).join('')
    const second = chars.slice(index + 1).join('').trim()
    if (!second || NO_LINE_START.test(second) || width(first) > available || width(second) > available) continue
    const distance = Math.abs(index + 1 - chars.length / 2)
    if (!best || distance < best.distance) best = { at: index + 1, distance }
  }
  return best ? `${chars.slice(0, best.at).join('')}\n${chars.slice(best.at).join('').trim()}` : balancedHeading(node, text, fontSize)
}

/** Particles that end the phrase before them: a display line doesn't start with one. */
const NO_DISPLAY_LINE_START = /^[的了着过地得们吗呢吧啊之]/
/** Words that lead into the one after them: a display line doesn't end with one. */
const NO_DISPLAY_LINE_END = /(?:第|和|与|及|或|在|从|把|被|对|向|为|每|越|最|更)$/
/** Characters that end a word as a suffix (开发者, 设计师, 会员日, 读书角, 作品集) or a verb's result (固定成). */
const SUFFIX = /^[者性化们庆节季日角师员家集线液界论感式型率度区馆店室站成]$/
/** Measure words and units of time: they end the number, 第 or 每 before them (第一年, 每个月, 2026年). */
const MEASURE = /^[年月日天周次个条元岁位种步章期届号页本张名家只道句篇课]$/
const COUNTED = /^(?:[第每]|[0-9一二三四五六七八九十百千万两几]+$)/
/** Characters that are words on their own (的, 和, 把, 都, 越): they don't pair with a neighbour. */
const ALONE = /^[的了着过地得吗呢吧啊之和与及或在从把被对向为都也就才又再还很越更最不没]$/
const IDEOGRAPH = /^\p{Script=Han}$/u

/** Whether lines break where a line may: none starts with a closing mark or ends with an opening one. */
function breaksAtAll(parts: readonly string[]): boolean {
  return parts.every((part, index) => (
    (index === 0 || !NO_LINE_START.test(part)) && (index === parts.length - 1 || !NO_LINE_END.test(part))
  ))
}

/**
 * Whether the lines of a display title break well: as they may at all
 * (breaksAtAll), none starting with a particle, none ending in a word that
 * leads into the next, and none of several a lone character.
 */
function breaksWell(parts: readonly string[]): boolean {
  return breaksAtAll(parts) && parts.every((part, index) => (
    (index === 0 || !NO_DISPLAY_LINE_START.test(part))
    && (index === parts.length - 1 || !NO_DISPLAY_LINE_END.test(part))
    && (parts.length === 1 || !IDEOGRAPH.test(part))
  ))
}

/**
 * A title's words as a display break sees them. The segmenter cuts Chinese
 * finer than a reader does (乔 | 迁 | 小 | 聚, 开发 | 者, 每 | 个 | 月), so a
 * suffix joins the word before it, a measure word the number before it, and
 * characters left on their own pair up, as most words are two characters
 * (乔迁 | 小聚, 开发者, 每个月, 全场), all but those that are words by
 * themselves (的 | 栏目, not 的栏 | 目).
 */
export function displayWords(text: string): string[] {
  const joined: string[] = []
  for (const { segment } of new Intl.Segmenter('zh', { granularity: 'word' }).segment(text)) {
    const previous = joined[joined.length - 1]
    const suffix = previous !== undefined && SUFFIX.test(segment) && [...previous].length >= 2 && [...previous].every((char) => IDEOGRAPH.test(char))
    const counted = previous !== undefined && MEASURE.test(segment) && COUNTED.test(previous)
    if (suffix || counted) joined[joined.length - 1] = previous + segment
    else joined.push(segment)
  }
  const words: string[] = []
  let run: string[] = []
  const flush = () => {
    for (let index = 0; index < run.length; index += 2) words.push(run.slice(index, index + 2).join(''))
    run = []
  }
  for (const word of joined) {
    if (IDEOGRAPH.test(word) && !ALONE.test(word)) run.push(word)
    else {
      flush()
      words.push(word)
    }
  }
  flush()
  return words
}

/**
 * A display title set to fill its box: the largest size, from `maxSize` down
 * to the node's own, at which it breaks at word boundaries into lines that
 * fit (up to `maxLines`, a line more only when it buys a tenth more size)
 * and break well (breaksWell, or the `rule` given). A break after a strong
 * pause (：！？) counts as a fifth more size and may go a tenth below the
 * box's own. A title with its own line breaks keeps them. Null when no break
 * reaches the box's own size: the usual fit applies.
 */
export function fillingHeading(
  node: FreeformTextElement,
  text: string,
  maxSize: number,
  maxLines = 3,
  { rule = breaksWell, close = false }: { rule?: (parts: readonly string[]) => boolean; close?: boolean } = {},
): { fontSize: number; text: string } | null {
  if (node.vertical || maxSize <= node.fontSize) return null
  const along = node.width - PADDING * 2
  const room = node.height - PADDING * 2
  const lineHeight = node.lineHeight ?? DEFAULT_LINE_HEIGHT
  const spacing = node.letterSpacing ?? 0
  const weight = node.fontWeight === 'bold' ? 1.04 : 1
  // Ems and characters of a line, measured as textFits measures (with its
  // slack), or `close` as balancedHeading can, so its widest size is
  // (room - spacing) / ems.
  const span = (part: string) => {
    const chars = [...part]
    const ems = chars.reduce((sum, char) => sum + (close && WIDE.test(char) ? WIDE_SLACK : glyphEm(char) * weight * WIDTH_SAFETY), 0)
    return { ems, chars: chars.length }
  }
  const widest = (parts: readonly string[]) => Math.min(...parts.map((part) => {
    const { ems, chars } = span(part)
    return ems > 0 ? (along - spacing * chars) / ems : Infinity
  }))
  const tall = (lines: number) => room / (lines * lineHeight)
  const candidates: Array<{ fontSize: number; text: string; lines: number; score: number }> = []
  if (text.includes('\n')) {
    const parts = text.split('\n')
    const fontSize = Math.min(maxSize, widest(parts), tall(parts.length))
    if (fontSize >= node.fontSize) candidates.push({ fontSize, text, lines: parts.length, score: fontSize })
  } else {
    const words = displayWords(text)
    if (words.length > 40) return null
    for (let lines = 1; lines <= Math.min(maxLines, words.length); lines += 1) {
      const splits: Array<{ fontSize: number; text: string; score: number }> = []
      const visit = (start: number, left: number, parts: string[]) => {
        if (left === 1) {
          const last = words.slice(start).join('').trim()
          const { lines: all, separated } = unseparated([...parts, last])
          if (all.some((part) => !part) || !rule(all)) return
          const fontSize = Math.min(maxSize, widest(all), tall(all.length))
          const strong = all.slice(0, -1).filter((part) => STRONG_PAUSE.test(part)).length
          if (fontSize < node.fontSize * (strong > 0 ? 0.9 : 1)) return
          // A break at a strong pause counts a fifth more; on a tie in size the
          // evener lines win, then a break after a pause, then longer lines
          // first (周年庆 / 全场, not 周年 / 庆全场).
          const ems = all.map((part) => span(part).ems)
          const ragged = ems.reduce((sum, value) => sum + ((Math.max(...ems) - value) / Math.max(...ems)) ** 2, 0)
          const pauses = all.slice(0, -1).filter((part) => PAUSE.test(part)).length + separated
          const rising = ems.slice(1).filter((value, index) => value > ems[index]).length
          splits.push({ fontSize, text: all.join('\n'), score: fontSize * (1 - ragged * 0.02 + pauses * 0.02 + strong * 0.2 - rising * 0.002) })
          return
        }
        for (let end = start + 1; end <= words.length - left + 1; end += 1) {
          const part = words.slice(start, end).join('').trim()
          // A longer line only sets smaller: one under the smallest size ends the search.
          if (part && widest([part]) < node.fontSize * 0.9) break
          if (part) visit(end, left - 1, [...parts, part])
        }
      }
      visit(0, lines, [])
      const best = splits.reduce<(typeof splits)[number] | null>((top, split) => (!top || split.score > top.score ? split : top), null)
      if (best) candidates.push({ fontSize: best.fontSize, text: best.text, lines, score: best.score })
    }
  }
  let chosen: (typeof candidates)[number] | null = null
  for (const candidate of candidates) {
    if (!chosen || candidate.score > chosen.score * (candidate.lines > chosen.lines ? 1.1 : 1)) chosen = candidate
  }
  if (!chosen) return null
  return { fontSize: Math.floor(chosen.fontSize), text: chosen.text }
}

/** The most lines a title is broken into between words. */
const TITLE_MAX_LINES = 6

/**
 * A title broken between words: as balancedHeading breaks it at `fontSize`,
 * in up to six lines measured close (a CJK line as wide as it sets, so no
 * title is set smaller than the line it fits); when no break there fits or
 * breaks well (breaksWell), at the largest size down to `floor` at which one
 * does (fillingHeading), with a line more if it needs one and the box has
 * the depth, so no word is split across two lines. When nothing breaks well
 * even at `floor`, the largest size that breaks between words at all; as it
 * is when it fits a line, has its own breaks, or breaks between words nowhere.
 */
export function wordBrokenHeading(
  node: FreeformTextElement,
  text: string,
  fontSize: number,
  floor: number,
): { fontSize: number; text: string } {
  const broken = balancedHeading(node, text, fontSize, { maxLines: TITLE_MAX_LINES, close: true })
  if (text.includes('\n') || node.vertical || floor >= fontSize) return { fontSize, text: broken }
  if (broken !== text && breaksWell(broken.split('\n'))) return { fontSize, text: broken }
  const lines = measureText(node, text, fontSize, true).lines
  if (lines < 2) return { fontSize, text }
  // fillingHeading lets a break at a strong pause go a tenth under its floor: not this one.
  const step = (rule: (parts: readonly string[]) => boolean) => {
    const set = fillingHeading({ ...node, fontSize: floor }, text, fontSize, Math.min(TITLE_MAX_LINES, lines + 1), { rule, close: true })
    return set && set.fontSize >= floor ? set : null
  }
  const stepped = step(breaksWell)
  if (stepped) return stepped
  if (broken !== text) return { fontSize, text: broken }
  // Nothing breaks well down to the floor: the largest size that breaks between words at all.
  return step(breaksAtAll) ?? { fontSize, text }
}

/** `node`'s box as deep as its sample's lines when they run deeper: the room textFits lends it. */
export function withSampleRoom(node: FreeformTextElement, sample: string | undefined): FreeformTextElement {
  if (sample === undefined || node.vertical) return node
  const depth = measureText(node, sample, node.fontSize, true).depth + PADDING * 2
  return depth > node.height ? { ...node, height: depth } : node
}

/** Titles joined with " · ", a line broken only between titles where the next would not fit. */
export function contentsLines(node: FreeformTextElement, titles: readonly string[]): string {
  const lines: string[] = []
  for (const title of titles) {
    const joined = lines.length > 0 ? `${lines[lines.length - 1]} · ${title}` : title
    if (lines.length > 0 && measureText(node, joined, node.fontSize, true).lines <= 1) lines[lines.length - 1] = joined
    else lines.push(title)
  }
  return lines.join('\n')
}

