// Rich text span algorithms — pure functions shared by the document
// validator, the action reducer, and the text renderers.
//
// A span marks a character range [start, end) inside a text element's plain
// `text` with additive styling: bold, a solid color, and (v16) a highlight
// colour behind the characters and an underline. Canonical spans are sorted
// by start, non-overlapping, non-empty, and within text bounds.

import { isHexColor } from './paint'
import type { RichTextSpan } from './types'

const SPAN_KEYS = new Set(['start', 'end', 'bold', 'color', 'highlight', 'underline'])

/** A span's styling without its range. */
export type RichTextStyle = Omit<RichTextSpan, 'start' | 'end'>

/** The styles a span can carry, in a fixed order (also the order of `RichTextStyle` keys in output). */
const STYLE_KEYS = ['bold', 'color', 'highlight', 'underline'] as const

function hasStyle(style: RichTextStyle): boolean {
  return STYLE_KEYS.some((key) => style[key] !== undefined)
}

function styleOf(span: RichTextStyle): RichTextStyle {
  const style: RichTextStyle = {}
  if (span.bold) style.bold = true
  if (span.color !== undefined) style.color = span.color
  if (span.highlight !== undefined) style.highlight = span.highlight
  if (span.underline) style.underline = true
  return style
}

function sameStyle(a: RichTextStyle, b: RichTextStyle): boolean {
  return STYLE_KEYS.every((key) => a[key] === b[key])
}

