// Headless render entry — the automation counterpart of the editor's export.
//
// A driver (Playwright, via the dingcard-mcp package) injects a payload
// BEFORE this module runs:
//
//   window.__DINGCARD_RENDER__ = { document: <FreeformDocument JSON> }
//     → renders every slide through the same artboard markup and export
//       pipeline the freeform editor uses (presentation-only scene nodes,
//       framed-image readiness wait, character-subset font embedding,
//       html-to-image toBlob at pixelRatio 1).
//
//   window.__DINGCARD_RENDER__ = { markdown: <MarkdownCardDocument JSON> }
//     → renders the markdown workspace's card pipeline: register embedded
//       images, parseBlocks, DOM-measured pagination, per-page Card with the
//       platform chrome, html-to-image toPng at pixelRatio 3 — identical to
//       the workspace's own export.
//
// Both paths write PNG data URLs back, each with a small JPEG preview a
// client can show to the model that made the document:
//
//   window.__DINGCARD_RENDER_RESULT__ =
//     | { ok: true; slides: Array<{ slideId; name; width; height; dataUrl; previewDataUrl }> }
//     | { ok: false; error: string }
//
//   window.__DINGCARD_RENDER__ = { document, inspect: true }
//     → mounts every slide the same way but exports nothing: it measures the
//       laid-out page instead (each node's box, each text's lines, whether
//       the words overflow their box and the size at which they would fit,
//       where each path's drawing lands in its box, and on a picture
//       background the colour behind each text) and writes
//       { ok: true; inspected: InspectedSlide[] }.

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { toBlob, toPng } from 'html-to-image'
import { FreeformPageBackground } from '../freeform/FreeformPageBackground'
import { FreeformSceneNodeView } from '../freeform/FreeformSceneNodeView'
import { waitForFramedImages } from '../freeform/imageReadiness'
import { buildFreeformFontCSS, collectFreeformFontRequests } from '../freeform/fontRequests'
import { normalizeFreeformDocument } from '../freeform/sceneDocument'
import { slideBackgroundToCss } from '../freeform/paint'
import type { FreeformDocument } from '../freeform/types'
import { isMarkdownDocument, type MarkdownCardDocument } from '../drafts'
import { parseBlocks } from '../markdown'
import { paginate, type Page } from '../paginate'
import { Card } from '../Card'
import { buildFontEmbedCSS } from '../fontEmbed'
import { PLATFORMS, buildConfig, resolveTheme } from '../theme'
import { store } from '../storage'
import '../styles.css'

interface RenderPayload {
  document?: unknown
  markdown?: unknown
  inspect?: boolean
}

interface RenderedSlide {
  slideId: string
  name: string
  width: number
  height: number
  dataUrl: string
  previewDataUrl: string
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** One slide as laid out: every node's box and every text's measured words. */
export interface InspectedSlide {
  slideId: string
  /** Boxes in page pixels, rotation included (the axis-aligned bounds). */
  nodes: Array<{ nodeId: string; rect: Rect }>
  texts: Array<{
    nodeId: string
    /** How far the words run past the box, down and across. */
    overflowY: number
    overflowX: number
    /** The largest whole font size at which they fit; null when they already do. */
    fitFontSize: number | null
    /** The visible lines (clipped to the box), or null for an empty text. */
    area: Rect | null
  }>
  /** Each path's drawing (its geometry, stroke left out) in its own box's pixels. */
  paths: Array<{ nodeId: string; bounds: Rect }>
  /** On a picture background: the picture's average colour behind each text's lines. */
  backdrops: Array<{ nodeId: string; color: string }>
  /** Pictures that didn't load. */
  imageError: string | null
}

export type RenderResult =
  | { ok: true; slides: RenderedSlide[] }
  | { ok: true; inspected: InspectedSlide[] }
  | { ok: false; error: string }

const EXPORT_IMAGE_WAIT_MS = 3_500

declare global {
  interface Window {
    __DINGCARD_RENDER__?: RenderPayload
    __DINGCARD_RENDER_RESULT__?: RenderResult
  }
}

function writeResult(result: RenderResult): void {
  window.__DINGCARD_RENDER_RESULT__ = result
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('blob read failed'))
    reader.readAsDataURL(blob)
  })
}

const PREVIEW_WIDTH = 432

/** A small JPEG of an exported page, for a client to show its model. */
async function previewOf(dataUrl: string, width: number, height: number): Promise<string> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = PREVIEW_WIDTH
  canvas.height = Math.max(1, Math.round((height / width) * PREVIEW_WIDTH))
  const context = canvas.getContext('2d')
  if (!context) return dataUrl
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.82)
}

