// QR code element support: payload validation and the module matrix the view
// renders as SVG. Wraps the `qrcode` package's synchronous `create()` — the
// browser build needs no canvas for it, so the code renders inline, stays
// crisp at any zoom, and exports with the artwork.

import { create as createQr } from 'qrcode'
import type { QrErrorCorrectionLevel } from './types'

/** Payloads stay short enough for every error-correction level. */
export const QR_PAYLOAD_MAX_LENGTH = 512
export const QR_DARK_DEFAULT = '#18181b'
export const QR_LIGHT_DEFAULT = '#ffffff'
export const QR_ECL_DEFAULT: QrErrorCorrectionLevel = 'M'

export function isValidQrPayload(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= QR_PAYLOAD_MAX_LENGTH
}

export function isValidQrEcl(value: unknown): value is QrErrorCorrectionLevel {
  return value === 'L' || value === 'M' || value === 'Q' || value === 'H'
}

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
