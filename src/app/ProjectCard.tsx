import { useRef, useState } from 'react'
import type { Draft } from '../drafts'
import { PLATFORMS } from '../theme'
import { CopyIcon, FreeformMarkIcon, MarkdownMarkIcon, MoreIcon, TrashIcon } from '../ui/icons'
import { DocumentPreview, Measured, type PreviewSource } from './DocumentPreview'
import { useDismiss } from './useDismiss'

export function projectSource(draft: Draft): PreviewSource {
  return draft.mode === 'markdown-card'
    ? { kind: 'markdown', document: draft.document }
    : { kind: 'freeform', document: draft.document }
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const minutes = Math.round((now - timestamp) / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} 天前`
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function projectDetail(draft: Draft): string {
  if (draft.mode === 'markdown-card') {
    const platform = PLATFORMS.find((candidate) => candidate.id === draft.document.platformId)
    return platform?.label ?? 'Markdown'
  }
  const slide = draft.document.slides[0]
  return slide ? `${slide.width} × ${slide.height}` : '自由编辑'
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
  onDelete?: (draft: Draft) => void
}

export function ProjectCard({ draft, onOpen, onDuplicate, onDelete }: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const pages = draft.mode === 'freeform-slide' ? draft.document.slides.length : null
  const systemName = draft.mode === 'markdown-card' ? 'Markdown 卡片' : '自由编辑'

  useDismiss(menuRef, menuOpen, () => setMenuOpen(false))

  return (
    <article className="project" data-testid="project-card" data-system={draft.mode}>
      <button className="project-open" type="button" onClick={() => onOpen(draft)} aria-label={`打开 ${draft.title}`}>
        <Measured className="project-thumb">
          {(width) => <DocumentPreview source={projectSource(draft)} width={width} lazy />}
        </Measured>
        {pages !== null && pages > 1 && <span className="project-pages tnum">{pages} 页</span>}
      </button>
      <div className="project-info">
        <div className="project-title">
          <SystemMark system={draft.mode} />
          <span>{draft.title}</span>
        </div>
        <div className="project-meta">
          <span>{systemName}</span>
          <span className="dot-sep" aria-hidden="true" />
          <span>{projectDetail(draft)}</span>
          <span className="dot-sep" aria-hidden="true" />
          <span className="tnum">{relativeTime(draft.updatedAt)}</span>
        </div>
      </div>
      {(onDuplicate || onDelete) && (
        <div className="project-menu" ref={menuRef}>
          <button
            className="icon-btn project-more"
            type="button"
            aria-label={`${draft.title} 的更多操作`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreIcon />
          </button>
          {menuOpen && (
            <div className="menu project-menu-list" role="menu">
              {onDuplicate && (
                <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onDuplicate(draft) }}>
                  <CopyIcon />复制一份
                </button>
              )}
              {onDelete && (
                <button role="menuitem" type="button" className="danger" onClick={() => { setMenuOpen(false); onDelete(draft) }}>
                  <TrashIcon />删除
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
