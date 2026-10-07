import type { CSSProperties } from 'react'
import type { ColorPaint, GradientStop, PatternPaint, ShapeFill, SlideBackground } from './types'

export const DEFAULT_TEXT_PAINT: ColorPaint = { type: 'solid', color: '#18181b' }
export const DEFAULT_PAGE_PAINT: ColorPaint = { type: 'solid', color: '#ffffff' }
export const DEFAULT_SHAPE_PAINT: ColorPaint = { type: 'solid', color: '#fed7aa' }
export const DEFAULT_GRADIENT_TO = '#f97316'
export const DEFAULT_GRADIENT_ANGLE = 135

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value)
}

export function normalizeAngle(angle: unknown): number {
  if (typeof angle !== 'number' || !Number.isFinite(angle)) return DEFAULT_GRADIENT_ANGLE
  return ((Math.round(angle) % 360) + 360) % 360
}

export function normalizeColorPaint(value: unknown, fallback: ColorPaint): ColorPaint {
  if (!value || typeof value !== 'object') return fallback
  const record = value as Record<string, unknown>

  if (record.type === 'solid' && isHexColor(record.color)) {
    return { type: 'solid', color: record.color }
  }

  if (
    record.type === 'linear-gradient' &&
    isHexColor(record.from) &&
    isHexColor(record.to) &&
    typeof record.angle === 'number' &&
    Number.isFinite(record.angle)
  ) {
    return {
      type: 'linear-gradient',
      from: record.from,
      to: record.to,
      angle: normalizeAngle(record.angle),
    }
  }

  return fallback
}

/** The v8 multi-stop gradient variant of `linear-gradient`. */
export function isStopsGradient(
  paint: ColorPaint,
): paint is { type: 'linear-gradient'; stops: GradientStop[]; angle: number } {
  return paint.type === 'linear-gradient' && 'stops' in paint
}

export function paintToCssBackground(paint: ColorPaint): string {
  if (paint.type === 'solid') return paint.color
  const stops = (list: GradientStop[]) =>
    list.map((stop) => `${stop.color} ${Math.round(stop.offset * 1000) / 10}%`).join(', ')
  if (paint.type === 'radial-gradient') {
    return `radial-gradient(circle farthest-corner at 50% 50%, ${stops(paint.stops)})`
  }
  const angle = normalizeAngle(paint.angle)
  if (isStopsGradient(paint)) {
    return `linear-gradient(${angle}deg, ${stops(paint.stops)})`
  }
  return `linear-gradient(${angle}deg, ${paint.from}, ${paint.to})`
}

/** An SVG gradient laid out in box pixels (userSpaceOnUse). */
export type SvgGradient =
  | { kind: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: GradientStop[] }
  | { kind: 'radial'; cx: number; cy: number; r: number; stops: GradientStop[] }

/**
 * The SVG gradient that paints a width × height box exactly like
 * `paintToCssBackground` does: the CSS gradient line through the centre at
 * the paint's angle, long enough to reach the corners, or the centred circle
 * out to the farthest corner. Solid paints need no gradient.
 */
export function svgGradientOf(paint: ColorPaint, width: number, height: number): SvgGradient | null {
  if (paint.type === 'solid') return null
  if (paint.type === 'radial-gradient') {
    return { kind: 'radial', cx: width / 2, cy: height / 2, r: Math.hypot(width, height) / 2, stops: paint.stops }
  }
  const angle = (normalizeAngle(paint.angle) * Math.PI) / 180
  const dx = Math.sin(angle)
  const dy = -Math.cos(angle)
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2
  const stops = isStopsGradient(paint)
    ? paint.stops
    : [{ offset: 0, color: paint.from }, { offset: 1, color: paint.to }]
  return {
    kind: 'linear',
    x1: width / 2 - dx * half,
    y1: height / 2 - dy * half,
    x2: width / 2 + dx * half,
    y2: height / 2 + dy * half,
    stops,
  }
}

/** The page's CSS background; a picture background is drawn by its own layer (FreeformPageBackground). */
export function slideBackgroundToCss(background: SlideBackground): string {
  if (background.type === 'transparent' || background.type === 'image') return 'transparent'
  if (background.type === 'pattern') return patternPaintToCssBackground(background)
  return paintToCssBackground(background)
}

export const PAGE_PATTERNS = ['dots', 'grid', 'lines', 'checks'] as const
export type PagePattern = (typeof PAGE_PATTERNS)[number]
export const PAGE_PATTERN_LABELS = { dots: '圆点', grid: '网格', lines: '横线', checks: '方格' } as const
export const PAGE_PATTERN_SIZE_MIN = 8
export const PAGE_PATTERN_SIZE_MAX = 64
export const PAGE_PATTERN_SIZE_DEFAULT = 20

export function isValidPagePattern(value: unknown): value is PagePattern {
  return typeof value === 'string' && (PAGE_PATTERNS as readonly string[]).includes(value)
}

