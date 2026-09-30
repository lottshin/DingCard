import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { Asset } from '../assets'
import { t } from '../i18n'
import { AssetsIcon, CloseIcon, SearchIcon, UploadIcon } from '../ui/icons'
import type { WorkspaceMode } from '../workspaces/types'
import { ASSET_ACCEPT } from './assetFiles'
import { uploadNotice, useAssets } from './useAssets'

interface AssetPanelProps {
  /** The library's owner (an account or this device's guest); null while the session is checked. */
  ownerId: string | null
  onInsert: (asset: Asset) => void
  onManage: () => void
}

interface PanelMessage {
  text: string
  tone: 'info' | 'error'
}

/** The asset library as a pick list: search, upload into the library, click to insert. */
export function AssetPanel({ ownerId, onInsert, onManage }: AssetPanelProps) {
  const assets = useAssets(ownerId)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState<PanelMessage | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepthRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const needle = query.trim().toLocaleLowerCase()
  const visible = useMemo(
    () => assets.assets.filter((asset) => !needle || asset.name.toLocaleLowerCase().includes(needle)),
    [assets.assets, needle],
  )

  function upload(files: File[]) {
    if (!ownerId || files.length === 0) return
    setMessage(null)
    void assets.upload(files).then((outcome) => {
      const notice = uploadNotice(outcome)
      setMessage(notice ? { text: notice.detail ? t('{title}：{detail}', { title: notice.title, detail: notice.detail }) : notice.title, tone: notice.tone } : null)
    })
  }

  const carriesFiles = (event: DragEvent) => Boolean(ownerId) && Array.from(event.dataTransfer.types).includes('Files')

  if (!ownerId) {
    return (
      <div className="asset-panel">
        <div className="asset-drawer-empty" role="status">
          <span className="asset-drop-icon"><AssetsIcon /></span>
          <span>{t('正在读取素材库…')}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={dragging ? 'asset-panel is-dragging' : 'asset-panel'}
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
      <div className="asset-drawer-tools">
        <label className="search-field">
          <SearchIcon />
          <input
            type="search"
            value={query}
            placeholder={t('搜索素材')}
            aria-label={t('搜索素材')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="ghost" type="button" onClick={() => inputRef.current?.click()} data-testid="asset-drawer-upload" title={t('上传到素材库')}>
          <UploadIcon />{t('上传')}
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
            <b>{t('素材库读取失败')}</b>
            <span>{assets.error}</span>
            <button className="ghost" type="button" onClick={assets.reload}>{t('重试')}</button>
          </div>
        ) : visible.length > 0 || assets.uploads.length > 0 ? (
          <div className="asset-drawer-grid">
            {assets.uploads.map((pending) => (
              <div className="asset-pick is-pending" key={pending.id} role="status" aria-label={t('正在上传 {name}', { name: pending.name })}>
                <span className="asset-spinner" />
              </div>
            ))}
            {visible.map((asset) => (
              <button
                key={asset.id}
                className="asset-pick"
                type="button"
                title={asset.name}
                aria-label={t('插入 {name}', { name: asset.name })}
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
            <p className="asset-drawer-empty">{t('没有名称包含「{query}」的素材', { query: query.trim() })}</p>
          ) : (
            <div className="asset-drawer-empty">
              <span className="asset-drop-icon"><UploadIcon /></span>
              <b>{t('素材库还是空的')}</b>
              <span>{t('把图片拖到这里，或者点「上传」。存进来的图片，所有项目都能用。')}</span>
            </div>
          )
        )}
      </div>

      <div className="asset-drawer-foot">
        <button className="link-btn" type="button" onClick={onManage}>{t('管理素材库')}</button>
        <span className="tnum">{t('{n} 张', { n: assets.assets.length })}</span>
      </div>
      {dragging && <div className="asset-drawer-drop" aria-hidden="true"><UploadIcon />{t('松开，存进素材库')}</div>}
    </div>
  )
}

interface AssetDrawerProps extends AssetPanelProps {
  system: WorkspaceMode
  onClose: () => void
  children?: ReactNode
}

/** The asset library beside an editor. */
export function AssetDrawer({ ownerId, system, onInsert, onManage, onClose }: AssetDrawerProps) {
  return (
    <aside
      className="asset-drawer"
      aria-label={t('素材库')}
      data-testid="asset-drawer"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        if (event.target instanceof HTMLInputElement && event.target.value) return
        event.preventDefault()
        onClose()
      }}
    >
      <div className="asset-drawer-head">
        <div>
          <h2>{t('素材库')}</h2>
          <p>{system === 'markdown-card' ? t('点一下，插入到光标所在的位置') : t('点一下，放到当前页的中央')}</p>
        </div>
        <button className="icon-btn" type="button" aria-label={t('关闭素材库')} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <AssetPanel ownerId={ownerId} onInsert={onInsert} onManage={onManage} />
    </aside>
  )
}
