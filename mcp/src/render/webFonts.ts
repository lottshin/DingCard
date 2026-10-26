// The render page's web fonts. render.html links the Google Fonts stylesheet
// and the page fetches the subsets it embeds into each picture. A fresh
// browser has no cache, so every render downloaded them again (4–5 s); a host
// that can't be reached stalled each render about a minute; and the words
// came out in a system font without a word said. These routes answer the
// page's font requests from a disk cache, fetch the rest through the browser
// itself (so its proxy settings hold) within a time limit, can take the
// stylesheet from another source (DINGCARD_FONTS_URL), and report the faces
// a render went without.

import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Browser, Page, Route } from 'playwright-core'
import { markdownFontPlan } from '../../../src/markdownLooks'
import { resolveTheme } from '../../../src/theme'

export const FONT_STYLESHEET_HOST = 'fonts.googleapis.com'
const FONT_FILE_HOST = 'fonts.gstatic.com'
/** How long one font request may take before the page goes on without it. */
export const FONT_FETCH_TIMEOUT_MS = 10_000
/** A cached stylesheet is used as it is for this long, then fetched again (and kept if that fails). */
export const STYLESHEET_FRESH_MS = 30 * 24 * 60 * 60_000

/** Where fonts are kept between renders: DINGCARD_FONT_CACHE_DIR, else <XDG_CACHE_HOME or ~/.cache>/dingcard/fonts. */
export function fontCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DINGCARD_FONT_CACHE_DIR?.trim()
  if (configured) return path.resolve(configured)
  const base = env.XDG_CACHE_HOME?.trim() || path.join(os.homedir(), '.cache')
  return path.join(base, 'dingcard', 'fonts')
}

/** DINGCARD_FONTS_URL: the address that stands in for https://fonts.googleapis.com (say https://fonts.googleapis.cn). */
export function fontsSource(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.DINGCARD_FONTS_URL?.trim()
  if (!value) return null
  let url: URL | null = null
  try {
    url = new URL(value)
  } catch {
    url = null
  }
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new Error(`DINGCARD_FONTS_URL=${value} 不是网址；它替代 https://fonts.googleapis.com，例如 https://fonts.googleapis.cn`)
  }
  return url.origin + url.pathname.replace(/\/+$/, '')
}

/** A stylesheet address moved onto the stand-in source, path and query kept. */
export function fromSource(url: string, source: string | null): string {
  if (!source) return url
  const original = new URL(url)
  return `${source}${original.pathname}${original.search}`
}

/** The families a Google Fonts css2 address asks for ("Noto Serif SC:wght@400;700" → "Noto Serif SC"). */
export function stylesheetFamilies(url: string): string[] {
  try {
    return new URL(url).searchParams.getAll('family').map((spec) => spec.split(':')[0].trim()).filter(Boolean)
  } catch {
    return []
  }
}

/** The face a font stack asks for first: the one the words are drawn in when it loads. */
export function primaryFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '')
}

/**
 * The font stacks a render payload draws its words in: a freeform document's
 * fontFamily values, a Markdown card's font and its look's faces. Null for
 * HTML, whose fonts are swapped for built-in ones while it is read.
 */
export function payloadFontStacks(payload: unknown): string[] | null {
  if (typeof payload !== 'object' || payload === null) return null
  if ('markdown' in payload) {
    const markdown = payload.markdown as { source?: unknown; themeId?: unknown; fontFamily?: unknown }
    if (typeof markdown?.source !== 'string' || typeof markdown.fontFamily !== 'string') return null
    return markdownFontPlan(resolveTheme(markdown.themeId).look ?? null, markdown.source, markdown.fontFamily).map((face) => face.fontFamily)
  }
  if (!('document' in payload)) return null
  const stacks: string[] = []
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, inner] of Object.entries(value)) {
        if (key === 'fontFamily' && typeof inner === 'string') stacks.push(inner)
        else walk(inner)
      }
    }
  }
  walk(payload.document)
  return stacks
}

