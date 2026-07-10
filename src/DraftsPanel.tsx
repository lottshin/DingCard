import { draftSubtitle, draftTitle, type Draft } from './drafts'

interface DraftsPanelProps {
  drafts: Draft[]
  activeId: string | null
  onOpen: (draft: Draft) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.round(hr / 24)
  return `${day} 天前`
}

/** Slide-in drawer listing the signed-in user's saved drafts. */
export function DraftsPanel({ drafts, activeId, onOpen, onDelete, onClose }: DraftsPanelProps) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span>我的草稿</span>
          <button className="modal-x" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        {drafts.length === 0 ? (
          <div className="drawer-empty">
            还没有草稿。编辑内容后点“保存草稿”，就会出现在这里。
          </div>
        ) : (
          <ul className="draft-list">
            {drafts.map((d) => (
              <li
                key={d.id}
                className={d.id === activeId ? 'draft-item on' : 'draft-item'}
                onClick={() => onOpen(d)}
              >
                <div className="draft-main">
                  <div className="draft-title">{draftTitle(d)}</div>
                  <div className="draft-meta">
                    {timeAgo(d.updatedAt)} · {draftSubtitle(d)}
                  </div>
                </div>
                <button
                  className="draft-del"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(d.id)
                  }}
                  aria-label="删除草稿"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}
