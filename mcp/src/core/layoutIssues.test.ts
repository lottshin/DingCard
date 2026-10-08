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
    documentVersion: 39,
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
      card('底板', '#d63b24', { x: 80, y: 80, width: 600, height: 300 }),
      text('浅字', { textFill: { type: 'solid', color: '#e8553d' } }),
      // Signal's paper-white numeral on its red block is the template's choice, even set small.
      text('编号', { y: 200, textFill: { type: 'solid', color: '#f1efe9' } }),
    ])
    const issues = layoutIssues(document, measured(
      [
        { id: '底板', rect: { x: 80, y: 80, width: 600, height: 300 } },
        { id: '浅字', rect: { x: 100, y: 100, width: 400, height: 100 } },
        { id: '编号', rect: { x: 100, y: 200, width: 400, height: 100 } },
      ],
      [
        { id: '浅字', area: { x: 108, y: 108, width: 200, height: 48 } },
        { id: '编号', area: { x: 108, y: 208, width: 60, height: 48 } },
      ],
    ))
    expect(kinds(issues)).toEqual(['low-contrast:浅字'])
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  test('a label effect is the words\' backdrop, and an outline that stands off them keeps them readable', () => {
    const rect = { x: 100, y: 100, width: 400, height: 100 }
    const area = { x: 108, y: 108, width: 200, height: 48 }
    const check = (node: FreeformTextElement) => kinds(layoutIssues(deck([node]), measured([{ id: node.id, rect }], [{ id: node.id, area }])))
    // White words on a white page read fine on a black label, not on a pale one.
    expect(check(text('标签', { textFill: { type: 'solid', color: '#ffffff' }, effect: { type: 'background', color: '#18181b', amount: 40, radius: 30 } }))).toEqual([])
    expect(check(text('浅底', { textFill: { type: 'solid', color: '#ffffff' }, effect: { type: 'background', color: '#fef9c3', amount: 40, radius: 30 } })))
      .toEqual(['low-contrast:浅底'])
    // White words with a dark outline stay readable on the white page; a pale outline doesn't help.
    expect(check(text('贴纸', { fontWeight: 'bold', textFill: { type: 'solid', color: '#ffffff' }, effect: { type: 'outline', color: '#f43f5e', amount: 50 } }))).toEqual([])
    expect(check(text('白边', { textFill: { type: 'solid', color: '#ffffff' }, effect: { type: 'outline', color: '#fafafa', amount: 50 } })))
      .toEqual(['low-contrast:白边'])
  })

  test('sample text, empty text and pictures that did not load', () => {
    const document = deck([text('导语', { text: '第一屏负责给出判断，\n后面的页面再交代过程。' }), text('空的', { text: '  ' })])
    const issues = layoutIssues(document, measured([], [], '图片加载失败'))
    expect(kinds(issues)).toEqual(['sample-text:导语', 'empty-text:空的', 'image-failed:'])
  })

  test('the same words in a node of another name are not a left-over sample', () => {
    // An HTML import names a text by its words: a button saying what a template's button says is the author's own.
    const document = deck([text('第一屏负责给出判断，…', { text: '第一屏负责给出判断，\n后面的页面再交代过程。' })])
    expect(kinds(layoutIssues(document, measured([], [])))).toEqual([])
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

  test('a ring drawn round words covers only what its rim crosses, a blob covers it all', () => {
    const words = { x: 300, y: 300, width: 400, height: 100 }
    const ringBox = { x: 250, y: 250, width: 500, height: 200 }
    // A 32 × 32 paint mask: the ring paints its outermost cells, the blob every cell.
    const rim = Array.from({ length: 32 * 32 }, (_, index) => {
      const row = Math.floor(index / 32)
      const column = index % 32
      return row < 2 || row > 29 || column < 2 || column > 29 ? '1' : '0'
    }).join('')
    const solid = '1'.repeat(32 * 32)
    const document = deck([
      text('标题', { ...words }),
      drawing('手绘圈', { ...ringBox, fill: { type: 'solid', color: '#e8453c' } }),
    ])
    const inspected = (mask: string) => {
      const slides = measured(
        [{ id: '标题', rect: words }, { id: '手绘圈', rect: ringBox }],
        [{ id: '标题', area: { x: 308, y: 308, width: 384, height: 84 } }],
      )
      slides[0].paths = [{ nodeId: '手绘圈', bounds: { x: 0, y: 0, width: 500, height: 200 }, mask }]
      return slides
    }
    expect(kinds(layoutIssues(document, inspected(rim)))).toEqual([])
    expect(kinds(layoutIssues(document, inspected(solid)))).toEqual(['covered-text:标题'])
    // Turned, the mask no longer lines up with the box on the page: the box decides.
    const turned = deck([text('标题', { ...words }), drawing('手绘圈', { ...ringBox, rotation: 10, fill: { type: 'solid', color: '#e8453c' } })])
    expect(kinds(layoutIssues(turned, inspected(rim)))).toEqual(['covered-text:标题'])
  })

  test('words inside a ring read against the page, not the ring\'s colour', () => {
    const words = { x: 300, y: 300, width: 400, height: 100 }
    const ringBox = { x: 250, y: 250, width: 500, height: 200 }
    const rim = Array.from({ length: 32 * 32 }, (_, index) => (Math.floor(index / 32) < 2 ? '1' : '0')).join('')
    // Red words inside a red ring on a white page: fine, the ring isn't behind them.
    const document = deck([
      drawing('手绘圈', { ...ringBox, fill: { type: 'solid', color: '#e8453c' } }),
      text('标题', { ...words, textFill: { type: 'solid', color: '#c0392b' }, fontSize: 60 }),
    ])
    const slides = measured(
      [{ id: '手绘圈', rect: ringBox }, { id: '标题', rect: words }],
      [{ id: '标题', area: { x: 308, y: 308, width: 384, height: 84 } }],
    )
    slides[0].paths = [{ nodeId: '手绘圈', bounds: { x: 0, y: 0, width: 500, height: 200 }, mask: rim }]
    expect(kinds(layoutIssues(document, slides))).toEqual([])
  })

  test('a highlighter stroke multiplied over words leaves them showing', () => {
    const covered = { x: 100, y: 600, width: 400, height: 100 }
    const document = deck([
      text('标题', { ...covered }),
      drawing('荧光笔', { ...covered, fill: { type: 'solid', color: '#ffe14d' }, blendMode: 'multiply' }),
    ])
    expect(layoutIssues(document, measured(
      [{ id: '标题', rect: covered }, { id: '荧光笔', rect: covered }],
      [{ id: '标题', area: { x: 108, y: 608, width: 384, height: 48 } }],
    ))).toEqual([])
  })
})

