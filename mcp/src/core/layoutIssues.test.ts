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
    documentVersion: 42,
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
      text('白字黄底', { textFill: { type: 'solid', color: '#ffffff' }, text: '重点在这里', fontSize: 56, spans: [{ start: 0, end: 2, highlight: '#fef08a' }] }),
      text('黑字黄底', { y: 300, text: '重点在这里', spans: [{ start: 0, end: 2, highlight: '#fef08a' }] }),
      text('改了字色', { y: 500, textFill: { type: 'solid', color: '#ffffff' }, text: '重点在这里', spans: [{ start: 0, end: 2, highlight: '#fef08a', color: '#111111' }] }),
    ])
    const issues = layoutIssues(document, measured([], []))
    expect(kinds(issues)).toEqual(['low-contrast:白字黄底'])
    expect(issues[0].message).toContain('高亮的「重点」')
  })
})

describe('data element checks', () => {
  const qr = (overrides: Record<string, unknown> = {}) => ({
    id: '二维码',
    name: '二维码',
    locked: false,
    hidden: false,
    type: 'qrcode',
    x: 100,
    y: 100,
    width: 280,
    height: 280,
    rotation: 0,
    scale: 1,
    payload: 'https://dingcard.app',
    dark: '#18181b',
    light: '#ffffff',
    ...overrides,
  }) as unknown as FreeformSceneNode

  test('a scannable, contrasting QR code passes', () => {
    expect(kinds(layoutIssues(deck([qr()]), measured([], [])))).toEqual([])
  })

  test('a tiny QR code and a low-contrast one are both called out', () => {
    const issues = layoutIssues(deck([qr({ id: '小码', name: '小码', width: 96, height: 96 })]), measured([], []))
    expect(kinds(issues)).toEqual(['tiny-qrcode:小码'])
    expect(issues[0].message).toContain('至少 120')

    const pale = layoutIssues(deck([qr({ id: '浅码', name: '浅码', dark: '#f4f4f5', light: '#ffffff' })]), measured([], []))
    expect(kinds(pale)).toEqual(['low-contrast-qrcode:浅码'])
    expect(pale[0].message).toContain('对比度')
  })

  test('a progress label wider than its element is called out, a fitting one is not', () => {
    const progress = (width: number, label: string) => ({
      id: '进度',
      name: '进度',
      locked: false,
      hidden: false,
      type: 'progress',
      x: 100,
      y: 100,
      width,
      height: 96,
      rotation: 0,
      scale: 1,
      progressKind: 'bar',
      value: 65,
      label,
    }) as unknown as FreeformSceneNode
    // A 12-character name at the bar's 16px label size is wider than 160px.
    const issues = layoutIssues(deck([progress(120, '十二个字的进度标签啦')]), measured([], []))
    expect(kinds(issues)).toEqual(['progress-label-overflow:进度'])
    expect(issues[0].message).toContain('缩短标签')
    expect(kinds(layoutIssues(deck([progress(480, '读书进度')]), measured([], [])))).toEqual([])
  })
})

