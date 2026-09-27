import { describe, expect, test } from 'vitest'
import { applyActions, inspectDocument, validateDocument } from './document'
import type { FreeformDocument } from '../../../src/freeform/types'

function seedDocument(): FreeformDocument {
  return {
    documentVersion: 4,
    activeSlideId: 'slide-1',
    slides: [
      {
        id: 'slide-1',
        name: '第一页',
        width: 1080,
        height: 1440,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [
          {
            id: 'title-1',
            name: '标题',
            locked: false,
            hidden: false,
            type: 'text',
            x: 72,
            y: 120,
            width: 900,
            height: 200,
            rotation: 0,
            scale: 1,
            text: '你好，叮卡',
            fontSize: 64,
            fontFamily: 'PingFang SC',
            textFill: { type: 'solid', color: '#18181b' },
            align: 'left',
            fontWeight: 'bold',
          },
          {
            id: 'group-1',
            name: '分组',
            locked: false,
            hidden: false,
            type: 'group',
            x: 72,
            y: 400,
            rotation: 0,
            scale: 1,
            children: [
              {
                id: 'shape-1',
                name: '色块',
                locked: false,
                hidden: false,
                type: 'shape',
                x: 0,
                y: 0,
                width: 200,
                height: 120,
                rotation: 0,
                scale: 1,
                shape: 'rect',
                fill: { type: 'solid', color: '#fed7aa' },
                stroke: 'transparent',
                strokeWidth: 0,
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('validateDocument', () => {
  test('accepts and normalizes a valid document', () => {
    const result = validateDocument(seedDocument())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.documentVersion).toBe(4)
    expect(result.document.slides[0].id).toBe('slide-1')
  })

  test('rejects documents with an extra key on a node', () => {
    const document = seedDocument() as unknown as Record<string, unknown>
    const slide = (document.slides as Array<Record<string, unknown>>)[0]
    const nodes = slide.nodes as Array<Record<string, unknown>>
    nodes[0].extra = true
    expect(validateDocument(document).ok).toBe(false)
  })

  test('rejects bad geometry and unknown versions', () => {
    const badScale = seedDocument() as unknown as Record<string, unknown>
    const slide = (badScale.slides as Array<Record<string, unknown>>)[0]
    const nodes = slide.nodes as Array<Record<string, unknown>>
    nodes[0].scale = 0
    expect(validateDocument(badScale).ok).toBe(false)

    expect(validateDocument({ documentVersion: 99, slides: [], activeSlideId: '' }).ok).toBe(false)
    expect(validateDocument('not a document').ok).toBe(false)
  })
})

describe('inspectDocument', () => {
  test('returns the slide and recursive node tree', () => {
    const result = inspectDocument(seedDocument())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.slideCount).toBe(1)
    expect(result.activeSlideId).toBe('slide-1')
    const slide = result.slides[0]
    expect(slide.width).toBe(1080)
    expect(slide.nodeCount).toBe(3)
    expect(slide.background).toBe('solid #ffffff')

    const title = slide.nodes[0]
    expect(title.type).toBe('text')
    expect(title.text).toBe('你好，叮卡')
    expect(title.fontSize).toBe(64)

    const group = slide.nodes[1]
    expect(group.type).toBe('group')
    expect(group.children).toHaveLength(1)
    expect(group.children?.[0].shape).toBe('rect')
  })

  test('rejects invalid documents', () => {
    expect(inspectDocument({ ok: 'nope' }).ok).toBe(false)
  })
})

describe('applyActions', () => {
  test('applies a sequence of editor actions', () => {
    const result = applyActions(seedDocument(), [
      { type: 'slide/add-after-active' },
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{ path: ['title-1'], patch: { text: '新标题' } }],
      },
      {
        type: 'node/update-geometry',
        slideId: 'slide-1',
        updates: [{ path: ['title-1'], patch: { y: 200 } }],
      },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.slides).toHaveLength(2)
    expect(result.changes).toEqual([true, true, true])
    const title = result.document.slides[0].nodes[0]
    if (title.type !== 'text') throw new Error('expected text node')
    expect(title.text).toBe('新标题')
    expect(title.y).toBe(200)
  })

  test('edits nodes inside groups through their path', () => {
    const result = applyActions(seedDocument(), [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [
          { path: ['group-1', 'shape-1'], patch: { fill: { type: 'solid', color: '#174a38' } } },
        ],
      },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const group = result.document.slides[0].nodes[1]
    if (group.type !== 'group') throw new Error('expected group')
    const shape = group.children[0]
    if (shape.type !== 'shape') throw new Error('expected shape')
    expect(shape.fill).toEqual({ type: 'solid', color: '#174a38' })
  })

  test('invalid actions are silently ignored and flagged as unchanged', () => {
    const result = applyActions(seedDocument(), [
      { type: 'node/delete', slideId: 'missing-slide', parentPath: [], nodeIds: ['x'] },
      { type: 'not-a-real-action' },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changes).toEqual([false, false])
    expect(result.document.slides).toHaveLength(1)
  })

  test('clone mints fresh ids for duplicated nodes', () => {
    const result = applyActions(seedDocument(), [
      {
        type: 'node/clone',
        slideId: 'slide-1',
        parentPath: [],
        nodeIds: ['title-1'],
      },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.slides[0].nodes).toHaveLength(3)
    const clone = result.document.slides[0].nodes[2]
    expect(clone.id).not.toBe('title-1')
  })

  test('rejects invalid input documents and non-array actions', () => {
    expect(applyDocumentInvalid().ok).toBe(false)
    const result = applyActions(seedDocument(), 'nope')
    expect(result.ok).toBe(false)
  })

  function applyDocumentInvalid() {
    return applyActions({ documentVersion: 4 }, [])
  }
})
