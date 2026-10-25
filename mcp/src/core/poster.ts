// Compose a poster: a one-page template (src/templates/slots.ts
// FREEFORM_POSTER_SLOTS) filled with the client's words. Every sample text is
// replaced or removed with what only frames it, the picture slot takes the
// client's picture (or a colour block that keeps the layout), and copy shrinks
// to stay in the box the template drew for it.

import { createDefaultImageFraming } from '../../../src/freeform/imageFraming'
import { parsePathData } from '../../../src/freeform/pathData'
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import { TABLE_CELL_MAX_CHARS, TABLE_COLS_MAX, TABLE_ROWS_MAX } from '../../../src/freeform/tables'
import {
  TIMELINE_ITEMS_MAX,
  TIMELINE_ITEMS_MIN,
  TIMELINE_LABEL_MAX_CHARS,
  TIMELINE_TEXT_MAX_CHARS,
} from '../../../src/freeform/timeline'
import type { FreeformDocument, FreeformSceneNode, FreeformTextElement } from '../../../src/freeform/types'
import { FREEFORM_POSTER_TEXT_ONLY, TEMPLATE_REGISTRY } from '../../../src/templates/registry'
import { FREEFORM_POSTER_SLOTS, posterTextOnlySlots, type PosterCentre, type PosterDetail, type PosterSlots, type SlotItem } from '../../../src/templates/slots'
import { tableNodes, tableShape } from '../../../src/templates/tables'
import type { FreeformPosterSeriesId } from '../../../src/templates/types'
import { fillingHeading, fittingFontSize, measureText, MIN_FIT_SCALE, textFits, withSampleRoom, wordBrokenHeading } from './textFit'

export interface PosterContent {
  title: string
  subtitle?: string
  body?: string
  /** Who it is for: the name on a certificate. */
  recipient?: string
  /** Information lines; "标签：内容" puts the part before the colon in the line's label. */
  details?: string[]
  /** A table's rows (a timetable): the first row is the column headings, each row's first cell its label. */
  table?: string[][]
  cta?: string
  tag?: string
  brand?: string
  /** The picture: an http(s) URL, a data URL, or a file path (embedded before the poster is kept). */
  image?: string
  /** The chart's data: category labels and one to three series with their values. */
  chart?: PosterChartContent
}

/** A chart as poster content: labels name the categories, each series one value per label; `kind` redraws it as another chart. */
export interface PosterChartContent {
  kind?: PosterChartKind
  labels?: string[]
  series: Array<{ name?: string; values: number[]; color?: string }>
}

const CHART_KINDS = ['bar', 'ring', 'line', 'radar'] as const
export type PosterChartKind = (typeof CHART_KINDS)[number]

export interface PosterSuccess {
  ok: true
  document: FreeformDocument
  summary: {
    documentVersion: number
    templateId: string
    width: number
    height: number
    /** Copy that was set smaller to fit its box. */
    shrunk: Array<{ node: string; from: number; to: number }>
    /** Copy that still doesn't fit at the smallest size: shorten it. */
    overflowing: Array<{ node: string; text: string }>
    /** Information lines beyond the rows the template has (and the room to continue them), timeline entries beyond eight, and table cells beyond the rows and columns it can draw. */
    unplaced: string[]
    /** Content the template has no place for, not even a free slot of a similar kind. */
    unused: Array<keyof PosterContent>
    /**
     * Content put somewhere the template didn't mean it: a line continuing
     * the information rows, or words in a free slot of a similar kind (a
     * sign-off in an empty information row, a body in the subtitle's place).
     * `node` names the layer that holds it.
     */
    moved: Array<{ content: keyof PosterContent; text: string; node: string }>
    /** What to do about anything left out; absent when everything is on the poster. */
    hint?: string
    /** text-only: no picture came, so the poster is the template's drawing without one. */
    layout?: 'text-only'
  }
}

export interface PosterError {
  ok: false
  error: string
}

// A colon between digits is part of a time or a ratio (09:30, 3:4), not a label's end.
const LABEL_SEPARATOR = /\s*(?:：|(?<!\d):|:(?!\d))\s*/

/** A badge's few words may shrink further than copy: they have to stay inside the badge. */
const TAG_MIN_FIT_SCALE = 0.5

/** Slots that take other content's words when their own is missing, by kind. */
type FreeSlotKind = 'row' | 'subtitle' | 'body' | 'brand'
const MOVES: Partial<Record<keyof PosterContent, readonly FreeSlotKind[]>> = {
  recipient: ['subtitle'],
  body: ['subtitle'],
  subtitle: ['body', 'row'],
  cta: ['row', 'brand', 'subtitle'],
  brand: ['row', 'subtitle'],
  tag: ['row'],
}
/** Content names in the hint for what didn't fit. */
const CONTENT_NAMES: Partial<Record<keyof PosterContent, string>> = {
  subtitle: '副标题',
  body: '正文',
  recipient: '获得者',
  cta: '按钮',
  tag: '角标',
  brand: '署名',
  details: '信息行',
  image: '图片',
  chart: '图表',
  table: '表格',
}
const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'] as const
/** The render page's padding inside a text box. */
const TEXT_PADDING = 8

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A node's box on the page; a group's spans its children. */
function boxOf(node: FreeformSceneNode, offset = { x: 0, y: 0 }): Box | null {
  if (node.type !== 'group') return { x: offset.x + node.x, y: offset.y + node.y, width: node.width, height: node.height }
  const inner = node.children.map((child) => boxOf(child, { x: offset.x + node.x, y: offset.y + node.y })).filter((box): box is Box => box !== null)
  if (inner.length === 0) return null
  const left = Math.min(...inner.map((box) => box.x))
  const top = Math.min(...inner.map((box) => box.y))
  return {
    x: left,
    y: top,
    width: Math.max(...inner.map((box) => box.x + box.width)) - left,
    height: Math.max(...inner.map((box) => box.y + box.height)) - top,
  }
}

