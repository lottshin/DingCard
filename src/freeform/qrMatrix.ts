// The QR module matrix, rendered as SVG by the scene view. This is the only
// module that imports the `qrcode` package: its browser build is pure, but the
// Node entry dynamically requires `fs`, which must stay out of the
// server-side bundles (see qrCode.ts).

import { create as createQr } from 'qrcode'
import type { QrModuleStyle } from './types'

export interface QrMatrix {
  /** Modules per side (a version-2 code is 25). */
  size: number
  /** Row-major module darkness. */
  rows: boolean[][]
}

/** The module matrix for a payload, or null when it cannot be encoded. */
export function qrMatrix(payload: string, ecl: 'L' | 'M' | 'Q' | 'H'): QrMatrix | null {
  try {
    const created = createQr(payload, { errorCorrectionLevel: ecl })
    const size = created.modules.size
    const data = created.modules.data
    const rows: boolean[][] = []
    for (let y = 0; y < size; y += 1) {
      const row: boolean[] = []
      for (let x = 0; x < size; x += 1) row.push(Boolean(data[y * size + x]))
      rows.push(row)
    }
    return { size, rows }
  } catch {
    return null
  }
}

/** A circle as a path: two arcs, so dots batch into one path element. */
function dotPath(cx: number, cy: number, radius: number): string {
  return `M${cx - radius} ${cy}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0z`
}

/** Whether a module belongs to one of the three finder patterns. */
function isFinderModule(x: number, y: number, size: number): boolean {
  return (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7)
}

/** The dot radius as a share of the module pitch: dots keep breathing room. */
const DOT_RADIUS = 0.42

/**
 * The dark modules as two SVG paths: the finder patterns (kept square in
 * every style so the code keeps scanning) and the data modules, shaped by
 * the style — squares, rounded squares (the view strokes them round), or
 * dots. Both are offset by the quiet-zone size.
 */
export function qrModulePaths(matrix: QrMatrix, quiet: number, style: QrModuleStyle): {
  finder: string
  data: string
} {
  const finder: string[] = []
  const data: string[] = []
  matrix.rows.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (!dark) return
      if (isFinderModule(x, y, matrix.size)) {
        finder.push(`M${x + quiet} ${y + quiet}h1v1h-1z`)
      } else if (style === 'dot') {
        data.push(dotPath(x + quiet + 0.5, y + quiet + 0.5, DOT_RADIUS))
      } else {
        data.push(`M${x + quiet} ${y + quiet}h1v1h-1z`)
      }
    })
  })
  return { finder: finder.join(''), data: data.join('') }
}
