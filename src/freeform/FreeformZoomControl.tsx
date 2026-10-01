import { t } from '../i18n'

export interface FreeformZoomControlProps {
  zoomPercent: number
  canZoomOut: boolean
  canZoomIn: boolean
  onZoomOut: () => void
  onZoomIn: () => void
  onFit: () => void
}

/** Zoom alone in the stage's lower right corner; the value fits the page again. */
export function FreeformZoomControl({
  zoomPercent,
  canZoomOut,
  canZoomIn,
  onZoomOut,
  onZoomIn,
  onFit,
}: FreeformZoomControlProps) {
  return (
    <div className="freeform-zoom" role="group" aria-label={t('预览缩放')}>
      <button
        className="zoom-btn"
        type="button"
        aria-label={t('缩小画布')}
        title={t('缩小画布')}
        disabled={!canZoomOut}
        onClick={onZoomOut}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4 10h12" />
        </svg>
      </button>
      <button
        className="zoom-value"
        type="button"
        data-testid="freeform-zoom-value"
        title={t('适应画布')}
        onClick={onFit}
      >
        {zoomPercent}%
      </button>
      <button
        className="zoom-btn"
        type="button"
        aria-label={t('放大画布')}
        title={t('放大画布')}
        disabled={!canZoomIn}
        onClick={onZoomIn}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4v12M4 10h12" />
        </svg>
      </button>
    </div>
  )
}