function union(boxes: readonly Box[]): Box {
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  return {
    x: left,
    y: top,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - left,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - top,
  }
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const encloses = (outer: Box, inner: Box) => outer.x <= inner.x && outer.y <= inner.y
  && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height

/** The next row's layer name: the row number counts on (信息三 → 信息四), else it is appended. */
function nextRowName(name: string, index: number): string {
  const numeral = NUMERALS[index] ?? String(index + 1)
  return /[一二三四五六七八九十]+$/.test(name) ? name.replace(/[一二三四五六七八九十]+$/, numeral) : `${name}${index + 1}`
}

/** A row's own number in a mark beside it, counted on for the next row ("03" → "04", "3" → "4"); other words stay. */
function countedOn(text: string, from: number, to: number): string {
  const match = /^(\D*)(\d+)(\D*)$/.exec(text)
  if (!match || Number(match[2]) !== from) return text
  return `${match[1]}${String(to).padStart(match[2].length, '0')}${match[3]}`
}

/** A line's label and value: "标签：内容" splits at the colon when both sides have words. */
function splitLine(line: string): { label: string; value: string } | null {
  const match = LABEL_SEPARATOR.exec(line)
  if (match === null || match.index === 0 || match.index + match[0].length >= line.length) return null
  return { label: line.slice(0, match.index), value: line.slice(match.index + match[0].length) }
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : ''
}

/** Check chart content: 1–12 labels, 1–3 series, each series one non-negative value per label. */
function normalizeChartContent(value: unknown): PosterChartContent | string {
  if (typeof value !== 'object' || value === null) return 'content.chart 需要是对象：{ labels?: string[], series: [{ name?, values: number[], color? }] }'
  const record = value as Record<string, unknown>
  if (record.kind !== undefined && !CHART_KINDS.includes(record.kind as PosterChartKind)) {
    return 'content.chart.kind 只能是 bar、ring、line 或 radar（柱状、环形、折线、雷达）'
  }
  const labels = record.labels === undefined ? undefined : record.labels as unknown
  if (labels !== undefined && (!Array.isArray(labels) || !labels.every((label) => typeof label === 'string'))) {
    return 'content.chart.labels 需要是字符串数组'
  }
  if (Array.isArray(labels) && (labels.length === 0 || labels.length > 12 || labels.some((label) => !String(label).trim()))) {
    return 'content.chart.labels 需要 1–12 个非空类目'
  }
  if (!Array.isArray(record.series) || record.series.length === 0 || record.series.length > 3) {
    return 'content.chart.series 需要 1–3 个系列：[{ name?, values: number[], color? }]'
  }
  const series: PosterChartContent['series'] = []
  for (const entry of record.series as Array<Record<string, unknown>>) {
    if (typeof entry !== 'object' || entry === null) return 'content.chart.series 的每个系列需要是对象'
    const name = entry.name === undefined ? undefined : String(entry.name)
    if (name !== undefined && (name.trim().length === 0 || name.length > 12)) {
      return 'content.chart.series 的名称需要 1–12 个字符'
    }
    const values = entry.values
    if (!Array.isArray(values) || values.length === 0 || values.length > 12
      || !values.every((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0)) {
      return 'content.chart.series 的每个系列需要 1–12 个非负数值'
    }
    const color = entry.color === undefined ? undefined : String(entry.color)
    if (color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return 'content.chart.series 的颜色需要是 #RRGGBB'
    }
    series.push({
      ...(name !== undefined ? { name } : {}),
      values: values as number[],
      ...(color !== undefined ? { color } : {}),
    })
  }
  return {
    ...(record.kind !== undefined ? { kind: record.kind as PosterChartKind } : {}),
    ...(Array.isArray(labels) ? { labels: labels.map(String) } : {}),
    series,
  }
}

/** Check and tidy poster content from a client: trimmed strings, no empty lines. */
export function normalizePosterContent(value: unknown): PosterContent | string {
  if (typeof value !== 'object' || value === null) return 'content 需要是对象'
  const record = value as Record<string, unknown>
  const title = clean(record.title)
  if (!title) return 'content.title（海报标题）不能为空'
  if (record.details !== undefined && !Array.isArray(record.details)) return 'content.details 需要是字符串数组'
  const details = Array.isArray(record.details) ? record.details.map(clean).filter((line) => line.length > 0) : []
  if (record.table !== undefined && (!Array.isArray(record.table) || !record.table.every((row) => Array.isArray(row)))) {
    return 'content.table 需要是二维字符串数组：[["节次", "周一", …], ["第 1 节", "语文", …], …]'
  }
  const table = Array.isArray(record.table) ? (record.table as unknown[][]).map((row) => row.map(clean)) : []
  // Rows with nothing in them at the end are not rows.
  while (table.length > 0 && table[table.length - 1].every((cell) => !cell)) table.pop()
  const content: PosterContent = { title }
  for (const key of ['subtitle', 'body', 'recipient', 'cta', 'tag', 'brand', 'image'] as const) {
    const text = clean(record[key])
    if (text) content[key] = text
  }
  if (details.length > 0) content.details = details
  if (table.length > 0) content.table = table
  if (record.chart !== undefined) {
    const chart = normalizeChartContent(record.chart)
    if (typeof chart === 'string') return chart
    content.chart = chart
  }
  return content
}

function posterSeries(templateId: string): { series: FreeformPosterSeriesId; create: () => FreeformDocument } | null {
  const template = TEMPLATE_REGISTRY.find((candidate) => candidate.id === templateId)
  if (!template || template.workspace !== 'freeform' || template.kind !== 'poster' || !template.createFreeform) return null
  if (!(template.series in FREEFORM_POSTER_SLOTS)) return null
  return { series: template.series as FreeformPosterSeriesId, create: template.createFreeform }
}

/** A node moved down the page (up when `by` is negative). */
function shifted(node: FreeformSceneNode, by: number): FreeformSceneNode {
  return by === 0 ? node : { ...node, y: Math.round((node.y + by) * 10) / 10 }
}

/** Where a node's ink sits down the page: a text's set lines where its alignment puts them, else its box. */
function inkSpan(node: FreeformSceneNode): { top: number; bottom: number } | null {
  if (node.type !== 'text') {
    const box = boxOf(node)
    return box ? { top: box.y, bottom: box.y + box.height } : null
  }
  if (node.vertical) return { top: node.y, bottom: node.y + node.height }
  const depth = measureText(node, node.text, node.fontSize, true).depth
  const room = node.height - TEXT_PADDING * 2
  const offset = node.verticalAlign === 'middle' ? (room - depth) / 2 : node.verticalAlign === 'bottom' ? room - depth : 0
  const top = node.y + TEXT_PADDING + Math.max(0, offset)
  return { top, bottom: top + depth }
}

/** How far down the page each y moves when the cuts close: by every cut at or above it. */
function cutShift(cuts: readonly Cut[], y: number): number {
  return -cuts.reduce((sum, cut) => sum + (y >= cut.at ? cut.by : 0), 0)
}

interface Cut {
  /** Where the closed room began down the page. */
  at: number
  by: number
}

/** Path data with every y value passed through `move`. Only absolute path data can be; anything else comes back null. */
function movedPath(d: string, move: (y: number) => number): string | null {
  const segments = parsePathData(d)
  if (!segments || segments.some((segment) => segment.command !== 'z' && segment.command === segment.command.toLowerCase())) return null
  // Which arguments of each command are y values, by position in its group.
  const ys: Record<string, readonly number[]> = { M: [1], L: [1], T: [1], V: [0], C: [1, 3, 5], S: [1, 3], Q: [1, 3], A: [6], H: [], Z: [], z: [] }
  const sizes: Record<string, number> = { M: 2, L: 2, T: 2, V: 1, H: 1, C: 6, S: 4, Q: 4, A: 7, Z: 1, z: 1 }
  const number = (value: number) => String(Math.round(value * 100) / 100)
  return segments.map(({ command, values }) => {
    const moved = values.map((value, index) => (ys[command].includes(index % sizes[command]) ? move(value) : value))
    return [command, ...moved.map(number)].join(' ')
  }).join(' ')
}

/** A card the cuts run across: shorter by them, its drawing cut where they are, so a torn receipt keeps its teeth. */
function shortened(node: FreeformSceneNode, cuts: readonly Cut[]): FreeformSceneNode {
  if (node.type === 'group') return node
  const foot = node.y + node.height
  // A cut reaching past the card's foot takes only what lies inside it.
  const across = cuts.filter((cut) => cut.at > node.y && cut.at < foot).map((cut) => ({ at: cut.at, by: Math.min(cut.by, foot - cut.at) }))
  const by = across.reduce((sum, cut) => sum + cut.by, 0)
  if (by <= 0) return node
  const height = Math.max(1, node.height - by)
  if (node.type !== 'path') return { ...node, height }
  const scale = node.viewBox.height / node.height
  // From the lowest cut up, so each one is still where the drawing has it:
  // what is below the cut moves up, what is inside it closes to its top.
  let d: string | null = node.d
  for (const cut of [...across].sort((a, b) => b.at - a.at)) {
    if (d === null) break
    const at = node.viewBox.y + (cut.at - node.y) * scale
    const room = cut.by * scale
    d = movedPath(d, (y) => (y >= at + room ? y - room : y > at ? at : y))
  }
  // Path data that can't be cut is squeezed instead.
  return d === null ? { ...node, height } : { ...node, d, height, viewBox: { ...node.viewBox, height: node.viewBox.height - by * scale } }
}

/** A card room opens across: taller by it, its drawing opened where the room goes, not stretched. */
function lengthened(node: FreeformSceneNode, opens: readonly Cut[]): FreeformSceneNode {
  if (node.type === 'group') return node
  const across = opens.filter((open) => open.at > node.y && open.at <= node.y + node.height + 1 && open.by > 0)
  const by = across.reduce((sum, open) => sum + open.by, 0)
  if (by <= 0) return node
  const height = node.height + by
  if (node.type !== 'path') return { ...node, height }
  const scale = node.viewBox.height / node.height
  const page = (y: number) => node.y + (y - node.viewBox.y) / scale
  const d = movedPath(node.d, (y) => y + across.reduce((sum, open) => sum + (page(y) >= open.at ? open.by : 0), 0) * scale)
  // Path data that can't be opened is stretched instead.
  return d === null ? { ...node, height } : { ...node, d, height, viewBox: { ...node.viewBox, height: node.viewBox.height + by * scale } }
}

/** The share of the page a closed-up block may leave empty above or below it once it is centred. */
const CLOSED_MARGIN = 0.2

/**
 * Inside the centre span, the room of each part of the template the content
 * left without words closes: parts overlapping down the page count as one,
 * a run of emptied ones closes to the wider of the gaps around it, what sits
 * below moves up, and the cards shorten by what closed across them. Room at
 * the foot of a span with no card stays for the centring to share. What is
 * pinned keeps its place; what stands aside moves as one piece; the room of
 * what is `held` (rows a spread list took over) stays. `grow` then
 * takes back up to its own height of what closed. A block so short that
 * centring it would leave more than CLOSED_MARGIN of the page empty above or
 * below keeps that room, or the room left at its foot, shared out between
 * its parts.
 */
function closeUp(
  nodes: FreeformSceneNode[],
  template: readonly FreeformSceneNode[],
  centre: PosterCentre,
  pageHeight: number,
  together: ReadonlyMap<string, string>,
  refit: (node: FreeformTextElement) => FreeformTextElement,
  held: ReadonlySet<string>,
): FreeformSceneNode[] {
  const { top, bottom, pinned = [], close = {} } = centre
  const cards = new Set(close.cards ?? [])
  const aside = new Set(close.aside ?? [])
  const fixed = new Set([...pinned, ...cards, ...aside])
  const kept = new Set([...nodes.map((node) => node.name), ...held])
  const within = (box: Box) => box.y >= top - 1 && box.y + box.height <= bottom + 1 && box.height < (bottom - top) * 0.9
  const drawn = new Map<string, Box>()
  for (const node of template) {
    const box = boxOf(node)
    if (box && within(box) && !fixed.has(node.name)) drawn.set(node.name, box)
  }
  // The bands down the page the content still fills (parts overlapping count as one).
  const bands: Array<{ top: number; bottom: number }> = []
  for (const [, box] of [...drawn].filter(([name]) => kept.has(name)).sort((a, b) => a[1].y - b[1].y)) {
    const last = bands[bands.length - 1]
    if (last && box.y < last.bottom) last.bottom = Math.max(last.bottom, box.y + box.height)
    else bands.push({ top: box.y, bottom: box.y + box.height })
  }
  // What was left without words, as the room it took between those bands: a
  // part beside a band (a picture beside the heading) leaves only what reaches past it.
  const emptied = [...drawn].filter(([name]) => !kept.has(name)).map(([, box]) => box)
  const cardBoxes = template.filter((node) => cards.has(node.name)).map((node) => boxOf(node)).filter((box): box is Box => box !== null)
  const card = cardBoxes.length > 0 ? union(cardBoxes) : null
  const cuts: Cut[] = []
  // What the parts left without words took at the foot of the span.
  let footRoom = 0
  for (let index = 0; index <= bands.length; index += 1) {
    const above = index > 0 ? bands[index - 1].bottom : card?.y ?? top
    const below = index < bands.length ? bands[index].top : card ? card.y + card.height : null
    const pieces = emptied
      .map((box) => ({ top: Math.max(box.y, above), bottom: Math.min(box.y + box.height, below ?? Infinity) }))
      .filter((piece) => piece.bottom > piece.top)
    if (pieces.length === 0) continue
    const first = Math.min(...pieces.map((piece) => piece.top))
    const last = Math.max(...pieces.map((piece) => piece.bottom))
    if (below !== null) {
      const keep = Math.max(first - above, below - last, 0)
      if (below - above - keep > 0) cuts.push({ at: first, by: below - above - keep })
    } else {
      footRoom = Math.max(0, last - above)
    }
  }
  if (cuts.length === 0 && footRoom === 0) return nodes
  // What stands aside moves as one piece, by what closed above its middle:
  // a price circle keeps its words where it drew them.
  const asideBoxes = template.filter((node) => aside.has(node.name)).map((node) => boxOf(node)).filter((box): box is Box => box !== null)
  const asideBox = asideBoxes.length > 0 ? union(asideBoxes) : null
  const asideAt = asideBox ? asideBox.y + asideBox.height / 2 : null
  const asideShift = asideAt === null || asideAt < top - 1 || asideAt > bottom + 1 ? 0 : cutShift(cuts, asideAt)
  let result = nodes.map((node) => {
    if (pinned.includes(node.name)) return node
    if (cards.has(node.name)) return shifted(shortened(node, cuts), cutShift(cuts.filter((cut) => cut.at <= node.y), node.y))
    if (aside.has(node.name)) return shifted(node, asideShift)
    // Rows the template didn't draw (lines past its last row) move from where they are.
    const at = drawn.get(node.name)?.y ?? (template.some((other) => other.name === node.name) ? null : node.y)
    return at === null || at < top - 1 || at > bottom + 1 ? node : shifted(node, cutShift(cuts, at))
  })
  const grower = close.grow ? result.find((node) => node.name === close.grow) : undefined
  if (grower && grower.type !== 'group' && cuts.length > 0) {
    const by = Math.min(cuts.reduce((sum, cut) => sum + cut.by, 0), grower.height)
    const foot = grower.y + grower.height
    const asideBelow = asideAt !== null && asideAt + asideShift >= foot - 1
    result = result.map((node) => {
      if (node === grower) return node.type === 'text' ? refit({ ...node, height: node.height + by }) : { ...node, height: node.height + by }
      if (pinned.includes(node.name)) return node
      if (aside.has(node.name)) return asideBelow ? shifted(node, by) : node
      const box = boxOf(node)
      if (!box) return node
      if (cards.has(node.name) && box.y < foot) return lengthened(node, [{ at: foot, by }])
      // Within the span: a footer below it keeps its place.
      return box.y >= foot - 1 && box.y <= bottom + 1 ? shifted(node, by) : node
    })
  }
  // The words of the block, top to bottom, as the parts that now sit apart
  // (a row with its rule, a button with its plate, what stands aside, count as one).
  const parts: Array<{ top: number; bottom: number; nodes: FreeformSceneNode[] }> = []
  const asideKey = Symbol('aside')
  const grouped = new Map<string | symbol, (typeof parts)[number]>()
  for (const node of result) {
    const box = boxOf(node)
    if (!box || cards.has(node.name) || pinned.includes(node.name) || !within(box)) continue
    const span = inkSpan(node)
    if (!span) continue
    const key = aside.has(node.name) ? asideKey : together.get(node.name)
    const group = key === undefined ? undefined : grouped.get(key)
    if (group) {
      group.top = Math.min(group.top, span.top)
      group.bottom = Math.max(group.bottom, span.bottom)
      group.nodes.push(node)
      continue
    }
    const part = { ...span, nodes: [node] }
    parts.push(part)
    if (key !== undefined) grouped.set(key, part)
  }
  parts.sort((a, b) => a.top - b.top)
  const merged: typeof parts = []
  for (const part of parts) {
    const last = merged[merged.length - 1]
    if (last && part.top < last.bottom) {
      last.bottom = Math.max(last.bottom, part.bottom)
      last.nodes.push(...part.nodes)
    } else {
      merged.push({ ...part, nodes: [...part.nodes] })
    }
  }
  if (merged.length < 2) return result
  // The page left empty above and below the block once it is centred: down to
  // what sits outside the span (a masthead, a footer), else the page's edge.
  const ink = merged[merged.length - 1].bottom - merged[0].top
  const outside = result.flatMap((node) => {
    const box = boxOf(node)
    return box && !within(box) && box.height < pageHeight * 0.9 ? [box] : []
  })
  const above = Math.max(0, ...outside.filter((box) => box.y + box.height <= top + 1).map((box) => box.y + box.height))
  const below = Math.min(pageHeight, ...outside.filter((box) => box.y >= bottom - 1).map((box) => box.y))
  const margin = Math.max(top - above, below - bottom) + (bottom - top - ink) / 2
  const back = Math.round(2 * (margin - pageHeight * CLOSED_MARGIN))
  if (back <= 0) return result
  // Shared between the gaps, none more than doubling: a title, a line and its
  // rule don't drift apart, and what is still missing stays round the block.
  const gaps = merged.slice(1).map((part, index) => Math.max(0, part.top - merged[index].bottom))
  const room = gaps.reduce((sum, gap) => sum + gap, 0)
  const opened = Math.min(back, room, cuts.reduce((sum, cut) => sum + cut.by, 0) + footRoom)
  if (opened <= 0) return result
  const moves = new Map<FreeformSceneNode, number>()
  // Where each gap opens, down the page, for the cards round the parts.
  const opens: Cut[] = []
  let moved = 0
  merged.forEach((part, index) => {
    if (index > 0) {
      const share = (opened * gaps[index - 1]) / room
      opens.push({ at: (merged[index - 1].bottom + part.top) / 2, by: Math.round(moved + share) - Math.round(moved) })
      moved += share
    }
    part.nodes.forEach((node) => moves.set(node, Math.round(moved)))
  })
  return result.map((node) => {
    const by = moves.get(node)
    if (by !== undefined) return shifted(node, by)
    return cards.has(node.name) ? lengthened(node, opens) : node
  })
}

/**
 * Close up what the content left open: fewer lines than rows spread over the
 * rows' span and sit in its middle (spreadDetails), a title shorter than its
 * sample pulls up what sits below it (titleFlow), parts left without words
 * close up (centre.close), and a column moves to the middle of its span
 * (centre).
 */
function settle(
  nodes: FreeformSceneNode[],
  template: readonly FreeformSceneNode[],
  slots: PosterSlots,
  used: number,
  page: { height: number; title: string },
): FreeformSceneNode[] {
  const { height: pageHeight, title } = page
  let result = nodes
  const rows = slots.details ?? []
  const filled = Math.min(used, rows.length)
  // Rows a spread list takes the room of: that room stays when the column closes up.
  const held = new Set<string>()
  if (slots.spreadDetails && filled >= 1 && filled < rows.length && !(filled === 1 && slots.closeLoneLine)) {
    const top = (row: (typeof rows)[number]) => template.find((node) => node.name === row.value)?.y
    const first = top(rows[0])
    const second = top(rows[1])
    if (first !== undefined && second !== undefined && second > first) {
      const pitch = second - first
      const spread = filled >= 2 ? Math.min(pitch * 1.6, (pitch * (rows.length - 1)) / (filled - 1)) : pitch
      // What the spread can't fill is shared above and below the list.
      const lead = (pitch * (rows.length - 1) - spread * (filled - 1)) / 2
      const offsets = new Map<string, number>()
      rows.slice(0, filled).forEach((row, index) => {
        for (const name of [row.label, row.value, ...(row.extras ?? [])]) if (name) offsets.set(name, lead + index * (spread - pitch))
      })
      result = result.map((node) => shifted(node, offsets.get(node.name) ?? 0))
      for (const row of rows.slice(filled)) for (const name of [row.label, row.value, ...(row.extras ?? [])]) if (name) held.add(name)
    }
  }
  if (slots.titleFlow) {
    const sample = template.find((node) => node.name === slots.title)
    const title = result.find((node) => node.name === slots.title)
    if (sample?.type === 'text' && title?.type === 'text') {
      const room = measureText(sample, sample.text, sample.fontSize, true).depth - measureText(title, title.text, title.fontSize, true).depth
      const below = sample.y + sample.height - 1
      const pinned = new Set(slots.titleFlow.pinned ?? [])
      if (room > 1) result = result.map((node) => (node.y >= below && !pinned.has(node.name) ? shifted(node, -room) : node))
    }
  }
  if (slots.centre?.close) {
    // What belongs together: an item with its note and extras, a row with its
    // label and the rule under it (a rule above a row parts it from the last).
    const together = new Map<string, string>()
    const items = [slots.subtitle, slots.body, slots.recipient, slots.cta, slots.tag, slots.brand].filter((item): item is SlotItem => item !== undefined)
    for (const item of items) for (const name of [item.text, item.note, ...(item.extras ?? [])]) if (name) together.set(name, item.text)
    const topOf = (name: string) => template.find((node) => node.name === name)?.y ?? 0
    for (const row of rows) {
      const below = (row.extras ?? []).filter((name) => topOf(name) >= topOf(row.value))
      for (const name of [row.label, row.value, ...below]) if (name) together.set(name, row.value)
    }
    const sample = template.find((node) => node.name === slots.title)
    // A title given the room fills its taller box: up to twice the size it may
    // take there, on up to three lines, its words settled on what follows.
    const refit = (node: FreeformTextElement): FreeformTextElement => {
      if (sample?.type !== 'text' || node.height <= sample.height) return node
      const scale = (slots.titleFit?.maxScale ?? 1) * Math.min(2, node.height / sample.height)
      const filled = fillingHeading({ ...node, fontSize: sample.fontSize }, title, Math.round(sample.fontSize * scale), Math.max(3, slots.titleFit?.maxLines ?? 0))
      if (!filled || filled.fontSize <= node.fontSize) return node
      return { ...node, fontSize: filled.fontSize, text: filled.text, verticalAlign: node.verticalAlign === 'middle' ? 'middle' : 'bottom' }
    }
    result = closeUp(result, template, slots.centre, pageHeight, together, refit, held)
  }
  if (slots.centre) {
    const { top, bottom, pinned = [] } = slots.centre
    // What lies inside the span moves; a frame reaching across it stays.
    const inside = result.filter((node) => {
      const box = boxOf(node)
      return box !== null && !pinned.includes(node.name) && box.y >= top - 1 && box.y + box.height <= bottom + 1 && box.height < (bottom - top) * 0.9
    })
    const spans = inside.map(inkSpan).filter((span): span is { top: number; bottom: number } => span !== null)
    if (spans.length > 0) {
      const by = Math.round((top + bottom) / 2 - (Math.min(...spans.map((span) => span.top)) + Math.max(...spans.map((span) => span.bottom))) / 2)
      const moving = new Set(inside)
      result = result.map((node) => (moving.has(node) ? shifted(node, by) : node))
    }
  }
  return slots.link ? linked(result, slots.link, rows.slice(0, filled)) : result
}

/**
 * The line joining the rows' marks, laid from the first row's mark to the
 * last's wherever the rows ended up. A line turned upright runs down the
 * page; one lying flat runs across it.
 */
function linked(nodes: FreeformSceneNode[], name: string, rows: readonly PosterDetail[]): FreeformSceneNode[] {
  const centreOf = (row: PosterDetail) => {
    const mark = nodes.find((node) => node.name === (row.extras?.[0] ?? row.value))
    const box = mark && boxOf(mark)
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null
  }
  const first = rows.length >= 2 ? centreOf(rows[0]) : null
  const last = rows.length >= 2 ? centreOf(rows[rows.length - 1]) : null
  if (!first || !last) return nodes
  return nodes.map((node) => {
    if (node.name !== name || node.type !== 'line') return node
    const upright = Math.abs(Math.abs(node.rotation % 180) - 90) < 1
    const length = Math.round(upright ? last.y - first.y : last.x - first.x)
    if (length <= 0) return node
    // A turned line turns about its middle: its box is laid flat round the middle of the run.
    const middle = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 }
    return { ...node, width: length, x: Math.round((middle.x - length / 2) * 10) / 10, y: Math.round((middle.y - node.height / 2) * 10) / 10 }
  })
}

export function composePoster(templateId: string, value: unknown): PosterSuccess | PosterError {
  const template = posterSeries(templateId)
  if (!template) {
    const known = TEMPLATE_REGISTRY.find((candidate) => candidate.id === templateId)
    return {
      ok: false,
      error: known?.kind === 'deck'
        ? `${templateId} 是整套卡片模板，用 create_document_from_content 生成；海报模板在 list_templates 里 kind 为 poster。`
        : `未知的海报模板 id：${templateId}（先用 list_templates 查询，kind 为 poster 的才是海报）。`,
    }
  }
  const content = normalizePosterContent(value)
  if (typeof content === 'string') return { ok: false, error: content }
  // Without a picture, a poster that draws one is set on its text-only drawing.
  const textOnly = content.image ? undefined : FREEFORM_POSTER_TEXT_ONLY[template.series]
  const slots = textOnly ? posterTextOnlySlots(template.series) : FREEFORM_POSTER_SLOTS[template.series]
  const made = template.create()
  const slide = textOnly ? textOnly() : made.slides[0]

  const texts = new Map<string, string>()
  const remove = new Set<string>()
  const unused: Array<keyof PosterContent> = []
  const dropItem = (item: SlotItem) => {
    remove.add(item.text)
    if (item.note) remove.add(item.note)
    item.extras?.forEach((name) => {
      if (!item.blank?.includes(name)) remove.add(name)
    })
  }

  texts.set(slots.title, content.title)
  const optional: Array<[keyof PosterContent, SlotItem | undefined]> = [
    ['subtitle', slots.subtitle],
    ['body', slots.body],
    ['recipient', slots.recipient],
    ['cta', slots.cta],
    ['tag', slots.tag],
    ['brand', slots.brand],
  ]
  // Slots with nothing of their own may take other words (see MOVES) before they go.
  const freeSlots = new Map<Exclude<FreeSlotKind, 'row'>, SlotItem>()
  for (const [key, slot] of optional) {
    const text = content[key] as string | undefined
    if (slot && text) texts.set(slot.text, text)
    else if (slot && (key === 'subtitle' || key === 'body' || key === 'brand')) freeSlots.set(key, slot)
    else if (slot) dropItem(slot)
    else if (text) unused.push(key)
  }

  const rows = slots.details ?? []
  const lines = content.details ?? []
  // A line in a row: its label in the row's label when both have one, else the whole line.
  const fillRow = (row: PosterDetail, line: string) => {
    const split = splitLine(line)
    if (row.label && split) {
      texts.set(row.label, split.label)
      texts.set(row.value, split.value)
    } else {
      if (row.label) remove.add(row.label)
      texts.set(row.value, line)
    }
  }
  rows.forEach((row, index) => {
    if (lines[index] !== undefined) fillRow(row, lines[index])
  })
  const freeRows = rows.slice(lines.length)
  // A timeline takes the detail lines as its entries when the template draws
  // no detail rows: the part before the colon becomes the time label.
  const timelined = new Map<string, FreeformSceneNode>()
  if (slots.timeline && rows.length === 0 && lines.length >= TIMELINE_ITEMS_MIN) {
    const node = slide.nodes.find((candidate) => candidate.name === slots.timeline!.node)
    if (node?.type === 'timeline') {
      timelined.set(node.name, {
        ...node,
        items: lines.slice(0, TIMELINE_ITEMS_MAX).map((line) => {
          const split = splitLine(line)
          const label = split ? split.label.slice(0, TIMELINE_LABEL_MAX_CHARS) : undefined
          const text = (split ? split.value : line).slice(0, TIMELINE_TEXT_MAX_CHARS)
          return { ...(label !== undefined ? { label } : {}), text }
        }),
      })
    }
  }
  if (lines.length > 0 && rows.length === 0 && timelined.size === 0) unused.push('details')
  slots.remove?.forEach(dropItem)

  const pictured = new Map<string, FreeformSceneNode>()
  if (slots.image) {
    const node = slide.nodes.find((candidate) => candidate.name === slots.image!.node)
    if (node && content.image) {
      if (node.type === 'image') pictured.set(node.name, { ...node, src: content.image, alt: content.title })
      else if (node.type === 'shape') {
        pictured.set(node.name, { ...node, fill: { type: 'image', src: content.image, fit: 'cover', framing: createDefaultImageFraming() } })
      }
    } else if (node?.type === 'shape' && slots.image.fallback) {
      pictured.set(node.name, { ...node, fill: { ...slots.image.fallback } })
    } else if (node && slots.image.keep) {
      // The template's own picture is part of the design: it stays.
    } else if (node) {
      remove.add(node.name)
      slots.image.extras?.forEach((name) => remove.add(name))
    }
  } else if (content.image) {
    unused.push('image')
  }

  // The chart is filled from its own content: the template's labels set the
  // point count unless the content brings its own.
  const charted = new Map<string, FreeformSceneNode>()
  const tabled = new Map<string, FreeformSceneNode>()
  if (slots.chart) {
    const node = slide.nodes.find((candidate) => candidate.name === slots.chart!.node)
    if (node?.type === 'chart') {
      if (content.chart) {
        const labels = content.chart.labels ?? node.labels
        const labelCount = labels.length
        const ragged = content.chart.series.find((entry) => entry.values.length !== labelCount)
        if (ragged !== undefined) {
          return {
            ok: false,
            error: `content.chart 的每个系列需要 ${labelCount} 个数值（和类目数一致）${
              ragged.name ? `：系列「${ragged.name}」给了 ${ragged.values.length} 个` : `，有系列给了 ${ragged.values.length} 个`
            }`,
          }
        }
        // Colours the content leaves out keep the template's, in series order.
        const templateColors = node.series.map((entry) => entry.color)
        charted.set(node.name, {
          ...node,
          chartKind: content.chart.kind ?? node.chartKind,
          labels: [...labels],
          series: content.chart.series.map((entry, index) => ({
            ...(entry.name !== undefined ? { name: entry.name } : {}),
            values: [...entry.values],
            color: entry.color ?? templateColors[index] ?? '#1d4ed8',
          })),
        })
      }
      // Without chart content the template's chart stays, like a kept illustration.
    } else if (content.chart) {
      unused.push('chart')
    }
  } else if (content.chart) {
    unused.push('chart')
  }

  const shrunk: PosterSuccess['summary']['shrunk'] = []
  const overflowing: PosterSuccess['summary']['overflowing'] = []
  const unplaced: string[] = []

  // A table is drawn again at the content's own size: as many rows and columns as given, filling the same space.
  let tableAt = -1
  let tableAnchor: FreeformSceneNode | null = null
  const tableCells: FreeformSceneNode[] = []
  if (slots.tableElement) {
    const node = slide.nodes.find((candidate) => candidate.name === slots.tableElement!.node)
    if (node?.type === 'table') {
      if (content.table) {
        // The element keeps its own limits: 12 rows, 6 columns, 24 characters a
        // cell; ragged rows fill out to the widest and a lone row pads to two.
        const cols = Math.min(TABLE_COLS_MAX, Math.max(...content.table.map((row) => row.length)))
        const rows = content.table.slice(0, TABLE_ROWS_MAX).map((row) => [...row])
        while (rows.length < 2) rows.push([])
        const cells: string[] = []
        for (const row of rows) {
          for (let col = 0; col < cols; col += 1) cells.push((row[col] ?? '').slice(0, TABLE_CELL_MAX_CHARS))
        }
        content.table.forEach((row, rowIndex) => row.forEach((cell, column) => {
          if (cell && (rowIndex >= TABLE_ROWS_MAX || column >= TABLE_COLS_MAX)) unplaced.push(`第 ${rowIndex + 1} 行第 ${column + 1} 列：${cell}`)
        }))
        // The template's column weights follow the grid: kept columns keep
        // theirs, a new column gets an even share.
        const templateWeights = node.colWidths
        const weights = templateWeights
          ? Array.from({ length: cols }, (_, index) => index < node.cols ? templateWeights[index] : 1)
          : undefined
        tabled.set(node.name, {
          ...node,
          rows: rows.length,
          cols,
          cells,
          ...(weights ? { colWidths: weights } : {}),
        })
      }
      // Without table content the template's table stays, like a kept illustration.
    } else if (content.table) {
      unused.push('table')
    }
  } else if (slots.table) {
    const { layout, sample } = slots.table
    const cells = content.table ?? sample.map((row) => row.map(() => ''))
    const shape = tableShape(layout, cells)
    cells.forEach((row, rowIndex) => row.forEach((cell, column) => {
      if (cell && (rowIndex >= shape.rows || column >= shape.columns)) unplaced.push(`第 ${rowIndex + 1} 行第 ${column + 1} 列：${cell}`)
    }))
    const prefixes = [`${layout.name}字 `, `${layout.name}格 `]
    tableAt = slide.nodes.findIndex((node) => prefixes.some((prefix) => node.name.startsWith(prefix)))
    tableAnchor = slide.nodes[tableAt] ?? null
    for (const cell of tableNodes(layout, cells)) {
      if (cell.type !== 'text' || textFits(cell, cell.text, cell.fontSize)) {
        tableCells.push(cell)
        continue
      }
      const size = fittingFontSize(cell, cell.text)
      const smallest = Math.max(10, Math.floor(cell.fontSize * MIN_FIT_SCALE))
      shrunk.push({ node: cell.name, from: cell.fontSize, to: size ?? smallest })
      if (size === null) overflowing.push({ node: cell.name, text: cell.text })
      tableCells.push({ ...cell, fontSize: size ?? smallest })
    }
    slide.nodes.forEach((node) => { if (prefixes.some((prefix) => node.name.startsWith(prefix))) remove.add(node.name) })
  } else if (content.table) {
    unused.push('table')
  }

  // What the template has no place for goes where the poster has room:
  // lines beyond the rows continue them (as far as the page leaves room),
  // then words take a free slot of a similar kind; what still finds none
  // is left out and reported.
  const moved: PosterSuccess['summary']['moved'] = []
  let leftLines = timelined.size > 0 ? lines.slice(TIMELINE_ITEMS_MAX) : lines.slice(rows.length)
  const working = [...slide.nodes]
  if (leftLines.length > 0 && timelined.size === 0 && rows.length > 0) {
    const last = rows[rows.length - 1]
    const rowNames = (row: PosterDetail) => [row.label, row.value, ...(row.extras ?? [])].filter((name): name is string => Boolean(name))
    // The last row as the template drew it, label included even when this
    // row's own line had none: a later line may well have one.
    const lastNodes = working.filter((node) => rowNames(last).includes(node.name))
    const valueOf = (row: PosterDetail) => working.find((node) => node.name === row.value)
    const lastValue = valueOf(last)
    const previousValue = rows.length > 1 ? valueOf(rows[rows.length - 2]) : undefined
    const lastBoxes = lastNodes.map((node) => boxOf(node)).filter((box): box is Box => box !== null)
    // Only rows stacked down the page continue (a certificate's scattered lines don't).
    const stacked = !previousValue || (lastValue !== undefined && lastValue.y > previousValue.y)
    if (lastValue && lastBoxes.length > 0 && stacked) {
      const pitch = previousValue ? lastValue.y - previousValue.y : (boxOf(lastValue)?.height ?? 0) * 1.3
      const row = union(lastBoxes)
      const allRows = new Set(rows.flatMap(rowNames))
      // What a new row must keep clear of: everything left on the page
      // (free slots included, they may still take words), but not the
      // page's backdrop or the panel the rows sit on — the new row stays
      // inside that panel instead.
      const grounds: Box[] = []
      const blockers: Box[] = []
      for (const node of working) {
        if (remove.has(node.name) || allRows.has(node.name)) continue
        const box = boxOf(node)
        if (!box) continue
        if ((node.type === 'shape' || node.type === 'path' || node.type === 'image') && box.width * box.height >= 0.6 * slide.width * slide.height) continue
        // The panel the rows sit on: a shape, or a filled drawing (the arch a flyer's lines stand in).
        const panel = node.type === 'shape' || (node.type === 'path' && node.fill.type !== 'transparent')
        if (panel && encloses(box, row)) grounds.push(box)
        else blockers.push(box)
      }
      const bottom = slide.height - Math.max(32, Math.round(slide.height * 0.025))
      const insertAt = Math.max(...lastNodes.map((node) => working.indexOf(node))) + 1
      const added: FreeformSceneNode[] = []
      let placedLines = 0
      for (const [index, line] of leftLines.entries()) {
        const by = pitch * (index + 1)
        const next = { ...row, y: row.y + by }
        if (next.y + next.height > bottom || blockers.some((box) => overlaps(box, next)) || !grounds.every((box) => encloses(box, next))) break
        const rowIndex = rows.length + index
        const names = new Map(rowNames(last).map((name) => [name, nextRowName(name, rowIndex)]))
        for (const node of lastNodes) {
          const clone = { ...structuredClone(node), id: crypto.randomUUID(), name: names.get(node.name) ?? node.name, y: Math.round((node.y + by) * 10) / 10 } as FreeformSceneNode
          // The row's number beside it counts on with the row (a playlist's 03 → 04).
          if (clone.type === 'text' && node.name !== last.label && node.name !== last.value) clone.text = countedOn(clone.text, rows.length, rowIndex + 1)
          added.push(clone)
        }
        fillRow({ ...(last.label ? { label: names.get(last.label) } : {}), value: names.get(last.value)! }, line)
        moved.push({ content: 'details', text: line, node: names.get(last.value)! })
        placedLines += 1
      }
      working.splice(insertAt, 0, ...added)
      leftLines = leftLines.slice(placedLines)
    }
  }
  const rowsTaken: PosterDetail[] = []
  // `below`: only slots under that line of the page, so lines still read in order.
  const takeSlot = (kinds: readonly FreeSlotKind[], text: string, content: keyof PosterContent, below?: number): boolean => {
    for (const kind of kinds) {
      if (below !== undefined && !slotBelow(kind, below)) continue
      if (kind === 'row') {
        const row = freeRows.find((candidate) => !rowsTaken.includes(candidate))
        if (!row) continue
        rowsTaken.push(row)
        fillRow(row, text)
        moved.push({ content, text, node: row.value })
        return true
      }
      const item = freeSlots.get(kind)
      if (!item) continue
      freeSlots.delete(kind)
      texts.set(item.text, text)
      moved.push({ content, text, node: item.text })
      return true
    }
    return false
  }
  const slotBelow = (kind: FreeSlotKind, y: number) => {
    if (kind === 'row') return false
    const item = freeSlots.get(kind)
    const node = item && working.find((candidate) => candidate.name === item.text)
    return node !== undefined && node.y >= y
  }
  // Lines the rows couldn't continue take a free slot under the lowest row
  // (a timeline's keep to the timeline).
  const rowBoxes = timelined.size > 0
    ? []
    : working.filter((node) => (texts.has(node.name) && rows.some((row) => row.value === node.name)) || moved.some((entry) => entry.node === node.name))
      .map((node) => boxOf(node)).filter((box): box is Box => box !== null)
  const rowsEnd = rowBoxes.length > 0 ? Math.max(...rowBoxes.map((box) => box.y + box.height)) : null
  if (rowsEnd !== null) leftLines = leftLines.filter((line) => !takeSlot(['brand', 'body', 'subtitle'], line, 'details', rowsEnd))
  for (const key of [...unused]) {
    const text = content[key]
    const kinds = MOVES[key]
    if (typeof text !== 'string' || !kinds) continue
    if (takeSlot(kinds, text, key)) unused.splice(unused.indexOf(key), 1)
  }
  // Whatever stayed free goes, with what only frames it.
  for (const item of freeSlots.values()) dropItem(item)
  for (const row of freeRows) {
    if (rowsTaken.includes(row)) continue
    if (row.label) remove.add(row.label)
    remove.add(row.value)
    row.extras?.forEach((name) => remove.add(name))
  }
  const filledRows = Math.min(rows.length, lines.length) + rowsTaken.length
  if (filledRows === 0) slots.detailsExtras?.forEach((name) => remove.add(name))
  if (filledRows < 2 && slots.link) remove.add(slots.link)
  unplaced.unshift(...leftLines)

  const nodes: FreeformSceneNode[] = working.flatMap((node): FreeformSceneNode[] => {
    if (node === tableAnchor) return tableCells
    if (remove.has(node.name)) return []
    const picture = pictured.get(node.name)
    if (picture) return [picture]
    const chart = charted.get(node.name)
    if (chart) return [chart]
    const table = tabled.get(node.name)
    if (table) return [table]
    const timeline = timelined.get(node.name)
    if (timeline) return [timeline]
    if (node.type !== 'text') return [node]
    const text = texts.get(node.name)
    if (text === undefined) return [node]
    // The sample lends its lines to the box, so copy no longer than it never shrinks.
    let next: FreeformTextElement = { ...node, text }
    delete next.spans
    const isTitle = node.name === slots.title
    // A display title fills its box: as large as its words break well.
    const filled = isTitle && slots.titleFit
      ? fillingHeading(next, text, Math.round(node.fontSize * slots.titleFit.maxScale), slots.titleFit.maxLines)
      : null
    if (filled) next = { ...next, fontSize: filled.fontSize, text: filled.text }
    else if (!textFits(next, text, next.fontSize, node.text)) {
      const scale = node.name === slots.tag?.text ? TAG_MIN_FIT_SCALE : MIN_FIT_SCALE
      const size = fittingFontSize(next, text, node.text, scale)
      const smallest = Math.max(10, Math.floor(next.fontSize * scale))
      shrunk.push({ node: node.name, from: next.fontSize, to: size ?? smallest })
      if (size === null) overflowing.push({ node: node.name, text })
      next = { ...next, fontSize: size ?? smallest }
    }
    if (isTitle && slots.titleFit?.align) next = { ...next, verticalAlign: slots.titleFit.align }
    if (isTitle && !filled) {
      // Between words, a little smaller when it must, no smaller than copy shrinks to.
      const { height } = withSampleRoom({ ...next, fontSize: node.fontSize }, node.text)
      const set = wordBrokenHeading({ ...next, height }, next.text, next.fontSize, Math.max(10, Math.floor(node.fontSize * MIN_FIT_SCALE)))
      if (set.fontSize !== next.fontSize) {
        const entry = shrunk.find((item) => item.node === node.name)
        if (entry) entry.to = set.fontSize
        else shrunk.push({ node: node.name, from: next.fontSize, to: set.fontSize })
      }
      next = { ...next, fontSize: set.fontSize, text: set.text }
    }
    return [next]
  })

  const placed = settle(nodes, slide.nodes, slots, filledRows, { height: slide.height, title: content.title })
  const document = normalizeFreeformDocument({ documentVersion: made.documentVersion, activeSlideId: slide.id, slides: [{ ...slide, nodes: placed }] })
  if (!document) return { ok: false, error: '生成的海报没有通过文档校验，请反馈。' }
  const left = [
    ...unused.map((key) => `${CONTENT_NAMES[key] ?? key}${typeof content[key] === 'string' && key !== 'image' ? `「${content[key]}」` : ''}`),
    ...unplaced.map((line) => `「${line}」`),
  ]
  return {
    ok: true,
    document,
    summary: {
      documentVersion: made.documentVersion,
      templateId,
      width: slide.width,
      height: slide.height,
      shrunk,
      overflowing,
      unplaced,
      unused,
      moved,
      ...(left.length > 0
        ? { hint: `海报上没有放下：${left.join('、')}。换一个有这些位置的模板（用 list_templates 的 ids 看 posterCapacity），或生成后用 apply_actions 加上。` }
        : {}),
      ...(textOnly ? { layout: 'text-only' as const } : {}),
    },
  }
}
