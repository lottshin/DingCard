// The HTML import on the headless render page (see renderPage.tsx): lays the
// HTML out in a sandboxed frame with the editor's web fonts, reads it back as
// a freeform document (freeform/htmlImport.ts) and checks the result the way
// every document is checked.

import { toPng } from 'html-to-image'
import { importHtmlDocument, prepareHtmlDocument, settleLayout, type HtmlImportNote, type RasterRequest } from '../freeform/htmlImport'
import { normalizeFreeformDocument } from '../freeform/sceneDocument'
import type { FreeformDocument } from '../freeform/types'

export interface HtmlImportPayload {
  source: string
  /** The size of a page the HTML doesn't size, and what 100vw × 100vh mean (default 1080 × 1440). */
  width?: number
  height?: number
}

export type HtmlImportOutcome =
  | { ok: true; document: FreeformDocument; notes: HtmlImportNote[] }
  | { ok: false; error: string }

const LOAD_TIMEOUT_MS = 30_000

function pageSize(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(128, Math.min(4096, Math.round(value))) : fallback
}

/** The HTML as the frame gets it: no scripts or handlers, every picture loading now, our web fonts linked. */
function frameSource(source: string): string {
  const parsed = new DOMParser().parseFromString(source, 'text/html')
  for (const element of Array.from(parsed.querySelectorAll('script, noscript, base'))) element.remove()
  for (const element of Array.from(parsed.querySelectorAll('*'))) {
    element.removeAttribute('loading')
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name)
    }
  }
  const charset = parsed.createElement('meta')
  charset.setAttribute('charset', 'utf-8')
  parsed.head.prepend(charset)
  const fonts = document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com"]')
  if (fonts) charset.after(fonts.cloneNode(true))
  return `<!doctype html>${parsed.documentElement.outerHTML}`
}

/** A background layer drawn by the browser into a picture. */
async function rasterize(request: RasterRequest): Promise<string | null> {
  const box = document.createElement('div')
  box.style.cssText = `position:fixed;left:0;top:0;width:${request.width}px;height:${request.height}px;pointer-events:none;`
  box.style.backgroundImage = request.backgroundImage
  box.style.backgroundSize = request.backgroundSize
  box.style.backgroundPosition = request.backgroundPosition
  box.style.backgroundRepeat = request.backgroundRepeat
  document.body.append(box)
  try {
    // A smooth gradient over the whole box keeps at half the pixels; patterns keep every one.
    const [tileWidth = 0, tileHeight = 0] = request.backgroundSize.split(/\s+/).map((part) => Number.parseFloat(part))
    const smooth = !/repeating|url\(/.test(request.backgroundImage)
      && tileWidth >= request.width - 1 && tileHeight >= request.height - 1
    return await toPng(box, { width: request.width, height: request.height, pixelRatio: smooth ? 0.5 : 1 })
  } catch {
    return null
  } finally {
    box.remove()
  }
}

/** Why a document failed the check: the first node that fails on its own. */
function firstInvalidNode(document: FreeformDocument): string {
  for (const slide of document.slides) {
    for (const node of slide.nodes) {
      const alone = { ...document, slides: [{ ...slide, nodes: [node] }], activeSlideId: slide.id }
      if (!normalizeFreeformDocument(alone)) return JSON.stringify(node).slice(0, 600)
    }
    const empty = { ...document, slides: [{ ...slide, nodes: [] }], activeSlideId: slide.id }
    if (!normalizeFreeformDocument(empty)) return JSON.stringify({ ...slide, nodes: undefined }).slice(0, 600)
  }
  return ''
}

export async function runHtmlImport(payload: HtmlImportPayload): Promise<HtmlImportOutcome> {
  if (!payload || typeof payload.source !== 'string' || !payload.source.trim()) return { ok: false, error: '缺少 HTML' }
  const width = pageSize(payload.width, 1080)
  const height = pageSize(payload.height, 1440)
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:0;opacity:0;pointer-events:none;`
  const loaded = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('HTML 加载超时（图片或字体 30 秒内没有加载完）')), LOAD_TIMEOUT_MS)
    frame.onload = () => {
      window.clearTimeout(timer)
      resolve()
    }
  })
  frame.srcdoc = frameSource(payload.source)
  document.body.append(frame)
  try {
    await loaded
    const doc = frame.contentDocument
    if (!doc?.body) return { ok: false, error: 'HTML 没有 body' }
    const prepared = await prepareHtmlDocument(doc)
    await settleLayout(doc)
    const imported = await importHtmlDocument(doc, prepared, { width, height, rasterize })
    const checked = normalizeFreeformDocument(imported.document)
    if (!checked) {
      return { ok: false, error: `转换结果没有通过文档校验，请把这段 HTML 反馈给我们。出问题的节点：${firstInvalidNode(imported.document)}` }
    }
    return { ok: true, document: checked, notes: imported.notes }
  } finally {
    frame.remove()
  }
}
