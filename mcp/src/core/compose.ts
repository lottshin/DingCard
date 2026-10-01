// Compose a finished deck from a freeform template and the reader's content:
// a cover, one page per section and, when asked for, the closing page. Every
// sample text the template drew is either replaced with the content or
// removed with the shapes that only frame it (see src/templates/slots.ts),
// page numbers follow the page, and filled-in copy shrinks to stay inside the
// box the template drew for it.

import { MAX_FREEFORM_SLIDES } from '../../../src/freeform/constants'
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import type {
  FreeformDocument,
  FreeformSceneNode,
  FreeformSlide,
  FreeformTextElement,
} from '../../../src/freeform/types'
import { TEMPLATE_REGISTRY } from '../../../src/templates/registry'
import { FREEFORM_TEMPLATE_SLOTS, type SlideSlots, type SlotItem } from '../../../src/templates/slots'
import type { FreeformTemplateSeriesId } from '../../../src/templates/types'
import { fittingFontSize, measureText, MIN_FIT_SCALE, textFits } from './textFit'

export interface DeckPage {
  title: string
  /** A paragraph; line breaks are kept. */
  body?: string
  /** Short points, one per item; "要点：说明" puts the part after the colon on the item's second line. */
  points?: string[]
  /** A pull quote; "引文 —— 出处" puts the source under it. */
  quote?: string
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
    documentVersion: 15
    templateId: string
    slideCount: number
    coverTitle: string
    pages: Array<{ slideId: string; page: number; role: 'cover' | 'section' | 'ending'; title: string }>
    /** Copy that was set smaller to fit its box. */
    shrunk: FontAdjustment[]
    /** Copy that still doesn't fit at the smallest size: shorten it (check_document measures the real layout). */
    overflowing: Array<{ slideId: string; page: number; node: string; text: string }>
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
  return {
    title,
    ...(body ? { body } : {}),
    ...(points.length > 0 ? { points } : {}),
    ...(quote ? { quote } : {}),
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

function seriesOf(templateId: string): { series: FreeformTemplateSeriesId; create: () => FreeformDocument } | null {
  const template = TEMPLATE_REGISTRY.find((candidate) => candidate.id === templateId)
  if (!template || template.workspace !== 'freeform' || !template.createFreeform) return null
  if (!(template.series in FREEFORM_TEMPLATE_SLOTS)) return null
  return { series: template.series as FreeformTemplateSeriesId, create: template.createFreeform }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Two lines for a title drawn as two texts: its own line break, else the punctuation nearest the middle, else the middle. */
function splitTitle(title: string): [string, string] {
  const lines = title.split('\n')
  if (lines.length > 1) return [lines[0], lines.slice(1).join(' ')]
  const chars = [...title]
  if (chars.length < 2) return [title, '']
  const middle = chars.length / 2
  let best = -1
  chars.forEach((char, index) => {
    if (/[，,、；;：:！!？? ]/.test(char) && index < chars.length - 1) {
      if (best < 0 || Math.abs(index + 1 - middle) < Math.abs(best + 1 - middle)) best = index
    }
  })
  const cut = best >= 0 ? best + 1 : Math.ceil(middle)
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

function fillSlide(slide: FreeformSlide, slots: SlideSlots, fill: SlideFill): FilledSlide {
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
  /** A point as an item shows it: its own words, or split into the item's two lines. */
  const itemParts = (item: SlotItem, point: string, index: number): [string, string | null] => {
    let [text, note] = item.note ? splitNote(point) : [point, null]
    const textNode = textNodeNamed(slide, item.text)
    if (item.note && note === null && textNode
      && !textFits(textNode, numbered(index, text), textNode.fontSize * MIN_FIT_SCALE, textNode.text)) {
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
    if (!textNode || !textFits(textNode, text, textNode.fontSize * MIN_FIT_SCALE, textNode.text)) return false
    const noteNode = item.note && note ? textNodeNamed(slide, item.note) : null
    return !noteNode || textFits(noteNode, note!, noteNode.fontSize * MIN_FIT_SCALE, noteNode.text)
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
    const sample = textNodeNamed(slide, node.name)?.text
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
  return { slide: { ...slide, nodes }, shrunk, overflowing }
}

export function composeDeck(templateId: string, value: unknown): ComposeSuccess | ComposeError {
  const template = seriesOf(templateId)
  if (!template) {
    return { ok: false, error: `未知的自由画布模板 id：${templateId}（先用 list_templates 查询，id 以 -freeform 结尾）。` }
  }
  const content = normalizeDeckContent(value)
  if (typeof content === 'string') return { ok: false, error: content }
  const slots = FREEFORM_TEMPLATE_SLOTS[template.series]
  const total = 1 + content.pages.length + (content.ending ? 1 : 0)
  // A fresh instance per page keeps every slide and node id unique.
  const fresh = (index: number) => template.create().slides[index]

  const plan: Array<{ role: 'cover' | 'section' | 'ending'; slide: FreeformSlide; slots: SlideSlots; fill: SlideFill }> = [
    {
      role: 'cover',
      slide: fresh(0),
      slots: slots.cover,
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
      slide: fresh(1),
      slots: slots.section,
      fill: { title: page.title, lead: page.body, points: page.points ?? [], quote: page.quote, toc: [], page: index + 2, total },
    })),
    ...(content.ending
      ? [{
          role: 'ending' as const,
          slide: fresh(2),
          slots: slots.ending,
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

  const filled = plan.map((entry) => ({ ...entry, result: fillSlide(entry.slide, entry.slots, entry.fill) }))
  const slides = filled.map((entry) => entry.result.slide)
  const document = normalizeFreeformDocument({ documentVersion: 15, activeSlideId: slides[0].id, slides })
  if (!document) return { ok: false, error: '生成的文档未通过 v15 校验。' }

  return {
    ok: true,
    document,
    summary: {
      documentVersion: 15,
      templateId,
      slideCount: document.slides.length,
      coverTitle: content.title,
      pages: filled.map((entry, index) => ({
        slideId: entry.result.slide.id,
        page: index + 1,
        role: entry.role,
        title: entry.fill.title,
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
    },
  }
}
