// Compose a finished deck from a freeform template and the reader's content:
// a cover, one page per section and, when asked for, the closing page. Every
// sample text the template drew is either replaced with the content or
// removed with the shapes that only frame it (see src/templates/slots.ts),
// page numbers follow the page, and filled-in copy shrinks to stay inside the
// box the template drew for it.

import { MAX_FREEFORM_SLIDES } from '../../../src/freeform/constants'
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import { diagnoseFreeformDocument } from '../../../src/freeform/diagnostics'
import {
  createChartElement,
  createProgressElement,
  createTableElement,
  createTimelineElement,
} from '../../../src/freeform/document'
import { CHART_ACCENT_DEFAULT, CHART_POINTS_MAX, isValidChartKind, isValidChartLabel, isValidChartSeriesName, isValidChartValue } from '../../../src/freeform/charts'
import { isValidTableCells, isValidTableCellText, isValidTableCols, isValidTableRows } from '../../../src/freeform/tables'
import { isValidTimelineItems } from '../../../src/freeform/timeline'
import { isValidProgressLabel, isValidProgressValue } from '../../../src/freeform/progress'
import { isHexColor } from '../../../src/freeform/paint'
import { FREEFORM_DOCUMENT_VERSION, type FreeformDocument, type FreeformSceneNode, type FreeformSlide, type FreeformTextElement } from '../../../src/freeform/types'
import { TEMPLATE_REGISTRY } from '../../../src/templates/registry'
import { FREEFORM_TEMPLATE_SLOTS, type SlideSlots, type SlotItem } from '../../../src/templates/slots'
import type { FreeformDeckSeriesId } from '../../../src/templates/types'
import { balancedHeading, emWidth, fittingFontSize, measureText, MIN_FIT_SCALE, textFits } from './textFit'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface DeckChart {
  /** bar / ring / line / radar. */
  kind: 'bar' | 'ring' | 'line' | 'radar'
  /** 1–12 category names, each up to 24 characters. */
  labels: string[]
  /** 1–3 series; values line up with the labels. */
  series: Array<{ name?: string; values: number[]; color?: string }>
}

export interface DeckTable {
  /** First row of cells; without it the rows start plain. */
  header?: string[]
  /** The body rows; every row has the same number of cells (1–6 columns, 2–12 rows in total). */
  rows: string[][]
}

export interface DeckTimeline {
  /** 2–8 steps: an optional short time and its text. */
  items: Array<{ label?: string; text: string }>
}

export interface DeckProgress {
  /** 0–100 with at most one decimal. */
  value: number
  /** The goal's 1–12 character name. */
  label?: string
}

export interface DeckPage {
  title: string
  /** A paragraph; line breaks are kept. */
  body?: string
  /** Short points, one per item; "要点：说明" puts the part after the colon on the item's second line. */
  points?: string[]
  /** A pull quote; "引文 —— 出处" puts the source under it. */
  quote?: string
  /** Another deck template whose page this one takes (its section page, or for the ending its closing page). */
  templateId?: string
  /** One data drawing for the page, placed in the room the words leave; at most one of chart / table / timeline / progress. */
  chart?: DeckChart
  table?: DeckTable
  timeline?: DeckTimeline
  progress?: DeckProgress
}

export interface DeckContent {
  title: string
  subtitle?: string
  pages: DeckPage[]
  /** The closing page; without it the deck ends on its last section. */
  ending?: DeckPage
}

export interface FontAdjustment {
  slideId: string
  page: number
  node: string
  from: number
  to: number
}

export interface ComposeSuccess {
  ok: true
  document: FreeformDocument
  summary: {
    documentVersion: number
    templateId: string
    slideCount: number
    coverTitle: string
    /** templateId: the template the page's layout came from. */
    pages: Array<{ slideId: string; page: number; role: 'cover' | 'section' | 'ending'; title: string; templateId: string }>
    /** Copy that was set smaller to fit its box. */
    shrunk: FontAdjustment[]
    /** Copy that still doesn't fit at the smallest size: shorten it (check_document measures the real layout). */
    overflowing: Array<{ slideId: string; page: number; node: string; text: string }>
    /** Data drawings placed on their pages, with the box each got. */
    placed?: Array<{ slideId: string; page: number; kind: 'chart' | 'table' | 'timeline' | 'progress'; node: string; x: number; y: number; width: number; height: number }>
    /** Data drawings that found no room on their page. */
    unplaced?: Array<{ slideId: string; page: number; kind: 'chart' | 'table' | 'timeline' | 'progress'; reason: string }>
  }
}

export interface ComposeError {
  ok: false
  error: string
}

const MAX_SECTIONS = MAX_FREEFORM_SLIDES - 2
const NOTE_SEPARATOR = /\s*[：:]\s*/
const QUOTE_SOURCE = /\s+[—–-]{1,2}\s*/

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : ''
}

