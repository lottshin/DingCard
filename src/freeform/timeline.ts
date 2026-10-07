// The timeline element (v36): a vertical spine with a dot per entry, each
// entry an optional short label (a date, a step) and a line of text. Sizes
// live here so the renderer, the editor and the tests share one truth.

import { wrapCellLines } from './tables'

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
  /** The vertical spine's x and its top and bottom ends. */
  spine: { x: number; y1: number; y2: number }
  /** One entry per item: the dot's centre, its label's baseline, and its wrapped text lines. */
  entries: Array<{
    dotY: number
    label: { x: number; y: number; text: string } | null
    textLines: Array<{ x: number; y: number; text: string }>
  }>
  fontSize: number
}

export function timelineGeometry(
  width: number,
  height: number,
  items: readonly TimelineItem[],
): TimelineGeometry {
  const spineX = 14
  const contentX = spineX + 20
  const rowHeight = height / items.length
  const fontSize = Math.max(9, Math.min(rowHeight * 0.34, 15))
  const labelSize = Math.max(8, Math.round(fontSize * 0.78))
  const lineHeight = fontSize * 1.25
  const labelHeight = labelSize * 1.3
  const maxTextLines = Math.max(1, Math.floor((rowHeight - 6) / lineHeight))

  const entries: TimelineGeometry['entries'] = items.map((item, index) => {
    const dotY = index * rowHeight + rowHeight / 2
    const label = item.label
    const wrapped = wrapCellLines(item.text, fontSize, width - contentX - 4)
    const textLines = wrapped.length > maxTextLines
      ? [...wrapped.slice(0, maxTextLines - 1), `${wrapped[maxTextLines - 1].slice(0, -1)}…`]
      : wrapped
    const hasLabel = label !== undefined
    const blockHeight = (hasLabel ? labelHeight : 0) + textLines.length * lineHeight
    const top = dotY - blockHeight / 2
    return {
      dotY,
      label: hasLabel
        ? { x: contentX, y: top + labelSize * 0.88, text: label }
        : null,
      textLines: textLines.map((line, lineIndex) => ({
        x: contentX,
        y: top + (hasLabel ? labelHeight : 0) + lineIndex * lineHeight + fontSize * 0.88,
        text: line,
      })),
    }
  })

  return {
    spine: { x: spineX, y1: 4, y2: height - 4 },
    entries,
    fontSize,
  }
}
