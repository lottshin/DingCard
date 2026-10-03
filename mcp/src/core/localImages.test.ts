import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { embedLocalHtmlImages } from './localImages'

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
    expect(result.html).toContain(`style="background-image: url('${DATA_URL}')"`)
    expect(result.html).toContain(`.hero { background: url("${DATA_URL}") center / cover }`)
    expect(result.html).toContain('<a href="./next.html">next</a><img src="https://example.com/a.png"><img src="data:image/gif;base64,R0lGOD">')
    expect(result.html).toContain('<img src="./missing.png">')
    expect(result.missing).toEqual(['./missing.png（找不到文件）'])
    expect(result.embedded).toContain(path.join(dir, 'css', 'page.css'))
  })
})
