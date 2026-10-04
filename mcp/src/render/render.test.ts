// Full render-pipeline test: template document → headless Chromium → PNG
// files with dimensions matching the slide. Slow (may build the frontend once
// and launches a real browser); run via `npm run test:render`.

import { mkdtempSync, readFileSync } from 'node:fs'
import { inflateSync as zlib_inflateSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { reduceFreeformDocument } from '../../../src/freeform/document'
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import { FILTER_PRESETS } from '../../../src/freeform/filterPresets'
import type { FreeformDocument, FreeformPathElement, FreeformTextElement } from '../../../src/freeform/types'
import { listIcons } from '../core/icons'
import { createDocumentFromOutline } from '../core/outline'
import { instantiateTemplate } from '../core/templates'
import { checkDocument } from './check'
import { importHtml, renderDocument, renderMarkdownDocument } from './renderer'
import { chromium } from 'playwright-core'
import type { FreeformSceneNode } from '../../../src/freeform/types'

function pngIhdr(png: Buffer): { width: number; height: number } {
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

/** Decode an 8-bit RGBA or RGB PNG into raw RGBA pixels (test helper for pixel truth). */
function decodePngRgba(png: Buffer): Buffer {
  const { width, height } = pngIhdr(png)
  // Colour type 6 is RGBA, 2 is RGB (what a browser screenshot of an opaque page gives).
  const channels = png[25] === 2 ? 3 : 4
  const idat: Buffer[] = []
  let offset = 8
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length))
    if (type === 'IEND') break
    offset += 12 + length
  }
  const raw = zlib_inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let input = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[input]
    input += 1
    raw.copy(out, y * stride, input, input + stride)
    input += stride
    for (let x = 0; x < stride; x += 1) {
      const index = y * stride + x
      const left = x >= channels ? out[index - channels] : 0
      const up = y > 0 ? out[index - stride] : 0
      const upLeft = y > 0 && x >= channels ? out[index - stride - channels] : 0
      if (filter === 1) out[index] = (out[index] + left) & 0xff
      else if (filter === 2) out[index] = (out[index] + up) & 0xff
      else if (filter === 3) out[index] = (out[index] + ((left + up) >> 1)) & 0xff
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        const nearest = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
        out[index] = (out[index] + nearest) & 0xff
      }
    }
  }
  if (channels === 4) return out
  const rgba = Buffer.alloc(width * height * 4, 255)
  for (let pixel = 0; pixel < width * height; pixel += 1) out.copy(rgba, pixel * 4, pixel * 3, pixel * 3 + 3)
  return rgba
}

type PixelRect = { x: number; y: number; width: number; height: number }

function isInk(pixels: Buffer, pageWidth: number, x: number, y: number): boolean {
  const at = (y * pageWidth + x) * 4
  return pixels[at] + pixels[at + 1] + pixels[at + 2] < 384
}

/** The box around the dark pixels inside a rect of a decoded page; null when there are none. */
function inkBox(pixels: Buffer, pageWidth: number, rect: PixelRect): { left: number; top: number; right: number; bottom: number } | null {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (!isInk(pixels, pageWidth, x, y)) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  return left === Infinity ? null : { left, top, right, bottom }
}

/** The stretches of rows (or columns) of a rect that hold dark pixels, in order. */
function inkRuns(pixels: Buffer, pageWidth: number, rect: PixelRect, along: 'rows' | 'columns'): Array<{ from: number; to: number }> {
  const runs: Array<{ from: number; to: number }> = []
  const [start, end] = along === 'rows' ? [rect.y, rect.y + rect.height] : [rect.x, rect.x + rect.width]
  for (let line = start; line < end; line += 1) {
    let inked = false
    if (along === 'rows') {
      for (let x = rect.x; x < rect.x + rect.width && !inked; x += 1) inked = isInk(pixels, pageWidth, x, line)
    } else {
      for (let y = rect.y; y < rect.y + rect.height && !inked; y += 1) inked = isInk(pixels, pageWidth, line, y)
    }
    if (!inked) continue
    const last = runs[runs.length - 1]
    if (last && last.to === line - 1) last.to = line
    else runs.push({ from: line, to: line })
  }
  return runs
}

