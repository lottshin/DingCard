// Cutting a single Markdown block that alone is taller than a page.
//
// paginate() places whole blocks. When one block by itself is taller than the
// content area, the old behaviour gave it a page of its own and let the card's
// `overflow: hidden` clip whatever hung below — content silently disappeared
// from the exported cards. These helpers cut such a block at a *measured*
// boundary instead: a binary search over candidate cut points where every
// candidate is verified against real DOM layout through the paginator's
// probe, so the split follows the actual font, card width and look rather
// than a character-count guess.
//
// Text (paragraph, heading, blockquote, code) is cut between graphemes — at a
// newline for code, preferring a nearby space or punctuation mark for prose —
// with every ancestor element of the cut repeated on both sides, so
// `<p>你好<strong>世界</strong></p>` cut at 2 becomes `<p>你好</p>` plus
// `<p><strong>世界</strong></p>` and no formatting is lost. Tables are cut
// between rows, with the header row repeated on the continuation.

import type { Block } from './markdown'

export type BlockPair = [Block, Block]

/** Block kinds whose content is text and may be cut between characters. */
const TEXT_KINDS: ReadonlySet<string> = new Set(['paragraph', 'heading', 'blockquote', 'code'])

/** Media and compound objects: cutting their *text* would not cut the object. */
const UNSPLITTABLE_CONTENT =
  'img, table, svg, video, canvas, iframe, audio, embed, object, picture'

/**
 * How far back from the longest fitting cut we look for a nicer one (just
 * after a space or punctuation). About one line of prose.
 */
const PREFERRED_WINDOW_TEXT = 30
/** Code is cut at line ends: look back this many characters for a newline. */
const PREFERRED_WINDOW_CODE = 240

const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('zh-Hans', { granularity: 'grapheme' })
    : null

/**
 * Every position in `text` where a cut keeps both sides' graphemes whole:
 * `[1, 2, …, text.length - 1]` in UTF-16 offsets, merged across surrogate
 * pairs and combining marks.
 */
export function graphemeOffsets(text: string): number[] {
  const offsets: number[] = []
  if (graphemeSegmenter) {
    for (const part of graphemeSegmenter.segment(text)) {
      const offset = part.index + part.segment.length
      if (offset > 0 && offset < text.length) offsets.push(offset)
    }
    return offsets
  }
  // Fallback when Intl.Segmenter is missing: keep surrogate pairs whole.
  let index = 0
  for (const character of text) {
    index += character.length
    if (index > 0 && index < text.length) offsets.push(index)
  }
  return offsets
}

/** Positions just after a newline: where a code block prefers to be cut. */
export function codeLineOffsets(text: string): number[] {
  const offsets: number[] = []
  let index = text.indexOf('\n')
  while (index !== -1) {
    const offset = index + 1
    if (offset < text.length) offsets.push(offset)
    index = text.indexOf('\n', offset)
  }
  return offsets
}

/** A cut reads better just after a space or punctuation mark than mid-word. */
const BREAK_AFTER = /[\s，。！？；：、,.!?;:…—～·»⟩）〉】〕」』”’]/

/** Positions just after a space or punctuation mark (whitespace included). */
export function preferredBreakOffsets(text: string): number[] {
  const offsets: number[] = []
  if (graphemeSegmenter) {
    for (const part of graphemeSegmenter.segment(text)) {
      const offset = part.index + part.segment.length
      if (BREAK_AFTER.test(part.segment) && offset > 0 && offset < text.length) {
        offsets.push(offset)
      }
    }
    return offsets
  }
  let index = 0
  for (const character of text) {
    index += character.length
    if (BREAK_AFTER.test(character) && index > 0 && index < text.length) {
      offsets.push(index)
    }
  }
  return offsets
}

/**
 * The nicest cut at or before `best`: a preferred boundary (space or
 * punctuation) when one lies within `window` characters back, otherwise the
 * measured best itself. `preferred` must be sorted ascending.
 */
export function preferNearbyBreak(best: number, preferred: number[], window: number): number {
  for (let i = preferred.length - 1; i >= 0; i -= 1) {
    const offset = preferred[i]
    if (offset > best) continue
    // The largest preferred offset ≤ best; take it when it is close enough.
    return offset > best - window ? offset : best
  }
  return best
}

function parseSingleRoot(html: string): Element | null {
  const template = document.createElement('template')
  template.innerHTML = html
  if (template.content.childElementCount !== 1) return null
  return template.content.firstElementChild
}

/**
 * Cut an element's text content at `offset` (UTF-16 offset into its
 * concatenated text), keeping both sides valid HTML: every ancestor of the
 * cut point is repeated on the right, so both halves render standalone.
 */
