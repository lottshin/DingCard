import { describe, expect, it } from 'vitest'
import { builtInFont } from '../freeform/fontChoices'
import { normalizeFreeformDocument } from '../freeform/sceneDocument'
import type { FreeformSceneLeaf, FreeformSceneNode } from '../freeform/types'
import { FONTS, PLATFORMS, THEMES } from '../theme'
import { templateFormat } from './formats'
import { TEMPLATE_REGISTRY, templatesForWorkspace } from './registry'

function nodeIds(nodes: FreeformSceneNode[]): string[] {
  return nodes.flatMap((node) => [
    node.id,
    ...(node.type === 'group' ? nodeIds(node.children) : []),
  ])
}

function sceneIds(document: ReturnType<NonNullable<ReturnType<typeof templatesForWorkspace>[number]['createFreeform']>>): string[] {
  return document.slides.flatMap((slide) => [slide.id, ...nodeIds(slide.nodes)])
}

function textFontFamilies(nodes: FreeformSceneNode[]): string[] {
  return nodes.flatMap((node) => {
    if (node.type === 'group') return textFontFamilies(node.children)
    return node.type === 'text' ? [node.fontFamily] : []
  })
}

function sceneLeaves(nodes: FreeformSceneNode[]): FreeformSceneLeaf[] {
  return nodes.flatMap((node) => node.type === 'group' ? sceneLeaves(node.children) : [node])
}

function geometrySignature(nodes: FreeformSceneNode[]): string {
  return sceneLeaves(nodes)
    .map((node) => [node.type, node.x, node.y, node.width, node.height, node.rotation].join(':'))
    .join('|')
}

