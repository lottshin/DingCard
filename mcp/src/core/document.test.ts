import { describe, expect, test } from 'vitest'
import { applyActions, inspectDocument, validateDocument } from './document'
import type { FreeformDocument } from '../../../src/freeform/types'

function seedDocument(): FreeformDocument {
  return {
    documentVersion: 37,
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
    expect(result.document.documentVersion).toBe(37)
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

  test('accepts v14 polyline vertices and rejects them on v13 inputs', () => {
    const poly = seedDocument() as unknown as Record<string, unknown>
    const slide = (poly.slides as Array<Record<string, unknown>>)[0]
    const nodes = slide.nodes as Array<Record<string, unknown>>
    nodes[1] = {
      id: 'ridge-1',
      name: '山脊折线',
      locked: false,
      hidden: false,
      type: 'line',
      x: 72,
      y: 700,
      width: 400,
      height: 120,
      rotation: 0,
      scale: 1,
      lineKind: 'line',
      stroke: '#17293c',
      strokeWidth: 8,
      endCap: 'dot',
      points: [
        { x: 0, y: 100 },
        { x: 130, y: 20 },
        { x: 260, y: 110 },
        { x: 400, y: 30 },
      ],
    }
    expect(validateDocument(poly).ok).toBe(true)

    const legacy = structuredClone(poly)
    legacy.documentVersion = 13
    expect(validateDocument(legacy).ok).toBe(false)

    const outOfBox = structuredClone(poly)
    const outOfBoxNodes = (outOfBox.slides as Array<Record<string, unknown>>)[0].nodes as Array<Record<string, unknown>>
    ;(outOfBoxNodes[1].points as Array<{ x: number; y: number }>)[1].y = 121
    expect(validateDocument(outOfBox).ok).toBe(false)
  })

  test('accepts v15 path nodes, summarises them, and rejects them on v14 inputs', () => {
    const drawn = seedDocument() as unknown as Record<string, unknown>
    const slide = (drawn.slides as Array<Record<string, unknown>>)[0]
    const nodes = slide.nodes as Array<Record<string, unknown>>
    const path = {
      locked: false,
      hidden: false,
      type: 'path',
      x: 72,
      y: 700,
      width: 400,
      height: 80,
      rotation: 0,
      scale: 1,
      viewBox: { x: 0, y: 0, width: 100, height: 20 },
      fill: { type: 'transparent' },
      stroke: '#17293c',
      strokeWidth: 2,
    }
    nodes.push(
      { ...path, id: 'wave-1', name: '波浪线', d: 'M0 10q12.5-10 25 0t25 0 25 0 25 0', dash: 0.5 },
      { ...path, id: 'icon-1', name: '对勾', width: 80, d: 'M20 6 9 17l-5-5', viewBox: { x: 0, y: 0, width: 24, height: 24 } },
    )
    expect(validateDocument(drawn).ok).toBe(true)

    const summary = inspectDocument(drawn)
    if (!summary.ok) throw new Error(summary.error)
    expect(summary.slides[0].nodes.slice(-2)).toMatchObject([
      { id: 'wave-1', type: 'path', d: 'M0 10q12.5-10 25 0t25 0 25 0 25 0' },
      { id: 'icon-1', type: 'path', icon: 'check' },
    ])

    const legacy = structuredClone(drawn)
    legacy.documentVersion = 14
    expect(validateDocument(legacy).ok).toBe(false)

    const scribbled = structuredClone(drawn)
    const scribbledNodes = (scribbled.slides as Array<Record<string, unknown>>)[0].nodes as Array<Record<string, unknown>>
    scribbledNodes.at(-1)!.d = 'M20 6 9'
    expect(validateDocument(scribbled).ok).toBe(false)
  })

  test('accepts v16 picture backgrounds and marked spans, and rejects them on v15 inputs', () => {
    const marked = seedDocument() as unknown as Record<string, unknown>
    const slide = (marked.slides as Array<Record<string, unknown>>)[0]
    slide.background = {
      type: 'image',
      src: 'https://cdn.example/paper.jpg',
      fit: 'cover',
      framing: { focusX: 0.5, focusY: 0.4, zoom: 1.2 },
    }
    const nodes = slide.nodes as Array<Record<string, unknown>>
    const text = nodes.find((node) => node.type === 'text')!
    text.spans = [{ start: 0, end: 1, highlight: '#fef08a', underline: true }]
    expect(validateDocument(marked).ok).toBe(true)

    const summary = inspectDocument(marked)
    if (!summary.ok) throw new Error(summary.error)
    expect(summary.slides[0].background).toBe('image https://cdn.example/paper.jpg (cover)')

    const legacy = structuredClone(marked)
    legacy.documentVersion = 15
    expect(validateDocument(legacy).ok).toBe(false)
  })

  test('accepts v32 patterned pages, applies them, and rejects them on v31 inputs', () => {
    const patterned = seedDocument() as unknown as Record<string, unknown>
    const slide = (patterned.slides as Array<Record<string, unknown>>)[0]
    slide.background = {
      type: 'pattern',
      color: '#fdf6ec',
      patternColor: '#18181b',
      pattern: 'dots',
      size: 20,
    }
    const valid = validateDocument(patterned)
    expect(valid.ok).toBe(true)
    if (!valid.ok) return

    const summary = inspectDocument(patterned)
    if (!summary.ok) throw new Error(summary.error)
    expect(summary.slides[0].background).toBe('pattern dots (#fdf6ec base, #18181b motif, 20px)')

    // slide/update swaps the motif in one action; an out-of-range size is ignored.
    const applied = applyActions(valid.document, [
      {
        type: 'slide/update',
        slideId: 'slide-1',
        patch: { background: { type: 'pattern', color: '#fdf6ec', patternColor: '#18181b', pattern: 'grid', size: 20 } },
      },
      {
        type: 'slide/update',
        slideId: 'slide-1',
        patch: { background: { type: 'pattern', color: '#fdf6ec', patternColor: '#18181b', pattern: 'grid', size: 99 } },
      },
    ])
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.changes).toEqual([true, false])
    expect(applied.document.slides[0].background).toEqual({
      type: 'pattern', color: '#fdf6ec', patternColor: '#18181b', pattern: 'grid', size: 20,
    })

    const legacy = structuredClone(patterned)
    legacy.documentVersion = 31
    expect(validateDocument(legacy).ok).toBe(false)
  })

  test('accepts v20 paragraph layout and struck, sized spans, and rejects them on v19 inputs', () => {
    const laidOut = seedDocument() as unknown as Record<string, unknown>
    const slide = (laidOut.slides as Array<Record<string, unknown>>)[0]
    const nodes = slide.nodes as Array<Record<string, unknown>>
    const text = nodes.find((node) => node.type === 'text')!
    Object.assign(text, { align: 'justify', verticalAlign: 'middle', paragraphSpacing: 12, list: 'number' })
    text.spans = [{ start: 0, end: 1, strike: true, fontSize: 96 }]
    expect(validateDocument(laidOut).ok).toBe(true)

    const legacy = structuredClone(laidOut)
    legacy.documentVersion = 19
    expect(validateDocument(legacy).ok).toBe(false)
  })

  test('accepts v19 picture fills on paths and rejects them on v18 inputs', () => {
    const framed = seedDocument() as unknown as Record<string, unknown>
    const slide = (framed.slides as Array<Record<string, unknown>>)[0]
    const nodes = slide.nodes as Array<Record<string, unknown>>
    const path = {
      locked: false,
      hidden: false,
      type: 'path',
      x: 200,
      y: 300,
      width: 400,
      height: 400,
      rotation: 0,
      scale: 1,
      d: 'M12 21s-8-5.5-8-11a8 8 0 0 1 16 0c0 5.5-8 11-8 11z',
      viewBox: { x: 0, y: 0, width: 24, height: 24 },
      fill: {
        type: 'image',
        src: 'https://cdn.example/paper.jpg',
        fit: 'cover',
        framing: { focusX: 0.5, focusY: 0.5, zoom: 1 },
      },
      stroke: '#17293c',
      strokeWidth: 2,
    }
    nodes.push({ ...path, id: 'heart-1', name: '爱心相框' })
    expect(validateDocument(framed).ok).toBe(true)

    const legacy = structuredClone(framed)
    legacy.documentVersion = 18
    expect(validateDocument(legacy).ok).toBe(false)
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

  test('lays out paragraphs and sizes words through style patches', () => {
    const result = applyActions(seedDocument(), [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['title-1'], patch: { align: 'justify', verticalAlign: 'bottom', paragraphSpacing: 20, list: 'bullet', spans: [{ start: 0, end: 1, fontSize: 120 }] } }],
      },
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['title-1'], patch: { verticalAlign: 'top', list: null } }],
      },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changes).toEqual([true, true])
    expect(validateDocument(result.document).ok).toBe(true)
    const title = result.document.slides[0].nodes[0]
    if (title.type !== 'text') throw new Error('expected text node')
    expect(title).toMatchObject({ align: 'justify', paragraphSpacing: 20, spans: [{ start: 0, end: 1, fontSize: 120 }] })
    expect('verticalAlign' in title).toBe(false)
    expect('list' in title).toBe(false)
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

  test('applies the v24 chart patches through node actions', () => {
    const withChart = seedDocument()
    withChart.slides[0].nodes.push({
      id: 'chart-1',
      name: '图表',
      locked: false,
      hidden: false,
      type: 'chart',
      x: 120,
      y: 900,
      width: 480,
      height: 320,
      rotation: 0,
      scale: 1,
      chartKind: 'bar',
      labels: ['一', '二', '三'],
      series: [
        { name: '去年', values: [2, 4, 6], color: '#1d4ed8' },
        { name: '今年', values: [3, 5, 7], color: '#e11d48' },
      ],
    })
    const valid = validateDocument(withChart)
    expect(valid.ok).toBe(true)
    if (!valid.ok) return

    const styled = applyActions(valid.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['chart-1'], patch: { chartKind: 'ring', accent: '#dc2626', showValues: true } }],
      },
    ])
    expect(styled.ok).toBe(true)
    if (!styled.ok) return
    const styledChart = styled.document.slides[0].nodes.find((node) => node.id === 'chart-1')
    expect(styledChart && styledChart.type === 'chart' ? styledChart.chartKind : '').toBe('ring')
    expect(styledChart && styledChart.type === 'chart' ? styledChart.showValues : undefined).toBe(true)
    // The v24 accent habit recolours every series at once.
    expect(styledChart && styledChart.type === 'chart'
      ? styledChart.series.every((entry) => entry.color === '#dc2626')
      : false).toBe(true)

    // The v31 legend switch stamps and clears, and rides in the summary.
    const legendful = applyActions(styled.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['chart-1'], patch: { showLegend: false } }],
      },
    ])
    expect(legendful.ok).toBe(true)
    if (!legendful.ok) return
    const legendChart = legendful.document.slides[0].nodes.find((node) => node.id === 'chart-1')
    expect(legendChart && legendChart.type === 'chart' ? legendChart.showLegend : undefined).toBe(false)
    const summary = inspectDocument(legendful.document)
    if (!summary.ok) throw new Error(summary.error)
    expect(summary.slides[0].nodes.find((node) => node.id === 'chart-1'))
      .toMatchObject({ type: 'chart', showLegend: false })
    const automatic = applyActions(legendful.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['chart-1'], patch: { showLegend: null } }],
      },
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['chart-1'], patch: { showLegend: 'no' } }],
      },
    ])
    expect(automatic.ok).toBe(true)
    if (!automatic.ok) return
    expect(automatic.changes).toEqual([true, false])
    const clearedChart = automatic.document.slides[0].nodes.find((node) => node.id === 'chart-1')
    expect(clearedChart && clearedChart.type === 'chart' ? 'showLegend' in clearedChart : true).toBe(false)

    // The v33 axis-tick switch hides the y-axis and rides in the summary.
    const tickless = applyActions(styled.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['chart-1'], patch: { showTicks: false } }],
      },
    ])
    expect(tickless.ok).toBe(true)
    if (!tickless.ok) return
    const tickChart = tickless.document.slides[0].nodes.find((node) => node.id === 'chart-1')
    expect(tickChart && tickChart.type === 'chart' ? tickChart.showTicks : undefined).toBe(false)
    const tickSummary = inspectDocument(tickless.document)
    if (!tickSummary.ok) throw new Error(tickSummary.error)
    expect(tickSummary.slides[0].nodes.find((node) => node.id === 'chart-1'))
      .toMatchObject({ type: 'chart', showTicks: false })
    const tickCleared = applyActions(tickless.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['chart-1'], patch: { showTicks: null } }],
      },
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['chart-1'], patch: { showTicks: 'no' } }],
      },
    ])
    expect(tickCleared.ok).toBe(true)
    if (!tickCleared.ok) return
    expect(tickCleared.changes).toEqual([true, false])
    const tickClearedChart = tickCleared.document.slides[0].nodes.find((node) => node.id === 'chart-1')
    expect(tickClearedChart && tickClearedChart.type === 'chart' ? 'showTicks' in tickClearedChart : true).toBe(false)

    const edited = applyActions(styled.document, [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{
          path: ['chart-1'],
          patch: {
            labels: ['住', '行', '吃'],
            series: [
              { name: '去年', values: [3, 2, 5], color: '#dc2626' },
              { name: '今年', values: [4, 3, 6], color: '#f59e0b' },
            ],
          },
        }],
      },
    ])
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    const editedChart = edited.document.slides[0].nodes.find((node) => node.id === 'chart-1')
    expect(editedChart && editedChart.type === 'chart' ? editedChart.labels : []).toEqual(['住', '行', '吃'])
    expect(editedChart && editedChart.type === 'chart'
      ? editedChart.series.map((entry) => entry.values)
      : []).toEqual([[3, 2, 5], [4, 3, 6]])

    // A ragged series rejects the content patch and keeps the element as-is.
    const rejected = applyActions(edited.document, [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{ path: ['chart-1'], patch: { labels: ['住'], series: editedChart && editedChart.type === 'chart' ? editedChart.series : [] } }],
      },
    ])
    expect(rejected.ok).toBe(true)
    if (!rejected.ok) return
    const keptChart = rejected.document.slides[0].nodes.find((node) => node.id === 'chart-1')
    expect(keptChart && keptChart.type === 'chart' ? keptChart.labels : []).toEqual(['住', '行', '吃'])
  })

  test('applies the v34 table patches through node actions', () => {
    const withTable = seedDocument()
    withTable.slides[0].nodes.push({
      id: 'table-1',
      name: '表格',
      locked: false,
      hidden: false,
      type: 'table',
      x: 120,
      y: 900,
      width: 480,
      height: 320,
      rotation: 0,
      scale: 1,
      rows: 3,
      cols: 3,
      cells: ['项目', '本月', '上月', '阅读', '1.2万', '9800', '涨粉', '320', '210'],
    })
    const valid = validateDocument(withTable)
    expect(valid.ok).toBe(true)
    if (!valid.ok) return

    // The v34 style switches stamp, ride in the summary, and clear on null.
    const styled = applyActions(valid.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['table-1'], patch: { headerRow: false, striped: true } }],
      },
    ])
    expect(styled.ok).toBe(true)
    if (!styled.ok) return
    const styledTable = styled.document.slides[0].nodes.find((node) => node.id === 'table-1')
    expect(styledTable && styledTable.type === 'table' ? styledTable.headerRow : undefined).toBe(false)
    expect(styledTable && styledTable.type === 'table' ? styledTable.striped : undefined).toBe(true)
    const summary = inspectDocument(styled.document)
    if (!summary.ok) throw new Error(summary.error)
    expect(summary.slides[0].nodes.find((node) => node.id === 'table-1'))
      .toMatchObject({ type: 'table', headerRow: false, striped: true })
    const restored = applyActions(styled.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['table-1'], patch: { headerRow: null, striped: null } }],
      },
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['table-1'], patch: { headerRow: 'no' } }],
      },
    ])
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.changes).toEqual([true, false])
    const clearedTable = restored.document.slides[0].nodes.find((node) => node.id === 'table-1')
    expect(clearedTable && clearedTable.type === 'table'
      ? 'headerRow' in clearedTable || 'striped' in clearedTable
      : true).toBe(false)

    // A bare resize keeps every cell that still has a place; new cells stay empty.
    const resized = applyActions(valid.document, [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{ path: ['table-1'], patch: { rows: 2, cols: 4 } }],
      },
    ])
    expect(resized.ok).toBe(true)
    if (!resized.ok) return
    const resizedTable = resized.document.slides[0].nodes.find((node) => node.id === 'table-1')
    expect(resizedTable && resizedTable.type === 'table' ? [resizedTable.rows, resizedTable.cols] : [])
      .toEqual([2, 4])
    expect(resizedTable && resizedTable.type === 'table' ? resizedTable.cells : [])
      .toEqual(['项目', '本月', '上月', '', '阅读', '1.2万', '9800', ''])

    // A wholesale cells patch replaces the grid in one step.
    const replaced = applyActions(resized.document, [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{ path: ['table-1'], patch: { cells: ['指标', 'A', 'B', 'C', '一月', '10', '20', '30'] } }],
      },
    ])
    expect(replaced.ok).toBe(true)
    if (!replaced.ok) return
    const replacedTable = replaced.document.slides[0].nodes.find((node) => node.id === 'table-1')
    expect(replacedTable && replacedTable.type === 'table' ? replacedTable.cells : [])
      .toEqual(['指标', 'A', 'B', 'C', '一月', '10', '20', '30'])

    // A ragged cells array rejects the patch and keeps the table as-is.
    const rejected = applyActions(replaced.document, [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{ path: ['table-1'], patch: { cells: ['指标', 'A'] } }],
      },
    ])
    expect(rejected.ok).toBe(true)
    if (!rejected.ok) return
    const keptTable = rejected.document.slides[0].nodes.find((node) => node.id === 'table-1')
    expect(keptTable && keptTable.type === 'table' ? keptTable.cells.length : 0).toBe(8)

    // The v35 color overrides stamp, ride in the summary, and clear on null.
    const colored = applyActions(valid.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['table-1'], patch: { ink: '#0f766e', headerFill: '#ccfbf1', stripeFill: '#f0fdfa' } }],
      },
    ])
    expect(colored.ok).toBe(true)
    if (!colored.ok) return
    const coloredTable = colored.document.slides[0].nodes.find((node) => node.id === 'table-1')
    expect(coloredTable && coloredTable.type === 'table' ? coloredTable.ink : undefined).toBe('#0f766e')
    expect(coloredTable && coloredTable.type === 'table' ? coloredTable.headerFill : undefined).toBe('#ccfbf1')
    const colorSummary = inspectDocument(colored.document)
    if (!colorSummary.ok) throw new Error(colorSummary.error)
    expect(colorSummary.slides[0].nodes.find((node) => node.id === 'table-1'))
      .toMatchObject({ type: 'table', ink: '#0f766e', stripeFill: '#f0fdfa' })
    const uncolored = applyActions(colored.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['table-1'], patch: { ink: null, headerFill: null, stripeFill: null } }],
      },
    ])
    expect(uncolored.ok).toBe(true)
    if (!uncolored.ok) return
    const uncoloredTable = uncolored.document.slides[0].nodes.find((node) => node.id === 'table-1')
    expect(uncoloredTable && uncoloredTable.type === 'table'
      ? 'ink' in uncoloredTable || 'headerFill' in uncoloredTable || 'stripeFill' in uncoloredTable
      : true).toBe(false)

    // Column weights replace wholesale, must match the column count, and a
    // resize remaps the kept columns while a new one takes an even share.
    const weighted = applyActions(valid.document, [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{ path: ['table-1'], patch: { colWidths: [2, 1, 1] } }],
      },
    ])
    expect(weighted.ok).toBe(true)
    if (!weighted.ok) return
    const weightedTable = weighted.document.slides[0].nodes.find((node) => node.id === 'table-1')
    expect(weightedTable && weightedTable.type === 'table' ? weightedTable.colWidths : undefined).toEqual([2, 1, 1])
    const weightSummary = inspectDocument(weighted.document)
    if (!weightSummary.ok) throw new Error(weightSummary.error)
    expect(weightSummary.slides[0].nodes.find((node) => node.id === 'table-1'))
      .toMatchObject({ type: 'table', colWidths: [2, 1, 1] })
    const mismatchedWeights = applyActions(weighted.document, [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{ path: ['table-1'], patch: { colWidths: [1, 1] } }],
      },
    ])
    expect(mismatchedWeights.ok).toBe(true)
    if (!mismatchedWeights.ok) return
    expect(mismatchedWeights.changes).toEqual([false])
    const remapped = applyActions(weighted.document, [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{ path: ['table-1'], patch: { cols: 4 } }],
      },
    ])
    expect(remapped.ok).toBe(true)
    if (!remapped.ok) return
    const remappedTable = remapped.document.slides[0].nodes.find((node) => node.id === 'table-1')
    expect(remappedTable && remappedTable.type === 'table' ? remappedTable.colWidths : undefined).toEqual([2, 1, 1, 1])
  })

  test('applies the v36 timeline patches through node actions', () => {
    const withTimeline = seedDocument()
    withTimeline.slides[0].nodes.push({
      id: 'timeline-1',
      name: '时间线',
      locked: false,
      hidden: false,
      type: 'timeline',
      x: 120,
      y: 900,
      width: 480,
      height: 420,
      rotation: 0,
      scale: 1,
      items: [
        { label: '3 月', text: '开始学设计' },
        { label: '6 月', text: '接到第一单' },
      ],
    })
    const valid = validateDocument(withTimeline)
    expect(valid.ok).toBe(true)
    if (!valid.ok) return

    // The accent stamp rides in the summary and clears on null.
    const styled = applyActions(valid.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['timeline-1'], patch: { accent: '#0f766e' } }],
      },
    ])
    expect(styled.ok).toBe(true)
    if (!styled.ok) return
    const styledTimeline = styled.document.slides[0].nodes.find((node) => node.id === 'timeline-1')
    expect(styledTimeline && styledTimeline.type === 'timeline' ? styledTimeline.accent : undefined).toBe('#0f766e')
    const summary = inspectDocument(styled.document)
    if (!summary.ok) throw new Error(summary.error)
    expect(summary.slides[0].nodes.find((node) => node.id === 'timeline-1'))
      .toMatchObject({ type: 'timeline', accent: '#0f766e', items: [{ label: '3 月', text: '开始学设计' }, { label: '6 月', text: '接到第一单' }] })
    const restored = applyActions(styled.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['timeline-1'], patch: { accent: null } }],
      },
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['timeline-1'], patch: { accent: 'teal' } }],
      },
    ])
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.changes).toEqual([true, false])
    const clearedTimeline = restored.document.slides[0].nodes.find((node) => node.id === 'timeline-1')
    expect(clearedTimeline && clearedTimeline.type === 'timeline' ? 'accent' in clearedTimeline : true).toBe(false)

    // Items replace wholesale; a single-entry list rejects the patch.
    const replaced = applyActions(valid.document, [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{
          path: ['timeline-1'],
          patch: {
            items: [
              { label: '周一', text: '写方案' },
              { text: '没有标签的一步' },
              { label: '周五', text: '交方案' },
            ],
          },
        }],
      },
    ])
    expect(replaced.ok).toBe(true)
    if (!replaced.ok) return
    const replacedTimeline = replaced.document.slides[0].nodes.find((node) => node.id === 'timeline-1')
    expect(replacedTimeline && replacedTimeline.type === 'timeline' ? replacedTimeline.items : []).toEqual([
      { label: '周一', text: '写方案' },
      { text: '没有标签的一步' },
      { label: '周五', text: '交方案' },
    ])
    const rejected = applyActions(replaced.document, [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{ path: ['timeline-1'], patch: { items: [{ text: '只有一项' }] } }],
      },
    ])
    expect(rejected.ok).toBe(true)
    if (!rejected.ok) return
    expect(rejected.changes).toEqual([false])
  })

  test('applies the v30 quiet-zone patch and surfaces it in summaries', () => {
    const withQr = seedDocument()
    withQr.slides[0].nodes.push({
      id: 'qr-1',
      name: '二维码',
      locked: false,
      hidden: false,
      type: 'qrcode',
      x: 700,
      y: 900,
      width: 240,
      height: 240,
      rotation: 0,
      scale: 1,
      payload: 'https://dingcard.app',
      dark: '#18181b',
      light: '#ffffff',
    })
    const valid = validateDocument(withQr)
    expect(valid.ok).toBe(true)
    if (!valid.ok) return

    const styled = applyActions(valid.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['qr-1'], patch: { quietZone: 4 } }],
      },
    ])
    expect(styled.ok).toBe(true)
    if (!styled.ok) return
    const code = styled.document.slides[0].nodes.find((node) => node.id === 'qr-1')
    expect(code && code.type === 'qrcode' ? code.quietZone : undefined).toBe(4)

    // The widened margin rides along in the node summary for clients.
    const summary = inspectDocument(styled.document)
    if (!summary.ok) throw new Error(summary.error)
    expect(summary.slides[0].nodes.find((node) => node.id === 'qr-1'))
      .toMatchObject({ type: 'qrcode', quietZone: 4 })

    // null restores the default by removing the field; an out-of-range width
    // is silently ignored and flagged unchanged.
    const restored = applyActions(styled.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['qr-1'], patch: { quietZone: null } }],
      },
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['qr-1'], patch: { quietZone: 5 } }],
      },
    ])
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.changes).toEqual([true, false])
    const cleared = restored.document.slides[0].nodes.find((node) => node.id === 'qr-1')
    expect(cleared && cleared.type === 'qrcode' ? 'quietZone' in cleared : true).toBe(false)
  })

  test('rejects invalid input documents and non-array actions', () => {
    expect(applyDocumentInvalid().ok).toBe(false)
    const result = applyActions(seedDocument(), 'nope')
    expect(result.ok).toBe(false)
  })

  test('applies the v21 shape parameters through node/update-style', () => {
    const withStar = seedDocument()
    withStar.slides[0].nodes.push({
      id: 'star-1',
      name: '五角星',
      locked: false,
      hidden: false,
      type: 'shape',
      x: 72,
      y: 800,
      width: 240,
      height: 240,
      rotation: 0,
      scale: 1,
      shape: 'star',
      fill: { type: 'solid', color: '#fbbf24' },
      stroke: 'transparent',
      strokeWidth: 0,
    })
    const valid = validateDocument(withStar)
    expect(valid.ok).toBe(true)
    if (!valid.ok) return

    const result = applyActions(valid.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['star-1'], patch: { starInnerRatio: 0.6 } }],
      },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const star = result.document.slides[0].nodes.find((node) => node.id === 'star-1')
    expect(star && star.type === 'shape' ? star.starInnerRatio : undefined).toBe(0.6)

    // A ratio outside the valid band rejects the patch and leaves the star as-is.
    const rejected = applyActions(result.document, [
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['star-1'], patch: { starInnerRatio: 2 } }],
      },
    ])
    expect(rejected.ok).toBe(true)
    if (!rejected.ok) return
    const kept = rejected.document.slides[0].nodes.find((node) => node.id === 'star-1')
    expect(kept && kept.type === 'shape' ? kept.starInnerRatio : undefined).toBe(0.6)
  })

  function applyDocumentInvalid() {
    return applyActions({ documentVersion: 4 }, [])
  }
})
