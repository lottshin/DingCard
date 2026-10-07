import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Card } from '../Card'
import { FreeformSlidePreview } from '../freeform/FreeformSlidePreview'
import { buildConfig, DEFAULT_PROFILE, FONTS, PLATFORMS, resolveTheme } from '../theme'
import { CloseIcon } from '../ui/icons'
import { TEMPLATE_FORMATS, templateFormat } from './formats'
import { markdownFirstPage, previewStyle } from './previewModel'
import { templatesForWorkspace } from './registry'
import { loadFavoriteTemplateIds, saveFavoriteTemplateIds, toggleFavoriteTemplateId } from './favorites'
import type { TemplateDefinition, TemplateFormatId, TemplateWorkspace } from './types'
import { t } from '../i18n'

interface TemplateGalleryProps {
  open: boolean
  workspace: TemplateWorkspace
  hasCurrentContent: boolean
  /** The open project is saved to the account, so a template can open beside it. */
  currentIsSaved: boolean
  onClose: () => void
  onApply: (template: TemplateDefinition) => void
  /** Add the template's pages to the open work instead (the freeform editor). */
  onInsert?: (template: TemplateDefinition) => void
}

function MarkdownTemplatePreview({ template, detail = false }: { template: TemplateDefinition; detail?: boolean }) {
  const document = template.createMarkdown?.()
  if (!document) return null
  const platform = PLATFORMS.find((candidate) => candidate.id === document.platformId) ?? PLATFORMS[0]
  const theme = resolveTheme(document.themeId)
  const font = FONTS.find((candidate) => candidate.id === document.fontFamily) ?? FONTS[0]
  const config = buildConfig(platform, theme, font.id)
  const firstPage = markdownFirstPage(document)
  return (
    <div className={detail ? 'template-markdown-preview detail' : 'template-markdown-preview'} style={previewStyle(detail ? 0.622 : 0.45, document.radius, config)}>
      <Card
        html={firstPage.html}
        config={config}
        profile={document.profile ?? DEFAULT_PROFILE}
        pageIndex={0}
        pageCount={template.pageCount}
        pageRole={firstPage.role}
        showHeader={false}
      />
    </div>
  )
}

/** The largest box of the template's own proportions that fits in `maxWidth` × `maxHeight`. */
export function templateFrame(template: TemplateDefinition, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const { width, height } = templateFormat(template.format)
  const scale = Math.min(maxWidth / width, maxHeight / height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export function FreeformTemplatePreview({ template, detail = false, frame }: {
  template: TemplateDefinition
  detail?: boolean
  /** Frame size for previews outside the gallery, such as the editor's templates panel. */
  frame?: { width: number; height: number }
}) {
  const document = useMemo(() => template.createFreeform?.(), [template])
  const slide = document?.slides[0]
  if (!slide) return null
  const size = frame ?? templateFrame(template, detail ? 300 : 300, detail ? 420 : 216)
  return (
    <FreeformSlidePreview
      slide={slide}
      frameWidth={size.width}
      frameHeight={size.height}
      className={detail ? 'template-freeform-preview detail' : 'template-freeform-preview'}
      artboardClassName='template-freeform-artboard'
    />
  )
}

function TemplatePreview({ template, detail = false }: { template: TemplateDefinition; detail?: boolean }) {
  return template.workspace === 'markdown'
    ? <MarkdownTemplatePreview template={template} detail={detail} />
    : <FreeformTemplatePreview template={template} detail={detail} />
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ))
}

