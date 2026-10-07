import { describe, expect, it } from 'vitest'

import { describeFreeformAction } from '../actionLabels'
import { reduceFreeformDocument } from '../document'
import {
  deckBodySize,
  deckColors,
  deckFonts,
  FONT_SETS,
  HEADING_SCALE,
  PALETTES,
  paletteColorMap,
  restyleDocument,
  restyleRequestProblem,
} from '../restyle'
import { normalizeFreeformDocument } from '../sceneDocument'
import { walkScene } from '../sceneTree'
import { FONTS } from '../../theme'
import { TEMPLATE_REGISTRY } from '../../templates/registry'
import type { FreeformDocument, FreeformSceneNode, FreeformTextElement } from '../types'

function template(id: string): FreeformDocument {
  const found = TEMPLATE_REGISTRY.find((candidate) => candidate.id === id)
  if (!found?.createFreeform) throw new Error(`no freeform template ${id}`)
  return found.createFreeform()
}

function texts(document: FreeformDocument): FreeformTextElement[] {
  const found: FreeformTextElement[] = []
  for (const slide of document.slides) {
    walkScene(slide.nodes, (node) => {
      if (node.type === 'text') found.push(node)
    })
  }
  return found
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((first, second) => second - first)
  return (x + 0.05) / (y + 0.05)
}

const freeformTemplates = TEMPLATE_REGISTRY.filter((candidate) => candidate.createFreeform)

describe('what a deck uses', () => {
  it('lists its colours by how much of the pages they cover, the page colour first', () => {
    const colors = deckColors(template('editorial-freeform'))
    expect(colors[0].color).toBe('#f6f3ea')
    expect(colors[0].background).toBeGreaterThan(0)
    // The closing page is dark with light words, so the page colour is also set as text.
    expect(colors[0].text).toBeGreaterThan(0)
    expect(colors.find((entry) => entry.color === '#1b1a18')?.text).toBeGreaterThan(0)
    expect(colors.find((entry) => entry.color === '#c23a26')?.fill).toBeGreaterThan(0)
    expect(new Set(colors.map((entry) => entry.color)).size).toBe(colors.length)
  })

  it('lists its fonts, the one set largest first, and finds the body size', () => {
    const document = template('editorial-freeform')
    const fonts = deckFonts(document)
    expect(fonts.map((font) => font.fontFamily)).toEqual(["'Noto Serif SC', serif", 'system-ui, sans-serif'])
    expect(fonts[0].largest).toBe(340)
    expect(fonts.reduce((sum, font) => sum + font.texts, 0)).toBe(texts(document).length)
    expect(deckBodySize(document)).toBeGreaterThan(18)
    expect(deckBodySize(document)).toBeLessThan(40)
  })
})