describe('text on a picture background', () => {
  test('judges contrast against the picture behind the words', () => {
    const document = deck([text('夜色', { textFill: { type: 'solid', color: '#1f2937' } }), text('月光', { y: 300, textFill: { type: 'solid', color: '#ffffff' } })])
    document.slides[0].background = { type: 'image', src: 'night.jpg', fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 } }
    const inspected = measured(
      [
        { id: '夜色', rect: { x: 100, y: 100, width: 400, height: 100 } },
        { id: '月光', rect: { x: 100, y: 300, width: 400, height: 100 } },
      ],
      [
        { id: '夜色', area: { x: 108, y: 108, width: 200, height: 48 } },
        { id: '月光', area: { x: 108, y: 308, width: 200, height: 48 } },
      ],
    )
    inspected[0].backdrops = [
      { nodeId: '夜色', color: '#111827' },
      { nodeId: '月光', color: '#111827' },
    ]
    const issues = layoutIssues(document, inspected)
    expect(kinds(issues)).toEqual(['low-contrast:夜色'])
    expect(issues[0].message).toContain('背景图')

    // Without a sample (a picture that couldn't be read), nothing is guessed.
    delete inspected[0].backdrops
    expect(layoutIssues(document, inspected)).toEqual([])
  })
})

describe('highlighted words', () => {
  test('need contrast against their highlight, whatever the page behind', () => {
    const document = deck([
      text('白字黄底', { textFill: { type: 'solid', color: '#ffffff' }, text: '重点在这里', spans: [{ start: 0, end: 2, highlight: '#fef08a' }] }),
      text('黑字黄底', { y: 300, text: '重点在这里', spans: [{ start: 0, end: 2, highlight: '#fef08a' }] }),
      text('改了字色', { y: 500, textFill: { type: 'solid', color: '#ffffff' }, text: '重点在这里', spans: [{ start: 0, end: 2, highlight: '#fef08a', color: '#111111' }] }),
    ])
    const issues = layoutIssues(document, measured([], []))
    expect(kinds(issues)).toEqual(['low-contrast:白字黄底'])
    expect(issues[0].message).toContain('高亮的「重点」')
  })
})