export function isValidPagePatternSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= PAGE_PATTERN_SIZE_MIN && value <= PAGE_PATTERN_SIZE_MAX
}

/** One repeat of the motif in px: the three densities the inspector offers. */
export const PAGE_PATTERN_SIZES = [12, 20, 32] as const
export const PAGE_PATTERN_SIZE_LABELS = { 12: '小', 20: '中', 32: '大' } as const

/**
 * The patterned page as one CSS `background` shorthand: the motif's tile over
 * the flat base colour, so the canvas, thumbnails, and exports all draw it
 * from the same string.
 */
export function patternPaintToCssBackground(paint: PatternPaint): string {
  const size = Math.round(paint.size)
  const motif = paint.patternColor
  const tile = `${size}px ${size}px`
  const layers: string[] = []
  if (paint.pattern === 'dots') {
    layers.push(`radial-gradient(circle, ${motif} 26%, transparent 27%) 0 0 / ${tile}`)
  } else if (paint.pattern === 'grid') {
    layers.push(`linear-gradient(${motif} 1px, transparent 1px) 0 0 / ${tile}`)
    layers.push(`linear-gradient(90deg, ${motif} 1px, transparent 1px) 0 0 / ${tile}`)
  } else if (paint.pattern === 'lines') {
    layers.push(`linear-gradient(${motif} 1px, transparent 1px) 0 0 / 100% ${size}px`)
  } else {
    const step = Math.max(4, Math.round(size / 4))
    layers.push(`repeating-linear-gradient(45deg, ${motif}, ${motif} 1px, transparent 1px, transparent ${step}px)`)
    layers.push(`repeating-linear-gradient(-45deg, ${motif}, ${motif} 1px, transparent 1px, transparent ${step}px)`)
  }
  return `${layers.join(', ')}, ${paint.color}`
}

/** A WCAG-style lightness read of a #RRGGBB colour, 0–1. */
function isLightColor(hex: string): boolean {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] > 0.4
}

/**
 * The patterned page an existing background turns into (v32): its own base
 * colour under ink dots by default, white dots when the base is dark.
 */
export function pagePatternFor(background: SlideBackground, pattern: PagePattern): PatternPaint {
  const color = background.type === 'transparent' || background.type === 'image'
    ? '#fdf6ec'
    : background.type === 'pattern'
      ? background.color
      : paintFallbackColor(background)
  const patternColor = background.type === 'pattern'
    ? background.patternColor
    : isLightColor(color) ? '#18181b' : '#ffffff'
  const size = background.type === 'pattern' ? background.size : PAGE_PATTERN_SIZE_DEFAULT
  return { type: 'pattern', color, patternColor, pattern, size }
}

export function shapeFillToStyle(fill: ShapeFill): CSSProperties {
  if (fill.type === 'image') return {}
  if (fill.type === 'transparent') return { background: 'none' }

  return { background: paintToCssBackground(fill) }
}

export function paintFallbackColor(fill: ColorPaint): string {
  if (fill.type === 'solid') return fill.color
  return isStopsGradient(fill) || fill.type === 'radial-gradient' ? fill.stops[0].color : fill.from
}

export function textFillToStyle(fill: ColorPaint): CSSProperties {
  if (fill.type === 'solid') return { color: fill.color }

  return {
    backgroundImage: paintToCssBackground(fill),
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
    caretColor: paintFallbackColor(fill),
  }
}

export function toGradientPaint(fill: ColorPaint): ColorPaint {
  if (fill.type === 'linear-gradient') return fill
  if (fill.type === 'radial-gradient') {
    return { type: 'linear-gradient', stops: fill.stops.map((stop) => ({ ...stop })), angle: DEFAULT_GRADIENT_ANGLE }
  }
  return {
    type: 'linear-gradient',
    from: fill.color,
    to: DEFAULT_GRADIENT_TO,
    angle: DEFAULT_GRADIENT_ANGLE,
  }
}

/** Enter the v12 radial form: keep any existing stops, fall back to a two-stop ramp. */
export function toRadialPaint(fill: ColorPaint): ColorPaint {
  if (fill.type === 'radial-gradient') return fill
  if (fill.type === 'linear-gradient' && 'stops' in fill) {
    return { type: 'radial-gradient', stops: fill.stops.map((stop) => ({ ...stop })) }
  }
  const from = fill.type === 'solid' ? fill.color : fill.from
  const to = fill.type === 'solid' ? DEFAULT_GRADIENT_TO : fill.to
  return {
    type: 'radial-gradient',
    stops: [
      { offset: 0, color: from },
      { offset: 1, color: to },
    ],
  }
}

export function toSolidPaint(fill: ColorPaint): ColorPaint {
  if (fill.type === 'solid') return fill
  return { type: 'solid', color: paintFallbackColor(fill) }
}