function relativeRect(rect: DOMRect, origin: DOMRect): Rect {
  return {
    x: Math.round(rect.left - origin.left),
    y: Math.round(rect.top - origin.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

/** Measure the mounted slide: node boxes, text overflow, and the size each overflowing text would fit at. */
function inspectArtboard(artboard: HTMLElement, slideId: string, imageError: string | null): InspectedSlide {
  const origin = artboard.getBoundingClientRect()
  const nodes: InspectedSlide['nodes'] = []
  const texts: InspectedSlide['texts'] = []
  const paths: InspectedSlide['paths'] = []
  for (const element of Array.from(artboard.querySelectorAll<HTMLElement>('[data-preview-node-id]'))) {
    const nodeId = element.dataset.previewNodeId!
    nodes.push({ nodeId, rect: relativeRect(element.getBoundingClientRect(), origin) })
    // The path is drawn in box pixels, so its own bounding box is box-relative.
    const drawing = element.querySelector<SVGPathElement>(':scope > .freeform-preview-path > path')
    if (drawing) {
      const bounds = drawing.getBBox()
      const round = (value: number) => Math.round(value * 10) / 10
      paths.push({
        nodeId,
        bounds: { x: round(bounds.x), y: round(bounds.y), width: round(bounds.width), height: round(bounds.height) },
      })
      continue
    }
    const box = element.querySelector<HTMLElement>(':scope > .freeform-preview-textbox')
    if (!box) continue
    const overflowY = Math.max(0, box.scrollHeight - box.clientHeight)
    const overflowX = Math.max(0, box.scrollWidth - box.clientWidth)
    let fitFontSize: number | null = null
    if (overflowY > 1 || overflowX > 1) {
      const original = box.style.fontSize
      const start = Math.floor(Number.parseFloat(getComputedStyle(box).fontSize))
      for (let size = start - 1; size >= 8; size -= 1) {
        box.style.fontSize = `${size}px`
        if (box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1) {
          fitFontSize = size
          break
        }
      }
      box.style.fontSize = original
    }
    const clip = box.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(box)
    const lines = Array.from(range.getClientRects())
      .map((rect) => ({
        left: Math.max(rect.left, clip.left),
        top: Math.max(rect.top, clip.top),
        right: Math.min(rect.right, clip.right),
        bottom: Math.min(rect.bottom, clip.bottom),
      }))
      .filter((rect) => rect.right > rect.left && rect.bottom > rect.top)
    const area = lines.length === 0 ? null : relativeRect(new DOMRect(
      Math.min(...lines.map((rect) => rect.left)),
      Math.min(...lines.map((rect) => rect.top)),
      Math.max(...lines.map((rect) => rect.right)) - Math.min(...lines.map((rect) => rect.left)),
      Math.max(...lines.map((rect) => rect.bottom)) - Math.min(...lines.map((rect) => rect.top)),
    ), origin)
    texts.push({ nodeId, overflowY, overflowX, fitFontSize, area })
  }
  return { slideId, nodes, texts, paths, backdrops: pictureBackdrops(artboard, origin, texts), imageError }
}

/** Sample the page's picture background (alone, at a quarter size) under each text's lines. */
function pictureBackdrops(
  artboard: HTMLElement,
  origin: DOMRect,
  texts: InspectedSlide['texts'],
): InspectedSlide['backdrops'] {
  const picture = artboard.querySelector<HTMLImageElement>('.freeform-page-background img')
  if (!picture || !picture.complete || picture.naturalWidth === 0) return []
  const scale = 0.25
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(origin.width * scale))
  canvas.height = Math.max(1, Math.round(origin.height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  const placed = picture.getBoundingClientRect()
  context.drawImage(
    picture,
    (placed.left - origin.left) * scale,
    (placed.top - origin.top) * scale,
    placed.width * scale,
    placed.height * scale,
  )
  const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0')
  const backdrops: InspectedSlide['backdrops'] = []
  for (const text of texts) {
    if (!text.area) continue
    const x = Math.max(0, Math.floor(text.area.x * scale))
    const y = Math.max(0, Math.floor(text.area.y * scale))
    const width = Math.min(canvas.width - x, Math.max(1, Math.ceil(text.area.width * scale)))
    const height = Math.min(canvas.height - y, Math.max(1, Math.ceil(text.area.height * scale)))
    if (width <= 0 || height <= 0) continue
    let data: Uint8ClampedArray
    try {
      data = context.getImageData(x, y, width, height).data
    } catch {
      // A picture from another site without CORS can't be read back.
      return []
    }
    let red = 0
    let green = 0
    let blue = 0
    let weight = 0
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] / 255
      red += data[index] * alpha
      green += data[index + 1] * alpha
      blue += data[index + 2] * alpha
      weight += alpha
    }
    // Fully see-through here (a contained picture's margins): nothing to judge against.
    if (weight < (data.length / 4) * 0.5) continue
    backdrops.push({ nodeId: text.nodeId, color: `#${hex(red / weight)}${hex(green / weight)}${hex(blue / weight)}` })
  }
  return backdrops
}

function waitForDoubleFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

/**
 * Best-effort wait for plain markdown card images. The workspace export does
 * not wait at all (the preview has already loaded them); here we wait up to
 * the timeout, then export whatever state the images are in — matching the
 * UI rather than failing a document the UI would export.
 */
function waitForCardImages(root: HTMLElement, timeoutMs: number): Promise<void> {
  const deadline = performance.now() + timeoutMs
  const tick = (resolve: () => void): void => {
    const images = Array.from(root.querySelectorAll('img'))
    if (images.every((img) => img.complete) || performance.now() >= deadline) {
      resolve()
      return
    }
    setTimeout(() => tick(resolve), 50)
  }
  return new Promise(tick)
}

function RenderApp({ document: doc, inspect }: { document: FreeformDocument; inspect: boolean }) {
  const [index, setIndex] = useState(0)
  const artboardRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  const slide = doc.slides[Math.min(index, doc.slides.length - 1)]

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    void (async () => {
      try {
        const fontCSS = await buildFreeformFontCSS(collectFreeformFontRequests(doc.slides))
        if (inspect) {
          // Lay the words out in the fonts the export embeds.
          const style = document.createElement('style')
          style.textContent = fontCSS
          document.head.appendChild(style)
          await document.fonts.ready
          const inspected: InspectedSlide[] = []
          for (let i = 0; i < doc.slides.length; i++) {
            setIndex(i)
            await waitForDoubleFrame()
            const artboard = artboardRef.current
            if (!artboard) throw new Error('render artboard missing')
            const imageWait = await waitForFramedImages(artboard, { timeoutMs: EXPORT_IMAGE_WAIT_MS })
            await waitForDoubleFrame()
            inspected.push(inspectArtboard(
              artboard,
              doc.slides[i].id,
              imageWait.ok ? null : imageWait.reason === 'timeout' ? '图片加载超时' : '图片加载失败',
            ))
          }
          writeResult({ ok: true, inspected })
          return
        }
        const slides: RenderedSlide[] = []
        // Sequential slide rendering, mirroring the editor's ZIP export: one
        // artboard, one slide mounted at a time, one blob per slide.
        for (let i = 0; i < doc.slides.length; i++) {
          setIndex(i)
          const current = doc.slides[i]
          // Let React commit the slide before waiting on its images.
          await waitForDoubleFrame()
          const artboard = artboardRef.current
          if (!artboard) throw new Error('render artboard missing')
          const imageWait = await waitForFramedImages(artboard, {
            timeoutMs: EXPORT_IMAGE_WAIT_MS,
          })
          if (!imageWait.ok) {
            throw new Error(imageWait.reason === 'timeout'
              ? '图片加载超时，渲染已取消'
              : '图片加载失败，渲染已取消')
          }
          await waitForDoubleFrame()
          const blob = await toBlob(artboard, {
            pixelRatio: 1,
            width: current.width,
            height: current.height,
            fontEmbedCSS: fontCSS,
          })
          if (!blob) throw new Error('页面导出失败')
          const dataUrl = await blobToDataUrl(blob)
          slides.push({
            slideId: current.id,
            name: current.name,
            width: current.width,
            height: current.height,
            dataUrl,
            previewDataUrl: await previewOf(dataUrl, current.width, current.height),
          })
        }
        writeResult({ ok: true, slides })
      } catch (error) {
        writeResult({
          ok: false,
          error: error instanceof Error && error.message.trim()
            ? error.message
            : '渲染失败',
        })
      }
    })()
  }, [doc, inspect])

  return (
    <div
      className="dingcard-render-stage"
      style={{ position: 'relative', margin: 0, padding: 0 }}
    >
      <div
        ref={artboardRef}
        className="freeform-artboard"
        style={{
          width: slide.width,
          height: slide.height,
          background: slideBackgroundToCss(slide.background),
        }}
      >
        <div className="freeform-artwork-clip">
          <FreeformPageBackground slide={slide} presentationOnly />
          <FreeformSceneNodeView
            nodes={slide.nodes}
            slideId={slide.id}
            presentationOnly
            activeParentPath={[]}
            selectedPaths={[]}
            onNodePointerDown={() => undefined}
            onNodeDoubleClick={() => undefined}
            onTextChange={() => undefined}
            onTextFocus={() => undefined}
          />
        </div>
      </div>
    </div>
  )
}

