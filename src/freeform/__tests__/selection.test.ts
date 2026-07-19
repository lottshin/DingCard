import { expect, expectTypeOf, it } from 'vitest'

import {
  filterLiveSelectionIds,
  getElementsInMarquee,
  getSceneNodesInMarquee,
  moveElementsWithinSlide,
  moveSceneNodesWithinSlide,
} from '../selection'
import type { FreeformElement, FreeformSceneNode, FreeformSlide } from '../types'

expectTypeOf(moveElementsWithinSlide)
  .parameter(0)
  .toEqualTypeOf<Pick<FreeformSlide, 'width' | 'height'>>()

const element = (id: string, x: number, y: number, width = 100, height = 100): FreeformElement => ({
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

it('filters stale selection ids while keeping live ids', () => {
  const elements = [element('a', 40, 80), element('b', 180, 80)]

  expect(filterLiveSelectionIds(elements, ['missing', 'a', 'gone', 'b'])).toEqual(['a', 'b'])
})

it('returns an empty selection for empty and all-stale ids', () => {
  const elements = [element('a', 40, 80)]

  expect(filterLiveSelectionIds(elements, [])).toEqual([])
  expect(filterLiveSelectionIds(elements, ['missing', 'gone'])).toEqual([])
})

it('preserves selected id order instead of document order', () => {
  const elements = [element('a', 40, 80), element('b', 180, 80), element('c', 320, 80)]

  expect(filterLiveSelectionIds(elements, ['c', 'a', 'b'])).toEqual(['c', 'a', 'b'])
})

it('selects elements intersecting the marquee rectangle', () => {
  const elements = [element('a', 100, 100), element('b', 260, 100), element('c', 520, 100)]

  expect(getElementsInMarquee(elements, { x: 90, y: 90, width: 300, height: 160 })).toEqual(['a', 'b'])
})

it('normalizes marquee rectangles dragged in reverse', () => {
  const elements = [element('a', 100, 100), element('b', 420, 100)]

  expect(getElementsInMarquee(elements, { x: 390, y: 240, width: -320, height: -180 })).toEqual(['a'])
})

it('does not select elements that only touch the marquee edge', () => {
  const elements = [element('a', 100, 100)]

  expect(getElementsInMarquee(elements, { x: 200, y: 100, width: 80, height: 100 })).toEqual([])
})

it('uses scaled visual bounds when testing marquee intersections', () => {
  const scaled = { ...element('scaled', 200, 100), scale: 2 }

  expect(getElementsInMarquee(
    [scaled],
    { x: 140, y: 80, width: 20, height: 40 },
  )).toEqual(['scaled'])
})

it('returns no patches for an empty selection', () => {
  const slide = { width: 500, height: 400 }
  const elements = [element('a', 40, 80)]

  expect(moveElementsWithinSlide(slide, elements, [], 20, 20)).toEqual([])
})

it('returns no patches for unknown selected ids', () => {
  const slide = { width: 500, height: 400 }
  const elements = [element('a', 40, 80)]

  expect(moveElementsWithinSlide(slide, elements, ['missing'], 20, 20)).toEqual([])
})

it('returns patches in document order regardless of selected id order', () => {
  const slide = { width: 500, height: 400 }
  const elements = [element('a', 40, 80), element('b', 180, 80), element('c', 320, 80)]

  expect(moveElementsWithinSlide(slide, elements, ['c', 'a'], 10, 0)).toEqual([
    { elementId: 'a', patch: { x: 50, y: 80 } },
    { elementId: 'c', patch: { x: 330, y: 80 } },
  ])
})

it('clamps movement at the top-left slide edge', () => {
  const slide = { width: 500, height: 400 }
  const elements = [element('a', 20, 30)]

  expect(moveElementsWithinSlide(slide, elements, ['a'], -80, -90)).toEqual([
    { elementId: 'a', patch: { x: 0, y: 0 } },
  ])
})

it('clamps movement at the bottom-right slide edge', () => {
  const slide = { width: 500, height: 400 }
  const elements = [element('a', 340, 250, 140, 130)]

  expect(moveElementsWithinSlide(slide, elements, ['a'], 120, 100)).toEqual([
    { elementId: 'a', patch: { x: 360, y: 270 } },
  ])
})

it('anchors oversized groups to the top-left fallback when no in-slide delta exists', () => {
  const slide = { width: 100, height: 100 }
  const elements = [element('a', 20, 30, 150, 140)]

  expect(moveElementsWithinSlide(slide, elements, ['a'], 10, 10)).toEqual([
    { elementId: 'a', patch: { x: 0, y: 0 } },
  ])
})

it('does not drag oversized groups farther away from the top-left fallback', () => {
  const slide = { width: 100, height: 100 }
  const elements = [element('a', 0, 0, 150, 140)]

  expect(moveElementsWithinSlide(slide, elements, ['a'], 30, 30)).toEqual([
    { elementId: 'a', patch: { x: 0, y: 0 } },
  ])
})

it('moves selected elements together while keeping the group inside the slide', () => {
  const slide = { width: 500, height: 400 }
  const elements = [element('a', 40, 80), element('b', 340, 120, 140)]

  expect(moveElementsWithinSlide(slide, elements, ['a', 'b'], 120, 0)).toEqual([
    { elementId: 'a', patch: { x: 60, y: 80 } },
    { elementId: 'b', patch: { x: 360, y: 120 } },
  ])
})

it('clamps scaled and rotated elements by their visual bounds', () => {
  const slide = { width: 500, height: 400 }
  const scaled = { ...element('scaled', 300, 100), scale: 2 }
  const rotated = {
    ...element('rotated', 200, 200, 100, 50),
    rotation: 90,
  }

  expect(moveElementsWithinSlide(slide, [scaled], ['scaled'], 100, 0)).toEqual([
    { elementId: 'scaled', patch: { x: 350, y: 100 } },
  ])
  expect(moveElementsWithinSlide(
    { width: 300, height: 300 },
    [rotated],
    ['rotated'],
    100,
    100,
  )).toEqual([
    { elementId: 'rotated', patch: { x: 225, y: 225 } },
  ])
})

it('moves and marquee-selects direct children in parent-local coordinates', () => {
  const child = element('child', 0, 0, 80, 40)
  const sibling = element('sibling', 180, 20, 60, 60)
  const hidden = { ...element('hidden', 300, 20, 60, 60), hidden: true }
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
    children: [child, sibling, hidden],
  }]

  const patches = moveSceneNodesWithinSlide(
    { width: 1200, height: 900 },
    nodes,
    ['parent'],
    ['child'],
    30,
    0,
  )
  expect(patches).toHaveLength(1)
  expect(patches[0].patch.x).toBeCloseTo(17.320508, 6)
  expect(patches[0].patch.y).toBeCloseTo(-10, 6)

  expect(getSceneNodesInMarquee(
    nodes,
    ['parent'],
    { x: 260, y: 210, width: 170, height: 170 },
  )).toContain('child')
  expect(getSceneNodesInMarquee(
    nodes,
    ['parent'],
    { x: 0, y: 0, width: 1200, height: 900 },
  )).not.toContain('hidden')
})
