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

/** Points along an arc in endpoint form (SVG implementation notes F.6.5), `steps` of them after the start. */
function arcSamples(
  from: { x: number; y: number },
  rxIn: number,
  ryIn: number,
  rotation: number,
  largeArc: number,
  sweep: number,
  to: { x: number; y: number },
  steps: number,
): Array<{ x: number; y: number }> {
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  if (rx === 0 || ry === 0 || (from.x === to.x && from.y === to.y)) return [to]
  const phi = (rotation * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (from.x - to.x) / 2
  const dy = (from.y - to.y) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
  const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator))
  const cx1 = (factor * rx * y1) / ry
  const cy1 = (-factor * ry * x1) / rx
  const centreX = cos * cx1 - sin * cy1 + (from.x + to.x) / 2
  const centreY = sin * cx1 + cos * cy1 + (from.y + to.y) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI
  return Array.from({ length: steps }, (_, index) => {
    const theta = start + (delta * (index + 1)) / steps
    return {
      x: centreX + rx * Math.cos(theta) * cos - ry * Math.sin(theta) * sin,
      y: centreY + rx * Math.cos(theta) * sin + ry * Math.sin(theta) * cos,
    }
  })
}

/**
 * The box a path's outline runs through, in its own coordinates (curves and
 * arcs sampled finely enough for layout), or null for data it can't read.
 * The stroke is not included.
 */
export function pathDataBounds(d: string): { x: number; y: number; width: number; height: number } | null {
  const segments = parsePathData(d)
  if (!segments) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const STEPS = 16
  let current = { x: 0, y: 0 }
  let start = { x: 0, y: 0 }
  // The last curve's second control point, for the smooth (S, T) commands.
  let control = null as { x: number; y: number; cubic: boolean } | null
  const cubic = (c1: { x: number; y: number }, c2: { x: number; y: number }, end: { x: number; y: number }) => {
    for (let step = 1; step <= STEPS; step += 1) {
      const t = step / STEPS
      const u = 1 - t
      add(
        u * u * u * current.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
        u * u * u * current.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
      )
    }
  }
  const quadratic = (c: { x: number; y: number }, end: { x: number; y: number }) => {
    for (let step = 1; step <= STEPS; step += 1) {
      const t = step / STEPS
      const u = 1 - t
      add(u * u * current.x + 2 * u * t * c.x + t * t * end.x, u * u * current.y + 2 * u * t * c.y + t * t * end.y)
    }
  }
  for (const { command, values } of segments) {
    const kind = command.toLowerCase()
    const relative = command === kind
    const point = (x: number, y: number) => (relative ? { x: current.x + x, y: current.y + y } : { x, y })
    if (kind === 'z') {
      current = start
      control = null
      continue
    }
    const count = ARGUMENT_COUNTS[kind]
    for (let offset = 0; offset < values.length; offset += count) {
      const v = values.slice(offset, offset + count)
      let next = current
      let nextControl = null as { x: number; y: number; cubic: boolean } | null
      if (kind === 'm') {
        next = point(v[0], v[1])
        // Pairs after a moveto's first are linetos.
        if (offset === 0) start = next
      } else if (kind === 'l') {
        next = point(v[0], v[1])
      } else if (kind === 'h') {
        next = { x: relative ? current.x + v[0] : v[0], y: current.y }
      } else if (kind === 'v') {
        next = { x: current.x, y: relative ? current.y + v[0] : v[0] }
      } else if (kind === 'c' || kind === 's') {
        const c1 = kind === 'c'
          ? point(v[0], v[1])
          : control?.cubic ? { x: 2 * current.x - control.x, y: 2 * current.y - control.y } : current
        const c2 = kind === 'c' ? point(v[2], v[3]) : point(v[0], v[1])
        next = kind === 'c' ? point(v[4], v[5]) : point(v[2], v[3])
        cubic(c1, c2, next)
        nextControl = { ...c2, cubic: true }
      } else if (kind === 'q' || kind === 't') {
        const c = kind === 'q'
          ? point(v[0], v[1])
          : control && !control.cubic ? { x: 2 * current.x - control.x, y: 2 * current.y - control.y } : current
        next = kind === 'q' ? point(v[2], v[3]) : point(v[0], v[1])
        quadratic(c, next)
        nextControl = { ...c, cubic: false }
      } else if (kind === 'a') {
        next = point(v[5], v[6])
        for (const sample of arcSamples(current, v[0], v[1], v[2], v[3], v[4], next, STEPS)) add(sample.x, sample.y)
      }
      add(next.x, next.y)
      current = next
      control = nextControl
    }
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
