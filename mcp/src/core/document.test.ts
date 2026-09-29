import { describe, expect, test } from 'vitest'
import { applyActions, inspectDocument, validateDocument } from './document'
import type { FreeformDocument } from '../../../src/freeform/types'

function seedDocument(): FreeformDocument {
  return {
    documentVersion: 13,
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
    expect(result.document.documentVersion).toBe(13)
    expect(result.document.slides[0].id).toBe('slide-1')
  })

  test('accepts the v11 transparent shape fill and rejects it on v10 inputs', () => {
    const noFill = seedDocument() as unknown as Record<string, unknown>
    const slide = (noFill.slides as Array<Record<string, unknown>>)[0]
    const nodes = slide.nodes as Array<Record<string, unknown>>
    const shape = (nodes[1].children as Array<Record<string, unknown>>)[0]
    shape.fill = { type: 'transparent' }
    shape.stroke = '#c2410c'
    shape.strokeWidth = 4
    const accepted = validateDocument(noFill)
    expect(accepted.ok).toBe(true)

    const legacy = structuredClone(noFill)
    legacy.documentVersion = 10
    expect(validateDocument(legacy).ok).toBe(false)

    const malformed = structuredClone(noFill)
    const malformedShape = (((malformed.slides as Array<Record<string, unknown>>)[0].nodes as Array<Record<string, unknown>>)[1].children as Array<Record<string, unknown>>)[0]
    malformedShape.fill = { type: 'transparent', color: '#ffffff' }
    expect(validateDocument(malformed).ok).toBe(false)
  })

  test('accepts the v12 radial gradient everywhere and rejects it on v11 inputs', () => {
    const radial = {
      type: 'radial-gradient',
      stops: [
        { offset: 0, color: '#fde68a' },
        { offset: 1, color: '#c2410c' },
      ],
    }
    const radialDocument = seedDocument() as unknown as Record<string, unknown>
    const slide = (radialDocument.slides as Array<Record<string, unknown>>)[0]
    slide.background = radial
    const nodes = slide.nodes as Array<Record<string, unknown>>
    nodes[0].textFill = radial
    const shape = (nodes[1].children as Array<Record<string, unknown>>)[0]
    shape.fill = radial
    expect(validateDocument(radialDocument).ok).toBe(true)

    const legacy = structuredClone(radialDocument)
    legacy.documentVersion = 11
    expect(validateDocument(legacy).ok).toBe(false)

    const malformed = structuredClone(radialDocument)
    const malformedSlide = (malformed.slides as Array<Record<string, unknown>>)[0]
    malformedSlide.background = { type: 'radial-gradient', stops: [{ offset: 0, color: '#fde68a' }] }
    expect(validateDocument(malformed).ok).toBe(false)
  })

  test('accepts v13 line endpoint caps and rejects them on v12 inputs', () => {
    const capped = seedDocument() as unknown as Record<string, unknown>
    const slide = (capped.slides as Array<Record<string, unknown>>)[0]
    const nodes = slide.nodes as Array<Record<string, unknown>>
    nodes[1] = {
      id: 'line-1',
      name: '双向线',
      locked: false,
      hidden: false,
      type: 'line',
      x: 72,
      y: 700,
      width: 400,
      height: 40,
      rotation: 0,
      scale: 1,
      lineKind: 'line',
      stroke: '#18181b',
      strokeWidth: 6,
      startCap: 'arrow',
      endCap: 'dot',
    }
    expect(validateDocument(capped).ok).toBe(true)

    const legacy = structuredClone(capped)
    legacy.documentVersion = 12
    expect(validateDocument(legacy).ok).toBe(false)

    const malformed = structuredClone(capped)
    const malformedNodes = (malformed.slides as Array<Record<string, unknown>>)[0].nodes as Array<Record<string, unknown>>
    malformedNodes[1].startCap = 'square'
    expect(validateDocument(malformed).ok).toBe(false)
  })

  test('accepts v9 text features, rejects vertical text on v8 inputs', () => {
    const stroked = seedDocument() as unknown as Record<string, unknown>
    const slide = (stroked.slides as Array<Record<string, unknown>>)[0]
    const nodes = slide.nodes as Array<Record<string, unknown>>
    nodes[0].stroke = '#f97316'
    nodes[0].strokeWidth = 3
    nodes[0].vertical = true
    nodes[0].textFill = {
      type: 'linear-gradient',
      stops: [
        { offset: 0, color: '#111111' },
        { offset: 1, color: '#ffffff' },
      ],
      angle: 90,
    }
    const accepted = validateDocument(stroked)
    expect(accepted.ok).toBe(true)

    const legacy = structuredClone(stroked)
    legacy.documentVersion = 8
    expect(validateDocument(legacy).ok).toBe(false)

    const badStops = structuredClone(stroked)
    const badNodes = ((badStops as Record<string, unknown>).slides as Array<Record<string, unknown>>)[0].nodes as Array<Record<string, unknown>>
    badNodes[0].textFill = {
      type: 'linear-gradient',
      stops: [
        { offset: 0.8, color: '#111111' },
        { offset: 0.2, color: '#ffffff' },
      ],
      angle: 90,
    }
    expect(validateDocument(badStops).ok).toBe(false)
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

  test('applies rich text spans and keeps them through text edits', () => {
    const spans = [
      { start: 0, end: 2, bold: true },
      { start: 2, end: 4, color: '#d92d20' },
    ]
    const styled = applyActions(seedDocument(), [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['title-1'], patch: { spans } }],
      },
    ])
    expect(styled.ok).toBe(true)
    if (!styled.ok) return
    expect(styled.changes).toEqual([true])
    expect(validateDocument(styled.document).ok).toBe(true)
    const styledTitle = styled.document.slides[0].nodes[0]
    if (styledTitle.type !== 'text') throw new Error('expected text node')
    expect(styledTitle.spans).toEqual(spans)

    const edited = applyActions(styled.document, [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{ path: ['title-1'], patch: { text: `${styledTitle.text}！` } }],
      },
    ])
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    const editedTitle = edited.document.slides[0].nodes[0]
    if (editedTitle.type !== 'text') throw new Error('expected text node')
    expect(editedTitle.spans).toEqual(spans)
    expect(validateDocument(edited.document).ok).toBe(true)
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