describe('design quality checks', () => {
  test('near-miss edges report the slip and the snap the fix would apply', () => {
    // Generated names, not a template's own node names: a pair the template
    // itself drew is the design, and the check leaves it alone.
    const document = deck([
      text('甲文字', { fontSize: 56, x: 100, y: 100 }),
      text('乙文字', { x: 104, y: 300 }),
      text('丙文字', { x: 480, y: 300 }),
    ])
    const issues = layoutIssues(document, measured([], []))
    const alignment = issues.find((issue) => issue.kind === 'misalignment')
    expect(alignment).toBeDefined()
    expect(alignment?.message).toContain('差 4px')
    expect(alignment?.alignment).toEqual({
      axis: 'x',
      anchorId: '甲文字',
      moves: [{ path: ['乙文字'], nodeId: '乙文字', from: 104, to: 100 }],
    })
  })

  test('centred and right-aligned text line up by the edge their words sit on', () => {
    const misaligned = (document: FreeformDocument) => layoutIssues(document, measured([], []))
      .filter((issue) => issue.kind === 'misalignment')
    // Both centred on the page: the boxes' left edges are 7px apart, the words are not.
    expect(misaligned(deck([
      text('甲标题', { fontSize: 120, x: 240, y: 300, width: 600, height: 160, align: 'center' }),
      text('乙副题', { x: 233, y: 500, width: 614, height: 60, align: 'center' }),
      text('丙正文', { x: 140, y: 640, width: 800, height: 200, align: 'center' }),
    ]))).toEqual([])
    // Centres 6px apart are the slip; the fix moves the box until the centres meet.
    const centres = misaligned(deck([
      text('甲标题', { fontSize: 120, x: 240, y: 300, width: 600, height: 160, align: 'center' }),
      text('乙副题', { x: 239, y: 500, width: 614, height: 60, align: 'center' }),
    ]))
    expect(centres.map((issue) => issue.message)).toEqual(['「乙副题」和「甲标题」的中线差 6px：对齐到一起更整齐。'])
    expect(centres[0].alignment?.moves).toEqual([{ path: ['乙副题'], nodeId: '乙副题', from: 239, to: 233 }])
    // Right-aligned words line up on the right.
    const rights = misaligned(deck([
      text('甲标题', { fontSize: 96, x: 480, y: 300, width: 500, height: 140, align: 'right' }),
      text('乙副题', { x: 585, y: 500, width: 400, height: 60, align: 'right' }),
    ]))
    expect(rights.map((issue) => issue.message)).toEqual(['「乙副题」和「甲标题」的右边差 5px：对齐到一起更整齐。'])
    expect(rights[0].alignment?.moves).toEqual([{ path: ['乙副题'], nodeId: '乙副题', from: 585, to: 580 }])
  })

  test('words inset in their own card keep their padding', () => {
    const document = deck([
      card('甲卡片', '#f4f4f5', { x: 100, y: 100, width: 400, height: 200 }),
      text('乙卡字', { x: 108, y: 108, width: 300, height: 60 }),
    ])
    expect(kinds(layoutIssues(document, measured([], []))).filter((kind) => kind.startsWith('misalignment'))).toEqual([])
  })

  test('a pair of template-named nodes carries the design, not a slip', () => {
    const document = deck([
      text('主标题', { fontSize: 56, x: 100, y: 100 }),
      text('导语', { x: 108, y: 300 }),
    ])
    expect(kinds(layoutIssues(document, measured([], [])))).toEqual([])
  })

  test('aligned edges, deliberate bleeds and roomy margins all stay quiet', () => {
    const document = deck([
      text('标题', { fontSize: 56, x: 100, y: 100 }),
      text('正文', { x: 100, y: 300 }),
      card('贴边卡', '#f4f4f5', { x: 0, y: 600, width: 300, height: 200 }),
      card('大边距', '#f4f4f5', { x: 200, y: 900, width: 300, height: 200 }),
    ])
    expect(kinds(layoutIssues(document, measured([], [])))).toEqual([])
  })

  test('a box hovering near a page edge is called out', () => {
    const document = deck([
      text('标题', { fontSize: 56, x: 100, y: 100 }),
      card('贴太近', '#f4f4f5', { x: 8, y: 300, width: 300, height: 200 }),
    ])
    const issues = layoutIssues(document, measured([], []))
    expect(kinds(issues)).toContain('edge-margin:贴太近')
    expect(issues[0].message).toContain('离左页边')
  })

  test('tiny body copy, too many fonts and too many colours each get their word', () => {
    const document = deck([
      text('标题', { fontSize: 56, x: 100, y: 100 }),
      text('小字', { x: 100, y: 300, fontSize: 14 }),
      text('字体一', { x: 100, y: 500, fontFamily: 'Font A' }),
      text('字体二', { x: 100, y: 700, fontFamily: 'Font B', textFill: { type: 'solid', color: '#ff0000' } }),
      text('字体三', { x: 100, y: 900, fontFamily: 'Font C', textFill: { type: 'solid', color: '#00ff00' } }),
      text('字体四', { x: 100, y: 1100, fontFamily: 'Font D', textFill: { type: 'solid', color: '#0000ff' } }),
      text('颜色多', { x: 100, y: 1240, textFill: { type: 'solid', color: '#ffff00' } }),
      text('洋红', { x: 600, y: 1240, textFill: { type: 'solid', color: '#ff00ff' } }),
      text('青色', { x: 600, y: 100, textFill: { type: 'solid', color: '#00ffff' } }),
    ])
    const found = kinds(layoutIssues(document, measured([], [])))
    expect(found).toContain('tiny-text:小字')
    expect(found.find((kind) => kind.startsWith('too-many-fonts'))).toBeDefined()
    expect(found.find((kind) => kind.startsWith('too-many-colors'))).toBeDefined()
  })

  test('a page of equal-sized text is told its heading does not stand', () => {
    const flat = deck([
      text('标题', { x: 100, y: 100 }),
      text('正文', { x: 100, y: 300 }),
      text('结尾', { x: 100, y: 500 }),
    ])
    expect(kinds(layoutIssues(flat, measured([], [])))).toContain('weak-heading:')
    const layered = deck([
      text('标题', { fontSize: 72, x: 100, y: 100 }),
      text('正文', { x: 100, y: 400 }),
      text('结尾', { x: 100, y: 600 }),
    ])
    expect(kinds(layoutIssues(layered, measured([], []))).filter((kind) => kind.startsWith('weak-heading'))).toEqual([])
  })
})
