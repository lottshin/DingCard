import { useRef, useState, type DragEvent } from 'react'
import { draftSubtitle, draftTitle, type Draft } from './drafts'
import { CloseIcon } from './ui/icons'

interface DraftsPanelProps {
  drafts: Draft[]
  activeId: string | null
  onOpen: (draft: Draft) => void
  onDelete: (id: string) => void
  onClose: () => void
  /** Receive a picked or dropped .json file; the workspace owns parsing/saving. */
  onImportFile: (file: File) => void
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
export function DraftsPanel({
  drafts,
  activeId,
  onOpen,
  onDelete,
  onClose,
  onImportFile,
}: DraftsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function importFirstFile(files: FileList | null) {
    const file = files?.[0]
    if (file) onImportFile(file)
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    setDragOver(true)
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragOver(false)
    }
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    setDragOver(false)
    importFirstFile(event.dataTransfer.files)
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className={dragOver ? 'drawer drag-over' : 'drawer'}
        onClick={(e) => e.stopPropagation()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-testid="drafts-drawer"
      >
        <div className="drawer-head">
          <span>我的草稿</span>
          <button className="modal-x" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </div>

        <div className="drawer-import" data-testid="draft-import">
          <button
            className="drawer-import-btn"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            导入 JSON 文档
          </button>
          <span className="drawer-import-hint">
            支持自由画布与 Markdown 文档（如 MCP 工具生成的结果），可点击选择或直接拖入 .json 文件
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="导入 JSON 文档"
            onChange={(event) => {
              importFirstFile(event.target.files)
              event.target.value = ''
            }}
          />
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
