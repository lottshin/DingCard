// The pieces of the template center: a tile at the template's own
// proportions, a masonry of tiles (each into the shortest column, so the
// order still reads left to right), and the preview a tile opens, with every
// page, what the template is, and templates like it.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { t } from '../i18n'
import { loadFavoriteTemplateIds, saveFavoriteTemplateIds, toggleFavoriteTemplateId } from '../templates/favorites'
import { colorName, similarTemplates, styleName, useName } from '../templates/finder'
import { templateFormat } from '../templates/formats'
import { TEMPLATE_COLORS, templateFacets, type TemplateStyleId, type TemplateUseId } from '../templates/taxonomy'
import type { TemplateDefinition } from '../templates/types'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '../ui/icons'
import { DocumentPreview, Measured } from './DocumentPreview'
import { templatePreviewSource } from './LoginPage'

/** The heart-shortlist, kept per browser (favorites.ts). */
export function useFavoriteTemplates(): [ReadonlySet<string>, (id: string) => void] {
  const [ids, setIds] = useState<string[]>(() => loadFavoriteTemplateIds())
  const set = useMemo(() => new Set(ids), [ids])
  const toggle = (id: string) => setIds((current) => {
    const next = toggleFavoriteTemplateId(current, id)
    saveFavoriteTemplateIds(next)
    return next
  })
  return [set, toggle]
}

function HeartButton({ template, on, onToggle, className }: { template: TemplateDefinition; on: boolean; onToggle: () => void; className: string }) {
  const title = t(template.title)
  return (
    <button
      className={on ? `${className} on` : className}
      type="button"
      aria-pressed={on}
      aria-label={on ? t('取消收藏{title}', { title }) : t('收藏{title}', { title })}
      data-testid={`template-favorite-${template.id}`}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 17s-6.3-3.9-8.2-7.2C.5 7.4 2 4 5.2 4c2 0 3.4 1.1 4.8 2.9C11.4 5.1 12.8 4 14.8 4 18 4 19.5 7.4 18.2 9.8 16.3 13.1 10 17 10 17Z" />
      </svg>
    </button>
  )
}

/** "9:16" for a poster, "4 页" for a set of pages. */
function templateMeta(template: TemplateDefinition): string {
  return template.kind === 'poster' ? t(templateFormat(template.format).ratio) : t('{n} 页', { n: template.pageCount })
}

interface TileProps {
  template: TemplateDefinition
  width: number
  favorited: boolean
  onToggleFavorite: (id: string) => void
  onPreview: (template: TemplateDefinition) => void
  onUse: (template: TemplateDefinition) => void
}

export function TemplateTile({ template, width, favorited, onToggleFavorite, onPreview, onUse }: TileProps) {
  const source = useMemo(() => templatePreviewSource(template), [template])
  const size = templateFormat(template.format)
  const frame = { width: Math.round(width), height: Math.round((width * size.height) / size.width) }
  const title = t(template.title)
  const system = template.workspace === 'markdown' ? 'md' : 'ff'

  return (
    <article className={template.pageCount > 1 ? 'tpl-tile is-pages' : 'tpl-tile'} data-testid="template-card" data-template-id={template.id}>
      <div className="tpl-tile-media" style={{ height: frame.height }}>
        <button className="tpl-tile-open" type="button" aria-label={t('预览{title}', { title })} onClick={() => onPreview(template)}>
          {source && <DocumentPreview source={source} width={frame.width} height={frame.height} lazy />}
        </button>
        <button className="tpl-tile-use" type="button" aria-label={t('用「{title}」新建项目', { title })} onClick={() => onUse(template)}>
          {t('使用')}
        </button>
        <HeartButton className="tpl-tile-heart" template={template} on={favorited} onToggle={() => onToggleFavorite(template.id)} />
      </div>
      <div className="tpl-tile-info">
        <h3>{title}</h3>
        <span className="tpl-tile-meta tnum">
          <span className={`sys-dot ${system}`} aria-hidden="true" />
          {templateMeta(template)}
        </span>
      </div>
    </article>
  )
}

