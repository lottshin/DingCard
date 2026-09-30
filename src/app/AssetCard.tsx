import { useEffect, useId, useRef, useState } from 'react'
import { formatBytes, type Asset } from '../assets'
import { CloseIcon, DownloadIcon, MoreIcon, PencilIcon, TrashIcon } from '../ui/icons'
import { useDismiss } from './useDismiss'

function assetFileName(asset: Asset): string {
  const match = /^data:image\/(png|jpeg|webp)/i.exec(asset.src) ?? /\.(png|jpe?g|webp)(?:[?#]|$)/i.exec(asset.src)
  const ext = (match?.[1] ?? 'png').toLowerCase()
  return `${asset.name}.${ext === 'jpeg' ? 'jpg' : ext}`
}

export function downloadAsset(asset: Asset) {
  const link = document.createElement('a')
  link.href = asset.src
  link.download = assetFileName(asset)
  document.body.append(link)
  link.click()
  link.remove()
}

function uploadedOn(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

interface AssetCardProps {
  asset: Asset
  onPreview: (asset: Asset) => void
  onRename: (asset: Asset, name: string) => void
  onDelete: (asset: Asset) => void
}

export function AssetCard({ asset, onPreview, onRename, onDelete }: AssetCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const cancelRenameRef = useRef(false)
  useDismiss(menuRef, menuOpen, () => setMenuOpen(false))

  function finishRename(value: string) {
    setRenaming(false)
    if (cancelRenameRef.current) return
    const name = value.trim()
    if (name && name !== asset.name) onRename(asset, name)
  }

  return (
    <article className="asset" data-testid="asset-card">
      <button className="asset-thumb" type="button" onClick={() => onPreview(asset)} aria-label={`查看 ${asset.name}`}>
        <img src={asset.src} alt="" loading="lazy" decoding="async" draggable={false} />
      </button>
      <div className="asset-info">
        {renaming ? (
          <input
            className="text-input asset-rename"
            aria-label="素材名称"
            defaultValue={asset.name}
            maxLength={60}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onBlur={(event) => finishRename(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
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
          <span className="asset-name" title={asset.name}>{asset.name}</span>
        )}
        <span className="asset-meta tnum">{asset.width} × {asset.height} · {formatBytes(asset.bytes)}</span>
      </div>
      <div className="asset-menu" ref={menuRef}>
        <button
          className="icon-btn asset-more"
          type="button"
          aria-label={`${asset.name} 的更多操作`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreIcon />
        </button>
        {menuOpen && (
          <div className="menu asset-menu-list" role="menu">
            <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); cancelRenameRef.current = false; setRenaming(true) }}>
              <PencilIcon />重命名
            </button>
            <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); downloadAsset(asset) }}>
              <DownloadIcon />下载
            </button>
            <button role="menuitem" type="button" className="danger" onClick={() => { setMenuOpen(false); onDelete(asset) }}>
              <TrashIcon />删除
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

interface AssetPreviewProps {
  asset: Asset
  /** Saved projects that use this image. */
  usedBy: number
  onDelete: (asset: Asset) => void
  onClose: () => void
}

export function AssetPreview({ asset, usedBy, onDelete, onClose }: AssetPreviewProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal asset-preview" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="asset-preview-stage">
          <img src={asset.src} alt={asset.name} />
        </div>
        <div className="asset-preview-side">
          <div className="modal-head">
            <h3 id={titleId}>{asset.name}</h3>
            <button ref={closeRef} className="modal-x" type="button" onClick={onClose} aria-label="关闭">
              <CloseIcon />
            </button>
          </div>
          <dl className="asset-facts">
            <div><dt>尺寸</dt><dd className="tnum">{asset.width} × {asset.height} px</dd></div>
            <div><dt>大小</dt><dd className="tnum">{formatBytes(asset.bytes)}</dd></div>
            <div><dt>上传于</dt><dd>{uploadedOn(asset.createdAt)}</dd></div>
            <div><dt>用在</dt><dd className="tnum">{usedBy > 0 ? `${usedBy} 个项目里` : '还没有项目用到'}</dd></div>
          </dl>
          <p className="asset-preview-hint">在编辑器顶栏打开「素材库」，点一下就能放进 Markdown 卡片或自由编辑的项目里。</p>
          <div className="modal-foot">
            <button className="ghost confirm-danger-ghost" type="button" onClick={() => onDelete(asset)}><TrashIcon />删除</button>
            <button className="accent" type="button" onClick={() => downloadAsset(asset)}><DownloadIcon />下载</button>
          </div>
        </div>
      </div>
    </div>
  )
}