function MarkdownRenderApp({ markdown }: { markdown: MarkdownCardDocument }) {
  const [pages, setPages] = useState<Page[] | null>(null)
  const [index, setIndex] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  const platform = PLATFORMS.find((candidate) => candidate.id === markdown.platformId) ?? PLATFORMS[0]
  const theme = resolveTheme(markdown.themeId)
  const config = buildConfig(platform, theme, markdown.fontFamily)
  // Same CSS variable set the workspace mounts around the Card, so the Card
  // renders with identical dimensions, colors, typography, and radius.
  const cssVars = {
    '--card-w': `${config.width}px`,
    '--card-h': `${config.height}px`,
    '--card-pad': `${config.padding}px`,
    '--card-bg': config.background,
    '--card-fg': config.color,
    '--card-accent': config.accent,
    '--card-font': config.fontFamily,
    '--card-fs': `${config.fontSize}px`,
    '--card-lh': String(config.lineHeight),
    '--card-gap': `${config.blockGap}px`,
    '--card-radius': `${markdown.radius}px`,
  } as CSSProperties

  // Images must be registered (img:<id> → data URL) BEFORE parseBlocks: the
  // marked image renderer resolves refs while producing block HTML. And
  // paginate() measures real DOM nodes, so it runs after React commits —
  // never during render (same rule the workspace follows).
  useEffect(() => {
    if (markdown.images) {
      for (const [ref, url] of Object.entries(markdown.images)) {
        store.images.register(ref, url)
      }
    }
    const blocks = parseBlocks(markdown.source)
    setPages(paginate(blocks, config, markdown.profile.headerFirstPageOnly))
  }, [markdown, config])

  const page = pages ? pages[Math.min(index, pages.length - 1)] : null

  useEffect(() => {
    if (startedRef.current || pages === null) return
    startedRef.current = true

    void (async () => {
      try {
        let fontCSS: string | undefined
        try {
          fontCSS = await buildFontEmbedCSS(markdown.source, markdown.fontFamily)
        } catch {
          fontCSS = undefined // fall back to no explicit embed rather than failing
        }
        const slides: RenderedSlide[] = []
        for (let i = 0; i < pages.length; i++) {
          setIndex(i)
          await waitForDoubleFrame()
          const card = cardRef.current
          if (!card) throw new Error('render card missing')
          await waitForCardImages(card, EXPORT_IMAGE_WAIT_MS)
          const dataUrl = await toPng(card, {
            pixelRatio: 3,
            width: config.width,
            height: config.height,
            fontEmbedCSS: fontCSS,
            // Keep the in-preview drag handles out of the exported PNG.
            filter: (element) =>
              !(element instanceof HTMLElement && element.classList.contains('img-handle')),
          })
          if (!dataUrl) throw new Error('页面导出失败')
          slides.push({
            slideId: `page-${i + 1}`,
            name: `第 ${i + 1} 页`,
            width: config.width * 3,
            height: config.height * 3,
            dataUrl,
            previewDataUrl: await previewOf(dataUrl, config.width, config.height),
          })
        }
        writeResult({ ok: true, slides })
      } catch (error) {
        writeResult({
          ok: false,
          error: error instanceof Error && error.message.trim()
            ? error.message
            : '渲染失败',
        })
      }
    })()
  }, [markdown, pages, config])

  return (
    <div
      className="dingcard-render-stage"
      style={{ position: 'relative', margin: 0, padding: 0, ...cssVars }}
    >
      {page && (
        <Card
          ref={cardRef}
          config={config}
          profile={markdown.profile}
          pageIndex={Math.min(index, pages!.length - 1)}
          pageCount={pages!.length}
          pageRole={page.role}
          showHeader={!markdown.profile.headerFirstPageOnly || index === 0}
          html={page.blocks.map((block) => block.html).join('')}
        />
      )}
    </div>
  )
}

const payload = window.__DINGCARD_RENDER__

if (!payload || typeof payload !== 'object') {
  writeResult({ ok: false, error: '缺少渲染数据（window.__DINGCARD_RENDER__）' })
} else if (payload.markdown !== undefined) {
  const markdown = isMarkdownDocument(payload.markdown)
    ? payload.markdown
    : null
  if (!markdown) {
    writeResult({ ok: false, error: '文档未通过 Markdown 文档校验（缺少 source/platformId/themeId/fontFamily/profile/radius）' })
  } else {
    createRoot(document.getElementById('root')!).render(
      <MarkdownRenderApp markdown={markdown} />,
    )
  }
} else {
  const doc = normalizeFreeformDocument(payload.document)
  if (!doc) {
    writeResult({ ok: false, error: '文档未通过自由画布文档校验' })
  } else {
    createRoot(document.getElementById('root')!).render(<RenderApp document={doc} inspect={payload.inspect === true} />)
  }
}
