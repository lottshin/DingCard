// SVG path data for v15 path nodes.
//
// `parsePathData` is a strict reader for the SVG 1.1 path grammar: every
// command, implicit repetition, packed numbers ("1.5.5", "1-2") and packed
// arc flags. Anything a browser would stop drawing at is rejected outright,
// so a document never stores a path that renders half-way.
//
// A path node keeps its `d` in its own viewBox and stretches to the node
// box. `fitPathData` redraws the path in box pixels instead of letting the
// SVG viewBox scale it: coordinates map linearly, arcs keep their shape, and
// the stroke is drawn afterwards at one even width (`pathStrokeScale`), so a
// path stretched to a new aspect never gets thick and thin sides.

import type { PathViewBox } from './types'

export const PATH_DATA_MAX_LENGTH = 20_000

const ARGUMENT_COUNTS: Readonly<Record<string, number>> = {
  m: 2,
  l: 2,
  t: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  a: 7,
  z: 0,
}

export interface PathSegment {
  /** The command letter as written; lower case is relative. */
  command: string
  /** Every argument of the command, implicit repetitions included. */
  values: number[]
}

const NUMBER_RE = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y

function isWhitespace(char: string | undefined): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f'
}

function startsNumber(char: string | undefined): boolean {
  return char !== undefined && (char === '.' || char === '-' || char === '+' || (char >= '0' && char <= '9'))
}

/** Read SVG path data into segments; null for anything outside the grammar. */
export function parsePathData(d: unknown): PathSegment[] | null {
  if (typeof d !== 'string' || d.length === 0 || d.length > PATH_DATA_MAX_LENGTH) return null
  const length = d.length
  let index = 0
  const skipWhitespace = () => {
    while (index < length && isWhitespace(d[index])) index += 1
  }
  /** Whitespace, then at most one comma (and the whitespace after it); true when a comma went by. */
  const skipSeparator = (): boolean => {
    skipWhitespace()
    if (d[index] !== ',') return false
    index += 1
    skipWhitespace()
    return true
  }
  const readNumber = (): number | null => {
    NUMBER_RE.lastIndex = index
    const match = NUMBER_RE.exec(d)
    if (!match) return null
    const value = Number(match[0])
    if (!Number.isFinite(value)) return null
    index += match[0].length
    return value
  }
  const readFlag = (): number | null => {
    const char = d[index]
    if (char !== '0' && char !== '1') return null
    index += 1
    return char === '1' ? 1 : 0
  }

  const segments: PathSegment[] = []
  skipWhitespace()
  if (index >= length) return null
  while (index < length) {
    const command = d[index]
    const kind = command.toLowerCase()
    const count = ARGUMENT_COUNTS[kind]
    // Every path starts with a moveto.
    if (count === undefined || (segments.length === 0 && kind !== 'm')) return null
    index += 1
    skipWhitespace()
    if (count === 0) {
      segments.push({ command, values: [] })
      continue
    }
    const values: number[] = []
    for (;;) {
      for (let argument = 0; argument < count; argument += 1) {
        if (argument > 0) skipSeparator()
        const flag = kind === 'a' && (argument === 3 || argument === 4)
        const value = flag ? readFlag() : readNumber()
        if (value === null) return null
        // Arc radii are non-negative in the grammar.
        if (kind === 'a' && argument < 2 && value < 0) return null
        values.push(value)
      }
      const comma = skipSeparator()
      if (startsNumber(d[index])) continue
      // A comma only ever sits between two numbers.
      if (comma) return null
      break
    }
    segments.push({ command, values })
  }
  return segments
}

const VALID_CACHE_LIMIT = 400
const validCache = new Map<string, boolean>()

