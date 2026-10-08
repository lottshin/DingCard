// The progress element (v38): one number, 0–100, drawn as a bar across the
// element or a ring around its centre, with the done share in the accent
// colour. Sizes live here so the renderer, the editor and the tests share
// one truth.

export const PROGRESS_VALUE_MIN = 0
export const PROGRESS_VALUE_MAX = 100

/** 0–100 with at most one decimal, so a fifth of a goal still shows honestly. */
export function isValidProgressValue(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= PROGRESS_VALUE_MIN
    && value <= PROGRESS_VALUE_MAX
    && Math.round(value * 10) / 10 === value
}

export function isProgressKind(value: unknown): value is 'bar' | 'ring' {
  return value === 'bar' || value === 'ring'
}

export interface ProgressGeometry {
  bar: {
    track: { x: number; y: number; width: number; height: number; radius: number }
    fill: { x: number; y: number; width: number; height: number; radius: number } | null
    /** The share's label: on the fill when it is wide enough, else beside its end. */
    percent: { x: number; y: number; text: string; onFill: boolean }
    fontSize: number
  } | null
  ring: {
    cx: number
    cy: number
    radius: number
    /** The arc as an SVG path, open from the top clockwise to the done share. */
    fillPath: string | null
    percent: { x: number; y: number; text: string }
    fontSize: number
  } | null
}

export function progressPercentText(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`
}

export function progressGeometry(
  width: number,
  height: number,
  kind: 'bar' | 'ring',
  value: number,
): ProgressGeometry {
  const percent = progressPercentText(value)
  if (kind === 'ring') {
    const radius = Math.max(6, Math.min(width, height) / 2 - 4)
    const cx = width / 2
    const cy = height / 2
    const fontSize = Math.max(14, Math.min(radius * 0.42, 34))
    // Start at the top, sweep clockwise to the done share of the circle; a
    // full share draws the whole ring as two arcs (a closed arc renders none).
    const angle = (value / 100) * Math.PI * 2
    const endX = cx + radius * Math.sin(angle)
    const endY = cy - radius * Math.cos(angle)
    const fillPath = value <= 0
      ? null
      : value >= 100
        ? `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius}`
        : `M ${cx} ${cy - radius} A ${radius} ${radius} 0 ${value > 50 ? 1 : 0} 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`
    return {
      bar: null,
      ring: {
        cx,
        cy,
        radius,
        fillPath,
        percent: { x: cx, y: cy + fontSize * 0.36, text: percent },
        fontSize,
      },
    }
  }

  // The bar fills the element's height; the share rides inside when wide
  // enough, else just past the drawn fill's end.
  const fontSize = Math.max(11, Math.min(height * 0.52, 22))
  const radius = height / 2
  const fillWidth = Math.round((value / 100) * width)
  const drawnWidth = Math.max(fillWidth, height)
  const onFill = fillWidth >= fontSize * 2.2
  return {
    bar: {
      track: { x: 0, y: 0, width, height, radius },
      fill: value <= 0 ? null : { x: 0, y: 0, width: drawnWidth, height, radius },
      percent: {
        x: onFill ? Math.min(radius * 0.7, 14) : Math.min(drawnWidth + 12, width - 4),
        y: height / 2 + fontSize * 0.36,
        text: percent,
        onFill,
      },
      fontSize,
    },
    ring: null,
  }
}