/** How a page's one data drawing reads, checked against the same rules as hand-written documents. */
function cleanData(label: string, record: Record<string, unknown>): { chart?: DeckChart; table?: DeckTable; timeline?: DeckTimeline; progress?: DeckProgress } | string {
  const kinds = (['chart', 'table', 'timeline', 'progress'] as const).filter((kind) => record[kind] !== undefined)
  if (kinds.length === 0) return {}
  if (kinds.length > 1) return `${label}只能带一种数据元素（chart / table / timeline / progress），收到了：${kinds.join('、')}`
  if (kinds[0] === 'chart') {
    const chart = record.chart as Record<string, unknown>
    const kind = chart.kind
    if (!isValidChartKind(kind)) return `${label}.chart.kind 必须是 bar / ring / line / radar 之一`
    const labels = chart.labels
    if (!Array.isArray(labels) || labels.length === 0 || labels.length > CHART_POINTS_MAX
      || !labels.every(isValidChartLabel)) {
      return `${label}.chart.labels 必须是 ${1}–${CHART_POINTS_MAX} 个 1–24 字符的类目名`
    }
    const series = chart.series
    if (!Array.isArray(series) || series.length === 0
      || !series.every((entry) => isRecord(entry)
        && (entry.name === undefined || isValidChartSeriesName(entry.name))
        && Array.isArray(entry.values) && entry.values.length === labels.length
        && entry.values.every(isValidChartValue)
        && (entry.color === undefined || isHexColor(entry.color)))) {
      return `${label}.chart.series 必须是 1–3 个 { name?, values: [≥0 数字 × ${labels.length}], color?(#RRGGBB) }，values 长度要和 labels 一致`
    }
    return {
      chart: {
        kind,
        labels: [...labels],
        series: series.map((entry) => ({
          ...(entry.name !== undefined ? { name: entry.name } : {}),
          values: [...entry.values],
          ...(entry.color !== undefined ? { color: entry.color } : {}),
        })),
      },
    }
  }
  if (kinds[0] === 'table') {
    const table = record.table as Record<string, unknown>
    const header = table.header === undefined ? undefined : table.header
    if (header !== undefined && (!Array.isArray(header) || !header.every((cell) => isValidTableCellText(cell)))) {
      return `${label}.table.header 必须是 1–24 字符的字符串数组`
    }
    const rows = table.rows
    if (!Array.isArray(rows) || rows.length === 0
      || !rows.every((row) => Array.isArray(row) && row.every((cell) => isValidTableCellText(cell)))) {
      return `${label}.table.rows 必须是二维字符串数组，每个单元格 1–24 字符`
    }
    const cols = header !== undefined ? Math.max(header.length, ...rows.map((row) => row.length))
      : Math.max(...rows.map((row) => row.length))
    const total = (header !== undefined ? 1 : 0) + rows.length
    if (!isValidTableCols(cols)) return `${label}.table 最多 6 列（含表头），现在最多的一行有 ${cols} 格`
    if (!isValidTableRows(total)) return `${label}.table 含表头一共要 2–12 行，现在是 ${total} 行`
    const flat = (header !== undefined ? header : []).concat(...rows)
    if (!isValidTableCells(flat, total, cols)) return `${label}.table 的单元格需要按行对齐（补空字符串到相同列数）`
    return {
      table: {
        ...(header !== undefined ? { header: [...header] } : {}),
        rows: rows.map((row) => [...row]),
      },
    }
  }
  if (kinds[0] === 'timeline') {
    const timeline = record.timeline
    if (!isValidTimelineItems(timeline)) {
      return `${label}.timeline 必须是 2–8 个 { label?(1–12 字), text(1–48 字) }`
    }
    return {
      timeline: {
        items: (timeline as DeckTimeline['items']).map((item) => ({
          ...(item.label !== undefined ? { label: item.label } : {}),
          text: item.text,
        })),
      },
    }
  }
  const progress = record.progress as Record<string, unknown>
  if (!isValidProgressValue(progress.value)) {
    return `${label}.progress.value 必须是 0–100 的数，最多一位小数`
  }
  const progressLabel = clean(progress.label)
  if (progressLabel !== '' && !isValidProgressLabel(progressLabel)) {
    return `${label}.progress.label 必须是 1–12 个字`
  }
  return { progress: { value: progress.value, ...(progressLabel ? { label: progressLabel } : {}) } }
}

function cleanPage(value: unknown, label: string): DeckPage | string {
  if (typeof value !== 'object' || value === null) return `${label}需要是对象`
  const record = value as Record<string, unknown>
  const title = clean(record.title)
  if (!title) return `${label}缺少 title`
  const points = Array.isArray(record.points)
    ? record.points.map(clean).filter((point) => point.length > 0)
    : []
  const body = clean(record.body)
  const quote = clean(record.quote)
  const templateId = clean(record.templateId)
  const data = cleanData(label, record)
  if (typeof data === 'string') return data
  return {
    title,
    ...(body ? { body } : {}),
    ...(points.length > 0 ? { points } : {}),
    ...(quote ? { quote } : {}),
    ...(templateId ? { templateId } : {}),
    ...data,
  }
}