/** The longest unbroken stretch of dark pixels on one row of a rect. */
function longestInkRun(pixels: Buffer, pageWidth: number, y: number, from: number, to: number): number {
  let longest = 0
  let current = 0
  for (let x = from; x <= to; x += 1) {
    current = isInk(pixels, pageWidth, x, y) ? current + 1 : 0
    longest = Math.max(longest, current)
  }
  return longest
}

/** How far each converted page is from the page as the browser shows the HTML: mean channel difference and the share of far-off pixels. */
async function browserDifference(html: string, files: readonly string[], distDir: string, viewport: { width: number; height: number }): Promise<Array<{ mean: number; far: number }>> {
  // The HTML as a browser shows it, with the same web fonts the render page links.
  const renderPage = readFileSync(path.join(distDir, 'render.html'), 'utf8')
  const fonts = /<link\b(?=[^>]*\brel="stylesheet")[^>]*fonts\.googleapis\.com[^>]*>/.exec(renderPage)?.[0] ?? ''
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport })
    await page.setContent(html.replace('<head>', `<head>${fonts}`), { waitUntil: 'networkidle' })
    await page.evaluate(() => (globalThis as unknown as { document: { fonts: { ready: Promise<unknown> } } }).document.fonts.ready)
    const sections = await page.locator('body > section').all()
    const out: Array<{ mean: number; far: number }> = []
    for (const [index, section] of sections.entries()) {
      const original = decodePngRgba(await section.screenshot())
      const converted = decodePngRgba(readFileSync(files[index]))
      expect(converted.length).toBe(original.length)
      let total = 0
      let far = 0
      for (let offset = 0; offset < original.length; offset += 4) {
        const difference = (Math.abs(original[offset] - converted[offset])
          + Math.abs(original[offset + 1] - converted[offset + 1])
          + Math.abs(original[offset + 2] - converted[offset + 2])) / 3
        total += difference
        if (difference > 40) far += 1
      }
      const pixels = original.length / 4
      out.push({ mean: total / pixels, far: far / pixels })
    }
    return out
  } finally {
    await browser.close()
  }
}

function v20Text(id: string, rect: PixelRect, extra: Partial<FreeformTextElement>): FreeformTextElement {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    ...rect,
    rotation: 0,
    scale: 1,
    type: 'text',
    text: '',
    fontSize: 60,
    fontFamily: `'PingFang SC', 'Noto Sans SC', sans-serif`,
    textFill: { type: 'solid', color: '#000000' },
    align: 'left',
    fontWeight: 'normal',
    lineHeight: 1.2,
    ...extra,
  }
}

