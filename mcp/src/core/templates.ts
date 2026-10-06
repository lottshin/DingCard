// Template tools — thin, typed access to the app's template registry.
//
// The registry lives in the shared frontend source (pure TypeScript, no DOM
// imports), so the MCP package compiles against the exact same factory code
// the in-app template center runs.

import { TEMPLATE_REGISTRY } from '../../../src/templates/registry'
import { templateFormat } from '../../../src/templates/formats'
import { FREEFORM_POSTER_SLOTS, FREEFORM_TEMPLATE_SLOTS, type SlideSlots } from '../../../src/templates/slots'
import type {
  FreeformPosterSeriesId,
  MarkdownTemplateDocument,
  TemplateKind,
  TemplateWorkspace,
} from '../../../src/templates/types'
import type { FreeformDocument, FreeformSlide } from '../../../src/freeform/types'

/** How much content a freeform template's pages hold before it spills over. */
export interface TemplateCapacity {
  coverSubtitle: boolean
  /** The cover lists the first page titles (a contents block). */
  coverContents: number
  sectionPoints: number
  sectionBody: boolean
  sectionQuote: boolean
  endingPoints: number
  endingBody: boolean
  endingQuote: boolean
}

/** What a poster template has room for (create_poster_from_content). */
export interface PosterCapacity {
  subtitle: boolean
  body: boolean
  /** A name to put on it (a certificate's recipient). */
  recipient: boolean
  /** Information lines ("时间：…", a menu's "拿铁：28"). */
  details: number
  cta: boolean
  tag: boolean
  brand: boolean
  image: boolean
  /** A table it draws at the content's size, up to this many rows and columns. */
  table?: { maxRows: number; maxColumns: number }
  /** A chart it fills from `chart` content (labels and series). */
  chart: boolean
}

export interface TemplateSummary {
  id: string
  series: string
  workspace: TemplateWorkspace
  /** deck: a cover, section pages and an ending (create_document_from_content); poster: one page (create_poster_from_content). */
  kind: TemplateKind
  /** The page size it is drawn at. */
  format: { id: string; name: string; ratio: string; width: number; height: number }
  title: string
  description: string
  pageCount: number
  tags: string[]
  capacity?: TemplateCapacity
  posterCapacity?: PosterCapacity
}

function pointRoom(slots: SlideSlots): number {
  return slots.list ? 6 : slots.items?.length ?? 0
}

function capacityOf(series: string): TemplateCapacity | undefined {
  const slots = FREEFORM_TEMPLATE_SLOTS[series as keyof typeof FREEFORM_TEMPLATE_SLOTS]
  if (!slots) return undefined
  return {
    coverSubtitle: Boolean(slots.cover.lead),
    coverContents: slots.cover.toc?.items?.length ?? (slots.cover.toc?.list ? 4 : 0),
    sectionPoints: pointRoom(slots.section),
    sectionBody: Boolean(slots.section.lead),
    sectionQuote: Boolean(slots.section.quote),
    endingPoints: pointRoom(slots.ending),
    endingBody: Boolean(slots.ending.lead),
    endingQuote: Boolean(slots.ending.quote),
  }
}

export type TemplateInstantiation =
  | { workspace: 'freeform'; document: FreeformDocument }
  | { workspace: 'markdown'; document: MarkdownTemplateDocument }

function posterCapacityOf(series: string): PosterCapacity | undefined {
  const slots = FREEFORM_POSTER_SLOTS[series as FreeformPosterSeriesId]
  if (!slots) return undefined
  return {
    subtitle: Boolean(slots.subtitle),
    body: Boolean(slots.body),
    recipient: Boolean(slots.recipient),
    details: slots.details?.length ?? 0,
    cta: Boolean(slots.cta),
    tag: Boolean(slots.tag),
    brand: Boolean(slots.brand),
    image: Boolean(slots.image),
    ...(slots.table ? { table: { maxRows: slots.table.layout.maxRows, maxColumns: slots.table.layout.maxColumns } } : {}),
    chart: Boolean(slots.chart),
  }
}

export function listTemplates(): TemplateSummary[] {
  return TEMPLATE_REGISTRY.map((template) => {
    const capacity = template.workspace === 'freeform' && template.kind === 'deck' ? capacityOf(template.series) : undefined
    const posterCapacity = template.kind === 'poster' ? posterCapacityOf(template.series) : undefined
    return {
      id: template.id,
      series: template.series,
      workspace: template.workspace,
      kind: template.kind,
      format: { ...templateFormat(template.format) },
      title: template.title,
      description: template.description,
      pageCount: template.pageCount,
      tags: [...template.tags],
      ...(capacity ? { capacity } : {}),
      ...(posterCapacity ? { posterCapacity } : {}),
    }
  })
}

export function instantiateTemplate(templateId: string): TemplateInstantiation {
  const template = TEMPLATE_REGISTRY.find((candidate) => candidate.id === templateId)
  if (!template) {
    const known = TEMPLATE_REGISTRY.map((candidate) => candidate.id).join(', ')
    throw new Error(`未知模板 id：${templateId}。可用模板：${known}`)
  }
  if (template.workspace === 'freeform') {
    if (!template.createFreeform) throw new Error(`模板 ${templateId} 缺少自由画布工厂`)
    return { workspace: 'freeform', document: template.createFreeform() }
  }
  if (!template.createMarkdown) throw new Error(`模板 ${templateId} 缺少 Markdown 工厂`)
  return { workspace: 'markdown', document: template.createMarkdown() }
}

export type TemplatePagesResult =
  | { ok: true; slides: FreeformSlide[] }
  | { ok: false; error: string }

/**
 * A freeform template's pages for slide/insert, by page number from 1 (all
 * of them when none are named). Every page is a fresh copy with its own ids,
 * so a page asked for twice comes in twice.
 */
export function templatePages(templateId: string, pages?: readonly number[]): TemplatePagesResult {
  const template = TEMPLATE_REGISTRY.find((candidate) => candidate.id === templateId)
  if (!template) return { ok: false, error: `未知模板 id：${templateId}（先用 list_templates 查询）。` }
  const create = template.workspace === 'freeform' ? template.createFreeform : undefined
  if (!create) return { ok: false, error: `${templateId} 是 Markdown 模板，不能加进自由画布文档。` }
  const all = create().slides
  if (!pages || pages.length === 0) return { ok: true, slides: all }
  const outside = pages.filter((page) => !Number.isInteger(page) || page < 1 || page > all.length)
  if (outside.length > 0) return { ok: false, error: `${templateId} 只有 ${all.length} 页，没有第 ${outside.join('、')} 页。` }
  return { ok: true, slides: pages.map((page) => create().slides[page - 1]) }
}

/** The freeform deck templates (cover, sections, ending). */
export function freeformTemplateIds(): string[] {
  return TEMPLATE_REGISTRY
    .filter((template) => template.workspace === 'freeform' && template.kind === 'deck' && typeof template.createFreeform === 'function')
    .map((template) => template.id)
}

/** The one-page poster templates. */
export function posterTemplateIds(): string[] {
  return TEMPLATE_REGISTRY
    .filter((template) => template.workspace === 'freeform' && template.kind === 'poster' && typeof template.createFreeform === 'function')
    .map((template) => template.id)
}
