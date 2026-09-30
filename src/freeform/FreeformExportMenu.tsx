import { useRef, useState } from 'react'
import { useDismiss } from '../app/useDismiss'
import { t } from '../i18n'
import { ChevronDownIcon, DownloadIcon, StackIcon } from '../ui/icons'
import type { FreeformViewPrefs } from './viewPrefs'

type ExportPrefs = Pick<FreeformViewPrefs, 'exportFormat' | 'exportScale' | 'exportQuality'>

interface FreeformExportMenuProps {
  /** Export can't start (the canvas isn't measured yet, or an image edit is open). */
  disabled: boolean
  exporting: boolean
  progress: { current: number; total: number } | null
  pageCount: number
  prefs: ExportPrefs
  onPrefsChange: (patch: Partial<ExportPrefs>) => void
  onExportCurrent: () => void
  onExportAll: () => void
}

/** The editor's main action: one button that opens format, size and what to download. */
export function FreeformExportMenu({
  disabled,
  exporting,
  progress,
  pageCount,
  prefs,
  onPrefsChange,
  onExportCurrent,
  onExportAll,
}: FreeformExportMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useDismiss(rootRef, open, () => setOpen(false))
  const triggerLabel = progress ? t('导出 {current}/{total}', progress) : exporting ? t('导出中…') : t('导出')

  return (
    <div className="ff-export" ref={rootRef}>
      <button
        className="toolbar-primary editor-primary ff-export-trigger"
        type="button"
        data-testid="freeform-export"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerLabel}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <DownloadIcon />
        <span className="editor-primary-label">{triggerLabel}</span>
        <ChevronDownIcon className="ff-export-chevron" />
      </button>
      {open && (
        <div
          className="ff-export-panel"
          role="dialog"
          aria-label={t('导出')}
          data-testid="freeform-export-options"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          }}
        >
          <div className="ff-export-row">
            <span className="field-label">{t('格式')}</span>
            <div className="seg stretch">
              {(['png', 'jpeg'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  className={prefs.exportFormat === format ? 'seg-btn on' : 'seg-btn'}
                  aria-pressed={prefs.exportFormat === format}
                  data-testid={`export-format-${format}`}
                  onClick={() => onPrefsChange({ exportFormat: format })}
                >
                  {format === 'png' ? 'PNG' : 'JPG'}
                </button>
              ))}
            </div>
          </div>
          <div className="ff-export-row">
            <span className="field-label">{t('倍率')}</span>
            <div className="seg stretch">
              {([1, 2] as const).map((scale) => (
                <button
                  key={scale}
                  type="button"
                  className={prefs.exportScale === scale ? 'seg-btn on' : 'seg-btn'}
                  aria-pressed={prefs.exportScale === scale}
                  data-testid={`export-scale-${scale}x`}
                  onClick={() => onPrefsChange({ exportScale: scale })}
                >
                  {scale}x
                </button>
              ))}
            </div>
          </div>
          {prefs.exportFormat === 'jpeg' && (
            <div className="ff-export-row">
              <span className="field-label">{t('质量')}</span>
              <div className="paint-row">
                <input
                  className="paint-range"
                  data-testid="export-quality-range"
                  type="range"
                  min={50}
                  max={100}
                  value={Math.round(prefs.exportQuality * 100)}
                  onChange={(event) => onPrefsChange({ exportQuality: Number(event.currentTarget.value) / 100 })}
                  aria-label={t('导出质量')}
                />
                <span className="export-quality-value">{Math.round(prefs.exportQuality * 100)}%</span>
              </div>
            </div>
          )}
          <p className="ff-export-hint">
            {prefs.exportFormat === 'jpeg' ? t('JPG 不支持透明，导出自动衬白底。') : t('PNG 保留透明背景。')}
          </p>
          <div className="ff-export-actions">
            <button
              className="accent"
              type="button"
              data-testid="freeform-primary-export"
              disabled={disabled || exporting}
              onClick={onExportCurrent}
            >
              <DownloadIcon />
              {t('下载当前页')}
            </button>
            <button
              className="ghost"
              type="button"
              data-testid="freeform-export-all"
              disabled={disabled || exporting}
              onClick={onExportAll}
            >
              <StackIcon />
              {progress ? t('导出 {current}/{total}', progress) : t('打包下载全部 {n} 页', { n: pageCount })}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
