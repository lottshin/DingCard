// Full render-pipeline test: template document → headless Chromium → PNG
// files with dimensions matching the slide. Slow (may build the frontend once
// and launches a real browser); run via `npm run test:render`.

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { reduceFreeformDocument } from '../../../src/freeform/document'
import type { FreeformTextElement } from '../../../src/freeform/types'
import { createDocumentFromOutline } from '../core/outline'
import { instantiateTemplate } from '../core/templates'
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
      // cover + one slide per section + the template ending page
      expect(result.files).toHaveLength(5)
      for (const file of result.files) {
        expect(file.width).toBe(1080)
        expect(file.height).toBe(1440)
        expect(file.bytes).toBeGreaterThan(1000)
      }
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
