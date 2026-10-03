// Reading computed CSS values for the HTML import (htmlImport.ts).
//
// Everything here takes the strings getComputedStyle hands back — colours as
// rgb()/rgba(), lengths in px, gradients with their stops spelled out — and
// turns them into what a freeform document can hold. Nothing here touches
// the DOM, so it is tested on its own.

import { FONTS } from '../theme'
import type { BlendMode, ColorPaint, GradientStop, SceneFilter } from './types'

export interface Rgba {
  r: number
  g: number
  b: number
  /** 0–1. */
  a: number
}

/** Splits at `separator` outside parentheses and quotes ("rgb(1, 2, 3) 10%, red" → 2 parts). */
export function splitTopLevel(value: string, separator: ',' | ' ' = ','): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let current = ''
  for (const char of value) {
    if (quote) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    const splits = depth === 0 && (separator === ',' ? char === ',' : /\s/.test(char))
    if (splits) {
      if (current.trim()) parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function channel(value: string, scale: number): number | null {
  const trimmed = value.trim()
  if (trimmed === 'none') return 0
  const number = Number.parseFloat(trimmed)
  if (!Number.isFinite(number)) return null
  return trimmed.endsWith('%') ? (number / 100) * scale : number
}

/** rgb()/rgba() in comma or space syntax, and `transparent`; anything else is null. */
export function parseRgb(value: string): Rgba | null {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  const match = /^rgba?\((.*)\)$/.exec(trimmed)
  if (!match) return null
  const body = match[1]
  const [colors, alphaPart] = body.includes('/') ? body.split('/') : [body, undefined]
  const parts = colors.includes(',') ? colors.split(',') : colors.trim().split(/\s+/)
  const values = [...parts]
  let alphaText = alphaPart
  if (alphaText === undefined && values.length === 4) alphaText = values.pop()
  if (values.length !== 3) return null
  const [r, g, b] = values.map((part) => channel(part, 255))
  const a = alphaText === undefined ? 1 : channel(alphaText, 1)
  if (r === null || g === null || b === null || a === null) return null
  return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(a, 0, 1) }
}

export function hexOf(color: Pick<Rgba, 'r' | 'g' | 'b'>): string {
  const hex = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`
}

/** `top` painted over an opaque `bottom`: what the eye sees, opaque. */
export function blendOver(top: Rgba, bottom: Pick<Rgba, 'r' | 'g' | 'b'>): Rgba {
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  }
}

export function parsePx(value: string | null | undefined): number | null {
  if (!value) return null
  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? number : null
}

/** An angle in deg, rad, grad or turn, in degrees; null when it isn't one. */
export function parseAngle(value: string): number | null {
  const match = /^(-?[\d.]+(?:e-?\d+)?)(deg|rad|grad|turn)$/i.exec(value.trim())
  if (!match) return null
  const number = Number.parseFloat(match[1])
  if (!Number.isFinite(number)) return null
  const unit = match[2].toLowerCase()
  if (unit === 'rad') return (number * 180) / Math.PI
  if (unit === 'grad') return number * 0.9
  if (unit === 'turn') return number * 360
  return number
}

export interface CssGradientStop {
  /** Along the gradient line, 0–1 (may run past either end before normalizing). */
  offset: number
  color: Rgba
}

export type CssGradient =
  | { kind: 'linear'; angle: number; stops: CssGradientStop[] }
  /** Only the centred farthest-corner circle maps onto a freeform paint; `exact` says whether this is one. */
  | { kind: 'radial'; exact: boolean; stops: CssGradientStop[] }

const SIDE_ANGLES: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 }

/** The angle of `to <side or corner>` in a width × height box (CSS Images 3: corners depend on the box). */
function directionAngle(words: string[], width: number, height: number): number | null {
  const sides = words.filter((word) => word in SIDE_ANGLES)
  if (sides.length !== words.length || sides.length === 0 || sides.length > 2) return null
  if (sides.length === 1) return SIDE_ANGLES[sides[0]]
  const vertical = sides.find((side) => side === 'top' || side === 'bottom')
  const horizontal = sides.find((side) => side === 'left' || side === 'right')
  if (!vertical || !horizontal) return null
  // The gradient line is perpendicular to the diagonal joining the other two corners.
  const corner = (Math.atan2(height, width) * 180) / Math.PI
  if (vertical === 'top') return horizontal === 'right' ? corner : 360 - corner
  return horizontal === 'right' ? 180 - corner : 180 + corner
}

/** Spreads stops without positions between their neighbours, as CSS does; positions never go back. */
function placeStops(raw: Array<{ color: Rgba; offset: number | null }>): CssGradientStop[] {
  if (raw.length === 0) return []
  const offsets = raw.map((stop) => stop.offset)
  if (offsets[0] === null) offsets[0] = 0
  if (offsets[offsets.length - 1] === null) offsets[offsets.length - 1] = 1
  let highest = -Infinity
  for (let index = 0; index < offsets.length; index += 1) {
    const offset = offsets[index]
    if (offset === null) continue
    highest = Math.max(highest, offset)
    offsets[index] = highest
  }
  for (let index = 1; index < offsets.length; index += 1) {
    if (offsets[index] !== null) continue
    const start = index - 1
    let end = index
    while (offsets[end] === null) end += 1
    const from = offsets[start] as number
    const to = offsets[end] as number
    for (let gap = index; gap < end; gap += 1) offsets[gap] = from + ((to - from) * (gap - start)) / (end - start)
    index = end
  }
  return raw.map((stop, index) => ({ color: stop.color, offset: offsets[index] as number }))
}

function stopsOf(parts: string[], lineLength: number, resolveColor: (value: string) => Rgba | null): CssGradientStop[] | null {
  const raw: Array<{ color: Rgba; offset: number | null }> = []
  for (const part of parts) {
    const words = splitTopLevel(part, ' ')
    const colorWord = words.find((word) => resolveColor(word) !== null)
    if (!colorWord) {
      // A colour hint (a lone position between two stops) only bends the blend: skipped.
      if (words.length === 1 && /^-?[\d.]/.test(words[0])) continue
      return null
    }
    const color = resolveColor(colorWord) as Rgba
    const positions = words.filter((word) => word !== colorWord).map((word) => {
      const number = Number.parseFloat(word)
      if (!Number.isFinite(number)) return null
      if (word.endsWith('%')) return number / 100
      if (word.endsWith('px')) return lineLength > 0 ? number / lineLength : null
      return number === 0 ? 0 : null
    })
    if (positions.some((position) => position === null)) return null
    if (positions.length === 0) raw.push({ color, offset: null })
    for (const position of positions) raw.push({ color, offset: position })
  }
  return raw.length >= 2 ? placeStops(raw) : null
}

/**
 * A computed `linear-gradient(…)` or `radial-gradient(…)` laid over a
 * width × height box; null for repeating and conic gradients and anything
 * unreadable.
 */
export function parseGradient(
  value: string,
  width: number,
  height: number,
  resolveColor: (value: string) => Rgba | null = parseRgb,
): CssGradient | null {
  const match = /^(linear|radial)-gradient\((.*)\)$/s.exec(value.trim())
  if (!match) return null
  const args = splitTopLevel(match[2])
  if (args.length < 2) return null
  if (match[1] === 'linear') {
    let angle = 180
    const first = args[0]
    const explicit = parseAngle(first)
    if (explicit !== null) {
      angle = explicit
      args.shift()
    } else if (first.startsWith('to ')) {
      const direction = directionAngle(first.slice(3).trim().split(/\s+/), width, height)
      if (direction === null) return null
      angle = direction
      args.shift()
    }
    const radians = (angle * Math.PI) / 180
    const lineLength = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))
    const stops = stopsOf(args, lineLength, resolveColor)
    return stops ? { kind: 'linear', angle: ((angle % 360) + 360) % 360, stops } : null
  }
  // Radial: an optional shape/size/position prelude, then the stops.
  let exact = true
  let shapeCircle = false
  const preludeWords = resolveColor(splitTopLevel(args[0], ' ')[0]) === null ? splitTopLevel(args.shift() as string, ' ') : []
  if (preludeWords.length > 0) {
    const at = preludeWords.indexOf('at')
    const sizing = at >= 0 ? preludeWords.slice(0, at) : preludeWords
    const position = at >= 0 ? preludeWords.slice(at + 1) : []
    for (const word of sizing) {
      if (word === 'circle') shapeCircle = true
      else if (word !== 'ellipse' && word !== 'farthest-corner') exact = false
    }
    const centred = position.length === 0
      || position.every((word) => word === 'center' || word === '50%')
    if (!centred) exact = false
  }
  // The default ellipse only matches the freeform circle on a square box.
  if (!shapeCircle && Math.abs(width - height) > 0.5) exact = false
  const radius = Math.hypot(width, height) / 2
  const stops = stopsOf(args, radius, resolveColor)
  return stops ? { kind: 'radial', exact, stops } : null
}

function mix(a: Rgba, b: Rgba, t: number): Rgba {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  }
}

/** The colour a gradient has at `offset`, between its stops. */
export function gradientColorAt(stops: readonly CssGradientStop[], offset: number): Rgba {
  if (offset <= stops[0].offset) return stops[0].color
  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1]
    const next = stops[index]
    if (offset <= next.offset) {
      const span = next.offset - previous.offset
      return span <= 0 ? next.color : mix(previous.color, next.color, (offset - previous.offset) / span)
    }
  }
  return stops[stops.length - 1].color
}

/** The stops cut to 0–1 (colours at the ends interpolated) and thinned to at most `limit`. */
export function normalizedStops(stops: readonly CssGradientStop[], limit = 8): CssGradientStop[] {
  const inside = stops.filter((stop) => stop.offset > 0 && stop.offset < 1)
  let result: CssGradientStop[] = [
    { offset: 0, color: gradientColorAt(stops, 0) },
    ...inside,
    { offset: 1, color: gradientColorAt(stops, 1) },
  ]
  // Two stops at one place make a hard edge; keep them, but never more than the paint allows.
  while (result.length > limit) {
    // Drop the inner stop whose colour the line through its neighbours predicts best.
    let best = 1
    let bestError = Infinity
    for (let index = 1; index < result.length - 1; index += 1) {
      const previous = result[index - 1]
      const next = result[index + 1]
      const span = next.offset - previous.offset
      const predicted = span <= 0 ? next.color : mix(previous.color, next.color, (result[index].offset - previous.offset) / span)
      const actual = result[index].color
      const error = Math.abs(predicted.r - actual.r) + Math.abs(predicted.g - actual.g) + Math.abs(predicted.b - actual.b) + Math.abs(predicted.a - actual.a) * 255
      if (error < bestError) {
        bestError = error
        best = index
      }
    }
    result = [...result.slice(0, best), ...result.slice(best + 1)]
  }
  return result
}

/**
 * The freeform paint for a gradient whose stops are opaque or share one
 * alpha (returned apart, for the node's opacity); null when the stops fade
 * by different amounts (a paint has no per-stop alpha) or a radial isn't
 * the centred circle.
 */
export function gradientPaint(gradient: CssGradient): { paint: ColorPaint; alpha: number } | null {
  if (gradient.kind === 'radial' && !gradient.exact) return null
  const stops = normalizedStops(gradient.stops)
  const alpha = stops[0].color.a
  if (stops.some((stop) => Math.abs(stop.color.a - alpha) > 0.02)) return null
  const paintStops: GradientStop[] = stops.map((stop) => ({
    offset: Math.round(stop.offset * 10000) / 10000,
    color: hexOf(stop.color),
  }))
  if (gradient.kind === 'radial') return { paint: { type: 'radial-gradient', stops: paintStops }, alpha }
  const angle = Math.round(gradient.angle) % 360
  return {
    paint: paintStops.length === 2 && paintStops[0].offset === 0 && paintStops[1].offset === 1
      ? { type: 'linear-gradient', from: paintStops[0].color, to: paintStops[1].color, angle }
      : { type: 'linear-gradient', stops: paintStops, angle },
    alpha,
  }
}

export interface CssShadow {
  inset: boolean
  x: number
  y: number
  blur: number
  spread: number
  color: Rgba
}

/** A computed box-shadow or text-shadow list ("rgba(0, 0, 0, 0.2) 0px 4px 12px 0px, …"). */
export function parseShadows(value: string, resolveColor: (value: string) => Rgba | null = parseRgb): CssShadow[] {
  if (!value || value === 'none') return []
  const shadows: CssShadow[] = []
  for (const part of splitTopLevel(value)) {
    const words = splitTopLevel(part, ' ')
    let color: Rgba | null = null
    let inset = false
    const lengths: number[] = []
    for (const word of words) {
      if (word === 'inset') {
        inset = true
        continue
      }
      const length = /^-?[\d.]+(px)?$/.test(word) ? Number.parseFloat(word) : null
      if (length !== null && Number.isFinite(length)) {
        lengths.push(length)
        continue
      }
      color = resolveColor(word) ?? color
    }
    if (lengths.length < 2) continue
    shadows.push({
      inset,
      x: lengths[0],
      y: lengths[1],
      blur: Math.max(0, lengths[2] ?? 0),
      spread: lengths[3] ?? 0,
      color: color ?? { r: 0, g: 0, b: 0, a: 1 },
    })
  }
  return shadows
}

/** A 2D affine matrix [a, b, c, d, e, f] (x' = a·x + c·y + e, y' = b·x + d·y + f). */
export type Affine = [number, number, number, number, number, number]

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0]

export function multiplyAffine(left: Affine, right: Affine): Affine {
  const [a1, b1, c1, d1, e1, f1] = left
  const [a2, b2, c2, d2, e2, f2] = right
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

export function applyAffine(matrix: Affine, x: number, y: number): { x: number; y: number } {
  return { x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] }
}

/** A computed `transform` ("none", "matrix(…)", "matrix3d(…)") as a 2D matrix; null for a 3D one. */
export function parseTransform(value: string | null | undefined): Affine | null {
  if (!value || value === 'none') return IDENTITY
  const flat = /^matrix\((.*)\)$/.exec(value.trim())
  if (flat) {
    const numbers = flat[1].split(',').map((part) => Number.parseFloat(part))
    return numbers.length === 6 && numbers.every(Number.isFinite) ? (numbers as Affine) : null
  }
  const deep = /^matrix3d\((.*)\)$/.exec(value.trim())
  if (deep) {
    const n = deep[1].split(',').map((part) => Number.parseFloat(part))
    if (n.length !== 16 || !n.every(Number.isFinite)) return null
    // Flat when nothing moves along z: keep the 2D part.
    const flatEnough = Math.abs(n[2]) < 1e-6 && Math.abs(n[3]) < 1e-6 && Math.abs(n[6]) < 1e-6 && Math.abs(n[7]) < 1e-6
      && Math.abs(n[8]) < 1e-6 && Math.abs(n[9]) < 1e-6 && Math.abs(n[11]) < 1e-6 && Math.abs(n[14]) < 1e-6
      && Math.abs(n[15] - 1) < 1e-6
    return flatEnough ? [n[0], n[1], n[4], n[5], n[12], n[13]] : null
  }
  return null
}

/** The individual `translate`, `rotate` and `scale` properties, applied before `transform`; percentages are of the box. */
export function individualTransform(
  translate: string,
  rotate: string,
  scale: string,
  box: { width: number; height: number } = { width: 0, height: 0 },
): Affine | null {
  let matrix = IDENTITY
  if (translate && translate !== 'none') {
    const [x = '0', y = '0', z = '0'] = translate.trim().split(/\s+/)
    if (Number.parseFloat(z) !== 0) return null
    const length = (value: string, size: number) => {
      const number = Number.parseFloat(value)
      if (!Number.isFinite(number)) return null
      return value.endsWith('%') ? (number / 100) * size : number
    }
    const tx = length(x, box.width)
    const ty = length(y, box.height)
    if (tx === null || ty === null) return null
    matrix = multiplyAffine(matrix, [1, 0, 0, 1, tx, ty])
  }
  if (rotate && rotate !== 'none') {
    const words = rotate.trim().split(/\s+/)
    const angle = parseAngle(words[words.length - 1])
    // Only a turn about z ("45deg" or "z 45deg" / "0 0 1 45deg") stays flat.
    const axisFlat = words.length === 1 || (words.length === 2 && words[0] === 'z')
      || (words.length === 4 && Number.parseFloat(words[0]) === 0 && Number.parseFloat(words[1]) === 0)
    if (angle === null || !axisFlat) return null
    const radians = (angle * Math.PI) / 180
    matrix = multiplyAffine(matrix, [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0])
  }
  if (scale && scale !== 'none') {
    const [x = '1', y = x] = scale.trim().split(/\s+/)
    const sx = Number.parseFloat(x) * (x.endsWith('%') ? 0.01 : 1)
    const sy = Number.parseFloat(y) * (y.endsWith('%') ? 0.01 : 1)
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null
    matrix = multiplyAffine(matrix, [sx, 0, 0, sy, 0, 0])
  }
  return matrix
}

export function isIdentity(matrix: Affine, epsilon = 1e-6): boolean {
  return matrix.every((value, index) => Math.abs(value - IDENTITY[index]) < epsilon)
}

export function isTranslation(matrix: Affine, epsilon = 1e-6): boolean {
  return Math.abs(matrix[0] - 1) < epsilon && Math.abs(matrix[1]) < epsilon
    && Math.abs(matrix[2]) < epsilon && Math.abs(matrix[3] - 1) < epsilon
}

/** A turn and one scale; `exact` is false when the matrix also skews or stretches unevenly. */
export function similarityOf(matrix: Affine): { rotation: number; scale: number; exact: boolean } {
  const [a, b, c, d] = matrix
  const scaleX = Math.hypot(a, b)
  const determinant = a * d - b * c
  const scaleY = scaleX > 0 ? determinant / scaleX : 0
  const skew = scaleX > 0 ? (a * c + b * d) / (scaleX * scaleX) : 0
  const rotation = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  const scale = Math.sqrt(Math.abs(determinant))
  const exact = scaleX > 0 && Math.abs(scaleX - scaleY) < 1e-3 * Math.max(1, scaleX) && Math.abs(skew) < 1e-3
  return { rotation: Math.round(rotation * 1000) / 1000, scale, exact }
}

export interface FilterReading {
  filter: SceneFilter
  /** opacity() inside the filter, multiplied into the node's opacity. */
  opacity: number
  /** A drop-shadow() in the filter, for nodes without a box shadow. */
  dropShadow: CssShadow | null
  /** Functions with no freeform counterpart. */
  unsupported: string[]
}

/** A computed `filter` list mapped onto a freeform filter. */
export function parseFilter(value: string, resolveColor: (value: string) => Rgba | null = parseRgb): FilterReading {
  const reading: FilterReading = { filter: {}, opacity: 1, dropShadow: null, unsupported: [] }
  if (!value || value === 'none') return reading
  const functions = value.match(/[a-z-]+\((?:[^()]|\([^()]*\))*\)/g) ?? []
  for (const item of functions) {
    const match = /^([a-z-]+)\((.*)\)$/s.exec(item)
    if (!match) continue
    const name = match[1]
    const argument = match[2].trim()
    const amount = () => {
      const number = Number.parseFloat(argument)
      if (!Number.isFinite(number)) return 1
      return argument.endsWith('%') ? number / 100 : number
    }
    if (name === 'blur') reading.filter.blur = clamp(parsePx(argument) ?? 0, 0, 100)
    else if (name === 'brightness') reading.filter.brightness = clamp(amount(), 0, 3)
    else if (name === 'contrast') reading.filter.contrast = clamp(amount(), 0, 3)
    else if (name === 'saturate') reading.filter.saturation = clamp(amount(), 0, 3)
    else if (name === 'grayscale') reading.filter.grayscale = clamp(amount(), 0, 1)
    else if (name === 'sepia') reading.filter.sepia = clamp(amount(), 0, 1)
    else if (name === 'hue-rotate') {
      const angle = parseAngle(argument) ?? 0
      reading.filter.hue = ((Math.round(angle) % 360) + 360) % 360
    } else if (name === 'opacity') reading.opacity *= clamp(amount(), 0, 1)
    else if (name === 'drop-shadow') reading.dropShadow = parseShadows(argument, resolveColor)[0] ?? null
    else reading.unsupported.push(name)
  }
  // Values that change nothing stay out, so an unfiltered look stores no filter.
  const neutral: Record<string, number> = { brightness: 1, contrast: 1, saturation: 1, blur: 0, hue: 0, grayscale: 0, sepia: 0 }
  for (const key of Object.keys(reading.filter) as Array<keyof SceneFilter>) {
    if (Math.abs((reading.filter[key] as number) - neutral[key]) < 1e-6) delete reading.filter[key]
  }
  return reading
}

const BLEND_MODES = new Set<BlendMode>([
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
])

export function blendModeOf(value: string): BlendMode | null {
  return BLEND_MODES.has(value as BlendMode) ? (value as BlendMode) : null
}

export function isBoldWeight(value: string): boolean {
  const number = Number.parseFloat(value)
  if (Number.isFinite(number)) return number >= 600
  return value === 'bold' || value === 'bolder'
}

// What the freeform pickers offer, by how a stack can name them; sans is what a new text box gets.
const SANS = 'PingFang SC, Microsoft YaHei, system-ui, sans-serif'
const NOTO_SANS = FONTS[1].id
const NOTO_SERIF = FONTS[2].id
const WENKAI = FONTS[3].id
const XIAOWEI = FONTS[4].id
const SONGTI = FONTS[5].id
const SYSTEM = FONTS[6].id

const KNOWN_FAMILIES: Record<string, string> = {
  'pingfang sc': SANS,
  'pingfang tc': SANS,
  'pingfang hk': SANS,
  pingfang: SANS,
  苹方: SANS,
  'noto sans sc': NOTO_SANS,
  'noto sans cjk sc': NOTO_SANS,
  'source han sans sc': NOTO_SANS,
  'source han sans': NOTO_SANS,
  思源黑体: NOTO_SANS,
  'noto serif sc': NOTO_SERIF,
  'noto serif cjk sc': NOTO_SERIF,
  'source han serif sc': NOTO_SERIF,
  'source han serif': NOTO_SERIF,
  思源宋体: NOTO_SERIF,
  'lxgw wenkai tc': WENKAI,
  'lxgw wenkai': WENKAI,
  霞鹜文楷: WENKAI,
  'zcool xiaowei': XIAOWEI,
  站酷小薇: XIAOWEI,
  'songti sc': SONGTI,
  stsong: SONGTI,
  simsun: SONGTI,
  宋体: SONGTI,
  'system-ui': SYSTEM,
  '-apple-system': SYSTEM,
  blinkmacsystemfont: SYSTEM,
}

// Families that read the same as one we have: swapped without a word.
const LOOKALIKES: Record<string, string> = {
  'microsoft yahei': SANS,
  微软雅黑: SANS,
  'hiragino sans gb': SANS,
  'heiti sc': SANS,
  stheiti: SANS,
  黑体: SANS,
  simhei: SANS,
}

const SERIF_HINTS = /serif|times|georgia|garamond|baskerville|playfair|didot|bodoni|merriweather|lora|song|ming|明朝|宋|serif sc/i
const SCRIPT_HINTS = /kai|楷|cursive|hand|script|brush|comic|marker/i
const GENERIC_KINDS: Record<string, 'sans' | 'serif' | 'script'> = {
  'sans-serif': 'sans',
  'ui-sans-serif': 'sans',
  monospace: 'sans',
  'ui-monospace': 'sans',
  serif: 'serif',
  'ui-serif': 'serif',
  cursive: 'script',
  fantasy: 'script',
}
const SANS_GENERICS = new Set(['sans-serif', 'ui-sans-serif', 'arial', 'helvetica', 'helvetica neue', 'inter', 'roboto', 'segoe ui', 'sf pro display', 'sf pro text', 'avenir', 'avenir next', 'montserrat', 'poppins', 'open sans', 'lato'])

export interface FontChoice {
  /** The freeform font-family value. */
  fontFamily: string
  /** The family the stack asked for, when the freeform font stands in for it. */
  replaced: string | null
}

function familiesOf(stack: string): string[] {
  return splitTopLevel(stack).map((family) => family.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
}

/** The freeform font for a CSS font-family stack: the first family we have, else the closest kind. */
export function chooseFont(stack: string): FontChoice {
  const families = familiesOf(stack)
  for (const family of families) {
    const key = family.toLowerCase()
    if (KNOWN_FAMILIES[key]) return { fontFamily: KNOWN_FAMILIES[key], replaced: null }
    if (LOOKALIKES[key]) return { fontFamily: LOOKALIKES[key], replaced: null }
  }
  const primary = families[0] ?? ''
  const key = primary.toLowerCase()
  const generic = GENERIC_KINDS[key]
  // A generic family alone needs no word; a named one we lack is reported.
  const replaced = generic || key === '' ? null : primary
  // The stack's own generic family says what kind of font the author meant.
  const kind = families.map((family) => GENERIC_KINDS[family.toLowerCase()]).find(Boolean)
    ?? (SCRIPT_HINTS.test(primary) ? 'script' : SERIF_HINTS.test(primary) && !SANS_GENERICS.has(key) ? 'serif' : 'sans')
  return { fontFamily: kind === 'serif' ? NOTO_SERIF : kind === 'script' ? WENKAI : SANS, replaced }
}

export function applyTextTransform(text: string, transform: string): string {
  if (transform === 'uppercase') return text.toUpperCase()
  if (transform === 'lowercase') return text.toLowerCase()
  if (transform === 'capitalize') return text.replace(/(^|[\s　(（"“'‘-])(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase())
  return text
}

/** The text of a list item's marker, or null for none or a style we don't spell out. */
export function listMarkerText(listStyleType: string, index: number): string | null {
  switch (listStyleType) {
    case 'disc':
      return '•'
    case 'circle':
      return '◦'
    case 'square':
      return '▪'
    case 'decimal':
      return `${index}.`
    case 'decimal-leading-zero':
      return `${String(index).padStart(2, '0')}.`
    case 'lower-alpha':
    case 'lower-latin':
      return index >= 1 && index <= 26 ? `${String.fromCharCode(96 + index)}.` : null
    case 'upper-alpha':
    case 'upper-latin':
      return index >= 1 && index <= 26 ? `${String.fromCharCode(64 + index)}.` : null
    case 'cjk-decimal':
      return `${String(index).replace(/\d/g, (digit) => '〇一二三四五六七八九'[Number(digit)])}、`
    default:
      return null
  }
}

/** A `content` value of a ::before / ::after: its text, or what kept it from being one. */
export function pseudoContentText(content: string, attribute: (name: string) => string | null): { text: string } | { image: string } | { unsupported: string } | null {
  if (!content || content === 'none' || content === 'normal') return null
  const url = /^url\((['"]?)(.*?)\1\)$/.exec(content.trim())
  if (url) return { image: url[2] }
  let text = ''
  for (const part of splitTopLevel(content, ' ')) {
    const quoted = /^(['"])(.*)\1$/s.exec(part)
    if (quoted) {
      text += quoted[2].replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/\\(.)/g, '$1')
      continue
    }
    const attr = /^attr\(\s*([\w-]+)\s*\)$/.exec(part)
    if (attr) {
      text += attribute(attr[1]) ?? ''
      continue
    }
    if (part === 'open-quote') text += '“'
    else if (part === 'close-quote') text += '”'
    else if (part === 'no-open-quote' || part === 'no-close-quote') continue
    else return { unsupported: part }
  }
  return { text }
}
