// Full render-pipeline test: template document → headless Chromium → PNG
// files with dimensions matching the slide. Slow (may build the frontend once
// and launches a real browser); run via `npm run test:render`.

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
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
