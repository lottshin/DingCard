// Path data for the HTML import (htmlImport.ts): SVG shapes and CSS boxes the
// freeform shapes can't draw (an ellipse that isn't a circle, corners of
// different radii, an SVG drawing under a transform) become path nodes.
// Pure functions over numbers and strings, tested on their own.

import type { Affine } from './htmlImportCss'
import { applyAffine } from './htmlImportCss'
import { PATH_DATA_MAX_LENGTH, parsePathData } from './pathData'

function format(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

const ARGUMENTS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }

/** An arc's ellipse after a linear map: its radii and rotation (degrees); a closed-form 2×2 SVD. */
export function transformArc(
  rx: number,
  ry: number,
  rotation: number,
  matrix: Affine,
): { rx: number; ry: number; rotation: number } {
  const [A, B, C, D] = matrix
  const angle = (rotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const m00 = A * rx * cos + C * rx * sin
  const m01 = -A * ry * sin + C * ry * cos
  const m10 = B * rx * cos + D * rx * sin
  const m11 = -B * ry * sin + D * ry * cos
  const e = (m00 + m11) / 2
  const f = (m00 - m11) / 2
  const g = (m10 + m01) / 2
  const h = (m10 - m01) / 2
  const q = Math.hypot(e, h)
  const r = Math.hypot(f, g)
  const turn = (Math.atan2(g, f) + Math.atan2(h, e)) / 2
  return { rx: q + r, ry: Math.abs(q - r), rotation: (turn * 180) / Math.PI }
}

/**
 * Path data redrawn through an affine matrix, every command made absolute
 * (H/V become L, S/T their full curves); null when it isn't path data or
 * the result runs past what a path node holds.
 */
export function transformPathData(d: string, matrix: Affine): string | null {
  const segments = parsePathData(d)
  if (!segments) return null
  const flips = matrix[0] * matrix[3] - matrix[1] * matrix[2] < 0
  const out: string[] = []
  const point = (x: number, y: number) => {
    const mapped = applyAffine(matrix, x, y)
    return `${format(mapped.x)} ${format(mapped.y)}`
  }
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  // The last curve's second control point, for S and T reflections.
  let lastCubic: { x: number; y: number } | null = null
  let lastQuad: { x: number; y: number } | null = null
  for (const segment of segments) {
    const lower = segment.command.toLowerCase()
    const relative = segment.command !== segment.command.toUpperCase()
    const count = ARGUMENTS[lower]
    if (count === 0) {
      out.push('Z')
      cx = sx
      cy = sy
      lastCubic = null
      lastQuad = null
      continue
    }
    for (let index = 0; index + count <= segment.values.length; index += count) {
      const v = segment.values.slice(index, index + count)
      const ox = relative ? cx : 0
      const oy = relative ? cy : 0
      let command = lower
      if (lower === 'm' && index > 0) command = 'l'
      if (command === 'm') {
        cx = v[0] + ox
        cy = v[1] + oy
        sx = cx
        sy = cy
        out.push(`M ${point(cx, cy)}`)
        lastCubic = null
        lastQuad = null
      } else if (command === 'l' || command === 'h' || command === 'v') {
        if (command === 'l') {
          cx = v[0] + ox
          cy = v[1] + oy
        } else if (command === 'h') {
          cx = v[0] + (relative ? cx : 0)
        } else {
          cy = v[0] + (relative ? cy : 0)
        }
        out.push(`L ${point(cx, cy)}`)
        lastCubic = null
        lastQuad = null
      } else if (command === 'c' || command === 's') {
        let x1: number
        let y1: number
        let rest: number[]
        if (command === 'c') {
          x1 = v[0] + ox
          y1 = v[1] + oy
          rest = v.slice(2)
        } else {
          x1 = lastCubic ? 2 * cx - lastCubic.x : cx
          y1 = lastCubic ? 2 * cy - lastCubic.y : cy
          rest = v
        }
        const x2 = rest[0] + ox
        const y2 = rest[1] + oy
        const x = rest[2] + ox
        const y = rest[3] + oy
        out.push(`C ${point(x1, y1)} ${point(x2, y2)} ${point(x, y)}`)
        lastCubic = { x: x2, y: y2 }
        lastQuad = null
        cx = x
        cy = y
      } else if (command === 'q' || command === 't') {
        let qx: number
        let qy: number
        let rest: number[]
        if (command === 'q') {
          qx = v[0] + ox
          qy = v[1] + oy
          rest = v.slice(2)
        } else {
          qx = lastQuad ? 2 * cx - lastQuad.x : cx
          qy = lastQuad ? 2 * cy - lastQuad.y : cy
          rest = v
        }
        const x = rest[0] + ox
        const y = rest[1] + oy
        out.push(`Q ${point(qx, qy)} ${point(x, y)}`)
        lastQuad = { x: qx, y: qy }
        lastCubic = null
        cx = x
        cy = y
      } else if (command === 'a') {
        const x = v[5] + ox
        const y = v[6] + oy
        if (v[0] === 0 || v[1] === 0) {
          out.push(`L ${point(x, y)}`)
        } else {
          const arc = transformArc(Math.abs(v[0]), Math.abs(v[1]), v[2], matrix)
          const sweep = flips ? (v[4] ? 0 : 1) : v[4] ? 1 : 0
          out.push(`A ${format(arc.rx)} ${format(arc.ry)} ${format(arc.rotation)} ${v[3] ? 1 : 0} ${sweep} ${point(x, y)}`)
        }
        lastCubic = null
        lastQuad = null
        cx = x
        cy = y
      }
    }
  }
  const result = out.join(' ')
  return result.length > 0 && result.length <= PATH_DATA_MAX_LENGTH ? result : null
}

export interface CornerRadii {
  topLeft: [number, number]
  topRight: [number, number]
  bottomRight: [number, number]
  bottomLeft: [number, number]
}

/** Radii scaled down together when neighbours would overlap, as CSS does. */
export function fitCornerRadii(width: number, height: number, radii: CornerRadii): CornerRadii {
  const { topLeft, topRight, bottomRight, bottomLeft } = radii
  const factor = Math.min(
    1,
    width / Math.max(1e-9, topLeft[0] + topRight[0]),
    width / Math.max(1e-9, bottomLeft[0] + bottomRight[0]),
    height / Math.max(1e-9, topLeft[1] + bottomLeft[1]),
    height / Math.max(1e-9, topRight[1] + bottomRight[1]),
  )
  const scale = (corner: [number, number]): [number, number] => [corner[0] * factor, corner[1] * factor]
  return { topLeft: scale(topLeft), topRight: scale(topRight), bottomRight: scale(bottomRight), bottomLeft: scale(bottomLeft) }
}

/** A box with rounded corners (any radius each, elliptical too) as path data. */
export function roundedRectPath(x: number, y: number, width: number, height: number, radii: CornerRadii): string {
  const { topLeft, topRight, bottomRight, bottomLeft } = fitCornerRadii(width, height, radii)
  const right = x + width
  const bottom = y + height
  const arc = (corner: [number, number], toX: number, toY: number) => (
    corner[0] > 0 && corner[1] > 0 ? ` A ${format(corner[0])} ${format(corner[1])} 0 0 1 ${format(toX)} ${format(toY)}` : ` L ${format(toX)} ${format(toY)}`
  )
  return `M ${format(x + topLeft[0])} ${format(y)}`
    + ` L ${format(right - topRight[0])} ${format(y)}`
    + arc(topRight, right, y + topRight[1])
    + ` L ${format(right)} ${format(bottom - bottomRight[1])}`
    + arc(bottomRight, right - bottomRight[0], bottom)
    + ` L ${format(x + bottomLeft[0])} ${format(bottom)}`
    + arc(bottomLeft, x, bottom - bottomLeft[1])
    + ` L ${format(x)} ${format(y + topLeft[1])}`
    + arc(topLeft, x + topLeft[0], y)
    + ' Z'
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const left = `${format(cx - rx)} ${format(cy)}`
  const right = `${format(cx + rx)} ${format(cy)}`
  return `M ${left} A ${format(rx)} ${format(ry)} 0 1 0 ${right} A ${format(rx)} ${format(ry)} 0 1 0 ${left} Z`
}

/** "x1,y1 x2,y2 …" (any separators) as numbers in pairs. */
export function parsePoints(value: string): Array<{ x: number; y: number }> {
  const numbers = (value.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number)
  const points: Array<{ x: number; y: number }> = []
  for (let index = 0; index + 1 < numbers.length; index += 2) points.push({ x: numbers[index], y: numbers[index + 1] })
  return points
}

export function polylinePath(points: ReadonlyArray<{ x: number; y: number }>, closed: boolean): string | null {
  if (points.length < 2) return null
  const [first, ...rest] = points
  return `M ${format(first.x)} ${format(first.y)}${rest.map((p) => ` L ${format(p.x)} ${format(p.y)}`).join('')}${closed ? ' Z' : ''}`
}

/** An SVG <rect>: its rx/ry the way SVG resolves them (one given means both, at most half the side). */
export function svgRectPath(x: number, y: number, width: number, height: number, rx: number | null, ry: number | null): string {
  let radiusX = rx ?? ry ?? 0
  let radiusY = ry ?? rx ?? 0
  radiusX = Math.min(Math.max(0, radiusX), width / 2)
  radiusY = Math.min(Math.max(0, radiusY), height / 2)
  const corner: [number, number] = [radiusX, radiusY]
  return roundedRectPath(x, y, width, height, { topLeft: corner, topRight: corner, bottomRight: corner, bottomLeft: corner })
}
