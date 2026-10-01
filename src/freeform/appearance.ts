// Appearance property algorithms — pure validators shared by the document
// validator, the action reducer, and the runtime mutation checks.
//
// v6 adds optional appearance fields to scene leaves: `opacity` and `shadow`
// on every leaf, `lineHeight` / `letterSpacing` / `italic` on text, and
// `cornerRadius` on shapes. v7 adds a `filter` stack and `blendMode` on every
// leaf, `dash` / `cap` on lines, and the star/hexagon shapes. v8 adds
// multi-stop gradient paints (`stops`) and the text outline (`stroke` /
// `strokeWidth` on text). v15 path nodes add `join` and `fillRule` and carry
// their own `viewBox`. All fields are strictly bounded; absent means the
// respective default (opaque, no shadow, browser line-height, no tracking,
// upright text, the stylesheet's 16px rect radius, unfiltered, normal
// blending, solid round-cap strokes, round joins, nonzero fills, no text
// outline).

import { isHexColor } from './paint'
import type {
  BlendMode,
  GradientStop,
  LinePoint,
  PathViewBox,
  SceneFilter,
  ShadowPaint,
} from './types'

const SHADOW_KEYS = new Set(['color', 'blur', 'offsetX', 'offsetY'])
const FILTER_KEYS = new Set(['brightness', 'contrast', 'saturation', 'blur'])

export const BLEND_MODES: readonly BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]

const BLEND_MODE_SET = new Set<string>(BLEND_MODES)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

export function isValidOpacity(value: unknown): value is number {
  return isFiniteIn(value, 0, 1)
}

export function isValidLineHeight(value: unknown): value is number {
  return isFiniteIn(value, 0.5, 4)
}

export function isValidLetterSpacing(value: unknown): value is number {
  return isFiniteIn(value, -50, 200)
}

export function isValidCornerRadius(value: unknown): value is number {
  return isFiniteIn(value, 0, 2000)
}

export function cloneShadowPaint(value: unknown): ShadowPaint | null {
  if (!isRecord(value)) return null
  const keys = Object.keys(value)
  if (keys.length !== SHADOW_KEYS.size || !keys.every((key) => SHADOW_KEYS.has(key))) return null
  if (
    !isHexColor(value.color) ||
    !isFiniteIn(value.blur, 0, 400) ||
    !isFiniteIn(value.offsetX, -1000, 1000) ||
    !isFiniteIn(value.offsetY, -1000, 1000)
  ) {
    return null
  }
  return {
    color: value.color,
    blur: value.blur,
    offsetX: value.offsetX,
    offsetY: value.offsetY,
  }
}

export function shadowPaintEquals(a: ShadowPaint | undefined, b: ShadowPaint | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.color === b.color
    && a.blur === b.blur
    && a.offsetX === b.offsetX
    && a.offsetY === b.offsetY
}

export function isValidBlendMode(value: unknown): value is BlendMode {
  return typeof value === 'string' && BLEND_MODE_SET.has(value)
}

/** Validate + clone a filter stack; null rejects. At least one key required. */
export function cloneSceneFilter(value: unknown): SceneFilter | null {
  if (!isRecord(value)) return null
  const keys = Object.keys(value)
  if (keys.length === 0 || !keys.every((key) => FILTER_KEYS.has(key))) return null
  const out: SceneFilter = {}
  for (const key of keys) {
    const clamp = key === 'blur' ? 100 : 3
    if (!isFiniteIn(value[key], 0, clamp)) return null
    out[key as keyof SceneFilter] = value[key] as number
  }
  return out
}

export function sceneFilterEquals(a: SceneFilter | undefined, b: SceneFilter | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (a[key as keyof SceneFilter] !== b[key as keyof SceneFilter]) return false
  }
  return true
}

export function sceneFilterCss(filter: SceneFilter): string {
  const parts: string[] = []
  if (filter.brightness !== undefined) parts.push(`brightness(${filter.brightness})`)
  if (filter.contrast !== undefined) parts.push(`contrast(${filter.contrast})`)
  if (filter.saturation !== undefined) parts.push(`saturate(${filter.saturation})`)
  if (filter.blur !== undefined) parts.push(`blur(${filter.blur}px)`)
  return parts.join(' ')
}

export function isValidDash(value: unknown): value is number {
  return isFiniteIn(value, 1, 500)
}

export function isValidLineCap(value: unknown): value is 'round' | 'butt' | 'square' {
  return value === 'round' || value === 'butt' || value === 'square'
}

export function isValidLineEndpointCap(value: unknown): value is 'none' | 'arrow' | 'dot' {
  return value === 'none' || value === 'arrow' || value === 'dot'
}

export const LINE_POINTS_MIN = 2
export const LINE_POINTS_MAX = 64
const LINE_POINT_KEYS = new Set(['x', 'y'])

