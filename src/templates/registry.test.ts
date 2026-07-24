import { describe, expect, it } from 'vitest'
import { normalizeFreeformDocumentV3 } from '../freeform/sceneDocument'
import type { FreeformSceneNode } from '../freeform/types'
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

describe('template registry', () => {
  it('exposes four series in both workspaces with unique IDs', () => {
    expect(TEMPLATE_REGISTRY).toHaveLength(8)
    expect(new Set(TEMPLATE_REGISTRY.map((template) => template.id)).size).toBe(8)
    expect(templatesForWorkspace('markdown')).toHaveLength(4)
    expect(templatesForWorkspace('freeform')).toHaveLength(4)
  })

  it('creates editable markdown documents with independent profile data', () => {
    for (const template of templatesForWorkspace('markdown')) {
      const first = template.createMarkdown?.()
      const second = template.createMarkdown?.()
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
      expect(first && normalizeFreeformDocumentV3(first)).not.toBeNull()
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
})
