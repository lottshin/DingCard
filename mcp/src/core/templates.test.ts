import { describe, expect, test } from 'vitest'
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import {
  freeformTemplateIds,
  posterTemplateIds,
  instantiateTemplate,
  listTemplates,
  templatePages,
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
      'neon-freeform',
      'brutalist-freeform',
      'soft-freeform',
      'blueprint-freeform',
    ]))
    for (const template of templates) {
      expect(template.title.length).toBeGreaterThan(0)
      expect(template.description.length).toBeGreaterThan(0)
      expect(template.pageCount).toBeGreaterThan(0)
      expect(template.tags.length).toBeGreaterThan(0)
    }
  })

  test('freeform template ids cover the eight decks, poster ids the twenty-nine posters', () => {
    expect(freeformTemplateIds()).toHaveLength(8)
    expect(posterTemplateIds()).toHaveLength(29)
  })

  test('says what each template makes and the size it is drawn at, and what a poster has room for', () => {
    const templates = listTemplates()
    const talk = templates.find((template) => template.id === 'talk-poster-freeform')!
    expect(talk).toMatchObject({ kind: 'poster', format: { id: 'story', ratio: '9:16', width: 1080, height: 1920 } })
    expect(talk.posterCapacity).toEqual({ subtitle: true, body: false, recipient: false, details: 3, cta: true, tag: true, brand: true, image: true, chart: false, timeline: false })
    expect(talk.capacity).toBeUndefined()
    expect(templates.find((template) => template.id === 'certificate-freeform')).toMatchObject({
      format: { id: 'a4-landscape', width: 1754, height: 1240 },
      posterCapacity: { recipient: true, details: 2 },
    })
    expect(templates.find((template) => template.id === 'timetable-freeform')!.posterCapacity!.table).toEqual({ maxRows: 12, maxColumns: 8 })
    expect(templates.find((template) => template.id === 'compare-table-freeform')!.posterCapacity!.table).toEqual({ maxRows: 12, maxColumns: 6 })
    expect(templates.find((template) => template.id === 'menu-freeform')!.posterCapacity!.details).toBe(8)
    expect(templates.find((template) => template.id === 'data-roundup-freeform')!.posterCapacity!.chart).toBe(true)
    expect(templates.find((template) => template.id === 'growth-timeline-freeform')!.posterCapacity).toMatchObject({ details: 8, chart: false, timeline: true })
    expect(templates.find((template) => template.id === 'moments-grid-freeform')).toMatchObject({ format: { id: 'moments-grid', width: 3240, height: 3240 } })
    const editorial = templates.find((template) => template.id === 'editorial-freeform')!
    expect(editorial).toMatchObject({ kind: 'deck', format: { id: 'xhs', width: 1080, height: 1440 } })
    expect(editorial.capacity).toBeDefined()
    expect(editorial.posterCapacity).toBeUndefined()
  })
})

describe('instantiateTemplate', () => {
  test('freeform templates produce v7-valid documents', () => {
    for (const id of freeformTemplateIds()) {
      const instantiation = instantiateTemplate(id)
      expect(instantiation.workspace).toBe('freeform')
      if (instantiation.workspace !== 'freeform') continue
      expect(normalizeFreeformDocument(instantiation.document)).not.toBeNull()
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

describe('templatePages', () => {
  test('gives a template\'s pages by number, each a fresh copy', () => {
    const all = templatePages('editorial-freeform')
    if (!all.ok) throw new Error(all.error)
    expect(all.slides.map((slide) => slide.name)).toEqual(['封面', '内页', '结尾'])

    const picked = templatePages('editorial-freeform', [2, 2, 3])
    if (!picked.ok) throw new Error(picked.error)
    expect(picked.slides.map((slide) => slide.name)).toEqual(['内页', '内页', '结尾'])
    // The same page twice: two pages, no id shared between them.
    expect(new Set(picked.slides.map((slide) => slide.id)).size).toBe(3)
    expect(picked.slides[0].nodes[0].id).not.toBe(picked.slides[1].nodes[0].id)

    const poster = templatePages('talk-poster-freeform')
    expect(poster.ok && poster.slides.map((slide) => [slide.width, slide.height])).toEqual([[1080, 1920]])
  })

  test('says what it cannot give', () => {
    expect(templatePages('editorial-freeform', [4])).toMatchObject({ ok: false, error: expect.stringContaining('只有 3 页') })
    expect(templatePages('nope')).toMatchObject({ ok: false, error: expect.stringContaining('未知模板') })
    expect(templatePages('editorial-archive-markdown')).toMatchObject({ ok: false, error: expect.stringContaining('Markdown') })
  })
})
