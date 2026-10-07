// The timeline element (v36): a spine with a dot per entry, each entry an
// optional short label (a date, a step) and a line of text. v37 lays the
// spine along the top with the entries side by side. Sizes live here so the
// renderer, the editor and the tests share one truth.

import { wrapCellLines } from './tables'

export const TIMELINE_ITEMS_MIN = 2
export const TIMELINE_ITEMS_MAX = 8
export const TIMELINE_LABEL_MAX_CHARS = 12
export const TIMELINE_TEXT_MAX_CHARS = 48

export function isValidTimelineLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= TIMELINE_LABEL_MAX_CHARS
}

export function isValidTimelineText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= TIMELINE_TEXT_MAX_CHARS
}

export interface TimelineItem {
  label?: string
  text: string
}

/** One timeline entry, 2–8 of them; every text 1–48 characters, labels 1–12. */
export function isValidTimelineItems(value: unknown): value is TimelineItem[] {
  return Array.isArray(value)
    && value.length >= 2
    && value.length <= TIMELINE_ITEMS_MAX
    && value.every((item) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return false
      const record = item as Record<string, unknown>
      const keys = Object.keys(record)
      if (!keys.every((key) => key === 'label' || key === 'text')) return false
      if (!isValidTimelineText(record.text)) return false
      return !('label' in record) || isValidTimelineLabel(record.label)
    })
}

export function timelineItemsSame(a: readonly TimelineItem[], b: readonly TimelineItem[]): boolean {
  return a.length === b.length && a.every((item, index) => {
    const other = b[index]
    return item.text === other.text && (item.label ?? '') === (other.label ?? '')
  })
}

export interface TimelineGeometry {
  /** The spine line's two ends. */
  spine: { x1: number; y1: number; x2: number; y2: number }
  /** One entry per item: the dot's centre, its label's baseline, and its wrapped text lines. */
  entries: Array<{
    dot: { x: number; y: number }
    label: { x: number; y: number; text: string; anchor: 'start' | 'middle' } | null
    textLines: Array<{ x: number; y: number; text: string; anchor: 'start' | 'middle' }>
  }>
  fontSize: number
}

export function timelineGeometry(
  width: number,
  height: number,
  items: readonly TimelineItem[],
  options: { horizontal?: boolean } = {},
): TimelineGeometry {
  const labelSize = (fontSize: number) => Math.max(8, Math.round(fontSize * 0.78))
  const clampLines = (wrapped: readonly string[], maxLines: number) => wrapped.length > maxLines
    ? [...wrapped.slice(0, maxLines - 1), `${wrapped[maxLines - 1].slice(0, -1)}…`]
    : wrapped

  if (options.horizontal) {
    // The spine runs along the top; the entries sit side by side under it,
    // each column of words centred on its dot.
    const spineY = 14
    const contentY = spineY + 20
    const columnWidth = width / items.length
    const fontSize = Math.max(9, Math.min(columnWidth * 0.14, 15))
    const labelPx = labelSize(fontSize)
    const lineHeight = fontSize * 1.25
    const labelHeight = labelPx * 1.3
    const maxTextLines = Math.max(1, Math.floor((height - contentY - 4) / lineHeight))
    const entries = items.map((item, index) => {
      const dotX = index * columnWidth + columnWidth / 2
      const wrapped = clampLines(wrapCellLines(item.text, fontSize, columnWidth - 10), maxTextLines)
      const hasLabel = item.label !== undefined
      const top = contentY
      return {
        dot: { x: dotX, y: spineY },
        label: hasLabel
          ? { x: dotX, y: top + labelPx * 0.88, text: item.label!, anchor: 'middle' as const }
          : null,
        textLines: wrapped.map((line, lineIndex) => ({
          x: dotX,
          y: top + (hasLabel ? labelHeight : 0) + lineIndex * lineHeight + fontSize * 0.88,
          text: line,
          anchor: 'middle' as const,
        })),
      }
    })
    return { spine: { x1: 4, y1: spineY, x2: width - 4, y2: spineY }, entries, fontSize }
  }

  // The spine runs down the left; the entries stack, one row each.
  const spineX = 14
  const contentX = spineX + 20
  const rowHeight = height / items.length
  const fontSize = Math.max(9, Math.min(rowHeight * 0.34, 15))
  const labelPx = labelSize(fontSize)
  const lineHeight = fontSize * 1.25
  const labelHeight = labelPx * 1.3
  const maxTextLines = Math.max(1, Math.floor((rowHeight - 6) / lineHeight))

  const entries = items.map((item, index) => {
    const dotY = index * rowHeight + rowHeight / 2
    const wrapped = clampLines(wrapCellLines(item.text, fontSize, width - contentX - 4), maxTextLines)
    const hasLabel = item.label !== undefined
    const blockHeight = (hasLabel ? labelHeight : 0) + wrapped.length * lineHeight
    const top = dotY - blockHeight / 2
    return {
      dot: { x: spineX, y: dotY },
      label: hasLabel
        ? { x: contentX, y: top + labelPx * 0.88, text: item.label!, anchor: 'start' as const }
        : null,
      textLines: wrapped.map((line, lineIndex) => ({
        x: contentX,
        y: top + (hasLabel ? labelHeight : 0) + lineIndex * lineHeight + fontSize * 0.88,
        text: line,
        anchor: 'start' as const,
      })),
    }
  })

  return { spine: { x1: spineX, y1: 4, x2: spineX, y2: height - 4 }, entries, fontSize }
}
