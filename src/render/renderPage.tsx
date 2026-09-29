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
// Both paths write PNG data URLs back:
//
//   window.__DINGCARD_RENDER_RESULT__ =
//     | { ok: true; slides: Array<{ slideId; name; width; height; dataUrl }> }
//     | { ok: false; error: string }

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { toBlob, toPng } from 'html-to-image'
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
}

interface RenderedSlide {
  slideId: string
  name: string
  width: number
  height: number
  dataUrl: string
}

export type RenderResult =
  | { ok: true; slides: RenderedSlide[] }
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

function RenderApp({ document: doc }: { document: FreeformDocument }) {
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
          slides.push({
            slideId: current.id,
            name: current.name,
            width: current.width,
            height: current.height,
            dataUrl: await blobToDataUrl(blob),
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
  }, [doc])

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
    createRoot(document.getElementById('root')!).render(<RenderApp document={doc} />)
  }
}
