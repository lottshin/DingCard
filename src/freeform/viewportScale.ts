export const DEFAULT_ZOOM_PERCENT = 100
export const MIN_ZOOM_PERCENT = 10
export const MAX_ZOOM_PERCENT = 400
export const ZOOM_STEP = 10

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

export function calculateFitScale(
  stageContentWidth: number,
  stageContentHeight: number,
  slideWidth: number,
  slideHeight: number,
): number | null {
  if (![stageContentWidth, stageContentHeight, slideWidth, slideHeight].every(isPositiveFinite)) {
    return null
  }
  return Math.min(stageContentWidth / slideWidth, stageContentHeight / slideHeight)
}

export function calculateRenderScale(
  fitScale: number | null,
  zoomPercent: number,
): number | null {
  if (fitScale === null || !isPositiveFinite(fitScale) || !isPositiveFinite(zoomPercent)) {
    return null
  }
  return fitScale * (zoomPercent / 100)
}

export function clampZoomPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ZOOM_PERCENT
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, value))
}