/** Check and tidy content from a client: trimmed strings, no empty points. */
export function normalizeDeckContent(value: unknown): DeckContent | string {
  if (typeof value !== 'object' || value === null) return 'content 需要是对象'
  const record = value as Record<string, unknown>
  const title = clean(record.title)
  if (!title) return 'content.title（封面标题）不能为空'
  if (!Array.isArray(record.pages) || record.pages.length === 0) return 'content.pages 至少要有一页'
  if (record.pages.length > MAX_SECTIONS) return `content.pages 最多 ${MAX_SECTIONS} 页`
  const pages: DeckPage[] = []
  for (const [index, page] of record.pages.entries()) {
    const cleaned = cleanPage(page, `第 ${index + 1} 个小节`)
    if (typeof cleaned === 'string') return cleaned
    pages.push(cleaned)
  }
  let ending: DeckPage | undefined
  if (record.ending !== undefined && record.ending !== null) {
    const cleaned = cleanPage(record.ending, '结尾页')
    if (typeof cleaned === 'string') return cleaned
    ending = cleaned
  }
  const subtitle = clean(record.subtitle)
  return { title, ...(subtitle ? { subtitle } : {}), pages, ...(ending ? { ending } : {}) }
}

function seriesOf(templateId: string): { series: FreeformDeckSeriesId; create: () => FreeformDocument } | null {
  const template = TEMPLATE_REGISTRY.find((candidate) => candidate.id === templateId)
  if (!template || template.workspace !== 'freeform' || !template.createFreeform) return null
  if (!(template.series in FREEFORM_TEMPLATE_SLOTS)) return null
  return { series: template.series as FreeformDeckSeriesId, create: template.createFreeform }
}

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * Two lines for a title drawn as two texts: its own line break, else the
 * split between words that sets the two most evenly (a break after
 * punctuation counts a little in its favour), else the middle character.
 */
function splitTitle(title: string): [string, string] {
  const lines = title.split('\n')
  if (lines.length > 1) return [lines[0], lines.slice(1).join(' ')]
  const chars = [...title]
  if (chars.length < 2) return [title, '']
  const words = [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(title)].map((part) => part.segment)
  let best: { lines: [string, string]; score: number } | null = null
  let head = ''
  for (const word of words.slice(0, -1)) {
    head += word
    const first = head.trim()
    const second = title.slice(head.length).trim()
    if (!first || !second || /^[，。、；：！？）」』》,.;:!?)]/.test(second)) continue
    const score = Math.max(emWidth(first), emWidth(second)) - (/[，、；：！？,;:!?]$/.test(first) ? 0.5 : 0)
    if (!best || score < best.score) best = { lines: [first, second], score }
  }
  if (best) return best.lines
  const cut = Math.ceil(chars.length / 2)
  return [chars.slice(0, cut).join('').trim(), chars.slice(cut).join('').trim()]
}

function splitNote(point: string): [string, string | null] {
  const match = NOTE_SEPARATOR.exec(point)
  if (!match || match.index === 0) return [point, null]
  const note = point.slice(match.index + match[0].length).trim()
  return note ? [point.slice(0, match.index).trim(), note] : [point, null]
}

function renumber(text: string, page: number, total: number): string {
  let seen = 0
  return text.replace(/(?<!\d)\d{2}(?!\d)/g, (match) => {
    seen += 1
    if (seen === 1) return pad(page)
    if (seen === 2) return pad(total)
    return match
  })
}

