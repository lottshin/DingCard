// QR code element support: payload validation and the shared constants.
// Deliberately free of the `qrcode` package — the document normalizer,
// validator, and reducer (which the server-side MCP renderer also bundles)
// import this module, and `qrcode`'s Node entry requires `fs` dynamically,
// which breaks ESM bundling. The module matrix lives in qrMatrix.ts, which
// only the browser view imports.

import type { QrErrorCorrectionLevel, QrModuleStyle } from './types'

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

export function isValidQrModuleStyle(value: unknown): value is QrModuleStyle {
  return value === 'square' || value === 'rounded' || value === 'dot'
}
