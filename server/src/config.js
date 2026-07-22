// Runtime config, all overridable via environment variables.
//
// In production these come from the systemd EnvironmentFile (see deploy docs).
// Sensible local-dev defaults are provided so `npm run dev` just works.

import { randomBytes } from 'node:crypto'
import path from 'node:path'

const DEV = process.env.NODE_ENV !== 'production'
const DEFAULT_IMAGE_LEASE_MS = 86_400_000

function nonNegativeNumber(value, fallback) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export function positiveInteger(value, fallback) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

// Where SQLite db + uploaded images live. In prod: /var/dinka.
// Always resolved to an absolute path — @fastify/static (and sane file writes)
// require it, and we don't want to depend on the caller passing an absolute one.
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'))
const WEB_ROOT = process.env.WEB_ROOT

export const config = {
  dev: DEV,
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),

  dataDir: DATA_DIR,
  dbPath: path.resolve(process.env.DB_PATH || path.join(DATA_DIR, 'data.db')),
  uploadsDir: path.resolve(process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads')),

  // Optional co-located SPA. The image runtime makes it mandatory at startup.
  webRoot: WEB_ROOT && WEB_ROOT.trim() ? path.resolve(WEB_ROOT) : '',
  imageRuntime: process.env.DINGCARD_IMAGE === '1',

  // JWT signing secret. MUST be set in production. In dev we fall back to a
  // random per-boot secret (tokens don't survive a restart, which is fine locally).
  jwtSecret: process.env.JWT_SECRET || (DEV ? randomBytes(32).toString('hex') : ''),
  jwtExpiry: process.env.JWT_EXPIRY || '7d',

  bcryptCost: Number(process.env.BCRYPT_COST || 12),

  // Requests per minute. Auth stays tighter by default, while integration or
  // trusted private deployments can raise either cap explicitly.
  rateLimitMax: positiveInteger(process.env.RATE_LIMIT_MAX, 300),
  authRateLimitMax: positiveInteger(process.env.AUTH_RATE_LIMIT_MAX, 20),

  // Public URL prefix Fastify serves from uploadsDir.
  uploadsPublicPath: process.env.UPLOADS_PUBLIC_PATH || '/uploads',

  // Per-user storage quota in bytes (images). Default 500 MB. 0 = unlimited.
  userQuotaBytes: Number(process.env.USER_QUOTA_BYTES || 500 * 1024 * 1024),

  // Newly uploaded/retained images remain protected from GC for this long.
  // Invalid or negative values fall back to one day; 0 is allowed for tests.
  imageLeaseMs: nonNegativeNumber(process.env.IMAGE_LEASE_MS, DEFAULT_IMAGE_LEASE_MS),

  // Max single upload size enforced by the Fastify multipart endpoint.
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 6 * 1024 * 1024),

  // Comma-separated allowed origins for CORS. Empty = same-origin only (no CORS).
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
}

if (!config.dev && !config.jwtSecret) {
  throw new Error('JWT_SECRET must be set in production (refusing to start with an empty secret)')
}
