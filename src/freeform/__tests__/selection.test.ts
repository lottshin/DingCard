import { expect, it } from 'vitest'

import { getElementsInMarquee, moveElementsWithinSlide } from '../selection'
import type { FreeformElement, FreeformSlide } from '../types'

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

it('selects elements intersecting the marquee rectangle', () => {
  const elements = [element('a', 100, 100), element('b', 260, 100), element('c', 520, 100)]

  expect(getElementsInMarquee(elements, { x: 90, y: 90, width: 300, height: 160 })).toEqual(['a', 'b'])
})

it('normalizes marquee rectangles dragged in reverse', () => {
  const elements = [element('a', 100, 100), element('b', 420, 100)]

  expect(getElementsInMarquee(elements, { x: 390, y: 240, width: -320, height: -180 })).toEqual(['a'])
})

it('moves selected elements together while keeping the group inside the slide', () => {
  const slide = { width: 500, height: 400 } as FreeformSlide
  const elements = [element('a', 40, 80), element('b', 340, 120, 140)]

  expect(moveElementsWithinSlide(slide, elements, ['a', 'b'], 120, 0)).toEqual([
    { elementId: 'a', patch: { x: 60, y: 80 } },
    { elementId: 'b', patch: { x: 360, y: 120 } },
  ])
})
