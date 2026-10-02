// Path data for the decoration library (decorations.ts): smooth curves through
// points, brush strokes that taper at their ends, stars, bursts, hearts and
// scalloped rims. Everything returns SVG path data with coordinates rounded to
// a tenth, so the library stays small and the same on every machine.

export type Point = readonly [number, number]

function round(value: number): number {
  const rounded = Math.round(value * 10) / 10
  return Object.is(rounded, -0) ? 0 : rounded
}

const pair = ([x, y]: Point) => `${round(x)} ${round(y)}`

/** A point as path data writes it ("x y"), rounded to a tenth. */
export const coords = pair

/** A deterministic wobble in [-1, 1] for the n-th point of a drawing (hand-drawn lines aren't regular). */
export function jitter(seed: number, n: number): number {
  const value = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

function catmullRom(points: readonly Point[], closed: boolean) {
  const count = points.length
  const at = (index: number): Point => closed
    ? points[(index + count) % count]
    : points[Math.max(0, Math.min(count - 1, index))]
  const segments = closed ? count : count - 1
  return Array.from({ length: segments }, (_, index) => {
    const [p0, p1, p2, p3] = [at(index - 1), at(index), at(index + 1), at(index + 2)]
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    return { from: p1, c1, c2, to: p2 }
  })
}

/** A smooth curve through every point (Catmull–Rom, written as cubic Béziers). */
export function smoothPath(points: readonly Point[], closed = false): string {
  if (points.length < 2) return ''
  const curves = catmullRom(points, closed)
  return `M${pair(points[0])}${curves.map(({ c1, c2, to }) => `C${pair(c1)} ${pair(c2)} ${pair(to)}`).join('')}${closed ? 'Z' : ''}`
}

/** Straight segments through the points. */
export function polyline(points: readonly Point[], closed = false): string {
  return `M${points.map(pair).join('L')}${closed ? 'Z' : ''}`
}

/** Points along the smooth curve through `points`, `steps` per stretch between two of them. */
export function sampleCurve(points: readonly Point[], steps = 10, closed = false): Point[] {
  const samples: Point[] = [points[0]]
  for (const { from, c1, c2, to } of catmullRom(points, closed)) {
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      const u = 1 - t
      samples.push([
        u * u * u * from[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * to[0],
        u * u * u * from[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * to[1],
      ])
    }
  }
  return samples
}

export interface BrushOptions {
  /** Width at the ends, as a share of the full width. */
  tip?: number
  /** How much of the length each end takes to swell to full width. */
  taper?: number
  /** Where the stroke is widest, 0–1 along it (a pen pressed at the start is widest early). */
  peak?: number
}

/**
 * A brush stroke along the curve through `points`: a filled outline `width`
 * across at its widest, narrowing to `tip` at both ends, like a marker or a
 * brush pen pressed and lifted.
 */
export function brushStroke(points: readonly Point[], width: number, options: BrushOptions = {}): string {
  const { tip = 0.18, taper = 0.32, peak = 0.45 } = options
  const line = sampleCurve(points, 8)
  const lengths = [0]
  for (let index = 1; index < line.length; index += 1) {
    lengths.push(lengths[index - 1] + Math.hypot(line[index][0] - line[index - 1][0], line[index][1] - line[index - 1][1]))
  }
  const total = lengths[lengths.length - 1] || 1
  const left: Point[] = []
  const right: Point[] = []
  line.forEach((point, index) => {
    const before = line[Math.max(0, index - 1)]
    const after = line[Math.min(line.length - 1, index + 1)]
    const dx = after[0] - before[0]
    const dy = after[1] - before[1]
    const length = Math.hypot(dx, dy) || 1
    const t = lengths[index] / total
    // Swell from the tip to full width over `taper` of the length at each end; the start swells faster when the peak is early.
    const rise = Math.min(1, t / Math.max(0.01, taper * (peak / 0.5)))
    const fall = Math.min(1, (1 - t) / Math.max(0.01, taper * ((1 - peak) / 0.5)))
    const ease = Math.sin((Math.min(rise, fall) * Math.PI) / 2)
    const half = (width / 2) * (tip + (1 - tip) * ease)
    left.push([point[0] - (dy / length) * half, point[1] + (dx / length) * half])
    right.push([point[0] + (dy / length) * half, point[1] - (dx / length) * half])
  })
  return smoothPath([...left, ...right.reverse()], true)
}

/** Two strokes from `tip`, swept back from the direction the line arrives in: an open arrowhead. */
export function arrowHead(tip: Point, from: Point, length: number, spread = 28, lean = 0): string {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0])
  const wing = (side: number) => {
    const turn = angle + Math.PI + side * ((spread + side * lean) * Math.PI) / 180
    return [tip[0] + Math.cos(turn) * length, tip[1] + Math.sin(turn) * length] as Point
  }
  return `M${pair(wing(1))}L${pair(tip)}L${pair(wing(-1))}`
}

/** A star with `count` points between radii `outer` and `inner`, its first point straight up. */
export function starPoints(cx: number, cy: number, outer: number, inner: number, count: number, turn = 0): Point[] {
  return Array.from({ length: count * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (index * Math.PI) / count + (turn * Math.PI) / 180
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius] as Point
  })
}

