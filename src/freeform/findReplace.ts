// Find and replace across a deck: every word a reader sees — text boxes
// (inside groups too), table cells, timeline labels and entries, chart
// categories and series names, a progress bar's name. A replacement takes
// the style of the word it replaces (its bold, colour, highlight…), so a
// highlighted brand name stays highlighted; every other character keeps its
// own. A field the replacement would push past its length limit (a table
// cell holds 24 characters) is left as it was and counted as skipped.

import { isValidChartLabel, isValidChartSeriesName } from './charts'
import { isValidProgressLabel } from './progress'
import { isValidTableCellText } from './tables'
import { isValidTimelineLabel, isValidTimelineText } from './timeline'
import type { FreeformDocument, FreeformSceneNode, RichTextSpan } from './types'

export interface FindReplaceResult {
  document: FreeformDocument
  /** Occurrences replaced. */
  replaced: number
  /** Occurrences found in fields the replacement would have overfilled. */
  skipped: number
}

/** Where `find` occurs in `text`, left to right, never overlapping. */
function occurrences(text: string, find: string): number[] {
  const found: number[] = []
  if (find === '') return found
  for (let index = text.indexOf(find); index !== -1; index = text.indexOf(find, index + find.length)) {
    found.push(index)
  }
  return found
}

type SpanStyle = Omit<RichTextSpan, 'start' | 'end'>

function styleOf(span: RichTextSpan): SpanStyle {
  const { start: _start, end: _end, ...style } = span
  return style
}

function sameStyle(a: SpanStyle | null, b: SpanStyle | null): boolean {
  if (a === null || b === null) return a === b
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof SpanStyle>
  return [...keys].every((key) => a[key] === b[key])
}

/**
 * `text` with every `find` replaced, and its spans carried along: unchanged
 * characters keep their style, each replacement takes the style of the
 * first character it replaces.
 */
export function replaceInText(
  text: string,
  spans: readonly RichTextSpan[] | undefined,
  find: string,
  replace: string,
): { text: string; spans: RichTextSpan[] | undefined; count: number } {
  const found = occurrences(text, find)
  if (found.length === 0) return { text, spans: spans ? [...spans] : undefined, count: 0 }
  const styleAt = (index: number): SpanStyle | null => {
    const span = spans?.find((entry) => entry.start <= index && index < entry.end)
    return span ? styleOf(span) : null
  }
  const chars: Array<{ char: string; style: SpanStyle | null }> = []
  let cursor = 0
  for (const at of found) {
    for (let index = cursor; index < at; index += 1) chars.push({ char: text[index], style: styleAt(index) })
    const style = styleAt(at)
    for (const char of replace) chars.push({ char, style })
    cursor = at + find.length
  }
  for (let index = cursor; index < text.length; index += 1) chars.push({ char: text[index], style: styleAt(index) })
  // Back into canonical spans: neighbours with one style merge.
  const next: RichTextSpan[] = []
  let offset = 0
  for (const { char, style } of chars) {
    const width = char.length
    if (style) {
      const last = next[next.length - 1]
      if (last && last.end === offset && sameStyle(styleOf(last), style)) last.end += width
      else next.push({ start: offset, end: offset + width, ...style })
    }
    offset += width
  }
  return { text: chars.map((entry) => entry.char).join(''), spans: next.length > 0 ? next : undefined, count: found.length }
}

/** A plain field replaced when the result is still valid; how many were found either way. */
function replaceField(value: string, find: string, replace: string, valid: (next: string) => boolean): { value: string; replaced: number; skipped: number } {
  const count = occurrences(value, find).length
  if (count === 0) return { value, replaced: 0, skipped: 0 }
  const next = value.split(find).join(replace)
  return valid(next) ? { value: next, replaced: count, skipped: 0 } : { value, replaced: 0, skipped: count }
}

function replaceInNode(node: FreeformSceneNode, find: string, replace: string): { node: FreeformSceneNode; replaced: number; skipped: number } {
  let replaced = 0
  let skipped = 0
  const field = (value: string, valid: (next: string) => boolean) => {
    const result = replaceField(value, find, replace, valid)
    replaced += result.replaced
    skipped += result.skipped
    return result.value
  }
  switch (node.type) {
    case 'group': {
      const children = node.children.map((child) => {
        const result = replaceInNode(child, find, replace)
        replaced += result.replaced
        skipped += result.skipped
        return result.node
      })
      return { node: replaced > 0 ? { ...node, children } : node, replaced, skipped }
    }
    case 'text': {
      const result = replaceInText(node.text, node.spans, find, replace)
      if (result.count === 0) return { node, replaced: 0, skipped: 0 }
      const { spans: _previous, ...rest } = node
      return { node: result.spans ? { ...rest, text: result.text, spans: result.spans } : { ...rest, text: result.text }, replaced: result.count, skipped: 0 }
    }
    case 'table': {
      const cells = node.cells.map((cell) => field(cell, isValidTableCellText))
      return { node: replaced > 0 ? { ...node, cells } : node, replaced, skipped }
    }
    case 'timeline': {
      const items = node.items.map((item) => ({
        ...(item.label !== undefined ? { label: field(item.label, isValidTimelineLabel) } : {}),
        text: field(item.text, isValidTimelineText),
      }))
      return { node: replaced > 0 ? { ...node, items } : node, replaced, skipped }
    }
    case 'chart': {
      const labels = node.labels.map((label) => field(label, isValidChartLabel))
      const series = node.series.map((entry) => (entry.name !== undefined
        ? { ...entry, name: field(entry.name, isValidChartSeriesName) }
        : entry))
      return { node: replaced > 0 ? { ...node, labels, series } : node, replaced, skipped }
    }
    case 'progress': {
      if (node.label === undefined) return { node, replaced: 0, skipped: 0 }
      const label = field(node.label, isValidProgressLabel)
      return { node: replaced > 0 ? { ...node, label } : node, replaced, skipped }
    }
    default:
      return { node, replaced: 0, skipped: 0 }
  }
}

/** Replace every `find` with `replace` across the deck, or only on `slideId`. */
export function findReplaceDocument(
  document: FreeformDocument,
  find: string,
  replace: string,
  slideId?: string | null,
): FindReplaceResult {
  if (find === '') return { document, replaced: 0, skipped: 0 }
  let replaced = 0
  let skipped = 0
  const slides = document.slides.map((slide) => {
    if (slideId && slide.id !== slideId) return slide
    let slideReplaced = 0
    const nodes = slide.nodes.map((node) => {
      const result = replaceInNode(node, find, replace)
      slideReplaced += result.replaced
      skipped += result.skipped
      return result.node
    })
    replaced += slideReplaced
    return slideReplaced > 0 ? { ...slide, nodes } : slide
  })
  return { document: replaced > 0 ? { ...document, slides } : document, replaced, skipped }
}

/** How many times `find` shows in the deck (or on `slideId`), wherever a reader sees words. */
export function countFindMatches(document: FreeformDocument, find: string, slideId?: string | null): number {
  const { replaced, skipped } = findReplaceDocument(document, find, find, slideId)
  return replaced + skipped
}
