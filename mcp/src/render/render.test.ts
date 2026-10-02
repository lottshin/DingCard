// Full render-pipeline test: template document → headless Chromium → PNG
// files with dimensions matching the slide. Slow (may build the frontend once
// and launches a real browser); run via `npm run test:render`.

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { reduceFreeformDocument } from '../../../src/freeform/document'
import type { FreeformPathElement, FreeformTextElement } from '../../../src/freeform/types'
import { listIcons } from '../core/icons'
import { createDocumentFromOutline } from '../core/outline'
import { instantiateTemplate } from '../core/templates'
import { checkDocument } from './check'
import { renderDocument, renderMarkdownDocument } from './renderer'

function pngIhdr(png: Buffer): { width: number; height: number } {
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

describe('renderDocument', () => {
  test(
    'renders a template document into per-slide PNGs',
    async () => {
      const instantiation = instantiateTemplate('editorial-freeform')
      if (instantiation.workspace !== 'freeform') throw new Error('expected a freeform document')
      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-render-'))

      const result = await renderDocument(instantiation.document, {
        outputDir,
        baseName: 'render-it',
      })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.error)
      expect(result.files).toHaveLength(3)

      for (const [index, file] of result.files.entries()) {
        expect(file.path).toBe(path.join(outputDir, `render-it-${String(index + 1).padStart(2, '0')}.png`))
        expect(file.width).toBe(1080)
        expect(file.height).toBe(1440)
        expect(file.bytes).toBeGreaterThan(1000)

        const png = readFileSync(file.path)
        expect(png.length).toBe(file.bytes)
        const ihdr = pngIhdr(png)
        expect(ihdr.width).toBe(1080)
        expect(ihdr.height).toBe(1440)
      }
    },
    420_000,
  )

  test(
    'renders rich text spans as visible pixel changes',
    async () => {
      const instantiation = instantiateTemplate('editorial-freeform')
      if (instantiation.workspace !== 'freeform') throw new Error('expected a freeform document')
      const base = instantiation.document
      const slide = base.slides[0]
      const textLeaf = base.slides[0].nodes.find(
        (node): node is FreeformTextElement => node.type === 'text' && node.text.length >= 4,
      )
      if (!textLeaf) throw new Error('expected a text node with at least four characters')
      const withSpans = reduceFreeformDocument(base, {
        type: 'node/update-style',
        slideId: slide.id,
        updates: [
          {
            path: [textLeaf.id],
            patch: {
              spans: [
                { start: 0, end: 2, bold: true },
                { start: 2, end: 4, color: '#d92d20' },
              ],
            },
          },
        ],
      })
      expect(withSpans).not.toBe(base)

      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-render-'))
      const plain = await renderDocument(base, {
        outputDir,
        baseName: 'plain',
        slideIds: [slide.id],
      })
      const styled = await renderDocument(withSpans, {
        outputDir,
        baseName: 'styled',
        slideIds: [slide.id],
      })
      expect(plain.ok).toBe(true)
      expect(styled.ok).toBe(true)
      if (!plain.ok || !styled.ok) throw new Error('expected both renders to succeed')
      expect(styled.files).toHaveLength(1)

      const ihdr = pngIhdr(readFileSync(styled.files[0].path))
      expect(ihdr.width).toBe(slide.width)
      expect(ihdr.height).toBe(slide.height)
      expect(readFileSync(styled.files[0].path).equals(readFileSync(plain.files[0].path))).toBe(false)
    },
    420_000,
  )

  test(
    'renders a card set generated from a markdown outline',
    async () => {
      const generated = createDocumentFromOutline(
        `# 大纲渲染

## 第一节
- 要点一
- 要点二

## 第二节
正文一行

## 第三节
- 收尾要点`,
        'editorial-freeform',
      )
      if (!generated.ok) throw new Error(generated.error)

      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-outline-'))
      const result = await renderDocument(generated.document, {
        outputDir,
        baseName: 'outline',
      })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.error)
      // cover + one slide per section (the outline asked for no closing page)
      expect(result.files).toHaveLength(4)
      for (const file of result.files) {
        expect(file.width).toBe(1080)
        expect(file.height).toBe(1440)
        expect(file.bytes).toBeGreaterThan(1000)
      }
      // Each page also comes back as a small JPEG for the client to show its model.
      expect(result.previews.map((preview) => preview.slideId)).toEqual(result.files.map((file) => file.slideId))
      for (const preview of result.previews) {
        expect(preview.dataUrl).toMatch(/^data:image\/jpeg;base64,/)
        const jpeg = Buffer.from(preview.dataUrl.split(',')[1], 'base64')
        expect(jpeg.length).toBeGreaterThan(2000)
        expect(jpeg.length).toBeLessThan(120_000)
      }
    },
    420_000,
  )

  test(
    'writes the pages as JPEGs at twice the size, one PDF holding them all, or one long image',
    async () => {
      const instantiation = instantiateTemplate('editorial-freeform')
      if (instantiation.workspace !== 'freeform') throw new Error('expected a freeform document')
      const document = instantiation.document
      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-export-'))
      const jpegSize = (bytes: Buffer) => {
        // Walk the JPEG segments to the start-of-frame marker, which holds the size.
        for (let at = 2; at < bytes.length;) {
          const marker = bytes[at + 1]
          const length = bytes.readUInt16BE(at + 2)
          if (marker >= 0xc0 && marker <= 0xc2) return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) }
          at += 2 + length
        }
        throw new Error('no frame in JPEG')
      }

      const jpegs = await renderDocument(document, { outputDir, baseName: 'big', format: 'jpeg', scale: 2, slideIds: [document.slides[1].id] })
      if (!jpegs.ok) throw new Error(jpegs.error)
      expect(jpegs.files.map((file) => path.basename(file.path))).toEqual(['big-01.jpg'])
      expect(jpegs.files[0]).toMatchObject({ width: 2160, height: 2880 })
      expect(jpegSize(readFileSync(jpegs.files[0].path))).toEqual({ width: 2160, height: 2880 })

      const pdf = await renderDocument(document, { outputDir, baseName: 'deck', format: 'pdf' })
      if (!pdf.ok) throw new Error(pdf.error)
      expect(pdf.files).toHaveLength(1)
      expect(pdf.files[0].path).toBe(path.join(outputDir, 'deck.pdf'))
      expect(pdf.files[0].pages?.map((page) => page.slideId)).toEqual(document.slides.map((slide) => slide.id))
      const source = readFileSync(pdf.files[0].path).toString('latin1')
      expect(source.startsWith('%PDF-1.4')).toBe(true)
      expect(source).toContain('/Count 3')
      expect(source.match(/\/MediaBox \[0 0 810 1080\]/g)).toHaveLength(3)
      expect(pdf.previews).toHaveLength(3)

      const long = await renderDocument(document, { outputDir, baseName: 'deck', long: true })
      if (!long.ok) throw new Error(long.error)
      expect(long.files).toHaveLength(1)
      expect(long.files[0]).toMatchObject({ path: path.join(outputDir, 'deck-long.png'), width: 1080, height: 4320, scale: 1 })
      expect(pngIhdr(readFileSync(long.files[0].path))).toEqual({ width: 1080, height: 4320 })

      expect(await renderDocument(document, { outputDir, format: 'pdf', long: true })).toMatchObject({ ok: false })
    },
    420_000,
  )

  test('refuses invalid documents and empty slide selections without a browser', async () => {
    const invalid = await renderDocument({ documentVersion: 4 }, { outputDir: tmpdir() })
    expect(invalid.ok).toBe(false)
    if (invalid.ok) return
    expect(invalid.error).toContain('校验')

    const instantiation = instantiateTemplate('editorial-freeform')
    if (instantiation.workspace !== 'freeform') throw new Error('expected a freeform document')
    const empty = await renderDocument(instantiation.document, {
      outputDir: tmpdir(),
      slideIds: ['no-such-slide'],
    })
    expect(empty.ok).toBe(false)
  }, 30_000)

  test(
    'renders v8 text outlines and multi-stop gradients as visible pixel changes',
    async () => {
      const instantiation = instantiateTemplate('editorial-freeform')
      if (instantiation.workspace !== 'freeform') throw new Error('expected a freeform document')
      const base = instantiation.document
      const slide = base.slides[0]
      const textLeaf = base.slides[0].nodes.find(
        (node): node is FreeformTextElement => node.type === 'text' && node.text.length >= 4,
      )
      if (!textLeaf) throw new Error('expected a text node with at least four characters')
      const styled = reduceFreeformDocument(base, {
        type: 'node/update-style',
        slideId: slide.id,
        updates: [
          {
            path: [textLeaf.id],
            patch: {
              stroke: '#f97316',
              strokeWidth: 6,
              textFill: {
                type: 'linear-gradient',
                stops: [
                  { offset: 0, color: '#111111' },
                  { offset: 0.5, color: '#f97316' },
                  { offset: 1, color: '#d92d20' },
                ],
                angle: 90,
              },
            },
          },
        ],
      })
      expect(styled).not.toBe(base)

      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-render-'))
      const plain = await renderDocument(base, {
        outputDir,
        baseName: 'plain',
        slideIds: [slide.id],
      })
      const v8 = await renderDocument(styled, {
        outputDir,
        baseName: 'v8',
        slideIds: [slide.id],
      })
      expect(plain.ok).toBe(true)
      expect(v8.ok).toBe(true)
      if (!plain.ok || !v8.ok) throw new Error('expected both renders to succeed')
      expect(v8.files).toHaveLength(1)
      expect(readFileSync(v8.files[0].path).equals(readFileSync(plain.files[0].path))).toBe(false)
    },
    420_000,
  )
})