/** Tiles in columns of at least `minColumn` px, each one into the shortest column. */
export function TemplateMasonry({ templates, minColumn = 188, gap = 20, children }: {
  templates: readonly TemplateDefinition[]
  minColumn?: number
  gap?: number
  children: (template: TemplateDefinition, width: number) => ReactNode
}) {
  return (
    <Measured className="tpl-masonry">
      {(width) => {
        const count = Math.max(2, Math.floor((width + gap) / (minColumn + gap)))
        const columnWidth = (width - gap * (count - 1)) / count
        const columns = Array.from({ length: count }, () => ({ height: 0, items: [] as TemplateDefinition[] }))
        for (const template of templates) {
          const size = templateFormat(template.format)
          const shortest = columns.reduce((best, column) => (column.height < best.height - 0.5 ? column : best), columns[0])
          shortest.items.push(template)
          shortest.height += (columnWidth * size.height) / size.width + 56 + gap
        }
        return (
          <div className="tpl-masonry-columns" style={{ gap, gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
            {columns.map((column, index) => (
              <div key={index} className="tpl-masonry-column" style={{ gap }}>
                {column.items.map((template) => children(template, columnWidth))}
              </div>
            ))}
          </div>
        )
      }}
    </Measured>
  )
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
}

interface PreviewProps {
  template: TemplateDefinition
  /** The templates the preview steps through with the arrows, in the gallery's order. */
  list: readonly TemplateDefinition[]
  /** Where similar templates come from. */
  pool: readonly TemplateDefinition[]
  favorites: ReadonlySet<string>
  onToggleFavorite: (id: string) => void
  onShow: (template: TemplateDefinition) => void
  onUse: (template: TemplateDefinition) => void
  onFilterUse: (use: TemplateUseId) => void
  onFilterStyle: (style: TemplateStyleId) => void
  onClose: () => void
}

/** A template up close: its pages, its size and kind, and others like it. */
export function TemplatePreviewDialog({ template, list, pool, favorites, onToggleFavorite, onShow, onUse, onFilterUse, onFilterStyle, onClose }: PreviewProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [page, setPage] = useState(0)
  const source = useMemo(() => templatePreviewSource(template), [template])
  const size = templateFormat(template.format)
  const facets = templateFacets(template)
  const similar = useMemo(() => similarTemplates(template, pool, 6), [template, pool])
  const index = list.findIndex((entry) => entry.id === template.id)
  const previous = index > 0 ? list[index - 1] : null
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null
  const title = t(template.title)
  // The page as large as the stage allows, at the template's proportions.
  const scale = Math.min(520 / size.width, 520 / size.height, (typeof window === 'undefined' ? 900 : window.innerHeight * 0.62) / size.height)
  const frame = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }
  const thumb = { width: Math.round((64 * size.width) / Math.max(size.width, size.height)), height: Math.round((64 * size.height) / Math.max(size.width, size.height)) }
  const latest = useRef({ previous, next, onShow, onClose })
  latest.current = { previous, next, onShow, onClose }

  useEffect(() => setPage(0), [template])

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frameId = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('.tpl-preview-use')?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        latest.current.onClose()
      } else if (event.key === 'ArrowLeft' && latest.current.previous && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault()
        latest.current.onShow(latest.current.previous)
      } else if (event.key === 'ArrowRight' && latest.current.next && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault()
        latest.current.onShow(latest.current.next)
      } else if (event.key === 'Tab') {
        const items = focusables(dialog)
        if (items.length === 0) return
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault()
          items[items.length - 1].focus()
        } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
          event.preventDefault()
          items[0].focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('keydown', onKeyDown, true)
      returnFocusRef.current?.focus()
    }
  }, [])

  return (
    <div
      className="tpl-preview-backdrop"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onClose()
      }}
    >
      <div ref={dialogRef} className="tpl-preview" role="dialog" aria-modal="true" aria-labelledby="tpl-preview-title" data-testid="template-preview">
        <button className="icon-btn tpl-preview-close" type="button" aria-label={t('关闭')} onClick={onClose}><CloseIcon /></button>
        <div className="tpl-preview-main">
          <div className="tpl-preview-stage">
            <button className="icon-btn tpl-preview-step" type="button" aria-label={t('上一个模板')} disabled={!previous} onClick={() => previous && onShow(previous)}><ChevronLeftIcon /></button>
            <div className="tpl-preview-page" style={{ width: frame.width, height: frame.height }}>
              {source && <DocumentPreview source={source} page={page} width={frame.width} height={frame.height} />}
            </div>
            <button className="icon-btn tpl-preview-step" type="button" aria-label={t('下一个模板')} disabled={!next} onClick={() => next && onShow(next)}><ChevronRightIcon /></button>
          </div>
          {template.pageCount > 1 && source && (
            <div className="tpl-preview-pages" role="group" aria-label={t('模板页面')}>
              {Array.from({ length: template.pageCount }, (_, pageIndex) => (
                <button
                  key={pageIndex}
                  type="button"
                  className="tpl-preview-thumb"
                  aria-label={t('第 {n} 页', { n: pageIndex + 1 })}
                  aria-pressed={page === pageIndex}
                  onClick={() => setPage(pageIndex)}
                >
                  <DocumentPreview source={source} page={pageIndex} width={thumb.width} height={thumb.height} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="tpl-preview-side">
          <div className="tpl-preview-uses">
            {facets.uses.map((use) => (
              <button key={use} type="button" className="tpl-preview-link" onClick={() => onFilterUse(use)}>{t(useName(use))}</button>
            ))}
          </div>
          <h2 id="tpl-preview-title">{title}</h2>
          <p className="tpl-preview-desc">{t(template.description)}</p>
          <dl className="tpl-preview-specs">
            <div><dt>{t('尺寸')}</dt><dd className="tnum">{t(size.name)} · {size.width}×{size.height}</dd></div>
            <div><dt>{t('页数')}</dt><dd className="tnum">{t('{n} 页', { n: template.pageCount })}</dd></div>
            <div><dt>{t('编辑方式')}</dt><dd>{template.workspace === 'markdown' ? t('Markdown 卡片') : t('自由编辑')}</dd></div>
            <div>
              <dt>{t('风格')}</dt>
              <dd className="tpl-preview-chips">
                {facets.styles.map((style) => (
                  <button key={style} type="button" className="chip" onClick={() => onFilterStyle(style)}>{t(styleName(style))}</button>
                ))}
              </dd>
            </div>
            <div>
              <dt>{t('颜色')}</dt>
              <dd className="tpl-preview-colors">
                {facets.colors.map((color) => (
                  <span key={color} className="tpl-color-dot" title={t(colorName(color))} style={{ background: TEMPLATE_COLORS.find((entry) => entry.id === color)?.swatch }} />
                ))}
              </dd>
            </div>
          </dl>
          <div className="tpl-preview-actions">
            <button className="primary tpl-preview-use" type="button" onClick={() => onUse(template)}>{t('使用这个模板')}</button>
            <HeartButton className="ghost tpl-preview-heart" template={template} on={favorites.has(template.id)} onToggle={() => onToggleFavorite(template.id)} />
          </div>
          {similar.length > 0 && (
            <section className="tpl-preview-similar" aria-labelledby="tpl-preview-similar">
              <h3 id="tpl-preview-similar">{t('相似模板')}</h3>
              <div className="tpl-preview-similar-grid">
                {similar.map((candidate) => {
                  const candidateSource = templatePreviewSource(candidate)
                  const candidateSize = templateFormat(candidate.format)
                  const box = 84
                  const fit = Math.min(box / candidateSize.width, box / candidateSize.height)
                  return (
                    <button key={candidate.id} type="button" className="tpl-preview-similar-item" aria-label={t('预览{title}', { title: t(candidate.title) })} onClick={() => onShow(candidate)}>
                      <span className="tpl-preview-similar-art">
                        {candidateSource && <DocumentPreview source={candidateSource} width={Math.round(candidateSize.width * fit)} height={Math.round(candidateSize.height * fit)} lazy />}
                      </span>
                      <span>{t(candidate.title)}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
