import { useRef, useState } from 'react'
import { useDismiss } from '../app/useDismiss'
import { t } from '../i18n'
import { ChevronDownIcon, DownloadIcon, LongImageIcon, StackIcon } from '../ui/icons'
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
  /** Every page stacked into one tall picture (PNG or JPG). */
  onExportLong: () => void
}

const FORMAT_LABELS = { png: 'PNG', jpeg: 'JPG', pdf: 'PDF' } as const

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
  onExportLong,
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
              {(['png', 'jpeg', 'pdf'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  className={prefs.exportFormat === format ? 'seg-btn on' : 'seg-btn'}
                  aria-pressed={prefs.exportFormat === format}
                  data-testid={`export-format-${format}`}
                  onClick={() => onPrefsChange({ exportFormat: format })}
                >
                  {FORMAT_LABELS[format]}
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
          {prefs.exportFormat !== 'png' && (
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
              {progress
                ? t('导出 {current}/{total}', progress)
                : prefs.exportFormat === 'pdf'
                  ? t('下载全部 {n} 页', { n: pageCount })
                  : t('打包下载全部 {n} 页', { n: pageCount })}
            </button>
            {prefs.exportFormat !== 'pdf' && (
              <button
                className="ghost"
                type="button"
                data-testid="freeform-export-long"
                disabled={disabled || exporting}
                onClick={onExportLong}
              >
                <LongImageIcon />
                {t('拼成一张长图')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