/** A closed polygon whose corners are rounded off by `radius` (a share of each side kept straight). */
export function roundedPolygon(points: readonly Point[], radius: number): string {
  const count = points.length
  const corners = points.map((corner, index) => {
    const previous = points[(index - 1 + count) % count]
    const next = points[(index + 1) % count]
    const toward = (target: Point): Point => {
      const dx = target[0] - corner[0]
      const dy = target[1] - corner[1]
      const length = Math.hypot(dx, dy) || 1
      const reach = Math.min(radius, length / 2)
      return [corner[0] + (dx / length) * reach, corner[1] + (dy / length) * reach]
    }
    return { corner, enter: toward(previous), leave: toward(next) }
  })
  return `M${pair(corners[0].leave)}${corners.slice(1).concat(corners[0]).map(({ corner, enter, leave }) => (
    `L${pair(enter)}Q${pair(corner)} ${pair(leave)}`
  )).join('')}Z`
}

/** A four-pointed sparkle: tips on the axes, its sides drawn in towards the centre by `waist` (0–1). */
export function sparkle(cx: number, cy: number, radius: number, waist = 0.16): string {
  const w = radius * waist
  return `M${pair([cx, cy - radius])}Q${pair([cx + w, cy - w])} ${pair([cx + radius, cy])}`
    + `Q${pair([cx + w, cy + w])} ${pair([cx, cy + radius])}`
    + `Q${pair([cx - w, cy + w])} ${pair([cx - radius, cy])}`
    + `Q${pair([cx - w, cy - w])} ${pair([cx, cy - radius])}Z`
}

/** A heart filling the box at (x, y), `width` × `height`. */
export function heart(x: number, y: number, width: number, height: number): string {
  const p = (u: number, v: number): Point => [x + u * width, y + v * height]
  return `M${pair(p(0.5, 0.26))}`
    + `C${pair(p(0.42, 0.06))} ${pair(p(0.06, 0.02))} ${pair(p(0.02, 0.33))}`
    + `C${pair(p(-0.02, 0.62))} ${pair(p(0.3, 0.8))} ${pair(p(0.5, 0.98))}`
    + `C${pair(p(0.7, 0.8))} ${pair(p(1.02, 0.62))} ${pair(p(0.98, 0.33))}`
    + `C${pair(p(0.94, 0.02))} ${pair(p(0.58, 0.06))} ${pair(p(0.5, 0.26))}Z`
}

/** A circle as two arcs (path data has no circle command). */
export function circle(cx: number, cy: number, radius: number): string {
  return `M${pair([cx - radius, cy])}A${round(radius)} ${round(radius)} 0 1 0 ${pair([cx + radius, cy])}`
    + `A${round(radius)} ${round(radius)} 0 1 0 ${pair([cx - radius, cy])}Z`
}

/** A rectangle with round corners. */
export function roundedRect(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2)
  return `M${pair([x + r, y])}H${round(x + width - r)}A${round(r)} ${round(r)} 0 0 1 ${pair([x + width, y + r])}`
    + `V${round(y + height - r)}A${round(r)} ${round(r)} 0 0 1 ${pair([x + width - r, y + height])}`
    + `H${round(x + r)}A${round(r)} ${round(r)} 0 0 1 ${pair([x, y + height - r])}`
    + `V${round(y + r)}A${round(r)} ${round(r)} 0 0 1 ${pair([x + r, y])}Z`
}

/** A circle whose rim is `count` round bumps reaching out to `radius` (a rosette, a seal). */
export function scallop(cx: number, cy: number, radius: number, count: number, depth = 0.08): string {
  const inner = radius * (1 - depth)
  const points = Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count
    return [cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner] as Point
  })
  const bump = (2 * Math.PI * inner) / count / 2
  return `M${pair(points[0])}${points.slice(1).concat([points[0]]).map((point) => (
    `A${round(bump)} ${round(bump)} 0 0 1 ${pair(point)}`
  )).join('')}Z`
}

/** Points around an oval that runs on past where it began, as a pen circling a word does. */
export function loopPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  options: { turns?: number; start?: number; tilt?: number; spread?: number; seed?: number; steps?: number } = {},
): Point[] {
  const { turns = 1.14, start = 200, tilt = -4, spread = 0.07, seed = 1, steps = 22 } = options
  const tiltRadians = (tilt * Math.PI) / 180
  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps
    const angle = ((start + 360 * turns * progress) * Math.PI) / 180
    // The second time round runs a little wider, so the ends don't meet.
    const grow = 1 + spread * (progress - 0.5) + 0.015 * jitter(seed, index)
    const x = Math.cos(angle) * rx * grow
    const y = Math.sin(angle) * ry * grow
    return [
      cx + x * Math.cos(tiltRadians) - y * Math.sin(tiltRadians),
      cy + x * Math.sin(tiltRadians) + y * Math.cos(tiltRadians),
    ] as Point
  })
}

/** A wave across `width` from (x, y): `periods` full swings `amplitude` above and below. */
export function wavePoints(x: number, y: number, width: number, amplitude: number, periods: number): Point[] {
  const steps = periods * 4
  return Array.from({ length: steps + 1 }, (_, index) => {
    const phase = (index * Math.PI) / 2
    return [x + (width * index) / steps, y - Math.sin(phase) * amplitude] as Point
  })
}

/** A spiral from the centre out, `turns` times round, ending at `radius`. */
export function spiralPoints(cx: number, cy: number, radius: number, turns: number, steps = 40): Point[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps
    const angle = progress * turns * 2 * Math.PI
    const reach = radius * (0.08 + 0.92 * progress)
    return [cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach] as Point
  })
}
