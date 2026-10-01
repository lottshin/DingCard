import { describe, expect, it } from 'vitest'
import { createShapeElement, createSlide, createTextElement } from '../document'
import { staggerNewElement } from '../insertPlacement'
import type { FreeformSceneNode } from '../types'

const page = createSlide({ width: 1080, height: 1440 })
const area = { width: page.width, height: page.height }
// 3% of the page's shorter side.
const STEP = 32

function insertMany(count: number) {
  const nodes: FreeformSceneNode[] = []
  for (let index = 0; index < count; index += 1) {
    nodes.push(staggerNewElement(createShapeElement(page, 'rect'), nodes, area))
  }
  return nodes
}

describe('placing new elements', () => {
  it('centres the first element and fans the next ones down and to the right', () => {
    const [first, second, third] = insertMany(3)
    expect([first.x, first.y]).toEqual([360, 600])
    expect([second.x, second.y]).toEqual([360 + STEP, 600 + STEP])
    expect([third.x, third.y]).toEqual([360 + 2 * STEP, 600 + 2 * STEP])
  })

  it('steps any element that would land on the same centre, whatever its kind', () => {
    const shape = staggerNewElement(createShapeElement(page, 'ellipse'), [], area)
    const text = staggerNewElement(createTextElement(page), [shape], area)
    expect(text.x + text.width / 2).toBe(shape.x + shape.width / 2 + STEP)
    expect(text.y + text.height / 2).toBe(shape.y + shape.height / 2 + STEP)
  })

  it('leaves the centre alone when nothing sits there', () => {
    const aside = { ...createShapeElement(page, 'rect'), x: 40, y: 40 }
    const next = staggerNewElement(createShapeElement(page, 'rect'), [aside], area)
    expect([next.x, next.y]).toEqual([360, 600])
  })

  it('turns up and to the left once the lower right runs out of page', () => {
    // One step down and right would cross the page's right edge.
    const tall = { ...createShapeElement(page, 'rect'), width: 1000, height: 1300, x: 60, y: 120 }
    const blocker = { ...tall, id: 'blocker' }
    const next = staggerNewElement(tall, [blocker], area)
    expect([next.x, next.y]).toEqual([60 - STEP, 120 - STEP])
  })

  it('gives up and stays centred when no step fits', () => {
    const full = { ...createShapeElement(page, 'rect'), width: 1080, height: 1440, x: 0, y: 0 }
    const next = staggerNewElement({ ...full, id: 'next' }, [full], area)
    expect([next.x, next.y]).toEqual([0, 0])
  })
})
