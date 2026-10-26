// The render page's font requests, answered without a browser: fake routes
// record how each request was answered, a fake fetcher stands in for the
// network.

import { mkdtempSync, writeFileSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  FontCache,
  fontCacheDir,
  fontsSource,
  fromSource,
  payloadFontStacks,
  primaryFamily,
  STYLESHEET_FRESH_MS,
  stylesheetFaces,
  stylesheetFamilies,
  WebFontRoutes,
  type FetchedFont,
} from './webFonts'

const STYLESHEET = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&family=Instrument+Sans:wght@400&display=swap'
const FILE = 'https://fonts.gstatic.com/s/notoserifsc/v35/a.woff2'
const CSS = `/* chinese */
@font-face {
  font-family: 'Noto Serif SC';
  font-style: normal;
  font-weight: 700;
  src: url(${FILE}) format('woff2');
  unicode-range: U+4E00-4E3F;
}
@font-face {
  font-family: 'Instrument Sans';
  src: url(https://fonts.gstatic.com/s/instrumentsans/v1/b.woff2) format('woff2');
}`

const freeform = (fontFamily: string) => ({ document: { slides: [{ nodes: [{ type: 'text', fontFamily }] }] } })

function cacheDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'dingcard-fonts-'))
}

function ok(body: string, contentType: string): FetchedFont {
  return { status: 200, contentType, body: Buffer.from(body) }
}

/** A request for url that records how it was answered. */
function routeFor(url: string) {
  const answer: { fulfilled?: { headers?: Record<string, string>; body?: string | Buffer }; aborted?: string } = {}
  const route = {
    request: () => ({ url: () => url }),
    fulfill: async (response: { headers?: Record<string, string>; body?: string | Buffer }) => {
      answer.fulfilled = response
    },
    abort: async (code?: string) => {
      answer.aborted = code ?? 'failed'
    },
  } as unknown as Parameters<WebFontRoutes['answer']>[0]
  return { route, answer }
}

describe('web font settings', () => {
  test('keeps fonts in DINGCARD_FONT_CACHE_DIR, else the XDG cache, else ~/.cache', () => {
    expect(fontCacheDir({ DINGCARD_FONT_CACHE_DIR: '/srv/fonts' })).toBe(path.resolve('/srv/fonts'))
    expect(fontCacheDir({ XDG_CACHE_HOME: '/var/cache' })).toBe(path.join('/var/cache', 'dingcard', 'fonts'))
    expect(fontCacheDir({})).toBe(path.join(os.homedir(), '.cache', 'dingcard', 'fonts'))
  })

  test('moves the stylesheet onto DINGCARD_FONTS_URL with its path and query', () => {
    expect(fontsSource({})).toBeNull()
    expect(fontsSource({ DINGCARD_FONTS_URL: 'https://fonts.googleapis.cn/' })).toBe('https://fonts.googleapis.cn')
    expect(fromSource(STYLESHEET, 'https://fonts.googleapis.cn')).toBe(STYLESHEET.replace('fonts.googleapis.com', 'fonts.googleapis.cn'))
    expect(fromSource(STYLESHEET, 'https://example.com/google-fonts')).toBe(STYLESHEET.replace('https://fonts.googleapis.com', 'https://example.com/google-fonts'))
    expect(fromSource(STYLESHEET, null)).toBe(STYLESHEET)
    expect(() => fontsSource({ DINGCARD_FONTS_URL: 'fonts.googleapis.cn' })).toThrow(/DINGCARD_FONTS_URL/)
  })

  test('reads the families a stylesheet asks for and the files it names', () => {
    expect(stylesheetFamilies(STYLESHEET)).toEqual(['Noto Serif SC', 'Instrument Sans'])
    expect(stylesheetFaces(CSS)).toEqual([
      { family: 'Noto Serif SC', url: FILE },
      { family: 'Instrument Sans', url: 'https://fonts.gstatic.com/s/instrumentsans/v1/b.woff2' },
    ])
  })

  test('reads the font stacks a payload draws its words in', () => {
    const document = {
      slides: [{
        nodes: [
          { type: 'text', fontFamily: `'Noto Serif SC', serif` },
          { type: 'group', children: [{ type: 'text', fontFamily: 'PingFang SC' }] },
        ],
      }],
    }
    expect(payloadFontStacks({ document })).toEqual([`'Noto Serif SC', serif`, 'PingFang SC'])
    // A Markdown card adds its look's faces: 宣纸 sets its page furniture in Noto Serif SC.
    expect(payloadFontStacks({ markdown: { source: '# 标题', themeId: 'template-xuan', fontFamily: `'PingFang SC', sans-serif` } }))
      .toEqual([`'PingFang SC', sans-serif`, `'Noto Serif SC', serif`])
    expect(payloadFontStacks({ html: { source: '<p style="font-family: Inter">x</p>' } })).toBeNull()
    expect(primaryFamily(`"Noto Serif SC", serif`)).toBe('Noto Serif SC')
  })

  test('takes a cache it cannot write as a miss', async () => {
    const blocker = path.join(cacheDir(), 'a-file')
    writeFileSync(blocker, 'not a directory')
    const cache = new FontCache(path.join(blocker, 'fonts'))
    await expect(cache.put(FILE, Buffer.from('font'), 'font/woff2')).resolves.toBeUndefined()
    expect(await cache.get(FILE)).toBeNull()
  })
})

