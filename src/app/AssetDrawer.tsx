import { useMemo, useRef, useState, type DragEvent } from 'react'
import type { Asset } from '../assets'
import type { User } from '../auth'
import { AssetsIcon, CloseIcon, SearchIcon, UploadIcon } from '../ui/icons'
import type { WorkspaceMode } from '../workspaces/types'
import { ASSET_ACCEPT } from './assetFiles'
import { uploadNotice, useAssets } from './useAssets'

interface AssetDrawerProps {
  user: User | null
  system: WorkspaceMode
  onInsert: (asset: Asset) => void
  onRequestAuth: () => void
  onManage: () => void
  onClose: () => void
}

interface DrawerMessage {
  text: string
  tone: 'info' | 'error'
}

/** The asset library beside an editor: pick to insert, drop or upload to add. */
export function AssetDrawer({ user, system, onInsert, onRequestAuth, onManage, onClose }: AssetDrawerProps) {
  const assets = useAssets(user)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState<DrawerMessage | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepthRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const needle = query.trim().toLocaleLowerCase()
  const visible = useMemo(
    () => assets.assets.filter((asset) => !needle || asset.name.toLocaleLowerCase().includes(needle)),
    [assets.assets, needle],
  )

  function upload(files: File[]) {
    if (!user || files.length === 0) return
    setMessage(null)
    void assets.upload(files).then((outcome) => {
      const notice = uploadNotice(outcome)
      setMessage(notice ? { text: notice.detail ? `${notice.title}：${notice.detail}` : notice.title, tone: notice.tone } : null)
    })
  }

  const carriesFiles = (event: DragEvent) => Boolean(user) && Array.from(event.dataTransfer.types).includes('Files')

  return (
    <aside
      className={dragging ? 'asset-drawer is-dragging' : 'asset-drawer'}
      aria-label="素材库"
      data-testid="asset-drawer"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        if (event.target instanceof HTMLInputElement && event.target.value) return
        event.preventDefault()
        onClose()
      }}
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        dragDepthRef.current += 1
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(event) => {
        if (!carriesFiles(event)) return
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setDragging(false)
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        dragDepthRef.current = 0
        setDragging(false)
        upload(Array.from(event.dataTransfer.files))
      }}
    >
      <div className="asset-drawer-head">
        <div>
          <h2>素材库</h2>
          <p>{system === 'markdown-card' ? '点一下，插入到光标所在的位置' : '点一下，放到当前页的中央'}</p>
        </div>
        <button className="icon-btn" type="button" aria-label="关闭素材库" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      {!user ? (
        <div className="asset-drawer-empty">
          <span className="asset-drop-icon"><AssetsIcon /></span>
          <b>登录后使用素材库</b>
          <span>常用的图片存一次，Markdown 卡片和自由编辑的项目都能用。</span>
          <button className="accent" type="button" onClick={onRequestAuth}>登录或注册</button>
        </div>
      ) : (
        <>
          <div className="asset-drawer-tools">
            <label className="search-field">
              <SearchIcon />
              <input
                type="search"
                value={query}
                placeholder="搜索素材"
                aria-label="搜索素材"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button className="ghost" type="button" onClick={() => inputRef.current?.click()} data-testid="asset-drawer-upload">
              <UploadIcon />上传
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ASSET_ACCEPT}
              multiple
              hidden
              data-testid="asset-drawer-file-input"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                event.currentTarget.value = ''
                upload(files)
              }}
            />
          </div>
          {message && (
            <p className={`asset-drawer-message is-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
              {message.text}
            </p>
          )}

          <div className="asset-drawer-body">
            {assets.status === 'error' ? (
              <div className="asset-drawer-empty">
                <b>素材库读取失败</b>
                <span>{assets.error}</span>
                <button className="ghost" type="button" onClick={assets.reload}>重试</button>
              </div>
            ) : visible.length > 0 || assets.uploads.length > 0 ? (
              <div className="asset-drawer-grid">
                {assets.uploads.map((pending) => (
                  <div className="asset-pick is-pending" key={pending.id} role="status" aria-label={`正在上传 ${pending.name}`}>
                    <span className="asset-spinner" />
                  </div>
                ))}
                {visible.map((asset) => (
                  <button
                    key={asset.id}
                    className="asset-pick"
                    type="button"
                    title={asset.name}
                    aria-label={`插入 ${asset.name}`}
                    data-testid="asset-pick"
                    onClick={() => onInsert(asset)}
                  >
                    <img src={asset.src} alt="" loading="lazy" decoding="async" draggable={false} />
                    <span className="asset-pick-name">{asset.name}</span>
                  </button>
                ))}
              </div>
            ) : assets.status === 'ready' && (
              needle ? (
                <p className="asset-drawer-empty">没有名称包含「{query.trim()}」的素材</p>
              ) : (
                <div className="asset-drawer-empty">
                  <span className="asset-drop-icon"><UploadIcon /></span>
                  <b>素材库还是空的</b>
                  <span>把图片拖到这里，或者点「上传」。存进来的图片，所有项目都能用。</span>
                </div>
              )
            )}
          </div>

          <div className="asset-drawer-foot">
            <button className="link-btn" type="button" onClick={onManage}>管理素材库</button>
            <span className="tnum">{assets.assets.length} 张</span>
          </div>
        </>
      )}
      {dragging && <div className="asset-drawer-drop" aria-hidden="true"><UploadIcon />松开，存进素材库</div>}
    </aside>
  )
}