describe('template registry', () => {
  it('exposes three markdown series, eight freeform decks and twenty posters with unique IDs', () => {
    expect(TEMPLATE_REGISTRY).toHaveLength(31)
    expect(new Set(TEMPLATE_REGISTRY.map((template) => template.id)).size).toBe(31)
    expect(templatesForWorkspace('markdown').map((template) => template.series)).toEqual([
      'editorial-archive',
      'public-theatre',
      'issue-cover',
    ])
    const freeform = templatesForWorkspace('freeform')
    expect(freeform.filter((template) => template.kind === 'deck')).toHaveLength(8)
    expect(freeform.filter((template) => template.kind === 'poster')).toHaveLength(20)
    // Posters come in every size the template center filters by.
    expect(new Set(freeform.map((template) => template.format))).toEqual(new Set(['xhs', 'story', 'square', 'landscape', 'wechat-cover', 'a4', 'a4-landscape', 'moments-grid']))
  })

  it('creates editable markdown documents with independent profile data', () => {
    for (const template of templatesForWorkspace('markdown')) {
      const first = template.createMarkdown?.()
      const second = template.createMarkdown?.()
      expect(template.pageCount).toBe(4)
      expect(first?.source.split(/\n---\n/)).toHaveLength(template.pageCount)
      expect(first?.source).toContain('---')
      expect(PLATFORMS.some((platform) => platform.id === first?.platformId)).toBe(true)
      expect(THEMES.some((theme) => theme.id === first?.themeId)).toBe(true)
      expect(FONTS.some((font) => font.id === first?.fontFamily)).toBe(true)
      expect(first?.profile).not.toBe(second?.profile)
      if (first && second) first.profile.nickname = 'changed'
      expect(second?.profile.nickname).not.toBe('changed')
    }
  })

  it('creates normalized multi-page freeform documents with fresh IDs', () => {
    for (const template of templatesForWorkspace('freeform')) {
      const first = template.createFreeform?.()
      const second = template.createFreeform?.()
      expect(first?.slides).toHaveLength(template.pageCount)
      expect(first && normalizeFreeformDocument(first)).not.toBeNull()
      // Every page is drawn at the template's own size.
      const size = templateFormat(template.format)
      expect(first?.slides.every((slide) => slide.width === size.width && slide.height === size.height), template.id).toBe(true)
      // Every face is a built-in font, or a stack that starts with one (a decoration's label, like a new text box's).
      const templateFonts = first?.slides.flatMap((slide) => textFontFamilies(slide.nodes)) ?? []
      expect(templateFonts.filter((font) => !builtInFont(font)), template.id).toEqual([])
      const firstIds = sceneIds(first!)
      const secondIds = sceneIds(second!)
      expect(new Set(firstIds).size).toBe(firstIds.length)
      expect(firstIds.some((id) => secondIds.includes(id))).toBe(false)
      if (first && second) first.slides[0].name = 'changed'
      expect(second?.slides[0].name).not.toBe('changed')
    }
  })

  it('ships composition-rich freeform pages instead of palette-only variants', () => {
    const seriesGeometry: string[] = []
    for (const template of templatesForWorkspace('freeform')) {
      const document = template.createFreeform?.()
      expect(document).toBeDefined()
      seriesGeometry.push(document!.slides.map((slide) => geometrySignature(slide.nodes)).join('/'))

      for (const slide of document!.slides) {
        const leaves = sceneLeaves(slide.nodes)
        // A poster can be sparer than a deck page, never bare.
        expect(leaves.length, `${template.id}/${slide.name}`).toBeGreaterThanOrEqual(template.kind === 'poster' ? 5 : 8)
        expect(leaves.filter((node) => node.type === 'text').length, `${template.id}/${slide.name}`).toBeGreaterThanOrEqual(3)
        expect(leaves.some((node) => node.type === 'shape' || node.type === 'path'), `${template.id}/${slide.name}`).toBe(true)
        // Linework: rules, or drawn strokes (a decoration's).
        expect(leaves.some((node) => node.type === 'line' || (node.type === 'path' && node.strokeWidth > 0)), `${template.id}/${slide.name}`).toBe(true)
      }
    }
    expect(new Set(seriesGeometry).size).toBe(28)
  })

  it('overscans full-bleed rectangles past artboard corners', () => {
    const seamRisks: string[] = []

    for (const template of templatesForWorkspace('freeform')) {
      const document = template.createFreeform?.()
      expect(document).toBeDefined()

      for (const slide of document!.slides) {
        const rectangles = sceneLeaves(slide.nodes).filter(
          (node): node is Extract<FreeformSceneLeaf, { type: 'shape' }> =>
            node.type === 'shape' && node.shape === 'rect',
        )
        const corners = [
          {
            name: 'top-left',
            isCovered: (node: Extract<FreeformSceneLeaf, { type: 'shape' }>) =>
              node.x <= 0 && node.y <= 0 && node.x + node.width >= 0 && node.y + node.height >= 0,
            hasBleed: (node: Extract<FreeformSceneLeaf, { type: 'shape' }>) =>
              node.x < 0 || node.y < 0,
          },
          {
            name: 'top-right',
            isCovered: (node: Extract<FreeformSceneLeaf, { type: 'shape' }>) =>
              node.x <= slide.width && node.y <= 0
              && node.x + node.width >= slide.width && node.y + node.height >= 0,
            hasBleed: (node: Extract<FreeformSceneLeaf, { type: 'shape' }>) =>
              node.x + node.width > slide.width || node.y < 0,
          },
          {
            name: 'bottom-left',
            isCovered: (node: Extract<FreeformSceneLeaf, { type: 'shape' }>) =>
              node.x <= 0 && node.y <= slide.height
              && node.x + node.width >= 0 && node.y + node.height >= slide.height,
            hasBleed: (node: Extract<FreeformSceneLeaf, { type: 'shape' }>) =>
              node.x < 0 || node.y + node.height > slide.height,
          },
          {
            name: 'bottom-right',
            isCovered: (node: Extract<FreeformSceneLeaf, { type: 'shape' }>) =>
              node.x <= slide.width && node.y <= slide.height
              && node.x + node.width >= slide.width && node.y + node.height >= slide.height,
            hasBleed: (node: Extract<FreeformSceneLeaf, { type: 'shape' }>) =>
              node.x + node.width > slide.width || node.y + node.height > slide.height,
          },
        ]

        for (const rectangle of rectangles) {
          for (const corner of corners) {
            if (corner.isCovered(rectangle) && !corner.hasBleed(rectangle)) {
              seamRisks.push(`${template.id}/${slide.name}/${rectangle.name}/${corner.name}`)
            }
          }
        }
      }
    }

    expect(seamRisks).toEqual([])
  })

  it('shows off the appearance features across the freeform templates, three or more in each', () => {
    const capabilities = new Set<string>()
    for (const template of templatesForWorkspace('freeform')) {
      const document = template.createFreeform?.()
      expect(document).toBeDefined()
      const used = new Set<string>()
      for (const slide of document!.slides) {
        if (slide.background.type === 'linear-gradient' && 'stops' in slide.background) {
          used.add('gradientStops')
        }
      }
      for (const leaf of document!.slides.flatMap((slide) => sceneLeaves(slide.nodes))) {
        if (leaf.opacity !== undefined) used.add('opacity')
        if (leaf.shadow !== undefined) used.add('shadow')
        if (leaf.filter !== undefined) used.add('filter')
        if (leaf.blendMode !== undefined) used.add('blendMode')
        if (leaf.type === 'text') {
          if (leaf.lineHeight !== undefined) used.add('lineHeight')
          if (leaf.letterSpacing !== undefined) used.add('letterSpacing')
          if (leaf.italic !== undefined) used.add('italic')
          if (leaf.vertical !== undefined) used.add('verticalText')
          if (leaf.stroke !== undefined) used.add('textStroke')
          if (leaf.textFill.type === 'linear-gradient' && 'stops' in leaf.textFill) {
            used.add('gradientStops')
          }
        }
        if (leaf.type === 'shape') {
          if (leaf.cornerRadius !== undefined) used.add('cornerRadius')
          if (leaf.shape === 'star' || leaf.shape === 'hexagon') used.add('newShapes')
          if (leaf.fill.type === 'linear-gradient' && 'stops' in leaf.fill) {
            used.add('gradientStops')
          }
        }
        if (leaf.type === 'line' && leaf.dash !== undefined) used.add('dash')
        if (leaf.type === 'path') used.add('path')
        if (leaf.type === 'text' && leaf.effect !== undefined) used.add('textEffect')
      }
      expect(
        used.size,
        `${template.id} should showcase at least three appearance capabilities`,
      ).toBeGreaterThanOrEqual(3)
      for (const capability of used) capabilities.add(capability)
    }
    expect([...capabilities].sort()).toEqual([
      'cornerRadius',
      'dash',
      'filter',
      'gradientStops',
      'letterSpacing',
      'lineHeight',
      'newShapes',
      'opacity',
      'path',
      'shadow',
      'textEffect',
      'verticalText',
    ])
  })

  it('aligns the Signal action arrow with the headline center', () => {
    const template = templatesForWorkspace('freeform').find(
      (candidate) => candidate.id === 'signal-freeform',
    )
    const document = template?.createFreeform?.()
    const slide = document?.slides.find((candidate) => candidate.name === '行动')
    const leaves = sceneLeaves(slide?.nodes ?? [])
    const headline = leaves.find((node) => node.name === '主标题')
    const direction = leaves.find((node) => node.name === '方向符号')
    const arrowText = leaves.find((node) => node.name === '箭头文字')

    expect(headline).toBeDefined()
    expect(direction).toBeDefined()
    expect(arrowText).toBeDefined()
    expect(direction!.y + direction!.height / 2).toBe(headline!.y + headline!.height / 2)
    // The arrow sits in the middle of its disc.
    expect(Math.abs(arrowText!.y + arrowText!.height / 2 - (direction!.y + direction!.height / 2))).toBeLessThanOrEqual(2)
    expect(arrowText!.x + arrowText!.width / 2).toBe(direction!.x + direction!.width / 2)
  })
})
