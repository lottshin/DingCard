import { describe, expect, test } from 'vitest'
import { DECORATIONS } from '../../../src/freeform/decorations'
import { walkScene } from '../../../src/freeform/sceneTree'
import type { FreeformDocument, FreeformSceneNode } from '../../../src/freeform/types'
import { listDecorations, placeDecorations } from './decorations'
import { inspectDocument } from './document'
import { instantiateTemplate } from './templates'

function poster(): FreeformDocument {
  const made = instantiateTemplate('talk-poster-freeform')
  if (made.workspace !== 'freeform') throw new Error('expected a freeform template')
  return made.document
}

function ids() {
  let n = 0
  return () => `deco-${++n}`
}

function texts(node: FreeformSceneNode): string[] {
  const found: string[] = []
  walkScene([node], (child) => { if (child.type === 'text') found.push(child.text) })
  return found
}

describe('list_decorations', () => {
  test('lists the whole library by category, with what an agent needs to place each', () => {
    const all = listDecorations()
    expect(all.total).toBe(DECORATIONS.length)
    expect(all.categories.map((category) => category.id)).toEqual(['hand-drawn', 'sticker', 'label'])
    expect(all.categories.reduce((sum, category) => sum + category.count, 0)).toBe(DECORATIONS.length)
    const circle = all.decorations.find((decoration) => decoration.id === 'circle-scribble')
    expect(circle).toMatchObject({ zh: '手绘圈', category: 'hand-drawn', stretches: true, color: '#e8453c' })
    expect(circle!.aspect).toBeGreaterThan(1.5)
    expect(all.decorations.find((decoration) => decoration.id === 'stamp')).toMatchObject({ text: '推荐', stretches: false })
  })

  test('searches in either language, narrows to a category, and names ids it lacks', () => {
    expect(listDecorations({ query: '圈' }).decorations.map((decoration) => decoration.id)).toContain('circle-scribble')
    expect(listDecorations({ query: 'coupon' }).decorations.map((decoration) => decoration.id)).toEqual(['coupon'])
    expect(listDecorations({ category: 'label' }).decorations.every((decoration) => decoration.category === 'label')).toBe(true)
    const picked = listDecorations({ ids: ['sparkles', 'nope'] })
    expect(picked.decorations.map((decoration) => decoration.id)).toEqual(['sparkles'])
    expect(picked.missing).toEqual(['nope'])
    expect(listDecorations({ query: '没有这种装饰' }).total).toBe(0)
  })
})

describe('add_decorations', () => {
  test('places decorations on a page, recoloured and re-worded, one under a named node', () => {
    const document = poster()
    const slide = document.slides[0]
    const placed = placeDecorations(document, undefined, [
      { decoration: 'circle-scribble', x: 60, y: 1000, width: 500, color: '#2447e0' },
      { decoration: 'burst-badge', x: 820, y: 60, width: 200, text: '免费', rotation: 8 },
      { decoration: 'marker-band', x: 60, y: 1300, width: 600, height: 90, below: '标题' },
    ], ids())
    expect(placed.ok).toBe(true)
    if (!placed.ok) return
    expect(placed.slideId).toBe(slide.id)
    expect(placed.notes).toEqual([])
    const nodes = placed.document.slides[0].nodes
    expect(nodes).toHaveLength(slide.nodes.length + 3)

    const [circle, burst, marker] = placed.added
    expect(circle.box).toMatchObject({ x: 60, y: 1000, width: 500 })
    const circleNode = nodes.find((node) => node.id === circle.nodeId)
    expect(circleNode?.type === 'path' && circleNode.fill).toEqual({ type: 'solid', color: '#2447e0' })

    const burstNode = nodes.find((node) => node.id === burst.nodeId)!
    expect(burstNode.type).toBe('group')
    expect(burstNode.rotation).toBe(8)
    expect(texts(burstNode)).toEqual(['免费'])

    // Under the title: just below it in the stack, and stretched to the height asked for.
    const titleAt = nodes.findIndex((node) => node.name === '标题')
    expect(nodes[titleAt - 1].id).toBe(marker.nodeId)
    expect(marker.box.height).toBe(90)
    expect(nodes.at(-1)!.id).toBe(burst.nodeId)
  })

  test('says what it could not use, and refuses what it cannot place', () => {
    const document = poster()
    const placed = placeDecorations(document, undefined, [
      { decoration: 'sparkle', x: 10, y: 10, text: '字', height: 300 },
      { decoration: 'stamp', x: 10, y: 10, below: '没有这个' },
    ], ids())
    expect(placed.ok && placed.notes).toEqual([
      'sparkle 不是标签，text 没有用上。',
      '这一页顶层没有「没有这个」，印章放在了最上层。',
    ])
    // A sparkle is one drawing, so it does stretch.
    expect(placed.ok && placed.added[0].box.height).toBe(300)
    expect(placeDecorations(document, undefined, [{ decoration: 'nope', x: 0, y: 0 }])).toMatchObject({ ok: false, error: expect.stringContaining('nope') })
    expect(placeDecorations(document, undefined, [{ decoration: 'sparkle', x: 0, y: 0, color: 'red' }])).toMatchObject({ ok: false, error: expect.stringContaining('#RRGGBB') })
    expect(placeDecorations(document, 'no-such-page', [{ decoration: 'sparkle', x: 0, y: 0 }])).toMatchObject({ ok: false })
  })

  test('lands at its default share of the page when no width is given', () => {
    const placed = placeDecorations(poster(), undefined, [{ decoration: 'sparkle', x: 0, y: 0 }], ids())
    expect(placed.ok && placed.added[0].box.width).toBe(108)
  })
})

describe('inspect_document', () => {
  test('names the decorations on a page, a group by the decoration it makes up', () => {
    // No two decorations share a drawing, so a drawing names its decoration.
    const owners = new Map<string, string>()
    for (const decoration of DECORATIONS) {
      for (const part of decoration.parts({ color: decoration.color, text: '' })) {
        if (part.kind !== 'path') continue
        expect(owners.get(part.d) ?? decoration.id, `${decoration.id} draws what ${owners.get(part.d)} draws`).toBe(decoration.id)
        owners.set(part.d, decoration.id)
      }
    }
    const placed = placeDecorations(poster(), undefined, [
      { decoration: 'circle-scribble', x: 60, y: 1000, width: 500, color: '#2447e0' },
      { decoration: 'burst-badge', x: 820, y: 60, width: 200, text: '免费' },
    ], ids())
    if (!placed.ok) throw new Error(placed.error)
    const inspected = inspectDocument(placed.document)
    if (!inspected.ok) throw new Error(inspected.error)
    const [circle, burst] = placed.added
    const summary = (id: string) => inspected.slides[0].nodes.find((node) => node.id === id)
    expect(summary(circle.nodeId)).toMatchObject({ type: 'path', decoration: 'circle-scribble' })
    expect(summary(circle.nodeId)?.d).toBeUndefined()
    expect(summary(burst.nodeId)).toMatchObject({ type: 'group', decoration: 'burst-badge' })
    expect(summary(burst.nodeId)?.children?.find((child) => child.type === 'text')).toMatchObject({ text: '免费' })
    // The template's own drawings and shapes are not library pieces.
    expect(inspected.slides[0].nodes.filter((node) => node.decoration).map((node) => node.id)).toEqual([circle.nodeId, burst.nodeId])
  })
})
