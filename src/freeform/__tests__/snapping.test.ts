import { expect, it } from 'vitest'

import { ROTATION_SNAP_STEP, snapDrag, snapGuide, snapRotationDegrees, snapSceneDrag } from '../snapping'
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

it('snaps rotation deltas to 15° increments without negative zero', () => {
  expect(ROTATION_SNAP_STEP).toBe(15)
  expect(snapRotationDegrees(0)).toBe(0)
  expect(snapRotationDegrees(7.4)).toBe(0)
  expect(snapRotationDegrees(7.6)).toBe(15)
  expect(snapRotationDegrees(22.5)).toBe(30)
  expect(snapRotationDegrees(-7.4)).toBe(0)
  // Math.round ties (-x.5) toward +Infinity, matching every other snap here.
  expect(snapRotationDegrees(-22.5)).toBe(-15)
  expect(snapRotationDegrees(-22.51)).toBe(-30)
  expect(snapRotationDegrees(90)).toBe(90)
  expect(snapRotationDegrees(179)).toBe(180)
  expect(snapRotationDegrees(-179)).toBe(-180)
  expect(snapRotationDegrees(Number.NaN)).toBe(0)
  expect(snapRotationDegrees(Number.POSITIVE_INFINITY)).toBe(0)
})

it('settles a dragged guide on the page centre, an edge or an object, centre first', () => {
  const slide = { width: 1080, height: 1440 }
  const nodes = [rect('card', 100, 300, 200, 100) as FreeformSceneNode]
  expect(snapGuide(slide, nodes, 'x', 536, 8)).toEqual({ position: 540, target: 'page-center' })
  expect(snapGuide(slide, nodes, 'y', 717, 8)).toEqual({ position: 720, target: 'page-center' })
  expect(snapGuide(slide, nodes, 'x', 6, 8)).toEqual({ position: 0, target: 'page-edge' })
  // An object's left edge, centre and right edge.
  expect(snapGuide(slide, nodes, 'x', 104, 8)).toEqual({ position: 100, target: 'element' })
  expect(snapGuide(slide, nodes, 'x', 197, 8)).toEqual({ position: 200, target: 'element' })
  expect(snapGuide(slide, nodes, 'y', 396, 8)).toEqual({ position: 400, target: 'element' })
  // Too far from anything, or snapping off: it stays where it was dropped.
  expect(snapGuide(slide, nodes, 'x', 620, 8)).toEqual({ position: 620, target: null })
  expect(snapGuide(slide, nodes, 'x', 536, 0)).toEqual({ position: 536, target: null })
  // A hidden object catches nothing.
  expect(snapGuide(slide, [{ ...nodes[0], hidden: true }], 'x', 104, 8)).toEqual({ position: 104, target: null })
})

it('evens out nearly equal gaps and reports the shared space', () => {
  // Left 100–300, moving dragged to 360–560 (gap 60), right at 624–824
  // (gap 64). The equal-gap snap moves to gaps 62/62: dx +2.
  const left = rect('左卡', 100, 300, 200, 100)
  const right = rect('右卡', 624, 300, 200, 100)
  const moving = rect('中间', 200, 200, 200, 100)
  const nodes = [left, right, moving] as FreeformSceneNode[]
  const result = snapSceneDrag(
    { width: 1080, height: 1440 },
    nodes,
    [],
    ['中间'],
    160,
    100,
  )
  expect(result.dx).toBe(162)
  expect(result.dy).toBe(100)
  expect(result.space).toEqual({ gap: 62, axis: 'x', before: '左卡', after: '右卡' })
  // Already-equal gaps (dx lands at 62/62) stay quiet.
  const exact = snapSceneDrag(
    { width: 1080, height: 1440 },
    [rect('左卡', 100, 300, 200, 100), rect('右卡', 624, 300, 200, 100), moving] as FreeformSceneNode[],
    [],
    ['中间'],
    162,
    100,
  )
  expect(exact.space).toBeUndefined()
})
