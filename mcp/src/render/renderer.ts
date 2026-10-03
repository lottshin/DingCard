// Headless renderer — document JSON in, PNG / JPEG / PDF files on disk.
//
// Pipeline: validate → ensure the built render page exists (one `npm run
// build` at the repo root, output kept off stdout to protect the stdio MCP
// protocol) → serve dist/ on a loopback port → drive Chromium via
// playwright-core (system Chrome first, matching the e2e suites'
// zero-download setup — playwright-core never downloads browsers) →
// collect the data URLs the render page produced → write files (a PDF is
// assembled here from the pages' JPEGs, with the editor's own PDF writer).
//
// Two payload variants reach the render page: `{ document }` for freeform
// documents and `{ markdown }` for markdown card envelopes. Every resource
// (page, browser, static server) is released in a finally block; errors
// surface as structured { ok: false, error } results.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { buildPdf, pdfPageFor } from '../../../src/exportPdf'
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import type { FreeformDocument } from '../../../src/freeform/types'
import type { HtmlImportNote } from '../../../src/freeform/htmlImport'
import { isMarkdownDocument } from '../../../src/drafts'
import { gridCells, isGridPage } from '../../../src/exportGrid'
import { createStaticServer } from './staticServer'

const RENDER_TIMEOUT_MS = 120_000
const BUILD_TIMEOUT_MS = 5 * 60_000

export interface RenderFile {
  path: string
  /** The page in it; a PDF or long image lists its `pages` instead. */
  slideId?: string
  name?: string
  /** A PDF's or long image's pages, in order. */
  pages?: Array<{ slideId: string; name: string }>
  /** Pixels of a picture; a PDF gives its first page's size in CSS px. */
  width: number
  height: number
  /** A long image's pixel ratio, lower than asked for when the pages wouldn't fit one picture. */
  scale?: number
  /** A grid square's place in its page's nine, 1–9 left to right, top to bottom. */
  tile?: number
  bytes: number
}

/** A small JPEG of one page, for the client to show its model. */
export interface RenderPreview {
  slideId: string
  name: string
  dataUrl: string
}

export interface RenderSuccess {
  ok: true
  files: RenderFile[]
  distDir: string
  previews: RenderPreview[]
}

export type RenderResult =
  | RenderSuccess
  | { ok: false; error: string }

export interface RenderOptions {
  outputDir: string
  baseName?: string
  slideIds?: string[]
  /** png (default) or jpeg: one picture per page; pdf: one file holding every page. */
  format?: 'png' | 'jpeg' | 'pdf'
  /** Pixel ratio, 1 (default) or 2. */
  scale?: 1 | 2
  /** JPEG quality for jpeg and pdf, 0.5–1 (default 0.92). */
  quality?: number
  /** png / jpeg: every page stacked into one tall picture, <baseName>-long.png, instead of one per page. */
  long?: boolean
  /** png / jpeg: each square page cut into nine, <baseName>-01-1.png … -01-9.png, instead of one per page. */
  grid?: boolean
}

/** Walk up from this module (bundled or source) to the repo root. */
export function resolveRepoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (;;) {
    if (
      existsSync(path.join(dir, 'package.json')) &&
      existsSync(path.join(dir, 'mcp', 'package.json'))
    ) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error('无法定位仓库根目录（未找到包含 mcp/ 的项目根）')
    dir = parent
  }
}

/** The frontend an installed package carries next to its server bundle (dist/app, copied in by build:app). */
function bundledFrontendDir(): string | null {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'app')
  return existsSync(path.join(dir, 'render.html')) ? dir : null
}

async function runFrontendBuild(repoRoot: string): Promise<void> {
  const build = spawn('npm', ['run', 'build'], {
    cwd: repoRoot,
    // stdout must stay silent: the MCP protocol owns it. Keep stderr for
    // diagnostics, buffered so failures can be quoted in the error result.
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const stderr: Buffer[] = []
  build.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk))
  const code = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      build.kill('SIGKILL')
      reject(new Error('前端构建超时'))
    }, BUILD_TIMEOUT_MS)
    build.once('error', reject)
    build.once('close', (exitCode) => {
      clearTimeout(timer)
      resolve(exitCode)
    })
  })
  if (code !== 0) {
    const tail = Buffer.concat(stderr).toString('utf8').split('\n').slice(-12).join('\n')
    throw new Error(`前端构建失败（退出码 ${code}）：\n${tail}`)
  }
}

