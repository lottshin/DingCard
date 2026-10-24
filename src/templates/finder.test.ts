import { afterEach, describe, expect, it } from 'vitest'
import { setLang } from '../i18n'
import { findTemplates, similarTemplates, usesIn } from './finder'
import { TEMPLATE_REGISTRY } from './registry'
import { TEMPLATE_COLORS, TEMPLATE_FACETS, TEMPLATE_STYLES, TEMPLATE_USES } from './taxonomy'

const ids = (list: { id: string }[]) => list.map((template) => template.id)

describe('template taxonomy', () => {
  it('files every template under known uses, styles and colours', () => {
    const uses = new Set<string>(TEMPLATE_USES.map((entry) => entry.id))
    const styles = new Set<string>(TEMPLATE_STYLES.map((entry) => entry.id))
    const colors = new Set<string>(TEMPLATE_COLORS.map((entry) => entry.id))
    for (const template of TEMPLATE_REGISTRY) {
      const facets = TEMPLATE_FACETS[template.series]
      expect(facets, template.id).toBeDefined()
      expect(facets.uses.length, template.id).toBeGreaterThan(0)
      expect(facets.styles.length, template.id).toBeGreaterThan(0)
      expect(facets.colors.length, template.id).toBeGreaterThan(0)
      expect(facets.uses.every((use) => uses.has(use)), template.id).toBe(true)
      expect(facets.styles.every((style) => styles.has(style)), template.id).toBe(true)
      expect(facets.colors.every((color) => colors.has(color)), template.id).toBe(true)
    }
    // No facet goes unused, and the Markdown looks are the long reads.
    for (const use of uses) expect(TEMPLATE_REGISTRY.some((template) => TEMPLATE_FACETS[template.series].uses.includes(use as never)), use).toBe(true)
    expect(TEMPLATE_REGISTRY.filter((template) => template.workspace === 'markdown').every((template) => TEMPLATE_FACETS[template.series].uses.includes('article'))).toBe(true)
  })
})

describe('findTemplates', () => {
  afterEach(() => setLang('zh'))

  it('narrows by use, size, style and colour together', () => {
    expect(ids(findTemplates(TEMPLATE_REGISTRY, { use: 'menu' }))).toEqual(['menu-freeform', 'dessert-menu-freeform', 'price-list-freeform'])
    expect(ids(findTemplates(TEMPLATE_REGISTRY, { use: 'menu', format: 'a4' }))).toEqual(['menu-freeform', 'dessert-menu-freeform'])
    expect(ids(findTemplates(TEMPLATE_REGISTRY, { style: 'chinese' }))).toEqual(['xuan-markdown', 'spring-festival-freeform', 'festival-poster-freeform', 'solar-term-freeform', 'word-of-year-freeform'])
    expect(findTemplates(TEMPLATE_REGISTRY, { color: 'black', use: 'article' }).map((template) => template.series)).toEqual(['night'])
    expect(ids(findTemplates(TEMPLATE_REGISTRY, { only: new Set(['memo-markdown', 'menu-freeform']) }))).toEqual(['memo-markdown', 'menu-freeform'])
  })

  it('finds by the words people type, best match first, every word counting', () => {
    // A title beats a description that mentions it.
    expect(ids(findTemplates(TEMPLATE_REGISTRY, { text: '菜单' })).slice(0, 2)).toEqual(['menu-freeform', 'dessert-menu-freeform'])
    expect(ids(findTemplates(TEMPLATE_REGISTRY, { text: '中秋' }))).toContain('festival-poster-freeform')
    // A use's own words: a PPT is office work.
    expect(ids(findTemplates(TEMPLATE_REGISTRY, { text: 'ppt' }))).toContain('pitch-cover-freeform')
    // Both words must hit; the one titled 节气 comes first.
    expect(ids(findTemplates(TEMPLATE_REGISTRY, { text: '国风 节气' }))).toEqual(['solar-term-freeform', 'xuan-markdown', 'spring-festival-freeform', 'word-of-year-freeform', 'festival-poster-freeform'])
    expect(findTemplates(TEMPLATE_REGISTRY, { text: '没有这种模板' })).toEqual([])
  })

  it('answers to the English the reader sees', () => {
    setLang('en')
    expect(ids(findTemplates(TEMPLATE_REGISTRY, { text: 'dessert' }))).toContain('dessert-menu-freeform')
    expect(ids(findTemplates(TEMPLATE_REGISTRY, { text: 'journal' }))).toContain('journal-markdown')
  })
})

describe('similarTemplates', () => {
  it('offers the same kind of template first, never the template itself', () => {
    const menu = TEMPLATE_REGISTRY.find((template) => template.id === 'menu-freeform')!
    const similar = similarTemplates(menu, TEMPLATE_REGISTRY, 4)
    expect(similar.map((template) => template.id).slice(0, 2)).toEqual(['dessert-menu-freeform', 'price-list-freeform'])
    expect(similar).not.toContain(menu)
    expect(similar).toHaveLength(4)
  })

  it('lists the uses a set of templates covers, in taxonomy order', () => {
    expect(usesIn(TEMPLATE_REGISTRY.filter((template) => template.workspace === 'markdown'))).toEqual(['article'])
    expect(usesIn(TEMPLATE_REGISTRY)).toEqual(TEMPLATE_USES.map((use) => use.id))
  })
})
