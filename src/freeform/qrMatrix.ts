// The QR module matrix, rendered as SVG by the scene view. This is the only
// module that imports the `qrcode` package: its browser build is pure, but the
// Node entry dynamically requires `fs`, which must stay out of the
// server-side bundles (see qrCode.ts).

import { create as createQr } from 'qrcode'
import type { QrErrorCorrectionLevel } from './types'

export interface QrMatrix {
  /** Modules per side (a version-2 code is 25). */
  size: number
  /** Row-major module darkness. */
  rows: boolean[][]
}

/** The module matrix for a payload, or null when it cannot be encoded. */
export function qrMatrix(payload: string, ecl: QrErrorCorrectionLevel): QrMatrix | null {
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

/** The dark modules as one SVG path, offset by the quiet-zone size. */
export function qrPath(matrix: QrMatrix, quiet: number): string {
  const parts: string[] = []
  matrix.rows.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`)
    })
  })
  return parts.join('')
}