/** Every font file a stylesheet names, with its family. */
export function stylesheetFaces(css: string): Array<{ family: string; url: string }> {
  const faces: Array<{ family: string; url: string }> = []
  for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const family = block[1].match(/font-family:\s*(['"]?)([^;'"]+)\1/)?.[2]?.trim()
    if (!family) continue
    for (const source of block[1].matchAll(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/g)) faces.push({ family, url: source[2] })
  }
  return faces
}

export interface CachedFont {
  body: Buffer
  contentType: string
  savedAt: number
}

/** Font files and stylesheets on disk by address. One that can't be read is a miss; one that can't be written is skipped. */
export class FontCache {
  constructor(private readonly dir: string) {}

  private base(url: string): string {
    return path.join(this.dir, createHash('sha256').update(url).digest('hex').slice(0, 40))
  }

  async get(url: string): Promise<CachedFont | null> {
    try {
      const base = this.base(url)
      const meta = JSON.parse(await readFile(`${base}.json`, 'utf8')) as { url?: unknown; contentType?: unknown; savedAt?: unknown }
      if (meta.url !== url) return null
      return {
        body: await readFile(`${base}.body`),
        contentType: typeof meta.contentType === 'string' ? meta.contentType : '',
        savedAt: typeof meta.savedAt === 'number' ? meta.savedAt : 0,
      }
    } catch {
      return null
    }
  }

  async put(url: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true })
      const base = this.base(url)
      const temp = `${base}.${process.pid}-${Math.random().toString(36).slice(2)}`
      // The body lands before its record, so a record always has its whole file.
      await writeFile(`${temp}.body`, body)
      await rename(`${temp}.body`, `${base}.body`)
      await writeFile(`${temp}.json`, JSON.stringify({ url, contentType, savedAt: Date.now() }))
      await rename(`${temp}.json`, `${base}.json`)
    } catch {
      // Not kept: the next render fetches it again.
    }
  }
}

export interface FetchedFont {
  status: number
  contentType: string
  body: Buffer
}

/** Fetch an address within timeoutMs; rejects when it times out or can't connect. */
export type FontFetcher = (url: string, timeoutMs: number) => Promise<FetchedFont>

/**
 * Fetch from a blank page of the same browser, so its proxy settings, DNS and
 * certificates hold (a fetch from Node would ignore a system proxy). The
 * page is opened on first use.
 */
export function browserFetcher(browser: Browser): { fetch: FontFetcher; close: () => Promise<void> } {
  let helper: Promise<Page> | null = null
  return {
    async fetch(url, timeoutMs) {
      helper ??= browser.newPage()
      const page = await helper
      const answer = await page.evaluate(async ({ url, timeoutMs }) => {
        const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), credentials: 'omit' })
        const bytes = new Uint8Array(await response.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        return { status: response.status, contentType: response.headers.get('content-type') ?? '', data: btoa(binary) }
      }, { url, timeoutMs })
      return { status: answer.status, contentType: answer.contentType, body: Buffer.from(answer.data, 'base64') }
    },
    async close() {
      if (helper) await (await helper).close().catch(() => undefined)
    },
  }
}

/** The web fonts a render went without. */
export interface FontFallback {
  /** Families drawn in a system font instead; empty when the stylesheet failed and the payload doesn't name its fonts. */
  families: string[]
  note: string
}

/** One render's font requests: cache, then the network within the time limit, then a stale copy, else fail at once. */
export class WebFontRoutes {
  private readonly fileHosts = new Set([FONT_FILE_HOST])
  private readonly familyOf = new Map<string, string>()
  private readonly missed = new Set<string>()
  private readonly loading = new Map<string, Promise<CachedFont | null>>()
  /** A fetch timed out or couldn't connect: the rest of this render doesn't wait for the network. */
  private unreachable = false

  constructor(
    private readonly cache: FontCache,
    private readonly fetchFont: FontFetcher,
    private readonly source: string | null = null,
    private readonly timeoutMs = FONT_FETCH_TIMEOUT_MS,
  ) {}