describe('WebFontRoutes', () => {
  test('fetches a font once and answers from the disk cache after that', async () => {
    const dir = cacheDir()
    const fetchFont = vi.fn(async () => ok('font bytes', 'font/woff2'))
    const first = new WebFontRoutes(new FontCache(dir), fetchFont)
    const shown = routeFor(FILE)
    const embedded = routeFor(FILE)
    // The page draws the face and fetches it to embed at the same time.
    await Promise.all([first.answer(shown.route), first.answer(embedded.route)])
    expect(fetchFont).toHaveBeenCalledTimes(1)
    expect(shown.answer.fulfilled?.headers).toMatchObject({ 'content-type': 'font/woff2', 'access-control-allow-origin': '*' })
    expect(String(embedded.answer.fulfilled?.body)).toBe('font bytes')

    const later = new WebFontRoutes(new FontCache(dir), fetchFont)
    const again = routeFor(FILE)
    await later.answer(again.route)
    expect(fetchFont).toHaveBeenCalledTimes(1)
    expect(String(again.answer.fulfilled?.body)).toBe('font bytes')
    expect(later.fallback(payloadFontStacks(freeform(`'Noto Serif SC', serif`)))).toBeNull()
  })

  test('stops waiting for the network once a request times out, and names the faces that fell back', async () => {
    const fetchFont = vi.fn(async (): Promise<FetchedFont> => {
      throw new Error('signal timed out')
    })
    const routes = new WebFontRoutes(new FontCache(cacheDir()), fetchFont)
    const sheet = routeFor(STYLESHEET)
    await routes.answer(sheet.route)
    expect(sheet.answer.aborted).toBe('failed')
    // The page asks again to embed: it fails at once instead of waiting another time limit.
    const embed = routeFor(STYLESHEET.replace('display=swap', 'display=block'))
    await routes.answer(embed.route)
    expect(embed.answer.aborted).toBe('failed')
    expect(fetchFont).toHaveBeenCalledTimes(1)

    const fallback = routes.fallback(payloadFontStacks(freeform(`'Noto Serif SC', serif`)))
    expect(fallback?.families).toEqual(['Noto Serif SC'])
    expect(fallback?.note).toMatch(/DINGCARD_FONTS_URL/)
    // Words set in a system face first lost nothing, though the stack names a web font after it.
    expect(routes.fallback(payloadFontStacks(freeform(`'PingFang SC', 'Noto Serif SC', sans-serif`)))).toBeNull()
    // HTML can't tell its faces: the note speaks of the web fonts it used.
    expect(routes.fallback(null)?.families).toEqual([])
    expect(routes.fallback(null)?.note).toMatch(/^用到的网页字体这次没加载到/)
  })

  test('names the family of a font file it could not have', async () => {
    const fetchFont = vi.fn(async (url: string): Promise<FetchedFont> => {
      if (url === STYLESHEET) return ok(CSS, 'text/css; charset=utf-8')
      if (url === FILE) return { status: 404, contentType: 'text/html', body: Buffer.from('missing') }
      return ok('font bytes', 'font/woff2')
    })
    const routes = new WebFontRoutes(new FontCache(cacheDir()), fetchFont)
    await routes.answer(routeFor(STYLESHEET).route)
    const missing = routeFor(FILE)
    await routes.answer(missing.route)
    expect(missing.answer.aborted).toBe('failed')
    // A missing file is no lost connection: the next one is still fetched.
    const other = routeFor('https://fonts.gstatic.com/s/instrumentsans/v1/b.woff2')
    await routes.answer(other.route)
    expect(String(other.answer.fulfilled?.body)).toBe('font bytes')
    expect(routes.fallback([])?.families).toEqual(['Noto Serif SC'])
  })

  test('answers with an old stylesheet when it cannot be fetched again', async () => {
    const cache = new FontCache(cacheDir())
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() - STYLESHEET_FRESH_MS - 60_000)
    await cache.put(STYLESHEET, Buffer.from(CSS), 'text/css; charset=utf-8')
    now.mockRestore()
    const fetchFont = vi.fn(async (): Promise<FetchedFont> => {
      throw new Error('offline')
    })
    const routes = new WebFontRoutes(cache, fetchFont)
    const sheet = routeFor(STYLESHEET)
    await routes.answer(sheet.route)
    expect(fetchFont).toHaveBeenCalledTimes(1)
    expect(String(sheet.answer.fulfilled?.body)).toBe(CSS)
    expect(routes.fallback([`'Noto Serif SC', serif`])).toBeNull()
  })

  test('takes the stylesheet from DINGCARD_FONTS_URL and the files it names as fonts', async () => {
    const source = 'https://fonts.googleapis.cn'
    const mirrored = CSS.replaceAll('fonts.gstatic.com', 'fonts.gstatic.cn')
    const fetchFont = vi.fn(async (url: string) => (url.startsWith(source) ? ok(mirrored, 'text/css') : ok('cn font', 'font/woff2')))
    const routes = new WebFontRoutes(new FontCache(cacheDir()), fetchFont, source)
    const cnFile = new URL(FILE.replace('fonts.gstatic.com', 'fonts.gstatic.cn'))
    expect(routes.handles(cnFile)).toBe(false)
    const sheet = routeFor(STYLESHEET)
    await routes.answer(sheet.route)
    expect(fetchFont).toHaveBeenCalledWith(fromSource(STYLESHEET, source), expect.any(Number))
    expect(String(sheet.answer.fulfilled?.body)).toBe(mirrored)
    expect(routes.handles(cnFile)).toBe(true)
    expect(routes.handles(new URL('http://127.0.0.1:5390/render.html'))).toBe(false)
  })
})
