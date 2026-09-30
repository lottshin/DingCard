import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Card } from '../Card'
import { FreeformSlidePreview } from '../freeform/FreeformSlidePreview'
import { buildConfig, DEFAULT_PROFILE, FONTS, PLATFORMS, resolveTheme } from '../theme'
import { CloseIcon } from '../ui/icons'
import { markdownFirstPage, previewStyle } from './previewModel'
import { templatesForWorkspace } from './registry'
import type { TemplateDefinition, TemplateWorkspace } from './types'
import { t } from '../i18n'

interface TemplateGalleryProps {
  open: boolean
  workspace: TemplateWorkspace
  hasCurrentContent: boolean
  /** The open project is saved to the account, so a template can open beside it. */
  currentIsSaved: boolean
  onClose: () => void
  onApply: (template: TemplateDefinition) => void
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

function FreeformTemplatePreview({ template, detail = false }: { template: TemplateDefinition; detail?: boolean }) {
  const document = useMemo(() => template.createFreeform?.(), [template])
  const slide = document?.slides[0]
  if (!slide) return null
  return (
    <FreeformSlidePreview
      slide={slide}
      frameWidth={detail ? 224 : 162}
      frameHeight={detail ? 299 : 216}
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

export function TemplateGallery({ open, workspace, hasCurrentContent, currentIsSaved, onClose, onApply }: TemplateGalleryProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const pendingReturnFocusRef = useRef<HTMLElement | null>(null)
  const pendingRef = useRef<TemplateDefinition | null>(null)
  const onCloseRef = useRef(onClose)
  const templates = templatesForWorkspace(workspace)
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? '')
  const [pending, setPending] = useState<TemplateDefinition | null>(null)
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0]
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
    setSelectedId(templates[0]?.id ?? '')
    pendingReturnFocusRef.current = null
    setPending(null)
  }, [workspace])

  if (!open || !selected) return null

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

  function renderTile(template: TemplateDefinition) {
    return (
      <article key={template.id} className={template.id === selected.id ? 'template-tile selected' : 'template-tile'}>
        <button
          className='template-tile-preview'
          type='button'
          aria-label={t('预览{title}', { title: t(template.title) })}
          aria-pressed={template.id === selected.id}
          onClick={() => setSelectedId(template.id)}
        >
          <TemplatePreview template={template} />
        </button>
        <div className='template-tile-copy'>
          <div>
            <h3>{t(template.title)}</h3>
            <p>{t(template.description)}</p>
          </div>
          <span className='template-page-count'>{t('{n} 页', { n: template.pageCount })}</span>
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
            {templates.map(renderTile)}
          </section>

          <aside className='template-detail' aria-label={t('模板详情')}>
            <div className='template-detail-preview'><TemplatePreview template={selected} detail /></div>
            <div className='template-detail-copy'>
              <span className='template-detail-series'>{t(selected.title)}</span>
              <h3>{selected.workspace === 'markdown' ? t('Markdown 长文排版') : t('自由画布轻设计')}</h3>
              <p>{t(selected.description)}</p>
              <p className='template-detail-note'>
                {selected.workspace === 'markdown'
                  ? t('{n} 页示例已经排好，正文、主题和字体都可以改。', { n: selected.pageCount })
                  : t('{n} 页作品已经排好，文字、颜色、尺寸和图层都可以改。', { n: selected.pageCount })}
              </p>
              <button className='template-use' type='button' onClick={() => requestApply(selected)}>{t('使用这套模板')}</button>
            </div>
          </aside>
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
                  : t('访客模式下不会保存，打开模板后当前内容就找不回来了。')}
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