/**
 * The built frontend: DINGCARD_DIST_DIR if set; inside the repository its
 * dist/ (built first if missing, so a checkout just works); else the copy an
 * installed package carries.
 */
async function resolveFrontend(): Promise<string> {
  const override = process.env.DINGCARD_DIST_DIR?.trim()
  if (override) {
    const distDir = path.resolve(override)
    if (!existsSync(path.join(distDir, 'render.html'))) {
      throw new Error(`DINGCARD_DIST_DIR=${override} 下没有 render.html；请先在仓库根执行 npm run build，或去掉该环境变量`)
    }
    return distDir
  }
  let repoRoot: string | null
  try {
    repoRoot = resolveRepoRoot()
  } catch {
    repoRoot = null
  }
  if (repoRoot) {
    const distDir = path.join(repoRoot, 'dist')
    if (existsSync(path.join(distDir, 'render.html'))) return distDir
    await runFrontendBuild(repoRoot)
    if (!existsSync(path.join(distDir, 'render.html'))) throw new Error('前端构建完成但仍未找到 dist/render.html')
    return distDir
  }
  const bundled = bundledFrontendDir()
  if (bundled) return bundled
  throw new Error('找不到叮卡前端：不在叮卡仓库里，安装包里也没有 dist/app；请设 DINGCARD_DIST_DIR 指向构建好的 dist/')
}

/** Prefer the system Chrome (like the e2e suites); playwright-core ships no
 * browsers, so without a system Chrome the fallback explains the options. */
async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[dingcard-mcp] 系统 Chrome 不可用（${reason}），尝试默认 Chromium`)
    try {
      return await chromium.launch({ headless: true })
    } catch {
      throw new Error(
        '无可用浏览器：渲染需要系统安装的 Google Chrome（推荐），'
        + '或另行执行 npx playwright install chromium 后重试。'
        + `（Chrome 启动失败原因：${reason}）`,
      )
    }
  }
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  return Buffer.from(base64, 'base64')
}

function sanitizeBaseName(value: string | undefined): string {
  const cleaned = (value ?? 'dingcard').replace(/[^A-Za-z0-9._-]/g, '-')
  return cleaned.length > 0 ? cleaned : 'dingcard'
}

interface RenderPageSlide {
  slideId: string
  name: string
  width: number
  height: number
  dataUrl: string
  previewDataUrl: string
  /** With grid: the page's nine squares in reading order. */
  tiles?: string[]
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The render page's measurements of one laid-out slide (see src/render/renderPage.tsx). */
export interface InspectedSlide {
  slideId: string
  nodes: Array<{ nodeId: string; rect: Rect }>
  texts: Array<{ nodeId: string; overflowY: number; overflowX: number; fitFontSize: number | null; area: Rect | null }>
  /**
   * Each path's drawing in its own box's pixels, and its paint mask: '1' for
   * every cell of an even grid over its box (row by row) that it paints
   * (older render builds leave these out).
   */
  paths?: Array<{ nodeId: string; bounds: Rect; mask?: string }>
  /** On a picture background: its average colour behind each text (older builds leave it out). */
  backdrops?: Array<{ nodeId: string; color: string }>
  imageError: string | null
}

interface RenderPageOutput {
  format: 'png' | 'jpeg'
  scale: number
  quality: number
  long: boolean
  grid: boolean
}

type RenderPayload =
  | { document: unknown; inspect?: boolean; output?: RenderPageOutput }
  | { markdown: unknown }
  | { html: { source: string; width?: number; height?: number } }

interface RenderPageLong {
  dataUrl: string
  width: number
  height: number
  scale: number
}

type PageResult = {
  ok?: boolean
  error?: string
  slides?: RenderPageSlide[]
  long?: RenderPageLong
  inspected?: InspectedSlide[]
  imported?: { document: unknown; notes: HtmlImportNote[] }
}

async function runInBrowser(payload: RenderPayload, port: number): Promise<PageResult> {
  const browser = await launchBrowser()
  const page = await browser.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  try {
    // The callback and evaluate bodies below run inside the browser page; use
    // globalThis so this Node module needs no DOM type library.
    await page.addInitScript(
      (init: RenderPayload) => {
        ;(globalThis as unknown as Record<string, unknown>).__DINGCARD_RENDER__ = init
      },
      payload,
    )
    await page.goto(`http://127.0.0.1:${port}/render.html`, { waitUntil: 'load' })
    await page.waitForFunction(
      () =>
        (globalThis as unknown as Record<string, unknown>).__DINGCARD_RENDER_RESULT__
          !== undefined,
      undefined,
      { timeout: RENDER_TIMEOUT_MS },
    )
    const raw = (await page.evaluate(
      () => (globalThis as unknown as Record<string, unknown>).__DINGCARD_RENDER_RESULT__,
    )) as PageResult
    if (!raw || raw.ok !== true) throw new Error(raw?.error ?? '渲染页未返回结果')
    return raw
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const context = pageErrors.length > 0 ? `；页面错误：${pageErrors.slice(0, 3).join(' | ')}` : ''
    throw new Error(`${detail}${context}`)
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}

