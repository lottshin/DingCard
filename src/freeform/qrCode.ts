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

/**
 * A logo is drawn over the code's centre: an image reference (`img:<id>`), a
 * public path or a URL. Renders force error correction H so the covered
 * modules stay recoverable.
 */
export const QR_LOGO_SRC_MAX_LENGTH = 100_000

/** The blank margin around the code, in module units (v30). */
export const QR_QUIET_ZONE_DEFAULT = 2
export const QR_QUIET_ZONE_MAX = 4

export function isValidQrQuietZone(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= QR_QUIET_ZONE_MAX
}

export function isValidQrLogoSrc(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= QR_LOGO_SRC_MAX_LENGTH
}
