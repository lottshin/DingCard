import { describe, expect, it } from 'vitest'
import { collectTextAutoSize } from '../textAutoSize'
import type {
  FreeformGroupNode,
  FreeformSceneNode,
  FreeformShapeElement,
  FreeformTextElement,
} from '../types'

let counter = 0

function textNode(overrides: Partial<FreeformTextElement> = {}): FreeformTextElement {
  counter += 1
  return {
    id: `text-${counter}`,
    name: `文本${counter}`,
    locked: false,
    hidden: false,
    type: 'text',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    rotation: 0,
    scale: 1,
    text: '内容',
    fontSize: 24,
    fontFamily: 'system-ui, sans-serif',
    textFill: { type: 'solid', color: '#1B1714' },
    align: 'left',
    fontWeight: 'normal',
    ...overrides,
  }
}

function shapeNode(): FreeformShapeElement {
  counter += 1
  return {
    id: `shape-${counter}`,
    name: `形状${counter}`,
    locked: false,
    hidden: false,
    type: 'shape',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    scale: 1,
    shape: 'rect',
    fill: { type: 'solid', color: '#000000' },
    stroke: '#000000',
    strokeWidth: 1,
  }
}

function groupNode(children: FreeformSceneNode[]): FreeformGroupNode {
  counter += 1
  return {
    id: `group-${counter}`,
    name: `组${counter}`,
    locked: false,
    hidden: false,
    type: 'group',
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    children,
  }
}

describe('collectTextAutoSize', () => {
  it('grows a horizontal text node to the measured content height', () => {
    const node = textNode()
    const updates = collectTextAutoSize([node], () => 136.4)

    expect(updates).toEqual([
      { path: [node.id], dimension: 'height', size: 137 },
    ])
  })

  it('grows a vertical text node to the measured content width', () => {
    const node = textNode({ vertical: true, width: 100, height: 400 })
    const updates = collectTextAutoSize([node], () => 208)

    expect(updates).toEqual([
      { path: [node.id], dimension: 'width', size: 208 },
    ])
  })

  it('keeps boxes that already fit or are larger than the content', () => {
    const fits = textNode()
    const larger = textNode({ height: 500 })
    const measure = () => 100

    expect(collectTextAutoSize([fits, larger], measure)).toEqual([])
  })

  it('ignores non-text nodes and unmeasurable text', () => {
    const shape = shapeNode()
    const hidden = textNode({ hidden: true })
    const measure = (id: string) => (id === hidden.id ? null : 999)

    expect(collectTextAutoSize([shape, hidden], measure)).toEqual([])
  })

  it('reports nested text nodes with their group paths', () => {
    const nested = textNode()
    const group = groupNode([nested])
    const updates = collectTextAutoSize([group], () => 250)

    expect(updates).toEqual([
      { path: [group.id, nested.id], dimension: 'height', size: 250 },
    ])
  })

  it('ignores non-finite or non-positive measurements', () => {
    const node = textNode()
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -10]) {
      expect(collectTextAutoSize([node], () => bad)).toEqual([])
    }
  })
})
