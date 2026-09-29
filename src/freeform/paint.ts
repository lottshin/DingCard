import type { CSSProperties } from 'react'
import type { ColorPaint, GradientStop, ShapeFill, SlideBackground } from './types'

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
  const angle = normalizeAngle(paint.angle)
  if (isStopsGradient(paint)) {
    const stops = paint.stops
      .map((stop) => `${stop.color} ${Math.round(stop.offset * 1000) / 10}%`)
      .join(', ')
    return `linear-gradient(${angle}deg, ${stops})`
  }
  return `linear-gradient(${angle}deg, ${paint.from}, ${paint.to})`
}

export function slideBackgroundToCss(background: SlideBackground): string {
  return background.type === 'transparent' ? 'transparent' : paintToCssBackground(background)
}

export function shapeFillToStyle(fill: ShapeFill): CSSProperties {
  if (fill.type === 'image') return {}
  if (fill.type === 'transparent') return { background: 'none' }

  return { background: paintToCssBackground(fill) }
}

export function paintFallbackColor(fill: ColorPaint): string {
  if (fill.type === 'solid') return fill.color
  return isStopsGradient(fill) ? fill.stops[0].color : fill.from
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
  return fill.type === 'linear-gradient'
    ? fill
    : {
        type: 'linear-gradient',
        from: fill.color,
        to: DEFAULT_GRADIENT_TO,
        angle: DEFAULT_GRADIENT_ANGLE,
      }
}

export function toSolidPaint(fill: ColorPaint): ColorPaint {
  if (fill.type === 'solid') return fill
  return { type: 'solid', color: paintFallbackColor(fill) }
}
