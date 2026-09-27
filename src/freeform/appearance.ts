// Appearance property algorithms — pure validators shared by the document
// validator, the action reducer, and the runtime mutation checks.
//
// v6 adds optional appearance fields to scene leaves: `opacity` and `shadow`
// on every leaf, `lineHeight` / `letterSpacing` / `italic` on text, and
// `cornerRadius` on shapes. All fields are strictly bounded; absent means the
// respective default (opaque, no shadow, browser line-height, no tracking,
// upright text, the stylesheet's 16px rect radius).

import { isHexColor } from './paint'
import type { ShadowPaint } from './types'

const SHADOW_KEYS = new Set(['color', 'blur', 'offsetX', 'offsetY'])

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