describe('restyleDocument', () => {
  it('replaces an exact colour everywhere it appears, and nothing else', () => {
    const document = template('editorial-freeform')
    const next = restyleDocument(document, { colors: { '#C23A26': '#123456' } })
    const before = JSON.stringify(document).toLowerCase()
    const after = JSON.stringify(next).toLowerCase()
    expect(before).toContain('#c23a26')
    expect(after).not.toContain('#c23a26')
    expect(after.split('#123456').length).toBe(before.split('#c23a26').length)
    expect(after.split('#123456').join('#c23a26')).toBe(before)
    // A colour the deck doesn't have changes nothing.
    expect(restyleDocument(document, { colors: { '#abcdef': '#123456' } })).toBe(document)
  })

  it('recolors a table\'s set colors and leaves absent ones alone', () => {
    const base = template('compare-table-freeform')
    const slide = base.slides[0]
    const table = slide.nodes.find((node) => node.type === 'table')
    if (!table || table.type !== 'table') throw new Error('compare-table template has no table')
    const withInk = {
      ...base,
      slides: [{ ...slide, nodes: slide.nodes.map((node) => node.id === table.id ? { ...table, ink: '#334155' } : node) }],
    }
    const next = restyleDocument(withInk, { colors: { '#334155': '#0f766e' } })
    const recolored = next.slides[0].nodes.find((node) => node.id === table.id)
    if (!recolored || recolored.type !== 'table') throw new Error('table lost in restyle')
    expect(recolored.ink).toBe('#0f766e')
    // The template's unset ink keeps its absence; its header fill maps too when set.
    const withFills = {
      ...withInk,
      slides: [{ ...slide, nodes: slide.nodes.map((node) => node.id === table.id ? { ...table, ink: '#334155', headerFill: '#e2e8f0', stripeFill: '#f1f5f9' } : node) }],
    }
    const fills = restyleDocument(withFills, { colors: { '#334155': '#0f766e', '#e2e8f0': '#ccfbf1', '#f1f5f9': '#f0fdfa' } })
    const refilled = fills.slides[0].nodes.find((node) => node.id === table.id)
    if (!refilled || refilled.type !== 'table') throw new Error('table lost in restyle')
    expect(refilled.ink).toBe('#0f766e')
    expect(refilled.headerFill).toBe('#ccfbf1')
    expect(refilled.stripeFill).toBe('#f0fdfa')
  })

  it('maps a palette: page and words take its colours, tints keep their place, colours take its accents', () => {
    const document = template('editorial-freeform')
    const sea = PALETTES.find((palette) => palette.id === 'sea-salt')!
    const map = paletteColorMap(document, sea)
    expect(map.get('#f6f3ea')).toBe(sea.background)
    // The words, not the light words of the dark closing page (drawn in the words' own near-black).
    expect(map.get('#1b1a18')).toBe(sea.text)
    expect(sea.accents).toContain(map.get('#c23a26'))
    // The quote band, a shade darker than the page, stays a light shade between the new page and words.
    const card = map.get('#e7dfcf')!
    expect(luminance(card)).toBeLessThan(luminance(sea.background))
    expect(luminance(card)).toBeGreaterThan(0.5)
  })

  it('keeps every word readable after a palette, on every template', () => {
    for (const entry of freeformTemplates) {
      const document = entry.createFreeform!()
      for (const palette of PALETTES) {
        const next = restyleDocument(document, { palette: palette.id })
        for (const slide of next.slides) {
          const nodes = slide.nodes
          nodes.forEach((node, index) => {
            if (node.type !== 'text' || node.textFill.type !== 'solid' || (node.opacity ?? 1) < 0.7) return
            const centre = { x: node.x + node.width / 2, y: node.y + node.height / 2 }
            const under = nodes.slice(0, index).reverse().find((candidate: FreeformSceneNode) => (
              (candidate.type === 'shape' || candidate.type === 'image' || (candidate.type === 'path' && candidate.fill.type !== 'transparent'))
              && !candidate.hidden && (candidate.opacity ?? 1) >= 0.7
              && centre.x >= candidate.x && centre.x <= candidate.x + candidate.width
              && centre.y >= candidate.y && centre.y <= candidate.y + candidate.height
            ))
            // Words on their own label read against the label.
            const label = node.effect?.type === 'background' ? { type: 'solid' as const, color: node.effect.color } : null
            const fill = label ?? (under?.type === 'shape' || under?.type === 'path' ? under.fill : under ? null : slide.background)
            if (!fill || fill.type !== 'solid') return
            const needed = node.fontSize >= 48 || (node.fontWeight === 'bold' && node.fontSize >= 40) ? 3 : 4.5
            expect(
              contrast(node.textFill.color, fill.color),
              `${entry.id} / ${palette.id} / ${node.name}`,
            ).toBeGreaterThanOrEqual(needed)
          })
        }
      }
    }
  })

  it('takes a font set: its heading font for large text, its body font for the rest', () => {
    const document = template('editorial-freeform')
    const set = FONT_SETS.find((candidate) => candidate.id === 'editorial')!
    const body = deckBodySize(document)!
    const next = restyleDocument(document, { fontSet: set.id })
    const pairs = texts(document).map((node, index) => [node, texts(next)[index]] as const)
    for (const [before, after] of pairs) {
      expect(after.fontFamily).toBe(before.fontSize >= body * HEADING_SCALE ? set.heading : set.body)
    }
    expect(pairs.some(([, after]) => after.fontFamily === set.heading)).toBe(true)
    expect(pairs.some(([, after]) => after.fontFamily === set.body)).toBe(true)
    // An exact replacement wins over the set for the family it names.
    const mixed = restyleDocument(document, { fontSet: set.id, fonts: { 'system-ui, sans-serif': 'PingFang SC' } })
    texts(document).forEach((node, index) => {
      if (node.fontFamily === 'system-ui, sans-serif') expect(texts(mixed)[index].fontFamily).toBe('PingFang SC')
    })
  })

  it('offers only fonts the editor can pick', () => {
    const offered = new Set(FONTS.map((font) => font.id))
    for (const set of FONT_SETS) {
      expect(offered.has(set.heading), set.heading).toBe(true)
      expect(offered.has(set.body), set.body).toBe(true)
    }
  })

  it('leaves the document alone for a request it cannot use, and says why', () => {
    const document = template('neon-freeform')
    expect(restyleDocument(document, { palette: 'nope' })).toBe(document)
    expect(restyleRequestProblem({ palette: 'nope' })).toContain('palette')
    expect(restyleRequestProblem({ fontSet: 'nope' })).toContain('fontSet')
    expect(restyleRequestProblem({ colors: { red: '#ffffff' } })).toContain('#RRGGBB')
    expect(restyleRequestProblem({ fonts: { 'PingFang SC': ' ' } })).toContain('字体名')
    expect(restyleRequestProblem({})).toContain('至少')
    expect(restyleRequestProblem({ palette: 'neon', fontSet: 'system' })).toBeNull()
  })

  it('runs through the reducer as one action that every template survives, with a history label', () => {
    for (const entry of freeformTemplates) {
      const document = entry.createFreeform!()
      for (const palette of PALETTES) {
        const next = reduceFreeformDocument(document, { type: 'document/restyle', palette: palette.id })
        expect(normalizeFreeformDocument(next), `${entry.id} / ${palette.id}`).not.toBeNull()
      }
      for (const set of FONT_SETS) {
        const next = reduceFreeformDocument(document, { type: 'document/restyle', fontSet: set.id })
        expect(normalizeFreeformDocument(next), `${entry.id} / ${set.id}`).not.toBeNull()
      }
    }
    expect(describeFreeformAction({ type: 'document/restyle', palette: 'neon' })).toBe('更换配色')
    expect(describeFreeformAction({ type: 'document/restyle', fontSet: 'book' })).toBe('更换字体组合')
    expect(describeFreeformAction({ type: 'document/restyle', fonts: { a: 'b' } })).toBe('替换字体')
    expect(describeFreeformAction({ type: 'document/restyle', colors: { '#000000': '#ffffff' } })).toBe('替换颜色')
  })
})
