import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { formatBytes, sortAssets, type Asset, type AssetOrder } from '../assets'
import type { User } from '../auth'
import { Select } from '../Select'
import { SearchIcon, UploadIcon } from '../ui/icons'
import { AssetCard, AssetPreview } from './AssetCard'
import { ASSET_ACCEPT, imageFiles } from './assetFiles'
import { ConfirmDialog } from './ConfirmDialog'
import { navigate, routes } from './router'
import type { AssetsState } from './useAssets'

interface AssetsPageProps {
  user: User | null
  assets: AssetsState
  /** Saved projects per asset id. */
  usage: ReadonlyMap<string, number>
  onUpload: (files: File[]) => void
  onRename: (asset: Asset, name: string) => void
  onDelete: (asset: Asset) => void
}

function carriesFiles(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function isTextTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]') !== null
}

export function AssetsPage({ user, assets, usage, onUpload, onRename, onDelete }: AssetsPageProps) {
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<AssetOrder>('recent')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Asset | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepthRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const onUploadRef = useRef(onUpload)
  onUploadRef.current = onUpload

  const all = assets.assets
  const totalBytes = all.reduce((sum, asset) => sum + asset.bytes, 0)
  const needle = query.trim().toLocaleLowerCase()
  const visible = useMemo(
    () => sortAssets(all.filter((asset) => !needle || asset.name.toLocaleLowerCase().includes(needle)), order),
    [all, needle, order],
  )
  const previewing = previewId ? all.find((asset) => asset.id === previewId) ?? null : null

  // Paste a screenshot anywhere on the page, except into a text field.
  useEffect(() => {
    if (!user) return
    const onPaste = (event: ClipboardEvent) => {
      if (isTextTarget(event.target)) return
      const files = imageFiles(event.clipboardData?.files)
      if (files.length === 0) return
      event.preventDefault()
      onUploadRef.current(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [user])

  const dropHandlers = user
    ? {
        onDragEnter: (event: DragEvent) => {
          if (!carriesFiles(event)) return
          event.preventDefault()
          dragDepthRef.current += 1
          setDragging(true)
        },
        onDragOver: (event: DragEvent) => {
          if (!carriesFiles(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        },
        onDragLeave: (event: DragEvent) => {
          if (!carriesFiles(event)) return
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
          if (dragDepthRef.current === 0) setDragging(false)
        },
        onDrop: (event: DragEvent) => {
          if (!carriesFiles(event)) return
          event.preventDefault()
          dragDepthRef.current = 0
          setDragging(false)
          const files = Array.from(event.dataTransfer.files)
          if (files.length > 0) onUpload(files)
        },
      }
    : {}

  const pick = () => inputRef.current?.click()

  return (
    <section className="page page-assets" aria-label="素材库" {...dropHandlers}>
      <div className="page-head">
        <div>
          <h1>素材库</h1>
          <p>
            {user
              ? '上传一次，Markdown 卡片和自由编辑的项目都能用。删掉素材不会影响已经用上它的项目。'
              : '登录后，常用的图片可以存进素材库，在所有项目里取用。'}
          </p>
        </div>
        {user && (
          <div className="page-actions">
            <button className="accent" type="button" onClick={pick} data-testid="asset-upload">
              <UploadIcon />上传图片
            </button>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ASSET_ACCEPT}
        multiple
        hidden
        data-testid="asset-file-input"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          if (files.length > 0) onUpload(files)
        }}
      />

      {!user ? (
        <div className="empty">
          <b>还没有登录</b>
          <span>登录后可以上传图片，在 Markdown 卡片和自由编辑里随时取用。</span>
          <button className="ghost" type="button" onClick={() => navigate(routes.login)}>登录或注册</button>
        </div>
      ) : (
        <>
          <div className="toolbar-row">
            <label className="search-field">
              <SearchIcon />
              <input
                type="search"
                value={query}
                placeholder="按名称搜索"
                aria-label="搜索素材"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <span className="asset-summary tnum">{all.length} 张 · {formatBytes(totalBytes)}</span>
            <span className="grow" />
            <Select
              value={order}
              title="排序"
              onChange={(value) => setOrder(value as AssetOrder)}
              options={[{ id: 'recent', label: '最近上传' }, { id: 'name', label: '按名称' }]}
            />
          </div>

          {assets.status === 'error' && (
            <div className="empty">
              <b>素材库读取失败</b>
              <span>{assets.error}</span>
              <button className="ghost" type="button" onClick={assets.reload}>重试</button>
            </div>
          )}

          {visible.length > 0 || assets.uploads.length > 0 ? (
            <div className="asset-grid">
              {assets.uploads.map((upload) => (
                <div className="asset is-pending" key={upload.id} role="status" aria-label={`正在上传 ${upload.name}`}>
                  <div className="asset-thumb"><span className="asset-spinner" /></div>
                  <div className="asset-info">
                    <span className="asset-name">{upload.name}</span>
                    <span className="asset-meta">上传中…</span>
                  </div>
                </div>
              ))}
              {visible.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onPreview={(target) => setPreviewId(target.id)}
                  onRename={onRename}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          ) : assets.status === 'ready' && (
            needle ? (
              <div className="empty">
                <b>没有名称包含「{query.trim()}」的素材</b>
                <span>换个关键词试试。</span>
              </div>
            ) : (
              <div className="asset-drop">
                <span className="asset-drop-icon"><UploadIcon /></span>
                <b>把图片拖到这里，或者直接粘贴截图</b>
                <span>PNG、JPG、WebP 都可以，长边超过 1800 px 会自动缩小。</span>
                <button className="ghost" type="button" onClick={pick}>选择图片</button>
              </div>
            )
          )}
        </>
      )}

      {dragging && (
        <div className="asset-drop-overlay" aria-hidden="true">
          <div><UploadIcon /><b>松开，上传到素材库</b></div>
        </div>
      )}
      {previewing && (
        <AssetPreview
          asset={previewing}
          usedBy={usage.get(previewing.id) ?? 0}
          onDelete={(asset) => {
            setPreviewId(null)
            setDeleting(asset)
          }}
          onClose={() => setPreviewId(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`删除「${deleting.name}」？`}
          body={(usage.get(deleting.id) ?? 0) > 0
            ? `有 ${usage.get(deleting.id)} 个项目用到了这张图片，它们不受影响，只是以后不能再从素材库里选它。`
            : '删除后不能再从素材库里选它。'}
          confirmLabel="删除"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const asset = deleting
            setDeleting(null)
            setPreviewId(null)
            onDelete(asset)
          }}
        />
      )}
    </section>
  )
}
