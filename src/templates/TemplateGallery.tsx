import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Card } from '../Card'
import { FreeformSlidePreview } from '../freeform/FreeformSlidePreview'
import { parseBlocks } from '../markdown'
import { buildConfig, DEFAULT_PROFILE, FONTS, PLATFORMS, THEMES } from '../theme'
import { templatesForWorkspace } from './registry'
import type { MarkdownTemplateDocument, TemplateDefinition, TemplateWorkspace } from './types'

interface TemplateGalleryProps {
  open: boolean
  workspace: TemplateWorkspace
  hasCurrentContent: boolean
  onClose: () => void
  onApply: (template: TemplateDefinition) => void
}

function markdownFirstPage(document: MarkdownTemplateDocument): string {
  const blocks = parseBlocks(document.source)
  const firstPage = [] as string[]
  for (const block of blocks) {
    if (block.isBreak) break
    firstPage.push(block.html)
  }
  return firstPage.join('')
}

function previewStyle(scale: number, radius: number, config: ReturnType<typeof buildConfig>): CSSProperties {
  return {
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
    '--card-radius': `${radius}px`,
    '--template-scale': String(scale),
  } as CSSProperties
}

function MarkdownTemplatePreview({ template, detail = false }: { template: TemplateDefinition; detail?: boolean }) {
  const document = template.createMarkdown?.()
  if (!document) return null
  const platform = PLATFORMS.find((candidate) => candidate.id === document.platformId) ?? PLATFORMS[0]
  const theme = THEMES.find((candidate) => candidate.id === document.themeId) ?? THEMES[0]
  const font = FONTS.find((candidate) => candidate.id === document.fontFamily) ?? FONTS[0]
  const config = buildConfig(platform, theme, font.id)
  return (
    <div className={detail ? 'template-markdown-preview detail' : 'template-markdown-preview'} style={previewStyle(detail ? 0.622 : 0.45, document.radius, config)}>
      <Card html={markdownFirstPage(document)} config={config} profile={document.profile ?? DEFAULT_PROFILE} showHeader={false} />
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

export function TemplateGallery({ open, workspace, hasCurrentContent, onClose, onApply }: TemplateGalleryProps) {
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
            <h2 id='template-gallery-title'>从一套成品开始</h2>
            <p className='template-dialog-subtitle'>样式和内容都可以继续改，先选一套接近你想法的。</p>
          </div>
          <button className='template-close' type='button' aria-label='关闭模板中心' title='关闭' onClick={onClose}>×</button>
        </header>

        <div className='template-dialog-body'>
          <section className='template-list' aria-label='模板列表'>
            {templates.map((template) => (
              <article key={template.id} className={template.id === selected.id ? 'template-tile selected' : 'template-tile'}>
                <button
                  className='template-tile-preview'
                  type='button'
                  aria-label={`预览${template.title}`}
                  aria-pressed={template.id === selected.id}
                  onClick={() => setSelectedId(template.id)}
                >
                  <TemplatePreview template={template} />
                </button>
                <div className='template-tile-copy'>
                  <div>
                    <h3>{template.title}</h3>
                    <p>{template.description}</p>
                  </div>
                  <span className='template-page-count'>{template.pageCount} 页</span>
                </div>
                <div className='template-tags'>
                  {template.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </article>
            ))}
          </section>

          <aside className='template-detail' aria-label='模板详情'>
            <div className='template-detail-preview'><TemplatePreview template={selected} detail /></div>
            <div className='template-detail-copy'>
              <span className='template-detail-series'>{selected.title}</span>
              <h3>{selected.workspace === 'markdown' ? 'Markdown 长文排版' : '自由画布轻设计'}</h3>
              <p>{selected.description}</p>
              <p className='template-detail-note'>
                {selected.workspace === 'markdown'
                  ? `${selected.pageCount} 页示例已经排好，正文、主题和字体都可以改。`
                  : `${selected.pageCount} 页作品已经排好，文字、颜色、尺寸和图层都可以改。`}
              </p>
              <button className='template-use' type='button' onClick={() => requestApply(selected)}>使用这套模板</button>
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
              <p className='template-kicker'>当前作品还在编辑中</p>
              <h3 id='template-confirm-title'>要新建一份模板作品吗？</h3>
              <p>已保存的草稿不会被覆盖；当前未保存的修改不会带入新作品。</p>
              <div className='template-confirm-actions'>
                <button className='template-cancel' type='button' onClick={closePending}>继续编辑</button>
                <button className='template-use' type='button' onClick={() => { pendingReturnFocusRef.current = null; onApply(pending); setPending(null) }}>新建模板作品</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
