import { describe, expect, it } from 'vitest'
import { normalizeFreeformDocumentV5 } from '../freeform/sceneDocument'
import type { FreeformSceneLeaf, FreeformSceneNode } from '../freeform/types'
import { FONTS, PLATFORMS, THEMES } from '../theme'
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
  it('exposes three markdown and four freeform series with unique IDs', () => {
    expect(TEMPLATE_REGISTRY).toHaveLength(7)
    expect(new Set(TEMPLATE_REGISTRY.map((template) => template.id)).size).toBe(7)
    expect(templatesForWorkspace('markdown').map((template) => template.series)).toEqual([
      'editorial-archive',
      'public-theatre',
      'issue-cover',
    ])
    expect(templatesForWorkspace('freeform')).toHaveLength(4)
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
      expect(first && normalizeFreeformDocumentV5(first)).not.toBeNull()
      expect(first?.slides.every((slide) => slide.width === 1080 && slide.height === 1440)).toBe(true)
      const validFontIds = new Set(FONTS.map((font) => font.id))
      const templateFonts = first?.slides.flatMap((slide) => textFontFamilies(slide.nodes)) ?? []
      expect(templateFonts.every((font) => validFontIds.has(font))).toBe(true)
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
        expect(leaves.length, `${template.id}/${slide.name}`).toBeGreaterThanOrEqual(8)
        expect(leaves.filter((node) => node.type === 'text').length, `${template.id}/${slide.name}`).toBeGreaterThanOrEqual(3)
        expect(leaves.some((node) => node.type === 'shape'), `${template.id}/${slide.name}`).toBe(true)
        expect(leaves.some((node) => node.type === 'line'), `${template.id}/${slide.name}`).toBe(true)
      }
    }
    expect(new Set(seriesGeometry).size).toBe(4)
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
    expect(arrowText!.y - direction!.y).toBe(-2)
  })
})
