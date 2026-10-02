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
import type { FreeformDocument } from '../../../src/freeform/types'

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
  /** Information lines ("时间：…"). */
  details: number
  cta: boolean
  tag: boolean
  brand: boolean
  image: boolean
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
    details: slots.details?.length ?? 0,
    cta: Boolean(slots.cta),
    tag: Boolean(slots.tag),
    brand: Boolean(slots.brand),
    image: Boolean(slots.image),
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
