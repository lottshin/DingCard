import { describe, expect, it } from 'vitest'
import {
  COLLAGE_LAYOUTS,
  collageBox,
  collageById,
  createCollageGroup,
} from '../collageLayouts'
import { normalizeFreeformDocumentV19 } from '../sceneDocument'
import type { FreeformDocument, FreeformSlide } from '../types'

const PAGE: FreeformSlide = {
  id: 'page',
  name: '第 1 页',
  width: 1080,
  height: 1440,
  background: { type: 'solid', color: '#ffffff' },
  nodes: [],
}

function documentWith(node: unknown): FreeformDocument {
  return normalizeFreeformDocumentV19({
    documentVersion: 19,
    activeSlideId: PAGE.id,
    slides: [{ ...PAGE, nodes: [node] }],
  })!
}

describe('collage layouts', () => {
  it('offers a set of unique, well-formed layouts', () => {
    expect(COLLAGE_LAYOUTS.length).toBeGreaterThanOrEqual(6)
    expect(new Set(COLLAGE_LAYOUTS.map((layout) => layout.id)).size).toBe(COLLAGE_LAYOUTS.length)
    for (const layout of COLLAGE_LAYOUTS) {
      expect(layout.aspect).toBeGreaterThan(0)
      for (const cell of layout.cells) {
        expect(cell.x).toBeGreaterThanOrEqual(0)
        expect(cell.y).toBeGreaterThanOrEqual(0)
        expect(cell.x + cell.width).toBeLessThanOrEqual(1 + 1e-9)
        expect(cell.y + cell.height).toBeLessThanOrEqual(1 + 1e-9)
        expect(cell.width).toBeGreaterThan(0)
        expect(cell.height).toBeGreaterThan(0)
      }
      // The cells tile the whole box exactly once.
      const area = layout.cells.reduce((sum, cell) => sum + cell.width * cell.height, 0)
      expect(area).toBeCloseTo(1, 6)
    }
  })

  it('builds a valid group of rounded cells with even gaps', () => {
    let n = 0
    const createId = () => `collage-${n++}`
    for (const layout of COLLAGE_LAYOUTS) {
      n = 0
      const box = collageBox(layout, PAGE)
      const group = createCollageGroup(layout, { box, createId })
      expect(group.type).toBe('group')
      expect(group.children).toHaveLength(layout.cells.length)
      // Cells stay inside the box, keep the gap apart, and never overlap.
      const cells = group.children
      for (const cell of cells) {
        if (cell.type !== 'shape') throw new Error('expected shape cell')
        expect(cell.x).toBeGreaterThanOrEqual(6 - 1)
        expect(cell.y).toBeGreaterThanOrEqual(6 - 1)
        expect(cell.x + cell.width).toBeLessThanOrEqual(box.width - 6 + 1)
        expect(cell.y + cell.height).toBeLessThanOrEqual(box.height - 6 + 1)
        expect(cell.shape).toBe('rect')
        expect(cell.cornerRadius).toBeGreaterThan(0)
      }
      for (let a = 0; a < cells.length; a += 1) {
        for (let b = a + 1; b < cells.length; b += 1) {
          const first = cells[a]
          const second = cells[b]
          if (first.type !== 'shape' || second.type !== 'shape') throw new Error('expected shape cells')
          const separated = first.x + first.width + 11 <= second.x
            || second.x + second.width + 11 <= first.x
            || first.y + first.height + 11 <= second.y
            || second.y + second.height + 11 <= first.y
          expect(separated).toBe(true)
        }
      }
      // The built collage is a valid current document.
      expect(() => documentWith(group)).not.toThrow()
      expect(documentWith(group).slides[0].nodes[0].type).toBe('group')
    }
  })

  it('sizes the box to the page and centres it', () => {
    for (const layout of COLLAGE_LAYOUTS) {
      const box = collageBox(layout, PAGE)
      expect(box.width).toBeLessThanOrEqual(PAGE.width * 0.8 + 1)
      expect(box.height).toBeLessThanOrEqual(PAGE.height * 0.8 + 1)
      expect(box.width / box.height).toBeCloseTo(layout.aspect, 0)
      expect(box.x + box.width / 2).toBeCloseTo(PAGE.width / 2, 0)
      expect(box.y + box.height / 2).toBeCloseTo(PAGE.height / 2, 0)
    }
  })

  it('looks layouts up by id and rejects unknown ones', () => {
    expect(collageById('quad')?.label).toBe('四宫格')
    expect(collageById('nope')).toBeUndefined()
  })
})
