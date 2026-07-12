import type { CSSProperties } from 'react'
import type { ColorPaint, ShapeFill, SlideBackground } from './types'

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

export function paintToCssBackground(paint: ColorPaint): string {
  return paint.type === 'solid'
    ? paint.color
    : `linear-gradient(${normalizeAngle(paint.angle)}deg, ${paint.from}, ${paint.to})`
}

export function slideBackgroundToCss(background: SlideBackground): string {
  return background.type === 'transparent' ? 'transparent' : paintToCssBackground(background)
}

export function shapeFillToStyle(fill: ShapeFill): CSSProperties {
  if (fill.type === 'image') {
    return {
      backgroundImage: `url("${fill.src}")`,
      backgroundSize: fill.fit,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
  }

  return { background: paintToCssBackground(fill) }
}

export function paintFallbackColor(fill: ColorPaint): string {
  return fill.type === 'solid' ? fill.color : fill.from
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
  return fill.type === 'solid' ? fill : { type: 'solid', color: fill.from }
}