describe('renderMarkdownDocument', () => {
  test(
    'renders a markdown template envelope into per-page PNGs',
    async () => {
      const instantiation = instantiateTemplate('editorial-archive-markdown')
      if (instantiation.workspace !== 'markdown') throw new Error('expected a markdown envelope')
      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-md-render-'))

      const result = await renderMarkdownDocument(instantiation.document, {
        outputDir,
        baseName: 'md-it',
      })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.error)
      // The template's manual `---` breaks produce (at least) four pages.
      expect(result.files.length).toBeGreaterThanOrEqual(4)

      for (const file of result.files) {
        // rednote platform: 360×480 logical at pixelRatio 3.
        expect(file.width).toBe(1080)
        expect(file.height).toBe(1440)
        expect(file.bytes).toBeGreaterThan(1000)

        const png = readFileSync(file.path)
        const ihdr = pngIhdr(png)
        expect(ihdr.width).toBe(1080)
        expect(ihdr.height).toBe(1440)
      }
    },
    420_000,
  )

  test('refuses invalid markdown envelopes without a browser', async () => {
    const result = await renderMarkdownDocument({ source: '只有正文' }, { outputDir: tmpdir() })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('Markdown 文档校验')
  }, 30_000)
})

describe('checkDocument', () => {
  test(
    'finds nothing to fix on a composed deck, and finds what an edit broke',
    async () => {
      const generated = createDocumentFromOutline(
        `# 一周早餐不重样
上班族的五分钟早餐清单

## 周一：燕麦杯
- 燕麦：前一晚泡好
- 酸奶：选无糖的
> 早餐吃好，上午不慌 —— 营养师

## 周二：鸡蛋三明治
全麦面包、煎蛋、生菜和番茄，五分钟搞定。

## 结尾：明天吃什么？
- 收藏这一套`,
        'editorial-freeform',
      )
      if (!generated.ok) throw new Error(generated.error)
      const clean = await checkDocument(generated.document)
      if (!clean.ok) throw new Error(clean.error)
      expect(clean.issues).toEqual([])
      expect(clean.summary).toEqual({ slideCount: 4, issueCount: 0, byKind: {} })

      // Overfill a paragraph and wash out a title: both get reported.
      const slide = generated.document.slides[2]
      const lead = slide.nodes.find((node) => node.name === '导语')!
      const title = slide.nodes.find((node) => node.name === '标题')!
      const broken = reduceFreeformDocument(reduceFreeformDocument(generated.document, {
        type: 'node/update-content',
        slideId: slide.id,
        updates: [{ path: [lead.id], patch: { text: '这是一段故意写得很长很长的正文，'.repeat(8) } }],
      }), {
        type: 'node/update-style',
        slideId: slide.id,
        updates: [{ path: [title.id], patch: { textFill: { type: 'solid', color: '#ece8dc' } } }],
      })
      const found = await checkDocument(broken)
      if (!found.ok) throw new Error(found.error)
      expect(found.issues.map((issue) => [issue.page, issue.kind, issue.node])).toEqual([
        [3, 'text-overflow', '导语'],
        [3, 'low-contrast', '标题'],
      ])
      const overflow = found.issues[0]
      expect(overflow.fitFontSize).toBeGreaterThan(10)
      expect(overflow.path).toEqual([lead.id])

      // fix sets the paragraph to the size it fits at; the colour is left to the client.
      const fixed = await checkDocument(broken, { fix: true })
      if (!fixed.ok) throw new Error(fixed.error)
      expect(fixed.fixed).toEqual([{ page: 3, slideId: slide.id, node: '导语', fontSize: overflow.fitFontSize }])
      expect(fixed.issues.map((issue) => issue.kind)).toEqual(['low-contrast'])
      const fixedLead = fixed.document!.slides[2].nodes.find((node) => node.id === lead.id) as FreeformTextElement
      expect(fixedLead.fontSize).toBe(overflow.fitFontSize)
    },
    420_000,
  )

  test(
    'draws icons and reports a drawing that leaves its box',
    async () => {
      const generated = createDocumentFromOutline('# 图标\n\n## 第一节\n- 要点一', 'editorial-freeform')
      if (!generated.ok) throw new Error(generated.error)
      const slide = generated.document.slides[1]
      const star = listIcons({ ids: ['star'] }).example as FreeformPathElement
      const icons: FreeformPathElement[] = [
        { ...star, x: 860, y: 1180, width: 120, height: 120, stroke: '#d92d20', strokeWidth: 2.5 },
        // Drawn in a 48-unit grid but given the 24-unit icon box: it spills out.
        { ...star, id: 'icon-spill', name: '溢出', x: 700, y: 1180, width: 120, height: 120, d: 'M4 4h40v40H4z' },
      ]
      const drawn = reduceFreeformDocument(generated.document, {
        type: 'node/insert-children',
        slideId: slide.id,
        parentPath: [],
        nodes: icons,
      })
      expect(drawn).not.toBe(generated.document)

      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-icons-'))
      const plain = await renderDocument(generated.document, { outputDir, baseName: 'plain', slideIds: [slide.id] })
      const withIcons = await renderDocument(drawn, { outputDir, baseName: 'icons', slideIds: [slide.id] })
      if (!plain.ok || !withIcons.ok) throw new Error('expected both renders to succeed')
      expect(readFileSync(withIcons.files[0].path).equals(readFileSync(plain.files[0].path))).toBe(false)

      const checked = await checkDocument(drawn)
      if (!checked.ok) throw new Error(checked.error)
      expect(checked.issues.map((issue) => [issue.kind, issue.node])).toEqual([['path-overflow', '溢出']])
      expect(checked.issues[0].message).toContain('width: 40, height: 40')
    },
    420_000,
  )

  test(
    'draws a picture background and marked words, and reports a background that fails to load',
    async () => {
      const generated = createDocumentFromOutline('# 背景图\n\n## 第一节\n- 要点一', 'editorial-freeform')
      if (!generated.ok) throw new Error(generated.error)
      const slide = generated.document.slides[0]
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#f6f3ea"/><circle cx="300" cy="80" r="60" fill="#d94836"/></svg>'
      const picture = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
      const title = slide.nodes.find((node): node is FreeformTextElement => node.type === 'text' && node.name === '主标题')!
      const marked = reduceFreeformDocument(reduceFreeformDocument(generated.document, {
        type: 'slide/update',
        slideId: slide.id,
        patch: { background: { type: 'image', src: picture, fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 } } },
      }), {
        type: 'node/update-style',
        slideId: slide.id,
        updates: [{ path: [title.id], patch: { spans: [{ start: 0, end: 2, highlight: '#fef08a', underline: true }] } }],
      })
      expect(marked.slides[0].background.type).toBe('image')

      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-background-'))
      const plain = await renderDocument(generated.document, { outputDir, baseName: 'plain', slideIds: [slide.id] })
      const pictured = await renderDocument(marked, { outputDir, baseName: 'pictured', slideIds: [slide.id] })
      if (!plain.ok || !pictured.ok) throw new Error('expected both renders to succeed')
      expect(readFileSync(pictured.files[0].path).equals(readFileSync(plain.files[0].path))).toBe(false)

      const checked = await checkDocument(marked)
      if (!checked.ok) throw new Error(checked.error)
      expect(checked.issues).toEqual([])

      // On a dark picture the template's dark title can't be read: it is measured against the picture.
      const night = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#111827"/></svg>').toString('base64')}`
      const dark = reduceFreeformDocument(marked, {
        type: 'slide/update',
        slideId: slide.id,
        patch: { background: { type: 'image', src: night, fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 } } },
      })
      const unreadable = await checkDocument(dark)
      if (!unreadable.ok) throw new Error(unreadable.error)
      const lowContrast = unreadable.issues.filter((issue) => issue.kind === 'low-contrast')
      expect(lowContrast.map((issue) => issue.node)).toContain('主标题')
      expect(lowContrast[0].message).toContain('背景图')

      const broken = reduceFreeformDocument(marked, {
        type: 'slide/update',
        slideId: slide.id,
        patch: { background: { type: 'image', src: 'data:image/png;base64,AAAA', fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 } } },
      })
      const failed = await checkDocument(broken)
      if (!failed.ok) throw new Error(failed.error)
      expect(failed.issues.map((issue) => [issue.page, issue.kind])).toEqual([[1, 'image-failed']])
    },
    420_000,
  )

  test(
    'reports the glyphs a box cuts, not a line box running past it',
    async () => {
      // Signal's cover titles sit in boxes drawn to their glyphs: the lines run past, nothing is cut.
      const generated = createDocumentFromOutline('# 一周早餐不重样\n\n## 周一：燕麦杯\n- 燕麦：前一晚泡好', 'signal-freeform')
      if (!generated.ok) throw new Error(generated.error)
      const clean = await checkDocument(generated.document)
      if (!clean.ok) throw new Error(clean.error)
      expect(clean.issues.filter((issue) => issue.kind === 'text-overflow')).toEqual([])

      // A shorter box cuts the glyphs, and the report says by about how much.
      const cover = generated.document.slides[0]
      const title = cover.nodes.find((node) => node.name === '标题上')!
      const cut = reduceFreeformDocument(generated.document, {
        type: 'node/update-geometry',
        slideId: cover.id,
        updates: [{ path: [title.id], patch: { height: 100 } }],
      })
      const found = await checkDocument(cut)
      if (!found.ok) throw new Error(found.error)
      const overflow = found.issues.find((issue) => issue.kind === 'text-overflow' && issue.node === '标题上')
      expect(overflow?.message).toMatch(/多出 [23]\dpx/)
      expect(overflow?.fitFontSize).toBeLessThan(116)
    },
    420_000,
  )

  test('flags an untouched template as sample copy', async () => {
    const instantiation = instantiateTemplate('signal-freeform')
    if (instantiation.workspace !== 'freeform') throw new Error('expected a freeform document')
    const result = await checkDocument(instantiation.document)
    if (!result.ok) throw new Error(result.error)
    expect(result.summary.byKind['sample-text']).toBeGreaterThan(5)
    // Its titles' boxes are drawn to their glyphs, so nothing reads as cut.
    expect(result.issues.every((issue) => issue.kind === 'sample-text')).toBe(true)
  }, 420_000)

  test('refuses invalid documents without a browser', async () => {
    const result = await checkDocument({ documentVersion: 4 })
    expect(result.ok).toBe(false)
  })
})
