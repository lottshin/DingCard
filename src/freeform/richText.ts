// Rich text span algorithms — pure functions shared by the document
// validator, the action reducer, and the text renderers.
//
// A span marks a character range [start, end) inside a text element's plain
// `text` with additive styling: bold and/or a solid color. Canonical spans
// are sorted by start, non-overlapping, non-empty, and within text bounds.

import { isHexColor } from './paint'
import type { RichTextSpan } from './types'

const SPAN_KEYS = new Set(['start', 'end', 'bold', 'color'])

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
  return 'bold' in value || 'color' in value
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
    spans.push(raw)
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
        && previous.bold === span.bold
        && previous.color === span.color
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
 * Add a span to a set, subtracting its range from any existing span it
 * overlaps (a straddling span keeps its surviving head and tail). Returns
 * null when the incoming span is invalid for the text.
 */
export function insertRichTextSpan(
  existing: RichTextSpan[] | undefined,
  span: RichTextSpan,
  textLength: number,
): RichTextSpan[] | null {
  if (!isSpanShape(span) || span.end > textLength) return null
  const trimmed: RichTextSpan[] = []
  for (const current of existing ?? []) {
    if (current.start < span.start) {
      trimmed.push({ ...current, end: Math.min(current.end, span.start) })
    }
    if (current.end > span.end) {
      trimmed.push({ ...current, start: Math.max(current.start, span.end) })
    }
  }
  const kept = trimmed.filter((candidate) => candidate.end > candidate.start)
  return [...kept, span].sort((a, b) => a.start - b.start)
}

export interface TextRun {
  text: string
  bold?: true
  color?: string
}

/** Split a text into styled runs at span boundaries, in display order. */
export function splitTextRuns(text: string, spans: RichTextSpan[] | undefined): TextRun[] {
  if (!spans || spans.length === 0) return text.length > 0 ? [{ text }] : []
  const runs: TextRun[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start > cursor) runs.push({ text: text.slice(cursor, span.start) })
    const styled: TextRun = { text: text.slice(span.start, span.end) }
    if (span.bold) styled.bold = span.bold
    if (span.color) styled.color = span.color
    runs.push(styled)
    cursor = span.end
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor) })
  return runs.filter((run) => run.text.length > 0)
}
