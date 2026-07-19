import { expect, it } from 'vitest'

import { snapDrag, snapSceneDrag } from '../snapping'
import type { FreeformElement, FreeformSceneNode } from '../types'

const rect = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 100,
): FreeformElement => ({
  id,
  name: id,
  locked: false,
  hidden: false,
  type: 'shape',
  shape: 'rect',
  x,
  y,
  width,
  height,
  rotation: 0,
  scale: 1,
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

it('snaps a scaled visual edge to the page edge', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [{ ...rect('a', 100, 100, 100, 100), scale: 2 }]

  expect(snapDrag(slide, elements, ['a'], -45, 0)).toEqual({
    dx: -50,
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

it('uses a scaled unselected element as a visual snap reference', () => {
  const slide = { width: 1200, height: 800 }
  const elements = [
    rect('a', 100, 100),
    { ...rect('b', 400, 120), scale: 2 },
  ]

  expect(snapDrag(slide, elements, ['a'], 145, 0)).toEqual({
    dx: 150,
    dy: 0,
    lines: [{ axis: 'x', position: 350, source: 'element' }],
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

it('snaps nested direct children in world space while excluding hidden references', () => {
  const selected = rect('selected', 0, 0, 100, 100)
  const reference = rect('reference', 220, 20, 100, 100)
  const hidden = { ...rect('hidden', 220, 200, 100, 100), hidden: true }
  const nodes: FreeformSceneNode[] = [{
    id: 'parent',
    name: 'Parent',
    locked: false,
    hidden: false,
    type: 'group',
    x: 300,
    y: 240,
    rotation: 30,
    scale: 1.5,
    children: [selected, reference, hidden],
  }]

  const result = snapSceneDrag(
    { width: 1200, height: 900 },
    nodes,
    ['parent'],
    ['selected'],
    65,
    0,
  )
  expect(result.dx).toBeCloseTo(65.884573, 6)
  const xLine = result.lines.find((line) => line.axis === 'x')
  expect(xLine).toEqual(expect.objectContaining({ axis: 'x', source: 'element' }))
  expect(xLine!.position).toBeCloseTo(495.788383, 6)
})
