import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '../Card'
import { FreeformSlidePreview } from '../freeform/FreeformSlidePreview'
import type { FreeformDocument } from '../freeform/types'
import { store } from '../storage'
import { markdownPage, previewStyle } from '../templates/previewModel'
import { buildConfig, DEFAULT_PROFILE, PLATFORMS, resolveTheme, type Profile } from '../theme'

export interface PreviewMarkdownDocument {
  source: string
  platformId: string
  themeId: string
  fontFamily: string
  radius: number
  profile?: Profile
  images?: Record<string, string>
}

export type PreviewSource =
  | { kind: 'markdown'; document: PreviewMarkdownDocument }
  | { kind: 'freeform'; document: FreeformDocument }

interface DocumentPreviewProps {
  source: PreviewSource
  /** Frame width in CSS px; the frame is 3:4 unless `height` is given. */
  width: number
  height?: number
  /** Which page to show: a manual-break section for Markdown, a slide for freeform. */
  page?: number
  className?: string
  /** Postpone rendering freeform scenes until the frame scrolls into view. */
  lazy?: boolean
}

/** Non-interactive page of a project or template, scaled into a frame. */
export function DocumentPreview({ source, width, height, page = 0, className, lazy = false }: DocumentPreviewProps) {
  const frameHeight = height ?? Math.round((width * 4) / 3)
  return source.kind === 'markdown'
    ? <MarkdownPreview document={source.document} page={page} width={width} height={frameHeight} className={className} />
    : <FreeformPreview document={source.document} page={page} width={width} height={frameHeight} className={className} lazy={lazy} />
}

function MarkdownPreview({
  document,
  page,
  width,
  height,
  className,
}: {
  document: PreviewMarkdownDocument
  page: number
  width: number
  height: number
  className?: string
}) {
  const content = useMemo(() => {
    // Drafts carry their images inline; register them so `img:` refs resolve.
    if (document.images) {
      for (const [ref, url] of Object.entries(document.images)) store.images.register(ref, url)
    }
    return markdownPage(document, page)
  }, [document, page])
  const platform = PLATFORMS.find((candidate) => candidate.id === document.platformId) ?? PLATFORMS[0]
  const config = buildConfig(platform, resolveTheme(document.themeId), document.fontFamily)
  const scale = Math.min(width / config.width, height / config.height)

  return (
    <div
      className={['doc-preview', 'doc-preview-md', className].filter(Boolean).join(' ')}
      style={{ width, height, ...previewStyle(scale, document.radius, config) }}
      aria-hidden="true"
    >
      <Card
        html={content.html}
        config={config}
        profile={document.profile ?? DEFAULT_PROFILE}
        pageIndex={page}
        pageCount={Math.max(page + 1, content.pageCount)}
        pageRole={content.role}
        showHeader={page === 0 || !(document.profile ?? DEFAULT_PROFILE).headerFirstPageOnly}
      />
    </div>
  )
}

function FreeformPreview({
  document,
  page,
  width,
  height,
  className,
  lazy,
}: {
  document: FreeformDocument
  page: number
  width: number
  height: number
  className?: string
  lazy: boolean
}) {
  const slide = document.slides[Math.min(page, document.slides.length - 1)]
  const classes = ['doc-preview', 'doc-preview-ff', className].filter(Boolean).join(' ')
  if (!slide) return <div className={classes} style={{ width, height }} />
  return (
    <div className={classes} style={{ width, height }} aria-hidden="true">
      <FreeformSlidePreview slide={slide} frameWidth={width} frameHeight={height} deferOffscreen={lazy} />
    </div>
  )
}

/** Renders `children(width)` once the container has a measurable width. */
export function Measured({ className, style, children }: { className?: string; style?: React.CSSProperties; children: (width: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setWidth(Math.floor(element.getBoundingClientRect().width))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} className={className} style={style}>
      {width > 0 ? children(width) : null}
    </div>
  )
}