/** A one-page v20 document of these nodes on white. */
function v20Page(nodes: FreeformTextElement[]): FreeformDocument {
  const document = normalizeFreeformDocument({
    documentVersion: 20,
    activeSlideId: 'v20',
    slides: [{ id: 'v20', name: 'v20', width: 1080, height: 1080, background: { type: 'solid', color: '#ffffff' }, nodes }],
  })
  if (!document) throw new Error('expected a valid v20 document')
  return document
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
    'renders a filter preset as a visible pixel change',
    async () => {
      const instantiation = instantiateTemplate('editorial-freeform')
      if (instantiation.workspace !== 'freeform') throw new Error('expected a freeform document')
      const base = instantiation.document
      const slide = base.slides[0]
      // The biggest shape on the cover: a filter on it changes real pixels.
      const shapeLeaf = base.slides[0].nodes
        .filter((node): node is Extract<typeof node, { type: 'shape' }> => node.type === 'shape')
        .sort((a, b) => b.width * b.height - a.width * a.height)[0]
      if (!shapeLeaf) throw new Error('expected a shape node on the cover')
      const mono = FILTER_PRESETS.find((preset) => preset.id === 'mono')!
      const filtered = reduceFreeformDocument(base, {
        type: 'node/update-style',
        slideId: slide.id,
        updates: [{ path: [shapeLeaf.id], patch: { filter: { ...mono.filter } } }],
      })
      expect(filtered).not.toBe(base)

      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-render-'))
      const plain = await renderDocument(base, { outputDir, baseName: 'plain', slideIds: [slide.id] })
      const styled = await renderDocument(filtered, { outputDir, baseName: 'mono', slideIds: [slide.id] })
      expect(plain.ok).toBe(true)
      expect(styled.ok).toBe(true)
      if (!plain.ok || !styled.ok) throw new Error('expected both renders to succeed')
      expect(styled.files).toHaveLength(1)
      expect(readFileSync(styled.files[0].path).equals(readFileSync(plain.files[0].path))).toBe(false)
    },
    420_000,
  )

  test(
    'renders a picture-filled path clipped to its outline',
    async () => {
      // An 8×8 solid red PNG fills a big heart; only the heart itself may
      // show red — the rest of its box stays the page's white.
      const redPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC'
      const document = {
        documentVersion: 20,
        activeSlideId: 's',
        slides: [{
          id: 's',
          name: '第 1 页',
          width: 400,
          height: 400,
          background: { type: 'solid', color: '#ffffff' },
          nodes: [{
            id: 'heart',
            name: '爱心相框',
            locked: false,
            hidden: false,
            type: 'path',
            x: 0,
            y: 0,
            width: 400,
            height: 400,
            rotation: 0,
            scale: 1,
            d: 'M200 360s-160-110-160-220a160 160 0 0 1 320 0c0 110-160 220-160 220z',
            viewBox: { x: 0, y: 0, width: 400, height: 400 },
            fill: { type: 'image', src: redPng, fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 } },
            stroke: '#000000',
            strokeWidth: 0,
          }],
        }],
      } as const
      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-render-'))
      const result = await renderDocument(document, { outputDir, baseName: 'heart' })
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.error)

      // Pixel truth: the heart's middle is red, the box corners outside the
      // outline stay white.
      const png = readFileSync(result.files[0].path)
      const redInside = png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
      expect(redInside).toBe(true)
      const decoded = decodePngRgba(png)
      const at = (x: number, y: number) => {
        const offset = (y * 400 + x) * 4
        return [decoded[offset], decoded[offset + 1], decoded[offset + 2]] as const
      }
      const [heartR, heartG, heartB] = at(200, 200)
      expect(heartR).toBeGreaterThan(200)
      expect(heartG).toBeLessThan(80)
      expect(heartB).toBeLessThan(80)
      const [cornerR, cornerG, cornerB] = at(10, 10)
      expect(cornerR).toBeGreaterThan(230)
      expect(cornerG).toBeGreaterThan(230)
      expect(cornerB).toBeGreaterThan(230)
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

  test(
    'cuts the Moments grid into nine squares in posting order, and refuses pages that are not square',
    async () => {
      const grid = instantiateTemplate('moments-grid-freeform')
      if (grid.workspace !== 'freeform') throw new Error('expected a freeform document')
      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-grid-'))
      const result = await renderDocument(grid.document, { outputDir, baseName: 'moments', grid: true })
      if (!result.ok) throw new Error(result.error)
      expect(result.files.map((file) => path.basename(file.path))).toEqual(
        Array.from({ length: 9 }, (_, index) => `moments-01-${index + 1}.png`),
      )
      expect(result.files.map((file) => file.tile)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
      for (const file of result.files) {
        expect(file).toMatchObject({ width: 1080, height: 1080, slideId: grid.document.slides[0].id })
        expect(pngIhdr(readFileSync(file.path))).toEqual({ width: 1080, height: 1080 })
      }

      const deck = instantiateTemplate('editorial-freeform')
      if (deck.workspace !== 'freeform') throw new Error('expected a freeform document')
      expect(await renderDocument(deck.document, { outputDir, grid: true })).toMatchObject({ ok: false, error: expect.stringContaining('正方形') })
      expect(await renderDocument(grid.document, { outputDir, grid: true, long: true })).toMatchObject({ ok: false })
    },
    420_000,
  )

  test(
    'lays out v20 lists, line positions, strikethroughs and sized words in exports',
    async () => {
      const list = { x: 80, y: 60, width: 600, height: 300 }
      const bottom = { x: 80, y: 420, width: 300, height: 300 }
      const middle = { x: 420, y: 420, width: 300, height: 300 }
      const struck = { x: 80, y: 780, width: 240, height: 200 }
      const plain = { x: 360, y: 780, width: 240, height: 200 }
      const sized = { x: 640, y: 780, width: 400, height: 240 }
      const document = v20Page([
        v20Text('list', list, { text: '一\n二\n三', list: 'bullet', lineHeight: 1.5 }),
        v20Text('bottom', bottom, { text: '底', verticalAlign: 'bottom' }),
        v20Text('middle', middle, { text: '中', verticalAlign: 'middle' }),
        v20Text('struck', struck, { text: '口', fontSize: 120, spans: [{ start: 0, end: 1, strike: true }] }),
        v20Text('plain', plain, { text: '口', fontSize: 120 }),
        v20Text('sized', sized, { text: '口口', fontSize: 40, spans: [{ start: 1, end: 2, fontSize: 120 }] }),
      ])
      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-v20-'))
      const result = await renderDocument(document, { outputDir, baseName: 'v20' })
      if (!result.ok) throw new Error(result.error)
      const pixels = decodePngRgba(readFileSync(result.files[0].path))
      const width = 1080

      // A bullet before each paragraph, in the gutter the words are indented past.
      const gutter = { x: list.x, y: list.y, width: 80, height: list.height }
      expect(inkRuns(pixels, width, gutter, 'rows')).toHaveLength(3)
      expect(inkBox(pixels, width, { ...list, x: list.x + 90, width: list.width - 90 })).not.toBeNull()

      // Lines low in their box, or in its middle — not at its top.
      const low = inkBox(pixels, width, bottom)
      expect(low?.top).toBeGreaterThan(bottom.y + bottom.height - 100)
      const centred = inkBox(pixels, width, middle)
      if (!centred) throw new Error('expected the middle word')
      expect(Math.abs((centred.top + centred.bottom) / 2 - (middle.y + middle.height / 2))).toBeLessThan(14)

      // A line through the middle of the struck word: one row inked right across it, which the plain word lacks.
      const crossed = (rect: PixelRect) => {
        const ink = inkBox(pixels, width, rect)
        if (!ink) throw new Error('expected a word')
        const height = ink.bottom - ink.top
        let across = false
        for (let y = Math.round(ink.top + height * 0.2); y <= ink.bottom - height * 0.2; y += 1) {
          across ||= longestInkRun(pixels, width, y, ink.left, ink.right) >= (ink.right - ink.left) * 0.9
        }
        return across
      }
      expect(crossed(struck)).toBe(true)
      expect(crossed(plain)).toBe(false)

      // The sized word stands three times taller than its neighbour.
      const glyphs = inkRuns(pixels, width, sized, 'columns')
      expect(glyphs).toHaveLength(2)
      const [small, large] = glyphs.map((glyph) => inkBox(pixels, width, { x: glyph.from, y: sized.y, width: glyph.to - glyph.from + 1, height: sized.height }))
      if (!small || !large) throw new Error('expected both words')
      expect((large.bottom - large.top) / (small.bottom - small.top)).toBeGreaterThan(2.4)
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
      expect(overflow?.message).toMatch(/多出 \d+px/)
      expect(overflow?.fitFontSize).toBeLessThan(title.type === 'text' ? title.fontSize : 0)
    },
    420_000,
  )

  test(
    'measures a list text by its words and markers, not the paragraph blocks across its box',
    async () => {
      const checked = await checkDocument(v20Page([
        v20Text('清单', { x: 100, y: 100, width: 600, height: 200 }, { text: '一\n二', fontSize: 40, lineHeight: 1.4, list: 'bullet' }),
        // In the indent the first bullet sits in.
        v20Text('旁注', { x: 90, y: 100, width: 60, height: 60 }, { text: '甲', fontSize: 40, lineHeight: 1.4 }),
        // Beside the short items, inside the box but clear of its words.
        v20Text('右侧', { x: 400, y: 100, width: 200, height: 60 }, { text: '丙', fontSize: 40, lineHeight: 1.4 }),
      ]))
      if (!checked.ok) throw new Error(checked.error)
      expect(checked.issues.filter((issue) => issue.kind === 'text-overlap').map((issue) => [issue.node, issue.message]))
        .toEqual([['清单', expect.stringContaining('「旁注」')]])
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

// Pictures for the HTML import tests, as data URLs so nothing loads from the network.
const PHOTO = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#2b5876"/><circle cx="860" cy="300" r="120" fill="#ffd166"/><path d="M0 620 L260 420 L470 600 L700 380 L1200 660 L1200 800 L0 800 Z" fill="#264653"/></svg>').toString('base64')}`
const FACE = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#e9c46a"/><circle cx="200" cy="160" r="80" fill="#6d4c41"/></svg>').toString('base64')}`

const POSTER_HTML = `<!doctype html><html><head><style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "PingFang SC", "Noto Sans SC", sans-serif; }
  section { position: relative; overflow: hidden; }
  .one { width: 1080px; height: 1440px; background: linear-gradient(160deg, #fff5e6 0%, #ffe0c2 100%); color: #1f2937; }
  .one h1 { position: absolute; left: 88px; top: 120px; margin: 0; font: 700 120px/1.08 "Noto Serif SC", serif; }
  .one h1 em { font-style: normal; color: #e8590c; }
  .one .lead { position: absolute; left: 88px; top: 420px; width: 800px; margin: 0; font-size: 38px; line-height: 1.6; color: #4b5563; }
  .one .card { position: absolute; left: 88px; right: 88px; top: 640px; height: 360px; padding: 48px; border-radius: 36px; background: #fff; box-shadow: 0 24px 60px rgba(31, 41, 55, 0.12); }
  .one .card img { width: 100%; height: 100%; object-fit: cover; object-position: 80% 30%; }
  .one .face { position: absolute; left: 88px; bottom: 120px; width: 120px; height: 120px; border-radius: 50%; object-fit: cover; }
  .one .badge { position: absolute; right: 88px; bottom: 100px; width: 180px; height: 180px; border-radius: 50%; border: 6px solid #1f2937; display: flex; align-items: center; justify-content: center; transform: rotate(-12deg); font-weight: 700; font-size: 36px; }
  .one .glass { position: absolute; left: 260px; bottom: 140px; padding: 16px 28px; border-radius: 999px; background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(8px); font-size: 30px; }
  .two { width: 1080px; height: 1080px; background: #0f172a; color: #fff; padding: 96px; }
  .two svg { width: 240px; height: 240px; }
  .two p { margin: 40px 0 0; font-size: 56px; line-height: 1.3; }
</style></head><body>
<section class="one" data-name="封面">
  <h1>春日<em>咖啡</em><br>市集</h1>
  <p class="lead">二十家独立咖啡馆、手作甜点和现场烘焙，<b>免费入场</b>，带上朋友来逛。</p>
  <div class="card" data-name="照片卡"><img src="${PHOTO}" alt="海边"></div>
  <img class="face" src="${FACE}" alt="头像">
  <div class="badge">免费</div>
  <div class="glass">城市漫游计划</div>
</section>
<section class="two">
  <svg viewBox="0 0 24 24" fill="none" stroke="#ffd166" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
  <p>四月最后一个周末</p>
</section>
</body></html>`

const V20_HTML = `<!doctype html><html><head><style>
  body { margin: 0; }
  section { position: relative; width: 1080px; height: 1440px; background: #fff; font-family: "Noto Sans SC", sans-serif; color: #222; }
  ul { position: absolute; left: 100px; top: 100px; width: 700px; margin: 0; padding-left: 40px; font-size: 40px; line-height: 1.5; }
  li + li { margin-top: 16px; }
  ol { position: absolute; left: 100px; top: 420px; width: 700px; margin: 0; padding-left: 60px; font-size: 36px; line-height: 1.4; }
  .body { position: absolute; left: 100px; top: 700px; width: 600px; margin: 0; font-size: 32px; line-height: 1.6; text-align: justify; }
  .price { position: absolute; left: 100px; top: 1100px; margin: 0; font-size: 40px; line-height: 1.2; }
  .price b { font-size: 96px; }
  .price s { color: #999999; }
</style></head><body>
<section>
  <ul><li>现磨咖啡</li><li>手作甜点</li><li>黑胶唱片</li></ul>
  <ol><li>先闷蒸三十秒</li><li>分三次注水</li></ol>
  <p class="body">二十家独立咖啡馆和烘焙铺带来当季豆子与手作甜点，现场还有黑胶唱片、植物和旧书摊，周末两天从早上十点开到晚上八点。</p>
  <p class="price"><s>¥129</s> 现价 ¥<b>59</b></p>
</section>
</body></html>`

function leaves(nodes: FreeformSceneNode[]): FreeformSceneNode[] {
  return nodes.flatMap((node) => (node.type === 'group' ? [node, ...leaves(node.children)] : [node]))
}

describe('importHtml', () => {
  test(
    'reads pages, boxes, words, pictures, drawings and turns back as freeform nodes',
    async () => {
      const result = await importHtml(POSTER_HTML)
      if (!result.ok) throw new Error(result.error)
      const [one, two] = result.document.slides
      expect(result.document.slides).toHaveLength(2)
      expect([one.width, one.height, one.name]).toEqual([1080, 1440, '封面'])
      expect([two.width, two.height]).toEqual([1080, 1080])
      expect(one.background).toEqual({ type: 'linear-gradient', from: '#fff5e6', to: '#ffe0c2', angle: 160 })
      const nodes = leaves(one.nodes)

      const title = nodes.find((node) => node.type === 'text' && node.text === '春日咖啡\n市集')
      expect(title).toMatchObject({ fontSize: 120, fontWeight: 'bold', lineHeight: 1.08, fontFamily: `'Noto Serif SC', serif` })
      expect(title && title.type === 'text' && title.spans).toEqual([{ start: 2, end: 4, color: '#e8590c' }])
      const lead = nodes.find((node) => node.type === 'text' && node.text.startsWith('二十家'))
      expect(lead && lead.type === 'text' && lead.spans?.[0]).toMatchObject({ bold: true })

      // The card: a rounded white box with its shadow; the photo inside it, framed by object-position.
      const card = nodes.find((node) => node.type === 'shape' && node.name === '照片卡')
      expect(card).toMatchObject({ shape: 'rect', cornerRadius: 36, fill: { type: 'solid', color: '#ffffff' } })
      expect(card && 'shadow' in card && card.shadow?.blur).toBe(60)
      const photo = nodes.find((node) => node.type === 'image')
      expect(photo).toMatchObject({ x: 136, y: 688, width: 808, height: 264, fit: 'cover' })
      expect(photo && photo.type === 'image' && photo.framing.focusY).toBeLessThan(0.5)
      // A round picture is an ellipse filled with it.
      const face = nodes.find((node) => node.type === 'shape' && node.name === '头像')
      expect(face).toMatchObject({ shape: 'ellipse', fill: { type: 'image', src: FACE } })

      // Turned by -12°: the badge's ring and word turn together about its centre.
      const badge = one.nodes.find((node) => node.type === 'group')
      expect(badge).toMatchObject({ type: 'group', rotation: 348 })

      // What a freeform document can't hold is said.
      expect(result.notes.some((note) => note.page === 1 && note.message.includes('backdrop-filter'))).toBe(true)

      // An SVG icon: one path per drawing, grouped, stroke kept even.
      const icon = two.nodes.find((node) => node.type === 'group')
      if (!icon || icon.type !== 'group') throw new Error('expected the icon as a group')
      expect(icon.children.map((child) => child.type)).toEqual(['path', 'path'])
      expect(icon.children[0]).toMatchObject({ stroke: '#ffd166', strokeWidth: 20, cap: 'round', fill: { type: 'transparent' } })
    },
    420_000,
  )

  test(
    'renders the converted document like the browser renders the HTML',
    async () => {
      const result = await importHtml(POSTER_HTML)
      if (!result.ok) throw new Error(result.error)
      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-html-'))
      const rendered = await renderDocument(result.document, { outputDir, baseName: 'converted' })
      if (!rendered.ok) throw new Error(rendered.error)

      const differences = await browserDifference(POSTER_HTML, rendered.files.map((file) => file.path), rendered.distDir, { width: 1080, height: 1440 })
      expect(differences).toHaveLength(2)
      for (const difference of differences) {
        // Antialiasing and the approximated shadow differ by a hair; a misplaced word or box would not.
        expect(difference.mean).toBeLessThan(4)
        expect(difference.far).toBeLessThan(0.03)
      }
    },
    420_000,
  )

  test(
    'reads lists, justified paragraphs, struck words and sized words as v20 text',
    async () => {
      const result = await importHtml(V20_HTML)
      if (!result.ok) throw new Error(result.error)
      const texts = result.document.slides[0].nodes.filter((node): node is FreeformTextElement => node.type === 'text')
      expect(texts.map((node) => node.text)).toEqual([
        '现磨咖啡\n手作甜点\n黑胶唱片',
        '先闷蒸三十秒\n分三次注水',
        expect.stringMatching(/^二十家/),
        '¥129 现价 ¥59',
      ])
      const [bullets, steps, body, price] = texts
      // One list text each, the markers drawn by the editor and the items' gap kept as paragraph spacing.
      expect(bullets).toMatchObject({ list: 'bullet', paragraphSpacing: 16, fontSize: 40 })
      expect(steps).toMatchObject({ list: 'number', paragraphSpacing: 16, fontSize: 36 })
      expect(body).toMatchObject({ align: 'justify' })
      // The price in the text's colour; the old one struck in grey, the new one in its own size.
      expect(price).toMatchObject({ fontSize: 40, textFill: { type: 'solid', color: '#222222' } })
      expect(price.spans).toEqual([
        { start: 0, end: 4, color: '#999999', strike: true },
        { start: 9, end: 11, bold: true, fontSize: 96 },
      ])
      expect(result.notes).toEqual([])

      const outputDir = mkdtempSync(path.join(tmpdir(), 'dingcard-html-v20-'))
      const rendered = await renderDocument(result.document, { outputDir, baseName: 'converted' })
      if (!rendered.ok) throw new Error(rendered.error)
      const [difference] = await browserDifference(V20_HTML, rendered.files.map((file) => file.path), rendered.distDir, { width: 1080, height: 1440 })
      expect(difference.mean).toBeLessThan(4)
      expect(difference.far).toBeLessThan(0.03)
    },
    420_000,
  )

  test('refuses an empty page without a browser', async () => {
    expect(await importHtml('   ')).toMatchObject({ ok: false })
  })
})

describe('share_document against a real server', () => {
  test(
    'renders, uploads, and puts the deck behind a public link',
    async () => {
      const { spawn } = await import('node:child_process')
      const { rmSync } = await import('node:fs')
      const { fileURLToPath } = await import('node:url')
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
      const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
      const { createDingcardServer } = await import('../index')

      const dataDir = mkdtempSync(path.join(tmpdir(), 'dingcard-share-e2e-'))
      const port = 3997
      const base = `http://127.0.0.1:${port}`
      const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../server')
      const server = spawn(process.execPath, ['src/index.js'], {
        cwd: serverDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          JWT_SECRET: 'mcp-render-test-secret-not-for-prod',
          DATA_DIR: dataDir,
          PORT: String(port),
          HOST: '127.0.0.1',
          AUTH_RATE_LIMIT_MAX: '10000',
          RATE_LIMIT_MAX: '10000',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      })
      const serverStderr: string[] = []
      server.stderr.on('data', (chunk: Buffer) => serverStderr.push(String(chunk)))

      // Wait for the server to accept requests.
      let healthy = false
      for (let attempt = 0; attempt < 100 && !healthy; attempt += 1) {
        healthy = await fetch(`${base}/api/health`).then((response) => response.ok).catch(() => false)
        if (!healthy) await new Promise((resolve) => setTimeout(resolve, 100))
      }
      expect(healthy, serverStderr.join('')).toBe(true)

      const saved = {
        url: process.env.DINGCARD_SERVER_URL,
        username: process.env.DINGCARD_SERVER_USERNAME,
        password: process.env.DINGCARD_SERVER_PASSWORD,
      }
      process.env.DINGCARD_SERVER_URL = base
      process.env.DINGCARD_SERVER_USERNAME = 'mcp-share'
      process.env.DINGCARD_SERVER_PASSWORD = 'mcp-share-1234'

      const mcp = createDingcardServer()
      const client = new Client({ name: 'dingcard-mcp-render-test', version: '0.0.0' })
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)])

      const callTool = async (name: string, arguments_: Record<string, unknown>) => {
        const response = await client.callTool({ name, arguments: arguments_ })
        const content = (response as { content: Array<{ type: string; text?: string }> }).content
        return JSON.parse(content[0].text ?? '') as Record<string, unknown>
      }

      try {
        // The share client logs in itself; the account just has to exist.
        const register = await fetch(`${base}/api/auth/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'mcp-share', password: 'mcp-share-1234' }),
        })
        expect(register.ok).toBe(true)

        const document = v20Page([
          v20Text('share-title', { x: 80, y: 160, width: 900, height: 200 }, { text: 'MCP 分享端到端' }),
        ])

        // The default answer carries the JSON plus a QR code image to scan.
        const shareResponse = await client.callTool({ name: 'share_document', arguments: { document, expiresInHours: 6 } })
        const blocks = (shareResponse as { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }).content
        expect(blocks).toHaveLength(2)
        expect(blocks[0].type).toBe('text')
        expect(blocks[1].type).toBe('image')
        expect(blocks[1].mimeType).toBe('image/png')
        expect((blocks[1].data ?? '').length).toBeGreaterThan(100)
        const shared = JSON.parse(blocks[0].text ?? '') as {
          ok: boolean
          share: { id: string; url: string; expiresAt: number; imageCount: number }
        }
        expect(shared.ok).toBe(true)
        const share = shared.share
        expect(share.url).toMatch(new RegExp(`^${base}/share/[A-Za-z0-9_-]+$`))
        expect(share.imageCount).toBe(1)
        expect(share.expiresAt - Date.now()).toBeGreaterThan(5 * 60 * 60 * 1000)
        expect(share.expiresAt - Date.now()).toBeLessThan(7 * 60 * 60 * 1000)

        // The public page opens without an account and carries the rendered page.
        const page = await fetch(share.url)
        expect(page.status).toBe(200)
        const html = await page.text()
        expect(html).toContain('长按图片保存到相册')
        expect(html).toMatch(/<img src="[^"]*\/uploads\//)

        const list = await callTool('list_shares', {})
        expect(list.ok).toBe(true)
        expect(list.shares).toHaveLength(1)
        expect((list.shares as Array<{ id: string }>)[0].id).toBe(share.id)

        const revoked = await callTool('revoke_share', { id: share.id })
        expect(revoked).toMatchObject({ ok: true, id: share.id })
        expect((await fetch(share.url)).status).toBe(404)
      } finally {
        await client.close()
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
        server.kill()
        await new Promise((resolve) => server.once('exit', resolve))
        rmSync(dataDir, { recursive: true, force: true })
      }
    },
    240_000,
  )
})
