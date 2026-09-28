// Batch generation: turn a markdown outline into one multi-slide freeform
// document based on a built-in template. Pure orchestration over the real
// reducer — no new document-model semantics.

import { reduceFreeformDocument } from '../../../src/freeform/document'
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import { walkScene } from '../../../src/freeform/sceneTree'
import type {
  FreeformDocument,
  FreeformSlide,
  FreeformTextElement,
} from '../../../src/freeform/types'
import { instantiateTemplate } from './templates'

export interface OutlineSection {
  title: string
  points: string[]
}

export interface ParsedOutline {
  title: string | null
  sections: OutlineSection[]
}

export interface OutlineDocumentResult {
  ok: true
  document: FreeformDocument
  summary: {
    documentVersion: 10
    slideCount: number
    coverTitle: string
    sections: Array<{ slideId: string; title: string; pointCount: number }>
  }
}

export interface OutlineError {
  ok: false
  error: string
}

const HEADING_1 = /^#\s+/
const HEADING_2 = /^##\s+/
const BULLET = /^[-*+]\s+|^(\d+)[.、)]\s+/

/**
 * Parse an outline: the first `#` line is the deck title, every `##` line
 * starts a section, and the remaining non-empty lines (bullet markers
 * stripped) are that section's points. Horizontal rules are ignored.
 */
export function parseOutline(source: string): ParsedOutline | null {
  const lines = typeof source === 'string' ? source.split('\n') : []
  let title: string | null = null
  const sections: OutlineSection[] = []
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.length === 0 || line === '---' || line === '***') continue
    if (HEADING_1.test(line)) {
      if (title === null) title = line.replace(HEADING_1, '').trim()
      continue
    }
    if (HEADING_2.test(line)) {
      sections.push({ title: line.replace(HEADING_2, '').trim(), points: [] })
      continue
    }
    if (sections.length === 0) continue
    sections[sections.length - 1].points.push(line.replace(BULLET, '').trim())
  }
  if (sections.length === 0) return null
  if (sections.some((section) => section.title.length === 0)) return null
  return { title, sections }
}

interface TextSlots {
  title: FreeformTextElement
  body: FreeformTextElement
}

function textLeaves(slide: FreeformSlide): FreeformTextElement[] {
  const leaves: FreeformTextElement[] = []
  walkScene(slide.nodes, (node) => {
    if (node.type === 'text') leaves.push(node)
  })
  return leaves
}

function area(leaf: FreeformTextElement): number {
  return leaf.width * leaf.height
}

/**
 * Locate the fill slots on a template slide: the title slot is the
 * "标题"-named text with the largest font, the body slot is the remaining
 * text with the most characters (the template's main copy node).
 */
function textSlots(slide: FreeformSlide): TextSlots | null {
  const leaves = textLeaves(slide)
  if (leaves.length < 2) return null
  let title: FreeformTextElement | undefined
  for (const leaf of leaves) {
    if (!leaf.name.includes('标题')) continue
    if (
      title === undefined
      || leaf.fontSize > title.fontSize
      || (leaf.fontSize === title.fontSize && area(leaf) > area(title))
    ) {
      title = leaf
    }
  }
  if (!title) return null
  let body: FreeformTextElement | undefined
  for (const leaf of leaves) {
    if (leaf.id === title.id) continue
    if (
      body === undefined
      || leaf.text.length > body.text.length
      || (leaf.text.length === body.text.length && area(leaf) > area(body))
    ) {
      body = leaf
    }
  }
  if (!body) return null
  return { title, body }
}

export function createDocumentFromOutline(
  outline: string,
  templateId: string,
): OutlineDocumentResult | OutlineError {
  const parsed = parseOutline(outline)
  if (!parsed) {
    return {
      ok: false,
      error: '大纲解析失败：需要至少一个 "## 小节标题" 段落（可先用 "# 总标题" 给整套卡片命名）。',
    }
  }

  let instantiation
  try {
    instantiation = instantiateTemplate(templateId)
  } catch {
    return { ok: false, error: `未知的模板 id：${templateId}（先用 list_templates 查询）。` }
  }
  if (instantiation.workspace !== 'freeform') {
    return { ok: false, error: '仅支持自由画布模板（id 以 -freeform 结尾）。' }
  }

  let document = instantiation.document
  if (document.slides.length < 2) {
    return { ok: false, error: '模板页数不足，无法生成多页卡片。' }
  }
  const cover = document.slides[0]
  const bodySlide = document.slides[1]
  const coverSlots = textSlots(cover)
  const bodySlots = textSlots(bodySlide)
  if (!coverSlots || !bodySlots) {
    return { ok: false, error: '模板缺少可填充的标题/正文文本节点。' }
  }

  // One slide per section: duplicate the template body slide for every
  // section after the first (before editing, so copies keep placeholder
  // text). Each duplicate lands directly after the body slide, so create
  // them in reverse to keep the sections in outline order.
  for (let index = parsed.sections.length - 1; index >= 1; index -= 1) {
    const next = reduceFreeformDocument(document, {
      type: 'slide/duplicate',
      slideId: bodySlide.id,
      duplicateSlideId: `outline-section-${index + 1}`,
    })
    if (next === document) {
      return { ok: false, error: '生成小节页面失败：页面数量达到上限。' }
    }
    document = next
  }
  const sectionSlideIds = [bodySlide.id]
  for (let index = 1; index < parsed.sections.length; index += 1) {
    sectionSlideIds.push(`outline-section-${index + 1}`)
  }

  const summarySections: OutlineDocumentResult['summary']['sections'] = []
  for (const [index, section] of parsed.sections.entries()) {
    const slideId = sectionSlideIds[index]
    const slide = document.slides.find((candidate) => candidate.id === slideId)
    if (!slide) return { ok: false, error: '生成小节页面失败：页面丢失。' }
    const slots = textSlots(slide)
    if (!slots) return { ok: false, error: '生成小节页面失败：找不到可填充字段。' }
    const updates: Array<{ path: string[]; patch: { text: string } }> = [
      { path: [slots.title.id], patch: { text: section.title } },
    ]
    if (section.points.length > 0) {
      updates.push({ path: [slots.body.id], patch: { text: section.points.join('\n') } })
    }
    document = reduceFreeformDocument(document, {
      type: 'node/update-content',
      slideId,
      updates,
    })
    summarySections.push({ slideId, title: section.title, pointCount: section.points.length })
  }

  const coverTitle = parsed.title ?? parsed.sections[0].title
  document = reduceFreeformDocument(document, {
    type: 'node/update-content',
    slideId: cover.id,
    updates: [{ path: [coverSlots.title.id], patch: { text: coverTitle } }],
  })

  const normalized = normalizeFreeformDocument(document)
  if (!normalized) {
    return { ok: false, error: '生成的文档未通过 v10 校验。' }
  }
  return {
    ok: true,
    document: normalized,
    summary: {
      documentVersion: 10,
      slideCount: normalized.slides.length,
      coverTitle,
      sections: summarySections,
    },
  }
}