async function renderInBrowser(payload: RenderPayload, port: number): Promise<{ slides: RenderPageSlide[]; long?: RenderPageLong }> {
  const result = await runInBrowser(payload, port)
  if (!result.slides) throw new Error('渲染页未返回页面')
  return { slides: result.slides, long: result.long }
}

const EXTENSIONS = { png: 'png', jpeg: 'jpg', pdf: 'pdf' } as const

/** The pages the render page produced, in the order asked for. */
function inOrder(rendered: RenderPageSlide[], order: Array<{ slideId: string; name: string }>): RenderPageSlide[] {
  const bySlideId = new Map(rendered.map((slide) => [slide.slideId, slide]))
  return order.map((expected) => {
    const produced = bySlideId.get(expected.slideId)
    if (!produced) throw new Error(`渲染结果缺少页面 ${expected.slideId}`)
    return produced
  })
}

async function writeOneFile(options: RenderOptions, suffix: string, bytes: Uint8Array): Promise<string> {
  const outputDir = path.resolve(options.outputDir)
  await mkdir(outputDir, { recursive: true })
  const filePath = path.join(outputDir, `${sanitizeBaseName(options.baseName)}${suffix}`)
  await writeFile(filePath, bytes)
  return filePath
}

/** Every page in one PDF, each page as large as its slide, from the JPEGs the render page made. */
async function writePdfFile(slides: RenderPageSlide[], options: RenderOptions): Promise<RenderFile> {
  const scale = options.scale ?? 1
  const bytes = buildPdf(slides.map((slide) => pdfPageFor(
    new Uint8Array(dataUrlToBuffer(slide.dataUrl)),
    slide,
    { width: Math.round(slide.width * scale), height: Math.round(slide.height * scale) },
  )))
  return {
    path: await writeOneFile(options, '.pdf', bytes),
    pages: slides.map((slide) => ({ slideId: slide.slideId, name: slide.name })),
    width: slides[0].width,
    height: slides[0].height,
    bytes: bytes.length,
  }
}

async function writeLongFile(slides: RenderPageSlide[], long: RenderPageLong, options: RenderOptions): Promise<RenderFile> {
  const bytes = dataUrlToBuffer(long.dataUrl)
  if (bytes.length === 0) throw new Error('长图渲染出了空文件')
  return {
    path: await writeOneFile(options, `-long.${EXTENSIONS[options.format === 'jpeg' ? 'jpeg' : 'png']}`, bytes),
    pages: slides.map((slide) => ({ slideId: slide.slideId, name: slide.name })),
    width: long.width,
    height: long.height,
    scale: long.scale,
    bytes: bytes.length,
  }
}

