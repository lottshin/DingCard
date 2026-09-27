import { describe, expect, test } from 'vitest'
import { normalizeFreeformDocumentV4 } from '../../../src/freeform/sceneDocument'
import {
  freeformTemplateIds,
  instantiateTemplate,
  listTemplates,
} from './templates'

describe('listTemplates', () => {
  test('lists every built-in template with full metadata', () => {
    const templates = listTemplates()
    const ids = templates.map((template) => template.id)
    expect(ids).toEqual(expect.arrayContaining([
      'editorial-archive-markdown',
      'public-theatre-markdown',
      'issue-cover-markdown',
      'editorial-freeform',
      'checklist-freeform',
      'signal-freeform',
      'night-flight-freeform',
    ]))
    for (const template of templates) {
      expect(template.title.length).toBeGreaterThan(0)
      expect(template.description.length).toBeGreaterThan(0)
      expect(template.pageCount).toBeGreaterThan(0)
      expect(template.tags.length).toBeGreaterThan(0)
    }
  })

  test('freeform template ids cover the four freeform series', () => {
    expect(freeformTemplateIds()).toHaveLength(4)
  })
})

describe('instantiateTemplate', () => {
  test('freeform templates produce v4-valid documents', () => {
    for (const id of freeformTemplateIds()) {
      const instantiation = instantiateTemplate(id)
      expect(instantiation.workspace).toBe('freeform')
      if (instantiation.workspace !== 'freeform') continue
      expect(normalizeFreeformDocumentV4(instantiation.document)).not.toBeNull()
      expect(instantiation.document.slides.length).toBeGreaterThan(0)
    }
  })

  test('each instantiation returns a fresh document (no shared node ids)', () => {
    const first = instantiateTemplate('editorial-freeform')
    const second = instantiateTemplate('editorial-freeform')
    if (first.workspace !== 'freeform' || second.workspace !== 'freeform') {
      throw new Error('expected freeform instantiations')
    }
    const slideIdsA = first.document.slides.map((slide) => slide.id).join(',')
    const slideIdsB = second.document.slides.map((slide) => slide.id).join(',')
    expect(slideIdsA).not.toEqual(slideIdsB)
  })

  test('markdown templates return their source envelope', () => {
    const instantiation = instantiateTemplate('editorial-archive-markdown')
    expect(instantiation.workspace).toBe('markdown')
    if (instantiation.workspace !== 'markdown') return
    expect(instantiation.document.source).toContain('#')
    expect(instantiation.document.platformId).toBe('rednote')
    expect(instantiation.document.fontFamily.length).toBeGreaterThan(0)
  })

  test('unknown template ids fail with the available list', () => {
    expect(() => instantiateTemplate('nope-freeform')).toThrow(/可用模板/)
  })
})