/** Spans using the v16 styles (highlight, underline), which older documents can't hold. */
export function usesV16SpanStyles(spans: readonly RichTextSpan[]): boolean {
  return spans.some((span) => span.highlight !== undefined || span.underline !== undefined)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSpanShape(value: unknown): value is RichTextSpan {
  if (!isRecord(value)) return false
  for (const key of Object.keys(value)) {
    if (!SPAN_KEYS.has(key)) return false
  }
  if (
    typeof value.start !== 'number' || !Number.isInteger(value.start) ||
    typeof value.end !== 'number' || !Number.isInteger(value.end) ||
    value.start < 0 || value.start >= value.end
  ) {
    return false
  }
  if ('bold' in value && value.bold !== true) return false
  if ('color' in value && !isHexColor(value.color)) return false
  if ('highlight' in value && !isHexColor(value.highlight)) return false
  if ('underline' in value && value.underline !== true) return false
  return 'bold' in value || 'color' in value || 'highlight' in value || 'underline' in value
}

/**
 * Validate and canonically order spans for a text of `textLength` chars.
 * Returns null when any span is malformed, out of bounds, or overlapping;
 * an empty array is returned as-is so patches can clear spans with `[]`.
 */
export function normalizeRichTextSpans(
  value: unknown,
  textLength: number,
): RichTextSpan[] | null {
  if (!Array.isArray(value)) return null
  const spans: RichTextSpan[] = []
  for (const raw of value) {
    if (!isSpanShape(raw)) return null
    if (raw.end > textLength) return null
    spans.push({ start: raw.start, end: raw.end, ...styleOf(raw) })
  }
  spans.sort((a, b) => a.start - b.start)
  for (let index = 1; index < spans.length; index += 1) {
    if (spans[index].start < spans[index - 1].end) return null
  }
  return spans
}

/**
 * Carry spans across a plain-text edit. The changed region is located via a
 * common prefix/suffix diff; spans inside it are dropped, spans before it
 * survive unchanged, spans after it shift by the length delta, and spans
 * crossing it keep their surviving part. Returns undefined when nothing is
 * left, so edited elements can drop the key entirely.
 */
export function remapRichTextSpans(
  spans: RichTextSpan[] | undefined,
  oldText: string,
  newText: string,
): RichTextSpan[] | undefined {
  if (!spans || spans.length === 0) return spans
  if (oldText === newText) return spans

  let prefix = 0
  const maxPrefix = Math.min(oldText.length, newText.length)
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) prefix += 1

  let suffix = 0
  const maxSuffix = Math.min(oldText.length - prefix, newText.length - prefix)
  while (
    suffix < maxSuffix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const oldCutEnd = oldText.length - suffix
  const newCutEnd = newText.length - suffix
  const shift = newCutEnd - oldCutEnd

  const out: RichTextSpan[] = []
  for (const span of spans) {
    const segments: Array<{ start: number; end: number }> = []
    if (span.start < prefix) {
      segments.push({ start: span.start, end: Math.min(span.end, prefix) })
    }
    if (span.end > oldCutEnd) {
      segments.push({ start: Math.max(span.start, oldCutEnd) + shift, end: span.end + shift })
    }
    // Segments of one span share its style; when the edit removed interior
    // characters the surviving parts are adjacent and merge back together.
    for (const segment of segments) {
      if (segment.end <= segment.start) continue
      const previous = out[out.length - 1]
      if (
        previous
        && previous.end === segment.start
        && sameStyle(previous, span)
      ) {
        previous.end = segment.end
      } else {
        out.push({ ...span, start: segment.start, end: segment.end })
      }
    }
  }
  return out.length > 0 ? out : undefined
}

/**
 * Restyle the characters in [range.start, range.end): each one's current
 * style (none where no span covers it) goes through `change`, and the result
 * is merged back into canonical spans — neighbours with equal styles join,
 * unstyled stretches drop out. Styles outside the range are untouched, so
 * underlining a bold word keeps it bold. Null when the range is invalid.
 */
export function restyleRichTextRange(
  existing: readonly RichTextSpan[] | undefined,
  range: { start: number; end: number },
  change: (style: RichTextStyle) => RichTextStyle,
  textLength: number,
): RichTextSpan[] | null {
  const { start, end } = range
  if (
    !Number.isInteger(start) || !Number.isInteger(end)
    || start < 0 || end > textLength || start >= end
  ) {
    return null
  }
  const spans = existing ?? []
  const cuts = new Set([start, end])
  for (const span of spans) {
    cuts.add(span.start)
    cuts.add(span.end)
  }
  const points = [...cuts].sort((a, b) => a - b)
  const out: RichTextSpan[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    const covering = spans.find((span) => span.start <= from && span.end >= to)
    const current = covering ? styleOf(covering) : {}
    const style = from >= start && to <= end ? styleOf(change(current)) : current
    if (!hasStyle(style)) continue
    const previous = out[out.length - 1]
    if (previous && previous.end === from && sameStyle(previous, style)) {
      previous.end = to
    } else {
      out.push({ start: from, end: to, ...style })
    }
  }
  return out
}

/** Whether every character in the range has the style `test` looks for. */
export function rangeHasRichTextStyle(
  spans: readonly RichTextSpan[] | undefined,
  range: { start: number; end: number },
  test: (style: RichTextStyle) => boolean,
): boolean {
  let cursor = range.start
  for (const span of [...(spans ?? [])].sort((a, b) => a.start - b.start)) {
    if (span.end <= cursor) continue
    if (span.start > cursor || !test(span)) return false
    cursor = span.end
    if (cursor >= range.end) return true
  }
  return cursor >= range.end
}

export interface TextRun {
  text: string
  bold?: true
  color?: string
  highlight?: string
  underline?: true
}

/** Split a text into styled runs at span boundaries, in display order. */
export function splitTextRuns(text: string, spans: RichTextSpan[] | undefined): TextRun[] {
  if (!spans || spans.length === 0) return text.length > 0 ? [{ text }] : []
  const runs: TextRun[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start > cursor) runs.push({ text: text.slice(cursor, span.start) })
    runs.push({ text: text.slice(span.start, span.end), ...styleOf(span) })
    cursor = span.end
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor) })
  return runs.filter((run) => run.text.length > 0)
}

/** Whether a run carries any styling of its own. */
export function isStyledRun(run: TextRun): boolean {
  return hasStyle(run)
}

/**
 * The CSS a styled run draws with (camelCase, for React styles and DOM
 * `style` alike). Gradient text (`solidFallback` given) has see-through
 * glyphs that show the text's gradient, so a coloured run fills its glyphs
 * with its own colour, a highlighted one (whose background would cover the
 * gradient) with the solid fallback, and underlines take that colour rather
 * than the invisible text colour.
 */
export function textRunStyle(run: TextRun, solidFallback?: string): Record<string, string> {
  const style: Record<string, string> = {}
  if (run.bold) style.fontWeight = '700'
  if (run.color) style.color = run.color
  if (run.highlight) style.backgroundColor = run.highlight
  if (solidFallback && (run.color || run.highlight)) {
    style.WebkitTextFillColor = run.color ?? solidFallback
  }
  if (run.underline) {
    style.textDecorationLine = 'underline'
    if (solidFallback) style.textDecorationColor = run.color ?? solidFallback
  }
  return style
}
