import { useRef, useState } from 'react'
import type { Draft } from '../drafts'
import { PLATFORMS } from '../theme'
import { CopyIcon, FreeformMarkIcon, MarkdownMarkIcon, MoreIcon, PencilIcon, TrashIcon } from '../ui/icons'
import { DocumentPreview, Measured, type PreviewSource } from './DocumentPreview'
import { useDismiss } from './useDismiss'
import { locale, t } from '../i18n'

export function projectSource(draft: Draft): PreviewSource {
  return draft.mode === 'markdown-card'
    ? { kind: 'markdown', document: draft.document }
    : { kind: 'freeform', document: draft.document }
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const minutes = Math.round((now - timestamp) / 60000)
  if (minutes < 1) return t('刚刚')
  if (minutes < 60) return t('{n} 分钟前', { n: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('{n} 小时前', { n: hours })
  const days = Math.round(hours / 24)
  if (days < 7) return t('{n} 天前', { n: days })
  return new Date(timestamp).toLocaleDateString(locale(), { month: 'short', day: 'numeric' })
}

export function projectDetail(draft: Draft): string {
  if (draft.mode === 'markdown-card') {
    const platform = PLATFORMS.find((candidate) => candidate.id === draft.document.platformId)
    return platform ? t(platform.label) : 'Markdown'
  }
  const slide = draft.document.slides[0]
  return slide ? `${slide.width} × ${slide.height}` : t('自由编辑')
}

export function SystemMark({ system, className }: { system: Draft['mode']; className?: string }) {
  return system === 'markdown-card'
    ? <MarkdownMarkIcon className={['sys-mark', 'sys-md', className].filter(Boolean).join(' ')} />
    : <FreeformMarkIcon className={['sys-mark', 'sys-ff', className].filter(Boolean).join(' ')} />
}

interface ProjectCardProps {
  draft: Draft
  onOpen: (draft: Draft) => void
  onDuplicate?: (draft: Draft) => void
  onRename?: (draft: Draft, title: string) => void
  onDelete?: (draft: Draft) => void
}

export function ProjectCard({ draft, onOpen, onDuplicate, onRename, onDelete }: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const cancelRenameRef = useRef(false)
  const pages = draft.mode === 'freeform-slide' ? draft.document.slides.length : null
  const systemName = draft.mode === 'markdown-card' ? t('Markdown 卡片') : t('自由编辑')

  useDismiss(menuRef, menuOpen, () => setMenuOpen(false))

  function finishRename(value: string) {
    setRenaming(false)
    if (cancelRenameRef.current) return
    const title = value.trim()
    if (title && title !== draft.title) onRename?.(draft, title)
  }

  return (
    <article className="project" data-testid="project-card" data-system={draft.mode}>
      <button className="project-open" type="button" onClick={() => onOpen(draft)} aria-label={t('打开 {title}', { title: draft.title })}>
        <Measured className="project-thumb">
          {(width) => <DocumentPreview source={projectSource(draft)} width={width} lazy />}
        </Measured>
        {pages !== null && pages > 1 && <span className="project-pages tnum">{t('{n} 页', { n: pages })}</span>}
      </button>
      <div className="project-info">
        <div className="project-title">
          <SystemMark system={draft.mode} />
          {renaming ? (
            <input
              className="text-input project-rename"
              aria-label={t('项目名称')}
              defaultValue={draft.title}
              maxLength={60}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onBlur={(event) => finishRename(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  if (event.nativeEvent.isComposing) return
                  event.currentTarget.blur()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  cancelRenameRef.current = true
                  event.currentTarget.blur()
                }
              }}
            />
          ) : (
            <span title={draft.title}>{draft.title}</span>
          )}
        </div>
        <div className="project-meta">
          <span>{systemName}</span>
          <span className="dot-sep" aria-hidden="true" />
          <span>{projectDetail(draft)}</span>
          <span className="dot-sep" aria-hidden="true" />
          <span className="tnum">{relativeTime(draft.updatedAt)}</span>
        </div>
      </div>
      {(onDuplicate || onRename || onDelete) && (
        <div className="project-menu" ref={menuRef}>
          <button
            className="icon-btn project-more"
            type="button"
            aria-label={t('{name} 的更多操作', { name: draft.title })}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreIcon />
          </button>
          {menuOpen && (
            <div className="menu project-menu-list" role="menu">
              {onRename && (
                <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); cancelRenameRef.current = false; setRenaming(true) }}>
                  <PencilIcon />{t('重命名')}
                </button>
              )}
              {onDuplicate && (
                <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onDuplicate(draft) }}>
                  <CopyIcon />{t('复制一份')}
                </button>
              )}
              {onDelete && (
                <button role="menuitem" type="button" className="danger" onClick={() => { setMenuOpen(false); onDelete(draft) }}>
                  <TrashIcon />{t('删除')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
