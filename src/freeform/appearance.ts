// Appearance property algorithms — pure validators shared by the document
// validator, the action reducer, and the runtime mutation checks.
//
// v6 adds optional appearance fields to scene leaves: `opacity` and `shadow`
// on every leaf, `lineHeight` / `letterSpacing` / `italic` on text, and
// `cornerRadius` on shapes. v7 adds a `filter` stack and `blendMode` on every
// leaf, `dash` / `cap` on lines, and the star/hexagon shapes. All fields are
// strictly bounded; absent means the respective default (opaque, no shadow,
// browser line-height, no tracking, upright text, the stylesheet's 16px rect
// radius, unfiltered, normal blending, solid round-cap strokes).

import { isHexColor } from './paint'
import type { BlendMode, SceneFilter, ShadowPaint } from './types'

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
