import { expect, expectTypeOf, it } from 'vitest'

import {
  filterLiveSelectionIds,
  getElementsInMarquee,
  moveElementsWithinSlide,
} from '../selection'
import type { FreeformElement, FreeformSlide } from '../types'

expectTypeOf(moveElementsWithinSlide)
  .parameter(0)
  .toEqualTypeOf<Pick<FreeformSlide, 'width' | 'height'>>()

const element = (id: string, x: number, y: number, width = 100, height = 100): FreeformElement => ({
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