/** Each page's nine squares as files: <baseName>-01-1.png … -01-9.png, in the order Moments posts them. */
async function writeGridFiles(rendered: RenderPageSlide[], options: RenderOptions): Promise<RenderFile[]> {
  const extension = EXTENSIONS[options.format === 'jpeg' ? 'jpeg' : 'png']
  const scale = options.scale ?? 1
  const files: RenderFile[] = []
  for (const [index, slide] of rendered.entries()) {
    if (!slide.tiles || slide.tiles.length !== 9) throw new Error(`页面 ${slide.slideId} 没有切出九宫格`)
    const cells = gridCells(Math.round(slide.width * scale), Math.round(slide.height * scale))
    for (const [tile, dataUrl] of slide.tiles.entries()) {
      const bytes = dataUrlToBuffer(dataUrl)
      if (bytes.length === 0) throw new Error(`页面 ${slide.slideId} 第 ${tile + 1} 格渲染出了空文件`)
      files.push({
        path: await writeOneFile(options, `-${String(index + 1).padStart(2, '0')}-${tile + 1}.${extension}`, bytes),
        slideId: slide.slideId,
        name: slide.name,
        tile: tile + 1,
        width: cells[tile].width,
        height: cells[tile].height,
        bytes: bytes.length,
      })
    }
  }
  return files
}

async function writeResultFiles(
  rendered: Array<RenderPageSlide>,
  order: Array<{ slideId: string; name: string }>,
  options: RenderOptions,
): Promise<RenderFile[]> {
  const bySlideId = new Map(rendered.map((slide) => [slide.slideId, slide]))
  const baseName = sanitizeBaseName(options.baseName)
  const outputDir = path.resolve(options.outputDir)
  await mkdir(outputDir, { recursive: true })
  const files: RenderFile[] = []
  for (let index = 0; index < order.length; index++) {
    const expected = order[index]
    const produced = bySlideId.get(expected.slideId)
    if (!produced) {
      throw new Error(`渲染结果缺少页面 ${expected.slideId}`)
    }
    const fileName = `${baseName}-${String(index + 1).padStart(2, '0')}.${EXTENSIONS[options.format === 'jpeg' ? 'jpeg' : 'png']}`
    const filePath = path.join(outputDir, fileName)
    const bytes = dataUrlToBuffer(produced.dataUrl)
    if (bytes.length === 0) {
      throw new Error(`页面 ${expected.slideId} 渲染出了空文件`)
    }
    await writeFile(filePath, bytes)
    const scale = options.scale ?? 1
    files.push({
      path: filePath,
      slideId: expected.slideId,
      name: produced.name || expected.name,
      width: Math.round(produced.width * scale),
      height: Math.round(produced.height * scale),
      bytes: bytes.length,
    })
  }
  return files
}

/** The built frontend (dist/), built first if it isn't there yet. */
export async function builtFrontendDir(): Promise<string> {
  return resolveFrontend()
}

/** The built render page, served on a loopback port for the duration of `work`. */
async function withRenderPage<T>(work: (port: number) => Promise<T>): Promise<T> {
  const server = await createStaticServer(await resolveFrontend())
  try {
    return await work(server.port)
  } finally {
    await server.close().catch(() => undefined)
  }
}

/** Lay a freeform document out in the render page and measure every slide (nothing is exported). */
export async function inspectLayout(document: FreeformDocument): Promise<InspectedSlide[]> {
  return withRenderPage(async (port) => {
    const result = await runInBrowser({ document, inspect: true }, port)
    if (!result.inspected) throw new Error('渲染页未返回测量结果')
    return result.inspected
  })
}

export type HtmlImportResult =
  | { ok: true; document: FreeformDocument; notes: HtmlImportNote[] }
  | { ok: false; error: string }