  /** Whether a request is the stylesheet or a font file it names. */
  handles(url: URL): boolean {
    return url.hostname === FONT_STYLESHEET_HOST || this.fileHosts.has(url.hostname)
  }

  async install(page: Page): Promise<void> {
    await page.route((url) => this.handles(url), (route) => this.answer(route))
  }

  async answer(route: Pick<Route, 'request' | 'fulfill' | 'abort'>): Promise<void> {
    const requested = route.request().url()
    const stylesheet = new URL(requested).hostname === FONT_STYLESHEET_HOST
    const font = await this.load(stylesheet ? fromSource(requested, this.source) : requested, stylesheet)
    if (!font) {
      this.missed.add(requested)
      await route.abort('failed').catch(() => undefined)
      return
    }
    if (stylesheet) this.learn(font.body.toString('utf8'))
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': font.contentType || (stylesheet ? 'text/css; charset=utf-8' : 'font/woff2'),
        // The page reads both with fetch() to embed them.
        'access-control-allow-origin': '*',
      },
      body: font.body,
    }).catch(() => undefined)
  }

  private load(url: string, stylesheet: boolean): Promise<CachedFont | null> {
    let pending = this.loading.get(url)
    if (!pending) {
      pending = this.loadOnce(url, stylesheet)
      this.loading.set(url, pending)
    }
    return pending
  }

  private async loadOnce(url: string, stylesheet: boolean): Promise<CachedFont | null> {
    const cached = await this.cache.get(url)
    // Font files never change under their address; a stylesheet is checked again after a while.
    if (cached && (!stylesheet || Date.now() - cached.savedAt < STYLESHEET_FRESH_MS)) return cached
    if (!this.unreachable) {
      try {
        const fetched = await this.fetchFont(url, this.timeoutMs)
        if (fetched.status >= 200 && fetched.status < 300 && fetched.body.length > 0) {
          await this.cache.put(url, fetched.body, fetched.contentType)
          return { body: fetched.body, contentType: fetched.contentType, savedAt: Date.now() }
        }
      } catch {
        this.unreachable = true
      }
    }
    // An old stylesheet beats none.
    return cached
  }

  /** The stylesheet names its font files: their hosts are fonts too (another source keeps its own). */
  private learn(css: string): void {
    for (const face of stylesheetFaces(css)) {
      this.familyOf.set(face.url, face.family)
      try {
        this.fileHosts.add(new URL(face.url).hostname)
      } catch {
        // Not an address.
      }
    }
  }

  /**
   * The faces this render went without, or null when it had them all. A font
   * file is only asked for when its face draws words, so a missed one is a
   * loss; a missed stylesheet costs the faces the words ask for first
   * (stacks from payloadFontStacks; null when that can't be told).
   */
  fallback(stacks: readonly string[] | null): FontFallback | null {
    if (this.missed.size === 0) return null
    const wanted = stacks ? new Set(stacks.map(primaryFamily)) : null
    const families = new Set<string>()
    let untold = false
    for (const url of this.missed) {
      if (new URL(url).hostname === FONT_STYLESHEET_HOST) {
        if (!wanted) untold = true
        else for (const family of stylesheetFamilies(url)) if (wanted.has(family)) families.add(family)
      } else {
        const family = this.familyOf.get(url)
        if (family) families.add(family)
      }
    }
    if (families.size === 0 && !untold) return null
    const list = [...families].sort()
    const which = list.length > 0 ? `网页字体 ${list.join('、')} ` : '用到的网页字体'
    return {
      families: list,
      note: `${which}这次没加载到（连不上字体源或超过 ${this.timeoutMs / 1000} 秒），换成了系统字体，排版和出图会和编辑器里不一样。网络恢复后再调用一次就会用回来，下载过的字体存在本机，之后不再联网；连不上 Google Fonts 时，可以设环境变量 DINGCARD_FONTS_URL 换一个字体源，见 docs/mcp.md「环境与配置」。`,
    }
  }
}
