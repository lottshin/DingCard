import { describe, expect, it } from 'vitest'
import type { FreeformSlide } from '../freeform/types'
import { TEMPLATE_REGISTRY } from './registry'
import { FREEFORM_TEMPLATE_SLOTS, slotNodeNames, slotSampleNames, type SlideSlots } from './slots'
import type { FreeformTemplateSeriesId } from './types'

const CJK = /[㐀-鿿]/
const STANDALONE_TWO_DIGITS = /(?<!\d)\d{2}(?!\d)/

// Chinese text a template keeps as decoration: labels that read as part of
// the design, not as sample sentences about some other topic.
const KEPT_DECORATION: Partial<Record<FreeformTemplateSeriesId, readonly string[]>> = {
  editorial: ['完'],
  blueprint: ['签名 / DATE'],
}

function freeformTemplates() {
  return TEMPLATE_REGISTRY.flatMap((template) => (
    template.workspace === 'freeform' && template.createFreeform
      ? [{ series: template.series as FreeformTemplateSeriesId, document: template.createFreeform() }]
      : []
  ))
}

function topNames(slide: FreeformSlide): string[] {
  return slide.nodes.map((node) => node.name)
}

function roles(document: { slides: FreeformSlide[] }, slots: { cover: SlideSlots; section: SlideSlots; ending: SlideSlots }) {
  return [
    { role: 'cover', slide: document.slides[0], slots: slots.cover },
    { role: 'section', slide: document.slides[1], slots: slots.section },
    { role: 'ending', slide: document.slides[2], slots: slots.ending },
  ] as const
}

describe('template slots', () => {
  it('cover every freeform template', () => {
    const series = freeformTemplates().map((template) => template.series).sort()
    expect(Object.keys(FREEFORM_TEMPLATE_SLOTS).sort()).toEqual(series)
  })

  it('point at nodes that exist, once each, on the slide they describe', () => {
    for (const { series, document } of freeformTemplates()) {
      expect(document.slides).toHaveLength(3)
      for (const { role, slide, slots } of roles(document, FREEFORM_TEMPLATE_SLOTS[series])) {
        const names = topNames(slide)
        for (const name of slotNodeNames(slots)) {
          expect(names.filter((candidate) => candidate === name), `${series} ${role}: ${name}`).toHaveLength(1)
        }
      }
    }
  })

  it('only mark texts with a page number as page numbers', () => {
    for (const { series, document } of freeformTemplates()) {
      for (const { role, slide, slots } of roles(document, FREEFORM_TEMPLATE_SLOTS[series])) {
        for (const name of slots.numbers ?? []) {
          const node = slide.nodes.find((candidate) => candidate.name === name)
          expect(node?.type, `${series} ${role}: ${name}`).toBe('text')
          if (node?.type === 'text') expect(node.text, `${series} ${role}: ${name}`).toMatch(STANDALONE_TWO_DIGITS)
        }
      }
    }
  })

  it('account for every Chinese sample text, so none survives a filled deck', () => {
    for (const { series, document } of freeformTemplates()) {
      const kept = KEPT_DECORATION[series] ?? []
      for (const { role, slide, slots } of roles(document, FREEFORM_TEMPLATE_SLOTS[series])) {
        const handled = new Set([...slotSampleNames(slots), ...(slots.numbers ?? [])])
        for (const node of slide.nodes) {
          if (node.type !== 'text' || !CJK.test(node.text)) continue
          if (handled.has(node.name)) continue
          expect(kept, `${series} ${role}: ${node.name} 「${node.text}」 is neither filled nor kept on purpose`)
            .toContain(node.text)
        }
      }
    }
  })
})
