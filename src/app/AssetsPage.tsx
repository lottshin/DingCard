import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { formatBytes, sortAssets, type Asset, type AssetOrder } from '../assets'
import { Select } from '../Select'
import { SearchIcon, UploadIcon } from '../ui/icons'
import { AssetCard, AssetPreview } from './AssetCard'
import { ASSET_ACCEPT, imageFiles } from './assetFiles'
import { ConfirmDialog } from './ConfirmDialog'
import { FontLibraryPanel, importFontFiles } from './FontLibraryPanel'
import type { AssetsState } from './useAssets'
import { FONT_FILE_ACCEPT } from '../freeform/fontFiles'
import { useImportedFonts } from '../freeform/fontLibrary'
import { t } from '../i18n'

interface AssetsPageProps {
  /** Whose library this is; null while the session is being checked. */
  ownerId: string | null
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

export function AssetsPage({ ownerId, assets, usage, onUpload, onRename, onDelete }: AssetsPageProps) {
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<AssetOrder>('recent')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Asset | null>(null)
  const [dragging, setDragging] = useState(false)
  // Pictures, or the fonts imported in this browser.
  const [kind, setKind] = useState<'images' | 'fonts'>('images')
  const [fontError, setFontError] = useState<string | null>(null)
  const fonts = useImportedFonts()
  const dragDepthRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const fontInputRef = useRef<HTMLInputElement>(null)
  const onUploadRef = useRef(onUpload)
  onUploadRef.current = onUpload
  const kindRef = useRef(kind)
  kindRef.current = kind
  const importFonts = (files: File[]) => {
    setFontError(null)
    void importFontFiles(files).then(setFontError)
  }

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
    if (!ownerId) return
    const onPaste = (event: ClipboardEvent) => {
      if (isTextTarget(event.target) || kindRef.current !== 'images') return
      const files = imageFiles(event.clipboardData?.files)
      if (files.length === 0) return
      event.preventDefault()
      onUploadRef.current(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [ownerId])

  const dropHandlers = ownerId
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
          if (files.length === 0) return
          if (kind === 'fonts') importFonts(files)
          else onUpload(files)
        },
      }
    : {}

  const pick = () => inputRef.current?.click()
  const pickFonts = () => fontInputRef.current?.click()

  return (
    <section className="page page-assets" aria-label={t('素材库')} {...dropHandlers}>
      <div className="page-head">
        <div>
          <h1>{t('素材库')}</h1>
        </div>
        {ownerId && (
          <div className="page-actions">
            <div className="tabs" role="group" aria-label={t('素材类型')}>
              <button type="button" aria-pressed={kind === 'images'} data-testid="asset-kind-images" onClick={() => setKind('images')}>
                {t('图片')} <span className="tnum">{all.length}</span>
              </button>
              <button type="button" aria-pressed={kind === 'fonts'} data-testid="asset-kind-fonts" onClick={() => setKind('fonts')}>
                {t('字体')} <span className="tnum">{fonts.length}</span>
              </button>
            </div>
            {kind === 'images' ? (
              <button className="accent" type="button" onClick={pick} data-testid="asset-upload">
                <UploadIcon />{t('上传图片')}
              </button>
            ) : (
              <button className="accent" type="button" onClick={pickFonts} data-testid="font-import">
                <UploadIcon />{t('导入字体')}
              </button>
            )}
          </div>
        )}
      </div>
      <input
        ref={fontInputRef}
        type="file"
        accept={FONT_FILE_ACCEPT}
        multiple
        hidden
        data-testid="font-file-input"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          if (files.length > 0) importFonts(files)
        }}
      />
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

      {ownerId && kind === 'fonts' && <FontLibraryPanel error={fontError} onPick={pickFonts} />}

      {!ownerId || kind !== 'images' ? null : (
        <>
          <div className="toolbar-row">
            <label className="search-field">
              <SearchIcon />
              <input
                type="search"
                value={query}
                placeholder={t('按名称搜索')}
                aria-label={t('搜索素材')}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <span className="asset-summary tnum">{t('{n} 张 · {size}', { n: all.length, size: formatBytes(totalBytes) })}</span>
            <span className="grow" />
            <Select
              value={order}
              title={t('排序')}
              onChange={(value) => setOrder(value as AssetOrder)}
              options={[{ id: 'recent', label: t('最近上传') }, { id: 'name', label: t('按名称') }]}
            />
          </div>

          {assets.status === 'error' && (
            <div className="empty">
              <b>{t('素材库读取失败')}</b>
              <span>{assets.error}</span>
              <button className="ghost" type="button" onClick={assets.reload}>{t('重试')}</button>
            </div>
          )}

          {visible.length > 0 || assets.uploads.length > 0 ? (
            <div className="asset-grid">
              {assets.uploads.map((upload) => (
                <div className="asset is-pending" key={upload.id} role="status" aria-label={t('正在上传 {name}', { name: upload.name })}>
                  <div className="asset-thumb"><span className="asset-spinner" /></div>
                  <div className="asset-info">
                    <span className="asset-name">{upload.name}</span>
                    <span className="asset-meta">{t('上传中…')}</span>
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
                <b>{t('没有名称包含「{query}」的素材', { query: query.trim() })}</b>
                <span>{t('换个关键词试试。')}</span>
              </div>
            ) : (
              <div className="asset-drop">
                <span className="asset-drop-icon"><UploadIcon /></span>
                <b>{t('把图片拖到这里，或者直接粘贴截图')}</b>
                <span>{t('PNG、JPG、WebP 都可以，长边超过 1800 px 会自动缩小。')}</span>
                <button className="ghost" type="button" onClick={pick}>{t('选择图片')}</button>
              </div>
            )
          )}
        </>
      )}

      {dragging && (
        <div className="asset-drop-overlay" aria-hidden="true">
          <div><UploadIcon /><b>{kind === 'fonts' ? t('松开，导入字体') : t('松开，上传到素材库')}</b></div>
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
          title={t('删除「{title}」？', { title: deleting.name })}
          body={(usage.get(deleting.id) ?? 0) > 0
            ? t('有 {n} 个项目用到了这张图片，它们不受影响，只是以后不能再从素材库里选它。', { n: usage.get(deleting.id) ?? 0 })
            : t('删除后不能再从素材库里选它。')}
          confirmLabel={t('删除')}
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