/** Sentences of a paragraph, for templates whose page has items but no paragraph slot. */
function sentences(body: string): string[] {
  return body
    .split(/\n|(?<=[。！？!?；;])/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

interface SlideFill {
  title: string
  lead?: string
  points: string[]
  quote?: string
  toc: string[]
  page: number
  total: number
}

interface FilledSlide {
  slide: FreeformSlide
  shrunk: Array<{ node: string; from: number; to: number }>
  overflowing: Array<{ node: string; text: string }>
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Room a text may grow into, and the gap it keeps from what it would run into. */
const GROW_GAP = 12
const PAGE_MARGIN = 24
/** Shapes at least this transparent are glows behind the copy, not things it can run into. */
const SEE_THROUGH = 0.7

function textNodeNamed(slide: FreeformSlide, name: string): FreeformTextElement | null {
  const node = slide.nodes.find((candidate) => candidate.name === name)
  return node?.type === 'text' ? node : null
}

function boxOf(node: FreeformSceneNode): Box | null {
  return node.type === 'group' ? null : { x: node.x, y: node.y, width: node.width, height: node.height }
}

function contains(outer: Box, inner: Box): boolean {
  return outer.x <= inner.x + 2 && outer.y <= inner.y + 2
    && outer.x + outer.width >= inner.x + inner.width - 2
    && outer.y + outer.height >= inner.y + inner.height - 2
}

/**
 * Let a text that needs more room take the free space around it: down to the
 * next thing below it, then up to the next thing above, staying inside the
 * card it sits on (or the page). Returns the box it may use.
 */
function freeRoom(node: FreeformTextElement, siblings: readonly FreeformSceneNode[], page: { height: number }): { top: number; bottom: number } {
  const own = boxOf(node)!
  const containers = siblings.flatMap((sibling) => {
    if (sibling === node || sibling.type !== 'shape') return []
    const box = boxOf(sibling)
    return box && contains(box, own) && box.width * box.height > own.width * own.height ? [box] : []
  })
  const card = containers.sort((a, b) => a.width * a.height - b.width * b.height)[0]
  let top = card ? card.y + GROW_GAP : PAGE_MARGIN
  let bottom = card ? card.y + card.height - GROW_GAP : page.height - PAGE_MARGIN
  for (const sibling of siblings) {
    if (sibling === node || sibling.hidden) continue
    if (sibling.type === 'shape' && (sibling.opacity ?? 1) < SEE_THROUGH) continue
    const box = boxOf(sibling)
    if (!box || containers.includes(box)) continue
    if (box.x >= own.x + own.width || box.x + box.width <= own.x) continue
    if (containers.some((container) => contains(container, own) && !contains(container, box) && contains(box, container))) continue
    if (box.y >= own.y + own.height - 1) bottom = Math.min(bottom, box.y - GROW_GAP)
    else if (box.y + box.height <= own.y + 1) top = Math.max(top, box.y + box.height + GROW_GAP)
  }
  return { top: Math.min(top, own.y), bottom: Math.max(bottom, own.y + own.height) }
}

/** Every text a page's slots fill. */
function slotTexts(slots: SlideSlots): string[] {
  const names: string[] = typeof slots.title === 'string' ? [slots.title] : [...slots.title]
  const add = (item: SlotItem | undefined) => {
    if (!item) return
    names.push(item.text)
    if (item.note) names.push(item.note)
  }
  if (slots.lead) names.push(slots.lead)
  slots.items?.forEach(add)
  if (slots.list) names.push(slots.list)
  add(slots.quote)
  slots.toc?.items?.forEach(add)
  if (slots.toc?.list) names.push(slots.toc.list)
  return names
}

/**
 * A slot's box, kept clear of the texts it overlaps. Templates sometimes draw
 * a box over the item beside it or the note under it (their samples are short
 * enough not to meet), and copy filling the whole box would run into that
 * text: the box ends where a text under it begins, and where a text beside it
 * begins on the side its lines grow toward (both boxes' padding still keeps
 * the words apart). Only texts starting past its middle count, so it keeps at
 * least half of each side.
 */
function clearOfTexts(node: FreeformTextElement, siblings: readonly FreeformSceneNode[]): FreeformTextElement {
  if (node.vertical) return node
  const middleX = node.x + node.width / 2
  const middleY = node.y + node.height / 2
  let left = node.x
  let right = node.x + node.width
  let bottom = node.y + node.height
  for (const sibling of siblings) {
    if (sibling === node || sibling.type !== 'text' || sibling.hidden) continue
    const rowOverlap = Math.min(node.y + node.height, sibling.y + sibling.height) - Math.max(node.y, sibling.y)
    const columnOverlap = Math.min(node.x + node.width, sibling.x + sibling.width) - Math.max(node.x, sibling.x)
    if (rowOverlap <= 0 || columnOverlap <= 0) continue
    const sameRow = rowOverlap >= Math.min(node.height, sibling.height) / 2
    if (sameRow && sibling.x > middleX) {
      if (node.align !== 'right') right = Math.min(right, sibling.x)
    } else if (sameRow && sibling.x + sibling.width < middleX) {
      if (node.align !== 'left') left = Math.max(left, sibling.x + sibling.width)
    } else if (columnOverlap >= Math.min(node.width, sibling.width) / 2 && sibling.y > middleY) {
      bottom = Math.min(bottom, sibling.y)
    }
  }
  if (node.align === 'center') {
    const half = Math.min(middleX - left, right - middleX)
    left = middleX - half
    right = middleX + half
  }
  if (left === node.x && right === node.x + node.width && bottom === node.y + node.height) return node
  const x = Math.round(left)
  return { ...node, x, width: Math.round(right) - x, height: Math.round(bottom) - node.y }
}

function fillSlide(template: FreeformSlide, slots: SlideSlots, fill: SlideFill): FilledSlide {
  // Sample copy that is always removed is nothing to keep clear of.
  const alwaysRemoved = new Set(slots.remove?.flatMap((item) => [item.text, ...(item.note ? [item.note] : []), ...(item.extras ?? [])]))
  const staying = template.nodes.filter((node) => !alwaysRemoved.has(node.name))
  const slotNames = new Set(slotTexts(slots))
  const cleared = new Set<string>()
  const slide: FreeformSlide = {
    ...template,
    nodes: template.nodes.map((node) => {
      if (node.type !== 'text' || !slotNames.has(node.name)) return node
      const clear = clearOfTexts(node, staying)
      if (clear !== node) cleared.add(node.name)
      return clear
    }),
  }
  const kept = slide.nodes.filter((node) => !alwaysRemoved.has(node.name))
  /** The sample that lends a box its room (see textFits); a cleared box has only the room it shows. */
  const sampleOf = (node: FreeformTextElement) => (cleared.has(node.name) ? undefined : node.text)
  const texts = new Map<string, string>()
  const remove = new Set<string>()
  const dropItem = (item: SlotItem | undefined) => {
    if (!item) return
    remove.add(item.text)
    if (item.note) remove.add(item.note)
    item.extras?.forEach((name) => remove.add(name))
  }
  const dropList = () => {
    if (!slots.list) return
    remove.add(slots.list)
    slots.listExtras?.forEach((name) => remove.add(name))
  }
  const bullets = (points: string[]) => points.map((point) => `· ${point}`)

  if (typeof slots.title === 'string') {
    texts.set(slots.title, fill.title)
  } else {
    const [first, second] = splitTitle(fill.title)
    texts.set(slots.title[0], first)
    if (second) texts.set(slots.title[1], second)
    else remove.add(slots.title[1])
  }

  let lead = fill.lead
  let points = fill.points
  const items = slots.items ?? []
  // A paragraph with nowhere to go joins the points, sentence by sentence.
  if (!slots.lead && lead && items.length > 0) {
    points = [...sentences(lead), ...points]
    lead = undefined
  }

  const numbered = (index: number, text: string) => (slots.numberedItems ? `${pad(index + 1)}\n${text}` : text)
  /**
   * Whether a text can take `text`: at the smallest size copy shrinks to, in
   * its box or in the free room the box may grow into (as fitting it does).
   */
  const canHold = (node: FreeformTextElement, text: string) => {
    const size = node.fontSize * MIN_FIT_SCALE
    if (textFits(node, text, size, sampleOf(node))) return true
    if (node.vertical) return false
    const room = freeRoom(node, kept, slide)
    return textFits({ ...node, y: room.top, height: room.bottom - room.top }, text, size, sampleOf(node))
  }
  /** A point as an item shows it: its own words, or split into the item's two lines. */
  const itemParts = (item: SlotItem, point: string, index: number): [string, string | null] => {
    let [text, note] = item.note ? splitNote(point) : [point, null]
    const textNode = textNodeNamed(slide, item.text)
    if (item.note && note === null && textNode
      && !textFits(textNode, numbered(index, text), textNode.fontSize * MIN_FIT_SCALE, sampleOf(textNode))) {
      const comma = /[，,；;]/.exec(point)
      if (comma && comma.index > 0 && comma.index < point.length - 1) {
        text = point.slice(0, comma.index).trim()
        note = point.slice(comma.index + 1).trim()
      }
    }
    return [numbered(index, text), note]
  }
  const itemFits = (item: SlotItem, point: string, index: number) => {
    const [text, note] = itemParts(item, point, index)
    const textNode = textNodeNamed(slide, item.text)
    if (!textNode || !canHold(textNode, text)) return false
    const noteNode = item.note && note ? textNodeNamed(slide, item.note) : null
    return !noteNode || canHold(noteNode, note!)
  }

  const shown = points.slice(0, items.length)
  const rest = points.slice(items.length)
  const useItems = shown.length > 0
    && (shown.every((point, index) => itemFits(items[index], point, index)) || (!slots.lead && !slots.list))
  if (useItems) {
    shown.forEach((point, index) => {
      const item = items[index]
      const [text, note] = itemParts(item, point, index)
      texts.set(item.text, text)
      if (item.note) {
        if (note) texts.set(item.note, note)
        else remove.add(item.note)
      }
    })
    items.slice(shown.length).forEach(dropItem)
    // Points beyond the items follow them: in the list, in the paragraph when
    // it sits below the items, else in the last item itself.
    const leadNode = slots.lead ? textNodeNamed(slide, slots.lead) : null
    const lastItem = items[shown.length - 1]
    const lastNode = textNodeNamed(slide, lastItem.text)
    if (rest.length > 0 && slots.list) {
      texts.set(slots.list, rest.join('\n'))
    } else {
      dropList()
      if (rest.length > 0 && leadNode && lastNode && leadNode.y >= lastNode.y) {
        lead = [lead, ...bullets(rest)].filter(Boolean).join('\n')
      } else if (rest.length > 0) {
        const target = lastItem.note ?? lastItem.text
        remove.delete(target)
        texts.set(target, [texts.get(target), ...rest].filter(Boolean).join('；'))
      }
    }
  } else {
    items.forEach(dropItem)
    if (points.length > 0 && slots.list) {
      texts.set(slots.list, points.join('\n'))
    } else {
      dropList()
      if (points.length > 0) lead = [lead, ...bullets(points)].filter(Boolean).join('\n')
    }
  }
  if (!useItems) slots.itemsExtras?.forEach((name) => remove.add(name))

  if (slots.lead) {
    if (lead) texts.set(slots.lead, lead)
    else {
      remove.add(slots.lead)
      slots.leadExtras?.forEach((name) => remove.add(name))
    }
  }

  if (slots.quote) {
    if (fill.quote) {
      const match = QUOTE_SOURCE.exec(fill.quote)
      const words = match && match.index > 0 ? fill.quote.slice(0, match.index).trim() : fill.quote
      const source = match && match.index > 0 ? fill.quote.slice(match.index + match[0].length).trim() : ''
      const sample = textNodeNamed(slide, slots.quote.text)?.text ?? ''
      const quoted = /^[“"「]/.test(sample) && !/^[“"「]/.test(words) ? `“${words}”` : words
      texts.set(slots.quote.text, quoted)
      if (slots.quote.note) {
        if (source) texts.set(slots.quote.note, source)
        else remove.add(slots.quote.note)
      }
    } else {
      dropItem(slots.quote)
    }
  }

  if (slots.toc) {
    const tocItems = slots.toc.items ?? []
    if (fill.toc.length > 0) {
      tocItems.forEach((item, index) => {
        const entry = fill.toc[index]
        if (entry === undefined) dropItem(item)
        else texts.set(item.text, entry)
      })
      if (slots.toc.list) texts.set(slots.toc.list, fill.toc.slice(0, 4).join('\n'))
    } else {
      tocItems.forEach(dropItem)
      if (slots.toc.list) remove.add(slots.toc.list)
      slots.toc.extras?.forEach((name) => remove.add(name))
    }
  }

  // Page numbers keep their width, so they keep their size too.
  const renumbered = new Map<string, string>()
  for (const name of slots.numbers ?? []) {
    if (remove.has(name) || texts.has(name)) continue
    const node = textNodeNamed(slide, name)
    if (node) renumbered.set(name, renumber(node.text, fill.page, fill.total))
  }
  slots.remove?.forEach(dropItem)

  const nodes: FreeformSceneNode[] = slide.nodes.flatMap((node): FreeformSceneNode[] => {
    if (remove.has(node.name)) return []
    if (node.type !== 'text') return [node]
    const number = renumbered.get(node.name)
    if (number !== undefined) return [{ ...node, text: number }]
    const text = texts.get(node.name)
    if (text === undefined) return [node]
    // Spans index into the sample text; the new words start plain.
    const next: FreeformTextElement = { ...node, text }
    delete next.spans
    return [next]
  })

  const shrunk: FilledSlide['shrunk'] = []
  const overflowing: FilledSlide['overflowing'] = []
  for (const [index, node] of nodes.entries()) {
    if (node.type !== 'text' || !texts.has(node.name)) continue
    const drawn = textNodeNamed(slide, node.name)
    const sample = drawn ? sampleOf(drawn) : undefined
    if (textFits(node, node.text, node.fontSize, sample)) continue
    let fitted: FreeformTextElement = node
    if (!node.vertical) {
      const room = freeRoom(node, nodes, slide)
      const wanted = measureText(node, node.text, node.fontSize).depth + 16
      const height = Math.min(wanted, room.bottom - room.top)
      const y = Math.max(room.top, Math.min(node.y, room.bottom - height))
      fitted = { ...node, y: Math.round(y), height: Math.round(Math.max(node.height, height)) }
      nodes[index] = fitted
    }
    if (textFits(fitted, fitted.text, fitted.fontSize, sample)) continue
    const size = fittingFontSize(fitted, fitted.text, sample)
    const smallest = Math.max(10, Math.floor(fitted.fontSize * MIN_FIT_SCALE))
    shrunk.push({ node: node.name, from: fitted.fontSize, to: size ?? smallest })
    if (size === null) overflowing.push({ node: node.name, text: fitted.text })
    nodes[index] = { ...fitted, fontSize: size ?? smallest }
  }
  // Filled-in headings, points and quotes on two or three lines break where the lines come out even.
  const headings = new Set([
    ...(typeof slots.title === 'string' ? [slots.title] : []),
    ...(slots.items ?? []).map((item) => item.text),
    ...(slots.quote ? [slots.quote.text] : []),
  ])
  nodes.forEach((node, index) => {
    if (node.type === 'text' && headings.has(node.name) && texts.has(node.name)) {
      nodes[index] = { ...node, text: balancedHeading(node, node.text, node.fontSize) }
    }
  })
  return { slide: { ...slide, nodes }, shrunk, overflowing }
}

export function composeDeck(templateId: string, value: unknown): ComposeSuccess | ComposeError {
  const template = seriesOf(templateId)
  if (!template) {
    const known = TEMPLATE_REGISTRY.find((candidate) => candidate.id === templateId)
    return {
      ok: false,
      error: known?.kind === 'poster'
        ? `${templateId} 是单页海报模板，用 create_poster_from_content 生成。`
        : `未知的自由画布模板 id：${templateId}（先用 list_templates 查询，id 以 -freeform 结尾）。`,
    }
  }
  const content = normalizeDeckContent(value)
  if (typeof content === 'string') return { ok: false, error: content }
  const total = 1 + content.pages.length + (content.ending ? 1 : 0)
  // A page may take its layout from another deck template; the cover is always the main one's.
  // A fresh instance per page keeps every slide and node id unique.
  type Layout = { templateId: string; slide: FreeformSlide; slots: SlideSlots }
  const layoutOf = (page: DeckPage | null, role: 'cover' | 'section' | 'ending'): Layout | null => {
    const id = page?.templateId ?? templateId
    const source = id === templateId ? template : seriesOf(id)
    if (!source) return null
    const index = role === 'cover' ? 0 : role === 'section' ? 1 : 2
    return { templateId: id, slide: source.create().slides[index], slots: FREEFORM_TEMPLATE_SLOTS[source.series][role] }
  }
  const notDeck = (page: DeckPage, label: string): ComposeError => ({
    ok: false,
    error: `${label}的 templateId「${page.templateId}」不是套图模板（list_templates 里 kind 为 deck 的才行）。`,
  })
  const cover = layoutOf(null, 'cover')!
  const sections: Layout[] = []
  for (const [index, page] of content.pages.entries()) {
    const layout = layoutOf(page, 'section')
    if (!layout) return notDeck(page, `第 ${index + 1} 个小节`)
    sections.push(layout)
  }
  const closing = content.ending ? layoutOf(content.ending, 'ending') : null
  if (content.ending && !closing) return notDeck(content.ending, '结尾页')

  const plan: Array<{ role: 'cover' | 'section' | 'ending'; layout: Layout; fill: SlideFill }> = [
    {
      role: 'cover',
      layout: cover,
      fill: {
        title: content.title,
        lead: content.subtitle,
        points: [],
        toc: content.pages.map((page) => page.title),
        page: 1,
        total,
      },
    },
    ...content.pages.map((page, index) => ({
      role: 'section' as const,
      layout: sections[index],
      fill: { title: page.title, lead: page.body, points: page.points ?? [], quote: page.quote, toc: [], page: index + 2, total },
    })),
    ...(content.ending && closing
      ? [{
          role: 'ending' as const,
          layout: closing,
          fill: {
            title: content.ending.title,
            lead: content.ending.body,
            points: content.ending.points ?? [],
            quote: content.ending.quote,
            toc: [],
            page: total,
            total,
          },
        }]
      : []),
  ]

  const filled = plan.map((entry) => ({ ...entry, result: fillSlide(entry.layout.slide, entry.layout.slots, entry.fill) }))
  // Data drawings land in the room the words leave, one per page at most.
  const placed: Array<{ slideId: string; page: number; kind: 'chart' | 'table' | 'timeline' | 'progress'; node: string; x: number; y: number; width: number; height: number }> = []
  const unplaced: Array<{ slideId: string; page: number; kind: 'chart' | 'table' | 'timeline' | 'progress'; reason: string }> = []
  for (const [index, entry] of filled.entries()) {
    const page = entry.role === 'cover' ? content : entry.role === 'section' ? content.pages[index - 1] : content.ending
    const element = page && dataElementOf(page)
    if (!element) continue
    const outcome = placeElement(entry.result.slide, element)
    const record = { slideId: entry.result.slide.id, page: index + 1, kind: element.kind }
    if (outcome) placed.push({ ...record, node: outcome.name, ...outcome.box })
    else unplaced.push({ ...record, reason: '这一页的空位放不下它：删短文字或换个版式更松的模板' })
  }
  const slides = filled.map((entry) => entry.result.slide)
  const document = normalizeFreeformDocument({ documentVersion: FREEFORM_DOCUMENT_VERSION, activeSlideId: slides[0].id, slides })
  if (!document) {
    return { ok: false, error: `生成的文档未通过校验：${diagnoseFreeformDocument({ documentVersion: FREEFORM_DOCUMENT_VERSION, activeSlideId: slides[0].id, slides }) ?? '请反馈'}` }
  }

  return {
    ok: true,
    document,
    summary: {
      documentVersion: FREEFORM_DOCUMENT_VERSION,
      templateId,
      slideCount: document.slides.length,
      coverTitle: content.title,
      pages: filled.map((entry, index) => ({
        slideId: entry.result.slide.id,
        page: index + 1,
        role: entry.role,
        title: entry.fill.title,
        templateId: entry.layout.templateId,
      })),
      shrunk: filled.flatMap((entry, index) => entry.result.shrunk.map((item) => ({
        slideId: entry.result.slide.id,
        page: index + 1,
        ...item,
      }))),
      overflowing: filled.flatMap((entry, index) => entry.result.overflowing.map((item) => ({
        slideId: entry.result.slide.id,
        page: index + 1,
        ...item,
      }))),
      ...(placed.length > 0 ? { placed } : {}),
      ...(unplaced.length > 0 ? { unplaced } : {}),
    },
  }
}

/** A page's one data drawing, as the node factory that builds it sees it. */
function dataElementOf(page: DeckPage): { kind: 'chart'; chart: DeckChart } | { kind: 'table'; table: DeckTable } | { kind: 'timeline'; timeline: DeckTimeline } | { kind: 'progress'; progress: DeckProgress } | null {
  if (page.chart) return { kind: 'chart', chart: page.chart }
  if (page.table) return { kind: 'table', table: page.table }
  if (page.timeline) return { kind: 'timeline', timeline: page.timeline }
  if (page.progress) return { kind: 'progress', progress: page.progress }
  return null
}

/** The size a data drawing wants, and the least it can be readable at. */
function elementSize(kind: 'chart' | 'table' | 'timeline' | 'progress'): { desired: { width: number; height: number }; min: { width: number; height: number } } {
  switch (kind) {
    case 'chart': return { desired: { width: 480, height: 320 }, min: { width: 280, height: 180 } }
    case 'table': return { desired: { width: 480, height: 320 }, min: { width: 320, height: 160 } }
    case 'timeline': return { desired: { width: 480, height: 420 }, min: { width: 320, height: 200 } }
    case 'progress': return { desired: { width: 480, height: 96 }, min: { width: 240, height: 64 } }
  }
}

/** Every leaf box a placed element has to keep clear of. */
function blockingBoxes(nodes: readonly FreeformSceneNode[]): Box[] {
  const boxes: Box[] = []
  const walk = (list: readonly FreeformSceneNode[]) => {
    for (const node of list) {
      if (node.hidden) continue
      // Nearly transparent shapes are glows behind the copy, not obstacles.
      if (node.type === 'shape' && (node.opacity ?? 1) < SEE_THROUGH) continue
      if (node.type === 'group') {
        walk(node.children)
        continue
      }
      const box = boxOf(node)
      if (box) boxes.push(box)
    }
  }
  walk(nodes)
  return boxes
}

/** The largest empty rectangle on a page, on a coarse grid. */
export function largestFreeRectangleFor(width: number, height: number, boxes: Box[]): Box {
  const CELL = 16
  const columns = Math.max(1, Math.floor(width / CELL))
  const rows = Math.max(1, Math.floor(height / CELL))
  const blocked = (column: number, row: number) => {
    const x = column * CELL
    const y = row * CELL
    if (x < PAGE_MARGIN || y < PAGE_MARGIN || x + CELL > width - PAGE_MARGIN || y + CELL > height - PAGE_MARGIN) return true
    return boxes.some((box) => x < box.x + box.width && x + CELL > box.x && y < box.y + box.height && y + CELL > box.y)
  }
  // Free cells pile upward row by row. Every rectangle is measured once: from
  // the first column of a run of cells at least that tall, as far right as the
  // run stays that tall. Areas are compared in cells; the answer is pixels.
  const heights = new Array<number>(columns).fill(0)
  let best = { x: PAGE_MARGIN, y: PAGE_MARGIN, width: 0, height: 0 }
  let bestArea = 0
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      heights[column] = blocked(column, row) ? 0 : heights[column] + 1
    }
    for (let column = 0; column < columns; column += 1) {
      const height = heights[column]
      if (height === 0) continue
      // The first column of an equal-height run measures the whole run once;
      // a taller neighbour does not cover this shorter, wider rectangle.
      if (column > 0 && heights[column - 1] === height) continue
      let width = 1
      while (column + width < columns && heights[column + width] >= height) width += 1
      if (height * width > bestArea) {
        bestArea = height * width
        best = { x: column * CELL, y: (row - height + 1) * CELL, width: width * CELL, height: height * CELL }
      }
    }
  }
  return best
}

/**
 * Put a page's data drawing on the filled slide, in the room the words left:
 * the element takes its wanted size centred in the largest free rectangle,
 * shrinking to the rectangle when it is smaller. Returns the node's name and
 * final box, or null when even the minimum size does not fit.
 */
function placeElement(
  slide: FreeformSlide,
  element: NonNullable<ReturnType<typeof dataElementOf>>,
): { name: string; box: { x: number; y: number; width: number; height: number } } | null {
  const { desired, min } = elementSize(element.kind)
  const free = largestFreeRectangleFor(slide.width, slide.height, blockingBoxes(slide.nodes))
  const fit = {
    width: Math.min(desired.width, free.width),
    height: Math.min(desired.height, free.height),
  }
  if (fit.width < min.width || fit.height < min.height) return null
  const x = Math.round(free.x + (free.width - fit.width) / 2)
  const y = Math.round(free.y + (free.height - fit.height) / 2)
  const box = { x, y, width: Math.round(fit.width), height: Math.round(fit.height) }
  const placed = elementNode(element, slide, box)
  slide.nodes = [...slide.nodes, placed]
  return { name: placed.name, box }
}

/** Build the drawing's node from the editor's own sample, with the reader's data. */
function elementNode(
  element: NonNullable<ReturnType<typeof dataElementOf>>,
  slide: FreeformSlide,
  box: { x: number; y: number; width: number; height: number },
): FreeformSceneNode {
  if (element.kind === 'chart') {
    const chart = element.chart
    const node = createChartElement(slide)
    return {
      ...node,
      ...box,
      chartKind: chart.kind,
      labels: [...chart.labels],
      series: chart.series.map((entry, index) => ({
        ...(entry.name !== undefined ? { name: entry.name } : {}),
        values: [...entry.values],
        color: entry.color ?? (index === 0 ? CHART_ACCENT_DEFAULT : node.series[0].color),
      })),
    }
  }
  if (element.kind === 'table') {
    const table = element.table
    const cols = Math.max(
      table.header?.length ?? 0,
      ...table.rows.map((row) => row.length),
    )
    const pad = (row: string[]) => [...row, ...Array.from({ length: cols - row.length }, () => '')]
    const cells: string[] = [...(table.header ? pad(table.header) : []), ...table.rows.flatMap((row) => pad(row))]
    const node = createTableElement(slide)
    return {
      ...node,
      ...box,
      rows: (table.header ? 1 : 0) + table.rows.length,
      cols,
      cells,
      ...(table.header ? {} : { headerRow: false }),
    }
  }
  if (element.kind === 'timeline') {
    const node = createTimelineElement(slide)
    return {
      ...node,
      ...box,
      items: element.timeline.items.map((item) => ({
        ...(item.label !== undefined ? { label: item.label } : {}),
        text: item.text,
      })),
      // Wide free room runs the entries side by side; tall room keeps the spine on the left.
      ...(box.width > box.height ? { horizontal: true } : {}),
    }
  }
  const node = createProgressElement(slide)
  return {
    ...node,
    ...box,
    value: element.progress.value,
    ...(element.progress.label ? { label: element.progress.label } : {}),
  }
}
