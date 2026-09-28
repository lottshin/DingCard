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

/**
 * Zoom step for one ctrl+wheel event: trackpad pinches fire many small deltas
 * (multiplicative), discrete mouse wheels fire ±100-ish notches.
 */
export function zoomPercentFromWheelDelta(current: number, deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return clampZoomPercent(current)
  if (!Number.isFinite(current) || current <= 0) return DEFAULT_ZOOM_PERCENT
  // Bound the exponent so extreme deltas stay finite through the multiply.
  const boundedDelta = Math.min(3000, Math.max(-3000, deltaY))
  const factor = Math.exp(-boundedDelta * 0.0015)
  return clampZoomPercent(Math.round(current * factor))
}
