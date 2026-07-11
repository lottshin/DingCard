import { expect, it } from 'vitest'

import { snapDrag } from '../snapping'
import type { FreeformElement } from '../types'

const rect = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 100,
): FreeformElement => ({
  id,
  type: 'shape',
  shape: 'rect',
  x,
  y,
  width,
  height,
  rotation: 0,
  fill: { type: 'solid', color: '#fff' },
  stroke: '#000',
  strokeWidth: 0,
})

it('snaps a dragged element to the page horizontal center', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100, 100, 100)]

  expect(snapDrag(slide, elements, ['a'], 345, 0)).toEqual({
    dx: 350,
    dy: 0,
    lines: [{ axis: 'x', position: 500, source: 'page' }],
  })
})

it('snaps a dragged element to the page left edge', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 20, 100, 100, 100)]

  expect(snapDrag(slide, elements, ['a'], -15, 0)).toEqual({
    dx: -20,
    dy: 0,
    lines: [{ axis: 'x', position: 0, source: 'page' }],
  })
})

it('snaps a dragged element to another element left edge', () => {
  const slide = { width: 1200, height: 800 }
  const elements = [rect('a', 100, 100), rect('b', 400, 120, 140, 100)]

  expect(snapDrag(slide, elements, ['a'], 294, 0)).toEqual({
    dx: 300,
    dy: 0,
    lines: [{ axis: 'x', position: 400, source: 'element' }],
  })
})

it('snaps vertical movement to another element top edge', () => {
  const slide = { width: 1000, height: 1200 }
  const elements = [rect('a', 100, 100), rect('b', 300, 400, 100, 140)]

  expect(snapDrag(slide, elements, ['a'], 0, 294)).toEqual({
    dx: 0,
    dy: 300,
    lines: [{ axis: 'y', position: 400, source: 'element' }],
  })
})

it('does not snap outside the threshold', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100, 100, 100)]

  expect(snapDrag(slide, elements, ['a'], 342, 0)).toEqual({
    dx: 342,
    dy: 0,
    lines: [],
  })
})

it('snaps a multi-selection group by its bounding box', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100), rect('b', 300, 100)]

  expect(snapDrag(slide, elements, ['a', 'b'], 245, 0)).toEqual({
    dx: 250,
    dy: 0,
    lines: [{ axis: 'x', position: 500, source: 'page' }],
  })
})

it('does not use selected elements as external snap references', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100), rect('b', 300, 100), rect('c', 700, 700)]

  expect(snapDrag(slide, elements, ['a', 'b'], 196, 0)).toEqual({
    dx: 196,
    dy: 0,
    lines: [],
  })
})

it('prefers page references over element references at the same distance', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100), rect('b', 500, 300)]

  expect(snapDrag(slide, elements, ['a'], 345, 0)).toEqual({
    dx: 350,
    dy: 0,
    lines: [{ axis: 'x', position: 500, source: 'page' }],
  })
})

it('uses stable dragged-anchor priority when candidates are tied', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100, 24, 100)]

  expect(snapDrag(slide, elements, ['a'], 394, 0)).toEqual({
    dx: 388,
    dy: 0,
    lines: [{ axis: 'x', position: 500, source: 'page' }],
  })
})

it('keeps snapped movement inside slide bounds', () => {
  const slide = { width: 500, height: 400 }
  const elements = [rect('a', 350, 100, 100, 100), rect('b', 494, 120, 100, 100)]

  expect(snapDrag(slide, elements, ['a'], 49, 0)).toEqual({
    dx: 50,
    dy: 0,
    lines: [
      { axis: 'x', position: 500, source: 'page' },
      { axis: 'y', position: 200, source: 'page' },
    ],
  })
})

it('returns original movement and no lines for invalid selection', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100)]

  expect(snapDrag(slide, elements, ['missing'], 20, 30)).toEqual({
    dx: 20,
    dy: 30,
    lines: [],
  })
})
