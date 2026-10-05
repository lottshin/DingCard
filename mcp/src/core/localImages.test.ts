import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { absolutizeRootRelativeImages, embedLocalHtmlImages } from './localImages'
import type { FreeformDocument } from '../../../src/freeform/types'

// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const DATA_URL = `data:image/png;base64,${PNG.toString('base64')}`

describe('embedLocalHtmlImages', () => {
  test('embeds pictures named in attributes, CSS and local stylesheets, and leaves the rest alone', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dingcard-html-'))
    mkdirSync(path.join(dir, 'css'))
    writeFileSync(path.join(dir, 'photo.png'), PNG)
    writeFileSync(path.join(dir, 'css', 'dot.png'), PNG)
    writeFileSync(path.join(dir, 'css', 'page.css'), '.dots { background: url(dot.png) }')
    const html = [
      '<link rel="stylesheet" href="./css/page.css">',
      '<img src="photo.png"><img src="./photo.png" alt="again">',
      `<div style="background-image: url('photo.png')"></div>`,
      '<style>.hero { background: url("./photo.png") center / cover }</style>',
      '<a href="./next.html">next</a><img src="https://example.com/a.png"><img src="data:image/gif;base64,R0lGOD">',
      '<img src="./missing.png">',
    ].join('\n')

    const result = await embedLocalHtmlImages(html, dir)

    expect(result.html).toContain(`<style>.dots { background: url(${DATA_URL}) }</style>`)
    expect(result.html).toContain(`<img src="${DATA_URL}"><img src="${DATA_URL}" alt="again">`)
    // The quote stays as written, so a style attribute keeps its own.
    expect(result.html).toContain(`style="background-image: url('${DATA_URL}')"` )
    expect(result.html).toContain(`.hero { background: url("${DATA_URL}") center / cover }`)
    expect(result.html).toContain('<a href="./next.html">next</a><img src="https://example.com/a.png"><img src="data:image/gif;base64,R0lGOD">')
    expect(result.html).toContain('<img src="./missing.png">')
    expect(result.missing).toEqual(['./missing.png（找不到文件）'])
    expect(result.embedded).toContain(path.join(dir, 'css', 'page.css'))
  })
})

describe('absolutizeRootRelativeImages', () => {
  const picture = (src: string) => ({
    id: src, name: src, locked: false, hidden: false, type: 'image' as const,
    x: 0, y: 0, width: 10, height: 10, rotation: 0, scale: 1, src, alt: '', fit: 'cover' as const,
    framing: { focusX: 0.5, focusY: 0.5, zoom: 1 },
  })
  const document = {
    version: 20,
    slides: [
      {
        id: 's1', name: '一', width: 100, height: 100,
        background: { type: 'solid' as const, color: '#fff' },
        nodes: [picture('/uploads/a.png')],
      },
      {
        id: 's2', name: '二', width: 100, height: 100,
        background: { type: 'image' as const, src: '/uploads/bg.png', fit: 'cover' as const, framing: { focusX: 0.5, focusY: 0.5, zoom: 1 } },
        nodes: [picture('https://elsewhere.example/b.png'), picture(DATA_URL)],
      },
    ],
  } as unknown as FreeformDocument

  test('prefixes root-relative srcs with the base and leaves everything else untouched', () => {
    const relocated = absolutizeRootRelativeImages(document, 'https://cards.example.com')
    expect((relocated.slides[0].nodes[0] as { src: string }).src).toBe('https://cards.example.com/uploads/a.png')
    expect((relocated.slides[1].background as { src: string }).src).toBe('https://cards.example.com/uploads/bg.png')
    expect((relocated.slides[1].nodes[0] as { src: string }).src).toBe('https://elsewhere.example/b.png')
    expect((relocated.slides[1].nodes[1] as { src: string }).src).toBe(DATA_URL)
    // A solid background keeps its shape.
    expect(relocated.slides[0].background.type).toBe('solid')
  })

  test('an empty base returns the document as-is', () => {
    expect(absolutizeRootRelativeImages(document, '')).toBe(document)
  })
})