export function TemplateGallery({ open, workspace, hasCurrentContent, currentIsSaved, onClose, onApply, onInsert }: TemplateGalleryProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const pendingReturnFocusRef = useRef<HTMLElement | null>(null)
  const pendingRef = useRef<TemplateDefinition | null>(null)
  const onCloseRef = useRef(onClose)
  const allTemplates = templatesForWorkspace(workspace)
  const formats = TEMPLATE_FORMATS.filter((format) => allTemplates.some((template) => template.format === format.id))
  const [format, setFormat] = useState<TemplateFormatId | null>(null)
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadFavoriteTemplateIds())
  const queryRef = useRef('')
  // The keyword looks at the copy a tile shows, so it finds what the reader sees.
  const keyword = query.trim().toLowerCase()
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds])
  const templates = useMemo(() => {
    const byFormat = format ? allTemplates.filter((template) => template.format === format) : allTemplates
    const byFavorite = favoritesOnly ? byFormat.filter((template) => favoriteSet.has(template.id)) : byFormat
    if (!keyword) return byFavorite
    return byFavorite.filter((template) =>
      [template.title, template.description, ...template.tags]
        .some((text) => t(text).toLowerCase().includes(keyword)))
  }, [allTemplates, format, keyword, favoritesOnly, favoriteSet])
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? '')
  const [pending, setPending] = useState<TemplateDefinition | null>(null)
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0]
  queryRef.current = query
  pendingRef.current = pending
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      const first = dialogRef.current && focusableElements(dialogRef.current)[0]
      first?.focus()
    })
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        // Escape in the search box clears the keyword first; the gallery stays.
        if (
          queryRef.current
          && event.target instanceof HTMLElement
          && event.target.closest('.template-search')
        ) {
          setQuery('')
          return
        }
        if (pendingRef.current) closePending()
        else onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusScope = pendingRef.current
        ? dialogRef.current.querySelector<HTMLElement>('.template-confirm') ?? dialogRef.current
        : dialogRef.current
      const focusables = focusableElements(focusScope)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown, true)
      previousFocusRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open || !pending) return
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('.template-confirm-actions button')?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open, pending])

  useEffect(() => {
    setFormat(null)
    setQuery('')
    setSelectedId(allTemplates[0]?.id ?? '')
    pendingReturnFocusRef.current = null
    setPending(null)
  }, [workspace])

  // Filtering can hide the picked tile; the selection follows what is shown.
  useEffect(() => {
    if (!templates.some((template) => template.id === selectedId)) {
      setSelectedId(templates[0]?.id ?? '')
    }
  }, [templates, selectedId])

  function pickFormat(next: TemplateFormatId | null) {
    setFormat(next)
  }

  if (!open) return null

  function requestApply(template: TemplateDefinition) {
    if (hasCurrentContent) {
      pendingReturnFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      setPending(template)
    }
    else onApply(template)
  }

  function closePending() {
    const returnFocus = pendingReturnFocusRef.current
    pendingReturnFocusRef.current = null
    setPending(null)
    requestAnimationFrame(() => returnFocus?.focus())
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' && event.target === event.currentTarget) requestApply(selected)
  }

  function toggleFavorite(id: string) {
    setFavoriteIds((current) => {
      const next = toggleFavoriteTemplateId(current, id)
      saveFavoriteTemplateIds(next)
      return next
    })
  }

  function renderTile(template: TemplateDefinition) {
    const favorited = favoriteSet.has(template.id)
    return (
      <article key={template.id} className={template.id === selected?.id ? 'template-tile selected' : 'template-tile'}>
        <button
          className={favorited ? 'template-tile-favorite on' : 'template-tile-favorite'}
          type='button'
          aria-pressed={favorited}
          aria-label={favorited ? t('取消收藏{title}', { title: t(template.title) }) : t('收藏{title}', { title: t(template.title) })}
          data-testid={`template-favorite-${template.id}`}
          onClick={(event) => {
            event.stopPropagation()
            toggleFavorite(template.id)
          }}
        >
          <svg viewBox='0 0 20 20' aria-hidden='true'>
            <path d='M10 17s-6.3-3.9-8.2-7.2C.5 7.4 2 4 5.2 4c2 0 3.4 1.1 4.8 2.9C11.4 5.1 12.8 4 14.8 4 18 4 19.5 7.4 18.2 9.8 16.3 13.1 10 17 10 17Z' />
          </svg>
        </button>
        <button
          className='template-tile-preview'
          type='button'
          aria-label={t('预览{title}', { title: t(template.title) })}
          aria-pressed={template.id === selected?.id}
          onClick={() => setSelectedId(template.id)}
        >
          <TemplatePreview template={template} />
        </button>
        <div className='template-tile-copy'>
          <div>
            <h3>{t(template.title)}</h3>
            <p>{t(template.description)}</p>
          </div>
          <span className='template-page-count'>
            {template.kind === 'poster' ? t(templateFormat(template.format).ratio) : t('{n} 页', { n: template.pageCount })}
          </span>
        </div>
        <div className='template-tags'>
          {template.tags.map((tag) => <span key={tag}>{t(tag)}</span>)}
        </div>
      </article>
    )
  }

  return (
    <div className='template-backdrop' onMouseDown={(event) => {
      if (event.target !== event.currentTarget) return
      event.preventDefault()
      if (pendingRef.current) closePending()
      else onClose()
    }}>
      <div
        ref={dialogRef}
        className='template-dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby='template-gallery-title'
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <header className='template-dialog-head'>
          <div>
            <p className='template-kicker'>DINGCARD / TEMPLATE LIBRARY</p>
            <h2 id='template-gallery-title'>{t('从一套成品开始')}</h2>
            <p className='template-dialog-subtitle'>{t('样式和内容都可以继续改，先选一套接近你想法的。')}</p>
          </div>
          <button className='template-close' type='button' aria-label={t('关闭模板中心')} title={t('关闭')} onClick={onClose}><CloseIcon /></button>
        </header>

        <div className='template-dialog-body'>
          <section className='template-list' aria-label={t('模板列表')}>
            <input
              className='template-search'
              type='search'
              data-testid='template-search'
              aria-label={t('搜索模板')}
              placeholder={t('搜索：名称、说明或标签')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {formats.length > 1 && (
              <div className='template-formats' role='group' aria-label={t('按尺寸筛选')}>
                <button type='button' aria-pressed={format === null} onClick={() => pickFormat(null)}>{t('全部')}</button>
                {formats.map((entry) => (
                  <button key={entry.id} type='button' aria-pressed={format === entry.id} data-testid={`template-format-${entry.id}`} onClick={() => pickFormat(entry.id)}>
                    {t(entry.name)}
                  </button>
                ))}
                <button
                  type='button'
                  aria-pressed={favoritesOnly}
                  data-testid='template-filter-favorites'
                  onClick={() => setFavoritesOnly((current) => !current)}
                >
                  {t('收藏')}
                </button>
              </div>
            )}
            {templates.map(renderTile)}
            {templates.length === 0 && (
              <p className='template-search-empty' data-testid='template-search-empty'>
                {t('没有找到相关模板，换个关键词或尺寸试试。')}
              </p>
            )}
          </section>

          {selected && (
          <aside className='template-detail' aria-label={t('模板详情')}>
            <div className='template-detail-preview'><TemplatePreview template={selected} detail /></div>
            <div className='template-detail-copy'>
              <span className='template-detail-series'>{t(selected.title)}</span>
              <h3>{selected.workspace === 'markdown' ? t('Markdown 长文排版') : selected.kind === 'poster' ? t('{name} · {width}×{height}', { name: t(templateFormat(selected.format).name), width: templateFormat(selected.format).width, height: templateFormat(selected.format).height }) : t('自由画布轻设计')}</h3>
              <p>{t(selected.description)}</p>
              <p className='template-detail-note'>
                {selected.workspace === 'markdown'
                  ? t('{n} 页示例已经排好，正文、主题和字体都可以改。', { n: selected.pageCount })
                  : selected.kind === 'poster'
                    ? t('文字、图片、颜色和图层都可以改。')
                    : t('{n} 页作品已经排好，文字、颜色、尺寸和图层都可以改。', { n: selected.pageCount })}
              </p>
              <button className='template-use' type='button' onClick={() => requestApply(selected)}>{t('使用这套模板')}</button>
              {onInsert && selected.workspace === 'freeform' && (
                <button className='template-add' type='button' data-testid='template-add-to-work' onClick={() => onInsert(selected)}>{t('加到当前作品')}</button>
              )}
            </div>
          </aside>
          )}
        </div>

        {pending && (
          <div
            className='template-confirm-backdrop'
            role='presentation'
            onMouseDown={(event) => {
              if (event.target !== event.currentTarget) return
              event.preventDefault()
              closePending()
            }}
          >
            <div className='template-confirm' role='alertdialog' aria-modal='true' aria-labelledby='template-confirm-title'>
              <p className='template-kicker'>{currentIsSaved ? t('当前项目已自动保存') : t('当前内容还没有保存')}</p>
              <h3 id='template-confirm-title'>{t('用这套模板新建项目？')}</h3>
              <p>
                {currentIsSaved
                  ? t('模板会作为一个新项目打开，当前项目留在「我的项目」里。')
                  : t('最近的修改还没保存，打开模板后就找不回来了。')}
              </p>
              <div className='template-confirm-actions'>
                <button className='template-cancel' type='button' onClick={closePending}>{t('继续编辑')}</button>
                <button className='template-use' type='button' onClick={() => { pendingReturnFocusRef.current = null; onApply(pending); setPending(null) }}>{t('用模板新建')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
