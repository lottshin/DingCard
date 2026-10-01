import { describe, expect, test } from 'vitest'
import type {
  FreeformDocument,
  FreeformPathElement,
  FreeformSceneNode,
  FreeformTextElement,
} from '../../../src/freeform/types'
import type { InspectedSlide } from '../render/renderer'
import { contrastRatio, layoutIssues } from './layoutIssues'

function text(id: string, overrides: Partial<FreeformTextElement> = {}): FreeformTextElement {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'text',
    x: 100,
    y: 100,
    width: 400,
    height: 100,
    rotation: 0,
    scale: 1,
    text: '自己的内容',
    fontSize: 40,
    fontFamily: 'PingFang SC',
    textFill: { type: 'solid', color: '#111111' },
    align: 'left',
    fontWeight: 'normal',
    ...overrides,
  }
}

function card(id: string, color: string, box: { x: number; y: number; width: number; height: number }): FreeformSceneNode {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'shape',
    ...box,
    rotation: 0,
    scale: 1,
    shape: 'rect',
    fill: { type: 'solid', color },
    stroke: 'transparent',
    strokeWidth: 0,
  }
}

function drawing(id: string, overrides: Partial<FreeformPathElement> = {}): FreeformPathElement {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'path',
    x: 100,
    y: 600,
    width: 200,
    height: 200,
    rotation: 0,
    scale: 1,
    d: 'M2 2h20v20H2z',
    viewBox: { x: 0, y: 0, width: 24, height: 24 },
    fill: { type: 'transparent' },
    stroke: '#111111',
    strokeWidth: 2,
    ...overrides,
  }
}

function deck(nodes: FreeformSceneNode[]): FreeformDocument {
  return {
    documentVersion: 15,
    activeSlideId: 'page',
    slides: [{ id: 'page', name: '第 1 页', width: 1080, height: 1440, background: { type: 'solid', color: '#ffffff' }, nodes }],
  }
}

function measured(
  nodes: Array<{ id: string; rect: { x: number; y: number; width: number; height: number } }>,
  texts: Array<{ id: string; area: { x: number; y: number; width: number; height: number } | null; overflowY?: number; fit?: number }>,
  imageError: string | null = null,
): InspectedSlide[] {
  return [{
    slideId: 'page',
    nodes: nodes.map((node) => ({ nodeId: node.id, rect: node.rect })),
    texts: texts.map((entry) => ({
      nodeId: entry.id,
      overflowY: entry.overflowY ?? 0,
      overflowX: 0,
      fitFontSize: entry.fit ?? null,
      area: entry.area,
    })),
    imageError,
  }]
}

const kinds = (issues: ReturnType<typeof layoutIssues>) => issues.map((issue) => `${issue.kind}:${issue.node ?? ''}`)

