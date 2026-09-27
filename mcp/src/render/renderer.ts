// Headless renderer — document JSON in, PNG files on disk.
//
// Pipeline: validate → ensure the built render page exists (one `npm run
// build` at the repo root, output kept off stdout to protect the stdio MCP
// protocol) → serve dist/ on a loopback port → drive Chromium via
// playwright-core (system Chrome first, matching the e2e suites'
// zero-download setup — playwright-core never downloads browsers) →
// collect the PNG data URLs the render page produced → write files.
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
import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import { isMarkdownDocument } from '../../../src/drafts'
import { createStaticServer } from './staticServer'

const RENDER_TIMEOUT_MS = 120_000
const BUILD_TIMEOUT_MS = 5 * 60_000

export interface RenderFile {
  path: string
  slideId: string
  name: string
  width: number
  height: number
  bytes: number
}

export interface RenderSuccess {
  ok: true
  files: RenderFile[]
  distDir: string
}

export type RenderResult =
  | RenderSuccess
  | { ok: false; error: string }

export interface RenderOptions {
  outputDir: string
  baseName?: string
  slideIds?: string[]
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

function resolveDistDir(repoRoot: string): string {
  const override = process.env.DINGCARD_DIST_DIR?.trim()
  if (override) return path.resolve(override)
  return path.join(repoRoot, 'dist')
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

async function ensureRenderPage(repoRoot: string, distDir: string): Promise<void> {
  if (existsSync(path.join(distDir, 'render.html'))) return
  const override = process.env.DINGCARD_DIST_DIR?.trim()
  if (override) {
    throw new Error(
      `DINGCARD_DIST_DIR=${override} 下没有 render.html；请先在仓库根执行 npm run build，或去掉该环境变量`,
    )
  }
  await runFrontendBuild(repoRoot)
  if (!existsSync(path.join(distDir, 'render.html'))) {
    throw new Error('前端构建完成但仍未找到 dist/render.html')
  }
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
}

type RenderPayload = { document: unknown } | { markdown: unknown }

async function renderInBrowser(
  payload: RenderPayload,
  port: number,
): Promise<Array<RenderPageSlide>> {
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
    )) as { ok?: boolean; error?: string; slides?: Array<RenderPageSlide> }
    if (!raw || raw.ok !== true || !raw.slides) {
      throw new Error(raw?.error ?? '渲染页未返回结果')
    }
    return raw.slides
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const context = pageErrors.length > 0 ? `；页面错误：${pageErrors.slice(0, 3).join(' | ')}` : ''
    throw new Error(`${detail}${context}`)
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
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
    const fileName = `${baseName}-${String(index + 1).padStart(2, '0')}.png`
    const filePath = path.join(outputDir, fileName)
    const bytes = dataUrlToBuffer(produced.dataUrl)
    if (bytes.length === 0) {
      throw new Error(`页面 ${expected.slideId} 渲染出了空文件`)
    }
    await writeFile(filePath, bytes)
    files.push({
      path: filePath,
      slideId: expected.slideId,
      name: produced.name || expected.name,
      width: produced.width,
      height: produced.height,
      bytes: bytes.length,
    })
  }
  return files
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

  let repoRoot: string
  try {
    repoRoot = resolveRepoRoot()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  const distDir = resolveDistDir(repoRoot)
  try {
    await ensureRenderPage(repoRoot, distDir)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  const server = await createStaticServer(distDir)
  try {
    const rendered = await renderInBrowser(payload, server.port)
    if (rendered.length === 0) {
      return { ok: false, error: '没有可渲染的页面' }
    }
    const expected = order ?? rendered.map((slide) => ({
      slideId: slide.slideId,
      name: slide.name,
    }))
    const files = await writeResultFiles(rendered, expected, options)
    return { ok: true, files, distDir }
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
    return { ok: false, error: '文档未通过自由画布 v4 校验，已拒绝渲染' }
  }
  const selected = options.slideIds
    ? document.slides.filter((slide) => options.slideIds!.includes(slide.id))
    : document.slides
  if (selected.length === 0) {
    return { ok: false, error: '没有可渲染的页面（slideIds 过滤后为空或不匹配）' }
  }
  const order = selected.map((slide) => ({ slideId: slide.id, name: slide.name }))
  return runRender({ document }, order, options)
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