function splitRootAtTextOffset(root: Element, offset: number): [Element, Element] | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  // `remaining` stays ≥ 1: offsets are > 0 and each skipped node subtracts
  // only its own length, so the cut always lands inside a text node.
  let remaining = offset
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    if (remaining > node.length) {
      remaining -= node.length
      continue
    }
    const before = document.createRange()
    before.setStart(root, 0)
    before.setEnd(node, remaining)
    const after = document.createRange()
    after.setStart(node, remaining)
    after.setEnd(root, root.childNodes.length)

    const left = root.cloneNode(false) as Element
    const right = root.cloneNode(false) as Element
    left.appendChild(before.cloneContents())
    right.appendChild(after.cloneContents())
    return [left, right]
  }
  return null
}

/**
 * A cut just after a newline leaves the head's `<pre>` ending in a blank
 * line; drop that one trailing newline. An empty head keeps it (a blank line
 * beats losing the block).
 */
function trimTrailingLineBreak(root: Element): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) last = node
  if (!last || !last.data.endsWith('\n')) return
  if (root.textContent === '\n') return
  last.data = last.data.slice(0, -1)
}

/**
 * The longest prefix of a text block that `fits` accepts, cut at a measured
 * boundary: line ends for code, grapheme boundaries for prose, preferring a
 * nearby space or punctuation mark. Returns the two parts, or null when the
 * block is not cuttable text (another kind, media or a table inside, less
 * than two characters, or not even the first character fits).
 */
export function splitOversizedTextBlock(
  block: Block,
  fits: (part: Block) => boolean,
): BlockPair | null {
  if (!TEXT_KINDS.has(block.kind)) return null

  const root = parseSingleRoot(block.html)
  if (!root) return null
  if (root.matches(UNSPLITTABLE_CONTENT) || root.querySelector(UNSPLITTABLE_CONTENT)) {
    return null
  }

  const content = root.textContent ?? ''
  if (content.length < 2) return null

  const candidates = graphemeOffsets(content)
  if (!candidates.length) return null

  const pairAt = (offset: number): BlockPair | null => {
    const split = splitRootAtTextOffset(root, offset)
    if (!split) return null
    const [left, right] = split
    if (block.kind === 'code') trimTrailingLineBreak(left)
    return [
      { ...block, html: left.outerHTML },
      { ...block, html: right.outerHTML },
    ]
  }

  // Binary search for the longest prefix that fits; text height never
  // shrinks as the prefix grows, so the predicate is monotonic.
  let low = 0
  let high = candidates.length - 1
  let bestPair: BlockPair | null = null
  let bestOffset = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    const pair = pairAt(candidates[mid])
    if (pair && fits(pair[0])) {
      bestPair = pair
      bestOffset = candidates[mid]
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  if (!bestPair || bestOffset < 0) return null

  // Trade a few characters of packing for a cut that reads naturally.
  const preferred =
    block.kind === 'code' ? codeLineOffsets(content) : preferredBreakOffsets(content)
  const nicer = preferNearbyBreak(bestOffset, preferred, block.kind === 'code' ? PREFERRED_WINDOW_CODE : PREFERRED_WINDOW_TEXT)
  if (nicer !== bestOffset) {
    const pair = pairAt(nicer)
    if (pair && fits(pair[0])) bestPair = pair
  }

  return bestPair
}

/**
 * Cut a tall table between rows, repeating its header row on the second part
 * so the continuation page stays readable. Binary search over row counts,
 * every candidate verified by real measurement through `fits`. Returns null
 * for anything but a plain thead/tbody (or bare rows) table, or when not
 * even the header plus one row fits — those the caller reports instead.
 */
export function splitOversizedTable(
  block: Block,
  fits: (part: Block) => boolean,
): BlockPair | null {
  const root = parseSingleRoot(block.html)
  if (!root || root.tagName !== 'TABLE') return null

  const children = Array.from(root.children)
  const headSection = children[0]?.tagName === 'THEAD' ? children[0] : null
  const rest = children.slice(headSection ? 1 : 0)
  // A caption, colgroup, tfoot or a second tbody would be dropped by the
  // rebuild below: refuse rather than lose them.
  if (!(rest.length === 1 && rest[0].tagName === 'TBODY') &&
      !(rest.length > 0 && rest.every((element) => element.tagName === 'TR'))) {
    return null
  }
  const bodySection = rest.length === 1 && rest[0].tagName === 'TBODY' ? rest[0] : null
  const rows = bodySection ? Array.from(bodySection.children) : rest
  if (rows.length < 2 || rows.some((element) => element.tagName !== 'TR')) return null

  const htmlOf = (tableRows: Element[]): string => {
    const table = root.cloneNode(false) as Element
    if (headSection) table.appendChild(headSection.cloneNode(true))
    if (bodySection) {
      const body = bodySection.cloneNode(false) as Element
      for (const row of tableRows) body.appendChild(row.cloneNode(true))
      table.appendChild(body)
    } else {
      for (const row of tableRows) table.appendChild(row.cloneNode(true))
    }
    return table.outerHTML
  }

  let low = 1
  let high = rows.length - 1
  let best = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (fits({ ...block, html: htmlOf(rows.slice(0, mid)) })) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  if (best < 1) return null

  return [
    { ...block, html: htmlOf(rows.slice(0, best)) },
    { ...block, html: htmlOf(rows.slice(best)) },
  ]
}