/** Whether a value is SVG path data a path node may store (results are cached per string). */
export function isValidPathData(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const cached = validCache.get(value)
  if (cached !== undefined) return cached
  const valid = parsePathData(value) !== null
  if (validCache.size >= VALID_CACHE_LIMIT) {
    const oldest = validCache.keys().next().value
    if (oldest !== undefined) validCache.delete(oldest)
  }
  validCache.set(value, valid)
  return valid
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

/**
 * The ellipse an arc follows, after stretching by (sx, sy): its radii and
 * rotation (degrees). The 2×2 map R(rotation)·diag(rx, ry) is stretched and
 * split back into a rotation and two radii (a closed-form 2×2 SVD).
 */
export function stretchArc(
  rx: number,
  ry: number,
  rotation: number,
  sx: number,
  sy: number,
): { rx: number; ry: number; rotation: number } {
  const angle = (rotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const a = sx * rx * cos
  const b = -sx * ry * sin
  const c = sy * rx * sin
  const d = sy * ry * cos
  const e = (a + d) / 2
  const f = (a - d) / 2
  const g = (c + b) / 2
  const h = (c - b) / 2
  const q = Math.hypot(e, h)
  const r = Math.hypot(f, g)
  const turn = (Math.atan2(g, f) + Math.atan2(h, e)) / 2
  return { rx: q + r, ry: Math.abs(q - r), rotation: (turn * 180) / Math.PI }
}

/** How much the stroke grows with the path: the geometric mean of the two stretches. */
export function pathStrokeScale(viewBox: PathViewBox, width: number, height: number): number {
  return Math.sqrt((width / viewBox.width) * (height / viewBox.height))
}

const FIT_CACHE_LIMIT = 400
const fitCache = new Map<string, string | null>()

/**
 * Redraw path data from its viewBox into a width × height box (box pixels,
 * origin top-left). Absolute coordinates shift and stretch, relative ones
 * only stretch, and arcs are re-fitted to the stretched ellipse.
 */
export function fitPathData(
  d: string,
  viewBox: PathViewBox,
  width: number,
  height: number,
): string | null {
  const key = `${width},${height},${viewBox.x},${viewBox.y},${viewBox.width},${viewBox.height}|${d}`
  const cached = fitCache.get(key)
  if (cached !== undefined) return cached
  const fitted = computeFittedPath(d, viewBox, width, height)
  if (fitCache.size >= FIT_CACHE_LIMIT) {
    const oldest = fitCache.keys().next().value
    if (oldest !== undefined) fitCache.delete(oldest)
  }
  fitCache.set(key, fitted)
  return fitted
}

function computeFittedPath(
  d: string,
  viewBox: PathViewBox,
  width: number,
  height: number,
): string | null {
  const segments = parsePathData(d)
  if (!segments) return null
  const sx = width / viewBox.width
  const sy = height / viewBox.height
  const tx = -viewBox.x * sx
  const ty = -viewBox.y * sy
  const x = (value: number, relative: boolean) => formatNumber(relative ? value * sx : value * sx + tx)
  const y = (value: number, relative: boolean) => formatNumber(relative ? value * sy : value * sy + ty)
  const parts: string[] = []
  segments.forEach((segment, segmentIndex) => {
    const kind = segment.command.toLowerCase()
    const relative = segment.command === kind
    const values = segment.values
    if (kind === 'z') {
      parts.push(segment.command)
      return
    }
    if (kind === 'h') {
      parts.push(segment.command + values.map((value) => x(value, relative)).join(' '))
      return
    }
    if (kind === 'v') {
      parts.push(segment.command + values.map((value) => y(value, relative)).join(' '))
      return
    }
    if (kind === 'a') {
      const groups: string[] = []
      for (let offset = 0; offset < values.length; offset += 7) {
        const arc = stretchArc(values[offset], values[offset + 1], values[offset + 2], sx, sy)
        groups.push([
          formatNumber(arc.rx),
          formatNumber(arc.ry),
          formatNumber(arc.rotation),
          String(values[offset + 3]),
          String(values[offset + 4]),
          x(values[offset + 5], relative),
          y(values[offset + 6], relative),
        ].join(' '))
      }
      parts.push(segment.command + groups.join(' '))
      return
    }
    // Coordinate pairs (m, l, t, c, s, q). A path's opening "m" is measured
    // from the origin, so its first point moves like an absolute one.
    const openingMove = segmentIndex === 0 && segment.command === 'm'
    const pairs: string[] = []
    for (let offset = 0; offset < values.length; offset += 2) {
      const absolute = openingMove && offset === 0
      pairs.push(`${x(values[offset], relative && !absolute)} ${y(values[offset + 1], relative && !absolute)}`)
    }
    if (openingMove) {
      parts.push(`M${pairs[0]}`)
      if (pairs.length > 1) parts.push(`l${pairs.slice(1).join(' ')}`)
      return
    }
    parts.push(segment.command + pairs.join(' '))
  })
  return parts.join('')
}