/** HTML laid out in the render page and read back as an editable freeform document (src/freeform/htmlImport.ts). */
export async function importHtml(source: string, size: { width?: number; height?: number } = {}): Promise<HtmlImportResult> {
  if (!source.trim()) return { ok: false, error: '缺少 HTML' }
  try {
    return await withRenderPage(async (port) => {
      const result = await runInBrowser({ html: { source, ...size } }, port)
      if (!result.imported) throw new Error('渲染页未返回转换结果')
      const document = normalizeFreeformDocument(result.imported.document)
      if (!document) throw new Error('转换结果没有通过自由画布文档校验')
      return { ok: true as const, document, notes: result.imported.notes }
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Small JPEGs of a freeform document's pages, without writing any files. */
export async function renderPreviews(document: FreeformDocument): Promise<RenderPreview[]> {
  return withRenderPage(async (port) => {
    const output: RenderPageOutput = { format: 'png', scale: 1, quality: 0.92, long: false, grid: false }
    const { slides } = await renderInBrowser({ document, output }, port)
    return slides.map((slide) => ({ slideId: slide.slideId, name: slide.name, dataUrl: slide.previewDataUrl }))
  })
}

/** Shared plumbing: build check → loopback server → browser → files.
 * `order` pre-declares the expected pages (freeform, slideId-keyed); pass
 * null when the page count is only known after in-browser pagination
 * (markdown) — then the produced slides are written in their own order. */
async function runRender(
  payload: RenderPayload,
  order: Array<{ slideId: string; name: string }> | null,
  options: RenderOptions,
): Promise<RenderResult> {
  if (!options.outputDir || typeof options.outputDir !== 'string') {
    return { ok: false, error: '缺少 outputDir（PNG 输出目录）' }
  }

  let distDir: string
  try {
    distDir = await resolveFrontend()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  const server = await createStaticServer(distDir)
  try {
    const { slides: rendered, long } = await renderInBrowser(payload, server.port)
    if (rendered.length === 0) {
      return { ok: false, error: '没有可渲染的页面' }
    }
    const expected = order ?? rendered.map((slide) => ({
      slideId: slide.slideId,
      name: slide.name,
    }))
    let files: RenderFile[]
    if (options.format === 'pdf') files = [await writePdfFile(inOrder(rendered, expected), options)]
    else if (options.long && long) files = [await writeLongFile(inOrder(rendered, expected), long, options)]
    else if (options.grid) files = await writeGridFiles(inOrder(rendered, expected), options)
    else files = await writeResultFiles(rendered, expected, options)
    const previews = rendered.map((slide) => ({
      slideId: slide.slideId,
      name: slide.name,
      dataUrl: slide.previewDataUrl,
    }))
    return { ok: true, files, distDir, previews }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    await server.close().catch(() => undefined)
  }
}

export async function renderDocument(
  value: unknown,
  options: RenderOptions,
): Promise<RenderResult> {
  const document = normalizeFreeformDocument(value)
  if (!document) {
    return { ok: false, error: '文档未通过自由画布文档校验，已拒绝渲染' }
  }
  const selected = options.slideIds
    ? document.slides.filter((slide) => options.slideIds!.includes(slide.id))
    : document.slides
  if (selected.length === 0) {
    return { ok: false, error: '没有可渲染的页面（slideIds 过滤后为空或不匹配）' }
  }
  if (options.long && options.format === 'pdf') {
    return { ok: false, error: 'long（拼成长图）只用于 png / jpeg；PDF 本来就把每页放在同一个文件里' }
  }
  if (options.grid) {
    if (options.format === 'pdf' || options.long) return { ok: false, error: 'grid（切成九宫格）只用于 png / jpeg 的逐页图片，不能和 PDF 或长图一起用' }
    const uneven = selected.filter((slide) => !isGridPage(slide))
    if (uneven.length > 0) {
      return { ok: false, error: `九宫格只切正方形的页面：${uneven.map((slide) => `${slide.name}（${slide.width}×${slide.height}）`).join('、')} 不是正方形；用 slideIds 只选正方形的页，或先把页面改成正方形（如 3240×3240）` }
    }
  }
  const order = selected.map((slide) => ({ slideId: slide.id, name: slide.name }))
  const output = {
    // A PDF is assembled here from JPEG pages.
    format: options.format === 'jpeg' || options.format === 'pdf' ? 'jpeg' as const : 'png' as const,
    scale: options.scale === 2 ? 2 : 1,
    quality: options.quality ?? 0.92,
    long: options.long === true,
    grid: options.grid === true,
  }
  // Only the pages asked for, so a long image or PDF holds just those.
  const shown: FreeformDocument = { ...document, slides: selected, activeSlideId: selected[0].id }
  return runRender({ document: shown, output }, order, options)
}

export async function renderMarkdownDocument(
  value: unknown,
  options: Omit<RenderOptions, 'slideIds'>,
): Promise<RenderResult> {
  if (!isMarkdownDocument(value)) {
    return {
      ok: false,
      error: '文档未通过 Markdown 文档校验：需要 source、platformId、themeId、fontFamily、profile、radius',
    }
  }
  // Page count is only known after in-browser pagination: write whatever
  // pages the render page produced, in produced order.
  return runRender({ markdown: value }, null, options)
}
