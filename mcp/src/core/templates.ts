// Template tools — thin, typed access to the app's template registry.
//
// The registry lives in the shared frontend source (pure TypeScript, no DOM
// imports), so the MCP package compiles against the exact same factory code
// the in-app template center runs.

import { TEMPLATE_REGISTRY } from '../../../src/templates/registry'
import { FREEFORM_TEMPLATE_SLOTS, type SlideSlots } from '../../../src/templates/slots'
import type {
  FreeformTemplateSeriesId,
  MarkdownTemplateDocument,
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

export interface TemplateSummary {
  id: string
  series: string
  workspace: TemplateWorkspace
  title: string
  description: string
  pageCount: number
  tags: string[]
  capacity?: TemplateCapacity
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

export function listTemplates(): TemplateSummary[] {
  return TEMPLATE_REGISTRY.map((template) => ({
    id: template.id,
    series: template.series,
    workspace: template.workspace,
    title: template.title,
    description: template.description,
    pageCount: template.pageCount,
    tags: [...template.tags],
    ...(template.workspace === 'freeform' ? { capacity: capacityOf(template.series) } : {}),
  }))
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

export function freeformTemplateIds(): string[] {
  return TEMPLATE_REGISTRY
    .filter((template): template is {
      id: string
      series: FreeformTemplateSeriesId
      workspace: 'freeform'
      title: string
      description: string
      pageCount: number
      tags: readonly string[]
      createFreeform: () => FreeformDocument
    } => template.workspace === 'freeform' && typeof template.createFreeform === 'function')
    .map((template) => template.id)
}
