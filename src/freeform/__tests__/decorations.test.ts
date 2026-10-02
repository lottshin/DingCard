import { describe, expect, it } from 'vitest'

import {
  DECORATION_CATEGORIES,
  DECORATIONS,
  createDecorationNode,
  decorationBounds,
  decorationById,
  decorationByName,
  decorationSize,
  decorationStretches,
  searchDecorations,
  wordsOn,
} from '../decorations'
import { isValidPathData, pathDataBounds } from '../pathData'
import { normalizeFreeformDocument } from '../sceneDocument'
import { walkScene } from '../sceneTree'
import type { FreeformSceneNode } from '../types'

function ids() {
  let n = 0
  return () => `node-${++n}`
}

function onPage(node: FreeformSceneNode) {
  return normalizeFreeformDocument({
    documentVersion: 19,
    activeSlideId: 'page',
    slides: [{ id: 'page', name: '页面', width: 1080, height: 1440, background: { type: 'solid', color: '#ffffff' }, nodes: [node] }],
  })
}

function leaves(node: FreeformSceneNode) {
  const found: FreeformSceneNode[] = []
  walkScene([node], (child) => { if (child.type !== 'group') found.push(child) })
  return found
}

describe('decoration library', () => {
  it('names every decoration once, in both languages, in a category the panel shows', () => {
    const categories = new Set(DECORATION_CATEGORIES.map((category) => category.id))
    expect(new Set(DECORATIONS.map((decoration) => decoration.id)).size).toBe(DECORATIONS.length)
    expect(new Set(DECORATIONS.map((decoration) => decoration.zh)).size).toBe(DECORATIONS.length)
    for (const decoration of DECORATIONS) {
      expect(categories.has(decoration.category), decoration.id).toBe(true)
      expect(decoration.en, decoration.id).toMatch(/^[A-Z]/)
      expect(decoration.color, decoration.id).toMatch(/^#[0-9a-f]{6}$/i)
      expect(decorationById(decoration.id)).toBe(decoration)
      expect(decorationByName(decoration.zh)).toBe(decoration)
      // Labels carry words; nothing else does.
      expect(Boolean(decoration.text), decoration.id).toBe(decoration.category === 'label')
    }
    for (const category of DECORATION_CATEGORIES) {
      expect(DECORATIONS.filter((decoration) => decoration.category === category.id).length, category.id).toBeGreaterThanOrEqual(10)
    }
  })

  it('becomes a valid node that fills the box it is placed in', () => {
    for (const decoration of DECORATIONS) {
      const node = createDecorationNode(decoration, { x: 100, y: 200, width: 300 }, ids())
      const document = onPage(node)
      expect(document, decoration.id).not.toBeNull()
      expect(node.name).toBe(decoration.zh)
      const bounds = decorationBounds(decoration)
      const height = (300 * bounds.height) / bounds.width
      if (node.type === 'group') {
        // Groups sit on the centre of what they hold.
        expect(node.x, decoration.id).toBeCloseTo(250, 1)
        expect(node.y, decoration.id).toBeCloseTo(200 + height / 2, 1)
        expect(node.children.length, decoration.id).toBeGreaterThan(1)
      } else {
        // A text box holds its words 8px in from its edges.
        const inset = node.type === 'text' ? 8 : 0
        expect(node.x, decoration.id).toBeCloseTo(100 - inset, 1)
        expect(node.y, decoration.id).toBeCloseTo(200 - inset, 1)
        if (node.type !== 'text') {
          expect(node.width, decoration.id).toBeCloseTo(300, 1)
          expect(node.height, decoration.id).toBeCloseTo(height, 1)
        }
      }
    }
  })

  it('draws every path inside its own box, so nothing spills past what is selected', () => {
    for (const decoration of DECORATIONS) {
      for (const leaf of leaves(createDecorationNode(decoration, { x: 0, y: 0, width: 400 }, ids()))) {
        if (leaf.type !== 'path') continue
        expect(isValidPathData(leaf.d), decoration.id).toBe(true)
        const drawn = pathDataBounds(leaf.d)!
        const { viewBox } = leaf
        expect(drawn.x, decoration.id).toBeGreaterThanOrEqual(viewBox.x - 0.1)
        expect(drawn.y, decoration.id).toBeGreaterThanOrEqual(viewBox.y - 0.1)
        expect(drawn.x + drawn.width, decoration.id).toBeLessThanOrEqual(viewBox.x + viewBox.width + 0.1)
        expect(drawn.y + drawn.height, decoration.id).toBeLessThanOrEqual(viewBox.y + viewBox.height + 0.1)
        // Every path shows: a fill or a stroke.
        expect(leaf.fill.type !== 'transparent' || leaf.strokeWidth > 0, decoration.id).toBe(true)
      }
    }
  })

  it('repaints what it draws in its own colour, and puts readable words on a label', () => {
    const pill = decorationById('pill')!
    const node = createDecorationNode(pill, { x: 0, y: 0, width: 200, color: '#2447e0', text: '上新' }, ids())
    expect(node.type).toBe('text')
    if (node.type !== 'text') return
    expect(node.text).toBe('上新')
    expect(node.effect).toMatchObject({ type: 'background', color: '#2447e0' })
    expect(node.textFill).toEqual({ type: 'solid', color: '#ffffff' })
    expect(wordsOn('#ffd23f')).toBe('#1c1917')
    expect(wordsOn('#1c1917')).toBe('#ffffff')

    const circle = createDecorationNode(decorationById('circle-scribble')!, { x: 0, y: 0, width: 300, color: '#1f9d63' }, ids())
    expect(circle.type === 'path' && circle.fill).toEqual({ type: 'solid', color: '#1f9d63' })
    const wave = createDecorationNode(decorationById('underline-wave')!, { x: 0, y: 0, width: 300, color: '#1f9d63' }, ids())
    expect(wave.type === 'path' && wave.stroke).toBe('#1f9d63')
  })

  it('writes sample words in the interface language unless given some', () => {
    const burst = decorationById('burst-badge')!
    const words = (node: FreeformSceneNode) => leaves(node).flatMap((leaf) => (leaf.type === 'text' ? [leaf.text] : []))
    expect(words(createDecorationNode(burst, { x: 0, y: 0, width: 180 }, ids()))).toEqual(['限时'])
    expect(words(createDecorationNode(burst, { x: 0, y: 0, width: 180, language: 'en' }, ids()))).toEqual(['SALE'])
    expect(words(createDecorationNode(burst, { x: 0, y: 0, width: 180, text: '五折', language: 'en' }, ids()))).toEqual(['五折'])
  })

  it('scales words, strokes and corners with the size it is placed at', () => {
    const outline = decorationById('outline-pill')!
    const small = createDecorationNode(outline, { x: 0, y: 0, width: 240 }, ids())
    const large = createDecorationNode(outline, { x: 0, y: 0, width: 480 }, ids())
    const text = (node: FreeformSceneNode) => leaves(node).find((leaf) => leaf.type === 'text')
    const frame = (node: FreeformSceneNode) => leaves(node).find((leaf) => leaf.type === 'shape')
    const [smallText, largeText] = [text(small), text(large)]
    const [smallFrame, largeFrame] = [frame(small), frame(large)]
    expect(smallText?.type === 'text' && largeText?.type === 'text' && largeText.fontSize / smallText.fontSize).toBeCloseTo(2, 1)
    expect(smallFrame?.type === 'shape' && largeFrame?.type === 'shape' && largeFrame.strokeWidth / smallFrame.strokeWidth).toBeCloseTo(2, 1)
  })

  it('stretches a single drawing to the box, and keeps anything else in proportion', () => {
    const wave = decorationById('underline-wave')!
    expect(decorationStretches(wave)).toBe(true)
    const stretched = createDecorationNode(wave, { x: 0, y: 0, width: 300, height: 120 }, ids())
    expect(stretched.type === 'path' && stretched.height).toBe(120)
    const stamp = decorationById('stamp')!
    expect(decorationStretches(stamp)).toBe(false)
    const kept = createDecorationNode(stamp, { x: 0, y: 0, width: 160, height: 40 }, ids())
    expect(kept.type).toBe('group')
  })

  it('lands at a share of the page and finds decorations by name or keyword in either language', () => {
    const size = decorationSize(decorationById('sparkle')!, { width: 1080, height: 1920 })
    expect(size.width).toBe(108)
    expect(searchDecorations('').length).toBe(DECORATIONS.length)
    expect(searchDecorations('印章').map((decoration) => decoration.id)).toEqual(['stamp'])
    expect(searchDecorations('underline').map((decoration) => decoration.id)).toEqual(['underline-brush', 'underline-wave', 'underline-double', 'zigzag'])
    expect(searchDecorations('胶带 照片').map((decoration) => decoration.id)).toEqual(['tape'])
  })
})
