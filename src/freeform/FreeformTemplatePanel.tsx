// The templates panel's list: each template's first page, grouped by size,
// the sizes in the active page's proportions first. A poster goes into the
// work in one click; a deck opens to its pages, to add one of them or all.
// Where they land (after the active page, or in its place while it is empty)
// is the workspace's call.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Measured } from '../app/DocumentPreview'
import { t } from '../i18n'
import { TEMPLATE_FORMATS, templateFormat, type TemplateFormat } from '../templates/formats'
import { FreeformTemplatePreview } from '../templates/TemplateGallery'
import type { TemplateDefinition } from '../templates/types'
import { ChevronLeftIcon } from '../ui/icons'
import { FreeformSlidePreview } from './FreeformSlidePreview'

interface FreeformTemplatePanelProps {
  templates: readonly TemplateDefinition[]
  /** The active page's size when the panel opens: templates drawn in its proportions come first. */
  pageSize: { width: number; height: number }
  /** How many more pages the work can take. */
  room: number
  /** Add these pages of the template (indexes into its pages). */
  onInsert: (template: TemplateDefinition, pages: readonly number[]) => void
}

function sameProportions(format: TemplateFormat, page: { width: number; height: number }): boolean {
  return page.height > 0 && Math.abs(format.width / format.height - page.width / page.height) < 0.01
}

export function FreeformTemplatePanel({ templates, pageSize, room, onInsert }: FreeformTemplatePanelProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  /** The deck whose pages were just closed: its tile takes the focus back. */
  const [closedId, setClosedId] = useState<string | null>(null)
  const open = templates.find((template) => template.id === openId)
  // The sizes in the active page's proportions first, as the page was when the panel opened:
  // adding a page of another size doesn't reshuffle the list under the pointer. (A stable sort.)
  const [formats] = useState(() => [...TEMPLATE_FORMATS].sort((a, b) => (
    Number(sameProportions(b, pageSize)) - Number(sameProportions(a, pageSize))
  )))

  useEffect(() => {
    if (openId || !closedId) return
    listRef.current?.querySelector<HTMLElement>(`[data-testid="freeform-template-tile-${CSS.escape(closedId)}"]`)?.focus()
    setClosedId(null)
  }, [openId, closedId])

  if (open) {
    return (
      <TemplatePages
        template={open}
        room={room}
        onInsert={onInsert}
        onBack={() => {
          setClosedId(open.id)
          setOpenId(null)
        }}
      />
    )
  }

  return (
    <div className="freeform-template-list" ref={listRef}>
      {formats.map((format) => {
        const group = templates.filter((template) => template.format === format.id)
        if (group.length === 0) return null
        // Landscape sizes take the whole row.
        const wide = format.width > format.height * 1.2
        return (
          <Fragment key={format.id}>
            <div className="freeform-drawer-section">{t(format.name)}</div>
            <div className="freeform-template-tiles">
              {group.map((template) => {
                const poster = template.kind === 'poster'
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`freeform-template-tile${wide ? ' is-wide' : ''}`}
                    data-testid={`freeform-template-tile-${template.id}`}
                    aria-label={t(poster ? '加入{title}' : '打开{title}', { title: t(template.title) })}
                    disabled={poster && room < 1}
                    onClick={() => (poster ? onInsert(template, [0]) : setOpenId(template.id))}
                  >
                    <Measured className="freeform-template-thumb" style={{ aspectRatio: `${format.width} / ${format.height}` }}>
                      {(width) => <FreeformTemplatePreview template={template} frame={{ width, height: Math.round((width * format.height) / format.width) }} />}
                    </Measured>
                    <span className="freeform-template-tile-title">{t(template.title)}</span>
                    <span className="freeform-template-tile-meta">
                      {poster ? t(format.ratio) : t('{n} 页', { n: template.pageCount })}
                    </span>
                  </button>
                )
              })}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

function TemplatePages({ template, room, onInsert, onBack }: {
  template: TemplateDefinition
  room: number
  onInsert: FreeformTemplatePanelProps['onInsert']
  onBack: () => void
}) {
  const backRef = useRef<HTMLButtonElement>(null)
  const slides = useMemo(() => template.createFreeform?.().slides ?? [], [template])
  const format = templateFormat(template.format)

  useEffect(() => {
    backRef.current?.focus()
  }, [])

  return (
    <div
      className="freeform-template-pages"
      data-testid="freeform-template-pages"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        // Back to the list first; the next Escape closes the panel.
        event.preventDefault()
        onBack()
      }}
    >
      <div className="freeform-template-pages-head">
        <button ref={backRef} className="icon-btn" type="button" aria-label={t('返回模板列表')} data-testid="freeform-template-back" onClick={onBack}>
          <ChevronLeftIcon />
        </button>
        <h3>{t(template.title)}</h3>
      </div>
      <button
        className="accent freeform-drawer-upload"
        type="button"
        data-testid="freeform-template-add-all"
        disabled={room < slides.length}
        onClick={() => onInsert(template, slides.map((_, index) => index))}
      >
        {t('加入全部 {n} 页', { n: slides.length })}
      </button>
      <div className="freeform-template-tiles">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            className="freeform-template-tile"
            data-testid={`freeform-template-page-${index + 1}`}
            aria-label={t('加入第 {n} 页', { n: index + 1 })}
            disabled={room < 1}
            onClick={() => onInsert(template, [index])}
          >
            <Measured className="freeform-template-thumb" style={{ aspectRatio: `${format.width} / ${format.height}` }}>
              {(width) => (
                <FreeformSlidePreview
                  slide={slide}
                  frameWidth={width}
                  frameHeight={Math.round((width * format.height) / format.width)}
                  className="template-freeform-preview"
                  artboardClassName="template-freeform-artboard"
                />
              )}
            </Measured>
            <span className="freeform-template-tile-title">{slide.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
