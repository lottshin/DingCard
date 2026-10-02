// Compose a poster: a one-page template (src/templates/slots.ts
// FREEFORM_POSTER_SLOTS) filled with the client's words. Every sample text is
// replaced or removed with what only frames it, the picture slot takes the
// client's picture (or a colour block that keeps the layout), and copy shrinks
// to stay in the box the template drew for it.

import { createDefaultImageFraming } from '../../../src/freeform/imageFraming'
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import type { FreeformDocument, FreeformSceneNode, FreeformTextElement } from '../../../src/freeform/types'
import { TEMPLATE_REGISTRY } from '../../../src/templates/registry'
import { FREEFORM_POSTER_SLOTS, type SlotItem } from '../../../src/templates/slots'
import type { FreeformPosterSeriesId } from '../../../src/templates/types'
import { balancedHeading, fittingFontSize, MIN_FIT_SCALE, textFits } from './textFit'

export interface PosterContent {
  title: string
  subtitle?: string
  body?: string
  /** Information lines; "标签：内容" puts the part before the colon in the line's label. */
  details?: string[]
  cta?: string
  tag?: string
  brand?: string
  /** The picture: an http(s) URL, a data URL, or a file path (embedded before the poster is kept). */
  image?: string
}

export interface PosterSuccess {
  ok: true
  document: FreeformDocument
  summary: {
    documentVersion: 17
    templateId: string
    width: number
    height: number
    /** Copy that was set smaller to fit its box. */
    shrunk: Array<{ node: string; from: number; to: number }>
    /** Copy that still doesn't fit at the smallest size: shorten it. */
    overflowing: Array<{ node: string; text: string }>
    /** Information lines beyond the rows the template has. */
    unplaced: string[]
    /** Content the template has no place for. */
    unused: Array<keyof PosterContent>
  }
}

export interface PosterError {
  ok: false
  error: string
}

const LABEL_SEPARATOR = /\s*[：:]\s*/

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : ''
}

/** Check and tidy poster content from a client: trimmed strings, no empty lines. */
export function normalizePosterContent(value: unknown): PosterContent | string {
  if (typeof value !== 'object' || value === null) return 'content 需要是对象'
  const record = value as Record<string, unknown>
  const title = clean(record.title)
  if (!title) return 'content.title（海报标题）不能为空'
  if (record.details !== undefined && !Array.isArray(record.details)) return 'content.details 需要是字符串数组'
  const details = Array.isArray(record.details) ? record.details.map(clean).filter((line) => line.length > 0) : []
  const content: PosterContent = { title }
  for (const key of ['subtitle', 'body', 'cta', 'tag', 'brand', 'image'] as const) {
    const text = clean(record[key])
    if (text) content[key] = text
  }
  if (details.length > 0) content.details = details
  return content
}

function posterSeries(templateId: string): { series: FreeformPosterSeriesId; create: () => FreeformDocument } | null {
  const template = TEMPLATE_REGISTRY.find((candidate) => candidate.id === templateId)
  if (!template || template.workspace !== 'freeform' || template.kind !== 'poster' || !template.createFreeform) return null
  if (!(template.series in FREEFORM_POSTER_SLOTS)) return null
  return { series: template.series as FreeformPosterSeriesId, create: template.createFreeform }
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
  const slots = FREEFORM_POSTER_SLOTS[template.series]
  const slide = template.create().slides[0]

  const texts = new Map<string, string>()
  const remove = new Set<string>()
  const unused: Array<keyof PosterContent> = []
  const dropItem = (item: SlotItem) => {
    remove.add(item.text)
    if (item.note) remove.add(item.note)
    item.extras?.forEach((name) => remove.add(name))
  }

  texts.set(slots.title, content.title)
  const optional: Array<[keyof PosterContent, SlotItem | undefined]> = [
    ['subtitle', slots.subtitle],
    ['body', slots.body],
    ['cta', slots.cta],
    ['tag', slots.tag],
    ['brand', slots.brand],
  ]
  for (const [key, slot] of optional) {
    const text = content[key] as string | undefined
    if (slot && text) texts.set(slot.text, text)
    else if (slot) dropItem(slot)
    else if (text) unused.push(key)
  }

  const rows = slots.details ?? []
  const lines = content.details ?? []
  rows.forEach((row, index) => {
    const line = lines[index]
    if (line === undefined) {
      if (row.label) remove.add(row.label)
      remove.add(row.value)
      row.extras?.forEach((name) => remove.add(name))
      return
    }
    const match = LABEL_SEPARATOR.exec(line)
    const hasLabel = match !== null && match.index > 0 && match.index + match[0].length < line.length
    if (row.label && hasLabel) {
      texts.set(row.label, line.slice(0, match.index))
      texts.set(row.value, line.slice(match.index + match[0].length))
    } else {
      if (row.label) remove.add(row.label)
      texts.set(row.value, line)
    }
  })
  if (lines.length > 0 && rows.length === 0) unused.push('details')
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
    } else if (node) {
      remove.add(node.name)
      slots.image.extras?.forEach((name) => remove.add(name))
    }
  } else if (content.image) {
    unused.push('image')
  }

  const shrunk: PosterSuccess['summary']['shrunk'] = []
  const overflowing: PosterSuccess['summary']['overflowing'] = []
  const nodes: FreeformSceneNode[] = slide.nodes.flatMap((node): FreeformSceneNode[] => {
    if (remove.has(node.name)) return []
    const picture = pictured.get(node.name)
    if (picture) return [picture]
    if (node.type !== 'text') return [node]
    const text = texts.get(node.name)
    if (text === undefined) return [node]
    // The sample lends its lines to the box, so copy no longer than it never shrinks.
    let next: FreeformTextElement = { ...node, text }
    delete next.spans
    if (!textFits(next, text, next.fontSize, node.text)) {
      const size = fittingFontSize(next, text, node.text)
      const smallest = Math.max(10, Math.floor(next.fontSize * MIN_FIT_SCALE))
      shrunk.push({ node: node.name, from: next.fontSize, to: size ?? smallest })
      if (size === null) overflowing.push({ node: node.name, text })
      next = { ...next, fontSize: size ?? smallest }
    }
    if (node.name === slots.title) next = { ...next, text: balancedHeading(next, next.text, next.fontSize) }
    return [next]
  })

  const document = normalizeFreeformDocument({ documentVersion: 17, activeSlideId: slide.id, slides: [{ ...slide, nodes }] })
  if (!document) return { ok: false, error: '生成的海报没有通过 v17 校验。' }
  return {
    ok: true,
    document,
    summary: {
      documentVersion: 17,
      templateId,
      width: slide.width,
      height: slide.height,
      shrunk,
      overflowing,
      unplaced: lines.slice(rows.length),
      unused,
    },
  }
}