describe('layout issues', () => {
  test('a clean page has none', () => {
    const document = deck([text('标题')])
    const rect = { x: 100, y: 100, width: 400, height: 100 }
    expect(layoutIssues(document, measured([{ id: '标题', rect }], [{ id: '标题', area: { x: 108, y: 108, width: 200, height: 48 } }]))).toEqual([])
  })

  test('overflowing text says the size it fits at', () => {
    const document = deck([text('正文')])
    const issues = layoutIssues(document, measured(
      [{ id: '正文', rect: { x: 100, y: 100, width: 400, height: 100 } }],
      [{ id: '正文', area: { x: 108, y: 108, width: 384, height: 84 }, overflowY: 60, fit: 28 }],
    ))
    expect(issues).toMatchObject([{ kind: 'text-overflow', node: '正文', path: ['正文'], fitFontSize: 28, page: 1 }])
    expect(issues[0].message).toContain('28')
  })

  test('texts that overlap, are covered, or leave the page', () => {
    const document = deck([text('甲'), text('乙', { y: 120 }), text('丙', { x: 1000 }), card('盖板', '#000000', { x: 0, y: 0, width: 1080, height: 300 })])
    const issues = layoutIssues(document, measured(
      [
        { id: '甲', rect: { x: 100, y: 100, width: 400, height: 100 } },
        { id: '乙', rect: { x: 100, y: 120, width: 400, height: 100 } },
        { id: '丙', rect: { x: 1000, y: 100, width: 400, height: 100 } },
        { id: '盖板', rect: { x: 0, y: 0, width: 1080, height: 300 } },
      ],
      [
        { id: '甲', area: { x: 108, y: 108, width: 300, height: 48 } },
        { id: '乙', area: { x: 108, y: 128, width: 300, height: 48 } },
        { id: '丙', area: { x: 1008, y: 108, width: 300, height: 48 } },
      ],
    ))
    expect(kinds(issues)).toEqual(expect.arrayContaining([
      'text-overlap:甲',
      'covered-text:甲',
      'covered-text:乙',
      'off-page:丙',
    ]))
  })

  test('low contrast against the card behind, but not the colours a template pairs on purpose', () => {
    const document = deck([
      card('底板', '#f6f3ea', { x: 80, y: 80, width: 600, height: 300 }),
      text('浅字', { textFill: { type: 'solid', color: '#ece8dc' } }),
      // Editorial's red page number on its cream page is the template's choice.
      text('页码', { y: 200, textFill: { type: 'solid', color: '#d94836' } }),
    ])
    const issues = layoutIssues(document, measured(
      [
        { id: '底板', rect: { x: 80, y: 80, width: 600, height: 300 } },
        { id: '浅字', rect: { x: 100, y: 100, width: 400, height: 100 } },
        { id: '页码', rect: { x: 100, y: 200, width: 400, height: 100 } },
      ],
      [
        { id: '浅字', area: { x: 108, y: 108, width: 200, height: 48 } },
        { id: '页码', area: { x: 108, y: 208, width: 60, height: 48 } },
      ],
    ))
    expect(kinds(issues)).toEqual(['low-contrast:浅字'])
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  test('sample text, empty text and pictures that did not load', () => {
    const document = deck([text('导语', { text: '第一屏负责给出判断，后面的页面再交代过程。' }), text('空的', { text: '  ' })])
    const issues = layoutIssues(document, measured([], [], '图片加载失败'))
    expect(kinds(issues)).toEqual(['sample-text:导语', 'empty-text:空的', 'image-failed:'])
  })
})

describe('path issues', () => {
  const box = { x: 100, y: 600, width: 200, height: 200 }

  test('a drawing that leaves its box says which viewBox would hold it', () => {
    const document = deck([drawing('图形', { d: 'M0 0h48v48H0z' })])
    const inspected = measured([{ id: '图形', rect: box }], [])
    inspected[0].paths = [{ nodeId: '图形', bounds: { x: 0, y: 0, width: 400, height: 400 } }]
    const issues = layoutIssues(document, inspected)
    expect(kinds(issues)).toEqual(['path-overflow:图形'])
    expect(issues[0].message).toContain('{ x: 0, y: 0, width: 48, height: 48 }')

    // A drawing inside its box, a little padding included, is fine.
    inspected[0].paths = [{ nodeId: '图形', bounds: { x: 16.7, y: 16.7, width: 166.6, height: 166.6 } }]
    expect(layoutIssues(document, inspected)).toEqual([])
  })

  test('a path with neither fill nor stroke cannot be seen', () => {
    const document = deck([drawing('隐形', { strokeWidth: 0 }), drawing('实心', { strokeWidth: 0, fill: { type: 'solid', color: '#111111' } })])
    expect(kinds(layoutIssues(document, measured([], [])))).toEqual(['empty-path:隐形'])
  })

  test('a filled drawing covers text, an outline does not', () => {
    const covered = { x: 100, y: 600, width: 400, height: 100 }
    const document = deck([
      text('标题', { ...covered }),
      drawing('描边', { ...box }),
      drawing('色块', { ...box, x: 300, fill: { type: 'solid', color: '#000000' } }),
    ])
    const issues = layoutIssues(document, measured(
      [
        { id: '标题', rect: covered },
        { id: '描边', rect: box },
        { id: '色块', rect: { ...box, x: 300 } },
      ],
      [{ id: '标题', area: { x: 108, y: 608, width: 384, height: 48 } }],
    ))
    expect(kinds(issues)).toEqual(['covered-text:标题'])
    expect(issues[0].message).toContain('色块')
  })
})
