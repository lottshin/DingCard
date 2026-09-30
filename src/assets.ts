// Asset library model: images a user keeps for reuse across projects.
//
// Both storage backends hand the UI the same `Asset` shape. `src` is always
// directly displayable: a data URL in local mode, a managed upload URL in
// remote mode. Deleting an asset never touches projects that already use it:
// local projects embed their own copy, and remote drafts keep the upload alive.

export interface Asset {
  id: string
  name: string
  src: string
  width: number
  height: number
  bytes: number
  createdAt: number
}

export interface NewAssetInput {
  /** An already downscaled PNG / JPEG / WebP data URL. */
  dataUrl: string
  name: string
  width: number
  height: number
}

export type AssetOrder = 'recent' | 'name'

/** The formats the server accepts; the local store mirrors it so both modes behave alike. */
export const ASSET_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']
export const ASSET_NAME_MAX = 60
const DIMENSION_MAX = 20_000

export function normalizeAssetName(name: string, fallback = '未命名图片'): string {
  const collapsed = name.replace(/\s+/g, ' ').trim()
  return Array.from(collapsed || fallback).slice(0, ASSET_NAME_MAX).join('')
}

/** "photo-street.final.jpg" -> "photo-street.final" */
export function assetNameFromFile(filename: string): string {
  return normalizeAssetName(filename.replace(/\.[a-z0-9]{1,5}$/i, ''))
}

export function dataUrlMime(dataUrl: string): string | null {
  const match = /^data:([^;,]+)[;,]/i.exec(dataUrl)
  return match ? match[1].toLowerCase() : null
}

/** Decoded payload size of a data URL, without decoding it. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  const payload = dataUrl.slice(comma + 1)
  if (!/;base64$/i.test(dataUrl.slice(0, comma))) return payload.length
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding)
}

export function isAssetDimension(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= DIMENSION_MAX
}

export function isAsset(value: unknown): value is Asset {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Asset>
  return (
    typeof candidate.id === 'string' && candidate.id !== '' &&
    typeof candidate.name === 'string' &&
    typeof candidate.src === 'string' && candidate.src !== '' &&
    isAssetDimension(candidate.width) &&
    isAssetDimension(candidate.height) &&
    typeof candidate.bytes === 'number' && Number.isFinite(candidate.bytes) && candidate.bytes >= 0 &&
    typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
  )
}

const nameCollator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })

export function sortAssets(assets: readonly Asset[], order: AssetOrder = 'recent'): Asset[] {
  return [...assets].sort((a, b) => (
    order === 'name'
      ? nameCollator.compare(a.name, b.name) || b.createdAt - a.createdAt
      : b.createdAt - a.createdAt || nameCollator.compare(a.name, b.name)
  ))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