/**
 * Clone a polyline vertex list: 2–64 points, each exactly `{x, y}` with
 * finite coordinates inside the node box (0 ≤ x ≤ width, 0 ≤ y ≤ height).
 */
export function cloneLinePoints(
  value: unknown,
  width: number,
  height: number,
): LinePoint[] | null {
  if (
    !Array.isArray(value)
    || value.length < LINE_POINTS_MIN
    || value.length > LINE_POINTS_MAX
  ) {
    return null
  }
  const points: LinePoint[] = []
  for (const entry of value) {
    if (!isRecord(entry)) return null
    const keys = Object.keys(entry)
    if (keys.length !== LINE_POINT_KEYS.size || !keys.every((key) => LINE_POINT_KEYS.has(key))) {
      return null
    }
    const { x, y } = entry
    if (
      typeof x !== 'number' || !Number.isFinite(x)
      || typeof y !== 'number' || !Number.isFinite(y)
      || x < 0 || x > width
      || y < 0 || y > height
    ) {
      return null
    }
    points.push({ x, y })
  }
  return points
}

export function isValidLineJoin(value: unknown): value is 'round' | 'miter' | 'bevel' {
  return value === 'round' || value === 'miter' || value === 'bevel'
}

export function isValidFillRule(value: unknown): value is 'nonzero' | 'evenodd' {
  return value === 'nonzero' || value === 'evenodd'
}

/** Path stroke width in viewBox units; 0 draws no stroke. */
export function isValidPathStrokeWidth(value: unknown): value is number {
  return isFiniteIn(value, 0, 10_000)
}

/** Path dash length in viewBox units: small viewBoxes need dashes under 1. */
export function isValidPathDash(value: unknown): value is number {
  return isFiniteIn(value, 0, 10_000) && value > 0
}

const VIEW_BOX_KEYS = new Set(['x', 'y', 'width', 'height'])

/** Clone a path viewBox: exactly `{x, y, width, height}`, finite, with a positive size. */
export function clonePathViewBox(value: unknown): PathViewBox | null {
  if (!isRecord(value)) return null
  const keys = Object.keys(value)
  if (keys.length !== VIEW_BOX_KEYS.size || !keys.every((key) => VIEW_BOX_KEYS.has(key))) return null
  const { x, y, width, height } = value
  if (
    typeof x !== 'number' || !Number.isFinite(x)
    || typeof y !== 'number' || !Number.isFinite(y)
    || typeof width !== 'number' || !Number.isFinite(width) || width <= 0
    || typeof height !== 'number' || !Number.isFinite(height) || height <= 0
  ) {
    return null
  }
  return { x, y, width, height }
}

export function pathViewBoxEquals(a: PathViewBox, b: PathViewBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export function isValidShape(value: unknown): value is 'rect' | 'ellipse' | 'triangle' | 'star' | 'hexagon' {
  return value === 'rect'
    || value === 'ellipse'
    || value === 'triangle'
    || value === 'star'
    || value === 'hexagon'
}

/** Shapes introduced in v7; older input versions must reject them. */
export function isV7Shape(value: unknown): boolean {
  return value === 'star' || value === 'hexagon'
}

const GRADIENT_STOP_KEYS = new Set(['offset', 'color'])
export const GRADIENT_STOPS_MIN = 2
export const GRADIENT_STOPS_MAX = 8

/**
 * Clone a multi-stop gradient stop list: 2–8 stops, each exactly
 * `{offset, color}` with a hex color and an ascending offset in [0, 1].
 */
export function cloneGradientStops(value: unknown): GradientStop[] | null {
  if (!Array.isArray(value) || value.length < GRADIENT_STOPS_MIN || value.length > GRADIENT_STOPS_MAX) {
    return null
  }
  const stops: GradientStop[] = []
  let previous = -1
  for (const entry of value) {
    if (!isRecord(entry)) return null
    const keys = Object.keys(entry)
    if (keys.length !== GRADIENT_STOP_KEYS.size || !keys.every((key) => GRADIENT_STOP_KEYS.has(key))) {
      return null
    }
    if (!isHexColor(entry.color)) return null
    const offset = entry.offset
    if (
      typeof offset !== 'number' || !Number.isFinite(offset)
      || offset < 0 || offset > 1 || offset <= previous
    ) {
      return null
    }
    previous = offset
    stops.push({ offset, color: entry.color })
  }
  return stops
}

export function gradientStopsEquals(
  a: GradientStop[] | undefined,
  b: GradientStop[] | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((stop, index) => stop.offset === b[index].offset && stop.color === b[index].color)
}

/** Text outline width in px; 0 would be invisible, so it stays strictly positive. */
export function isValidTextStrokeWidth(value: unknown): value is number {
  return isFiniteIn(value, 0.5, 100)
}
