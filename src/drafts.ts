// Per-user draft storage, backed by localStorage.
//
// Drafts are namespaced by user id so two accounts in the same browser don't
// see each other's work. This is client-only and does not sync across devices.
// What is written can be packed first: the local store swaps big pictures for
// refs to IndexedDB (storage/localPictures.ts), which these functions never read.

import { normalizeFreeformDocument } from './freeform/sceneDocument'
import type { FreeformDocument } from './freeform/types'
import { collectImages } from './imageStore'
import type { Profile } from './theme'
import type { WorkspaceMode } from './workspaces/types'

const KEY_PREFIX = 'slicer.drafts.'
const DEFAULT_CARD_RADIUS = 18

export interface MarkdownCardDocument {
  source: string
  platformId: string
  themeId: string
  fontFamily: string
  profile: Profile
  radius: number
  /** ref -> dataURL for every image used in `source`, so drafts survive the
   *  session-scoped image store being cleared. */
  images?: Record<string, string>
}

export interface DraftEnvelopeBase {
  id: string
  title: string
  schemaVersion: 2
  updatedAt: number
}

export type MarkdownDraft = DraftEnvelopeBase & {
  mode: 'markdown-card'
  document: MarkdownCardDocument
}

export type FreeformDraft = DraftEnvelopeBase & {
  mode: 'freeform-slide'
  document: FreeformDocument
}

export type Draft = MarkdownDraft | FreeformDraft

export type SaveDraftInput = {
  id?: string
  title?: string
} & (
  | {
      mode: 'markdown-card'
      document: Omit<MarkdownCardDocument, 'images'> & {
        images?: Record<string, string>
      }
    }
  | {
      mode: 'freeform-slide'
      document: FreeformDocument
    }
)

function keyFor(userId: string): string {
  return KEY_PREFIX + userId
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isProfile(value: unknown): value is Profile {
  if (!isRecord(value)) return false
  return (
    isString(value.nickname) &&
    isString(value.handle) &&
    isString(value.location) &&
    isString(value.avatarColor) &&
    (isString(value.avatarImage) || value.avatarImage === null) &&
    isBoolean(value.verified) &&
    isBoolean(value.headerFirstPageOnly)
  )
}

function isImageMap(value: unknown): value is Record<string, string> {
  if (value === undefined) return true
  if (!isRecord(value)) return false
  return Object.values(value).every(isString)
}

/** Structural check for a markdown card document (used by reads, imports, and the render page). */
export function isMarkdownDocument(value: unknown): value is MarkdownCardDocument {
  if (!isRecord(value)) return false
  return (
    isString(value.source) &&
    isString(value.platformId) &&
    isString(value.themeId) &&
    isString(value.fontFamily) &&
    isProfile(value.profile) &&
    isNumber(value.radius) &&
    isImageMap(value.images)
  )
}

function normalizeMarkdownDocument(raw: Record<string, unknown>): MarkdownCardDocument | null {
  const document = {
    source: raw.source,
    platformId: raw.platformId,
    themeId: raw.themeId,
    fontFamily: raw.fontFamily,
    profile: raw.profile,
    radius: isNumber(raw.radius) ? raw.radius : DEFAULT_CARD_RADIUS,
    images: raw.images,
  }
  return isMarkdownDocument(document) ? document : null
}

export function normalizeDraftForRead(raw: unknown): Draft | null {
  if (!isRecord(raw)) return null

  if (
    raw.schemaVersion === 2 &&
    isString(raw.id) &&
    isString(raw.title) &&
    isNumber(raw.updatedAt) &&
    isString(raw.mode) &&
    isRecord(raw.document)
  ) {
    if (raw.mode === 'markdown-card' && isMarkdownDocument(raw.document)) {
      return {
        id: raw.id,
        title: raw.title,
        schemaVersion: 2,
        mode: 'markdown-card',
        document: raw.document,
        updatedAt: raw.updatedAt,
      }
    }
    if (raw.mode === 'freeform-slide') {
      const document = normalizeFreeformDocument(raw.document)
      if (!document) return null
      return {
        id: raw.id,
        title: raw.title,
        schemaVersion: 2,
        mode: 'freeform-slide',
        document,
        updatedAt: raw.updatedAt,
      }
    }
    return null
  }

  if (isString(raw.id) && isString(raw.title) && isNumber(raw.updatedAt)) {
    const document = normalizeMarkdownDocument(raw)
    if (!document) return null
    return {
      id: raw.id,
      title: raw.title,
      schemaVersion: 2,
      mode: 'markdown-card',
      document,
      updatedAt: raw.updatedAt,
    }
  }

  return null
}

/** Validate save input through the same document normalizers used by reads. */
export function normalizeDraftForWrite(raw: unknown): SaveDraftInput | null {
  if (!isRecord(raw)) return null
  if (raw.id !== undefined && !isString(raw.id)) return null
  if (raw.title !== undefined && !isString(raw.title)) return null

  const normalized = normalizeDraftForRead({
    id: raw.id ?? '__draft-validation__',
    title: raw.title ?? '',
    schemaVersion: 2,
    updatedAt: 0,
    mode: raw.mode,
    document: raw.document,
  })
  if (!normalized) return null

  const identity = {
    ...(raw.id !== undefined ? { id: raw.id } : {}),
    ...(raw.title !== undefined ? { title: raw.title } : {}),
  }
  return normalized.mode === 'freeform-slide'
    ? { ...identity, mode: normalized.mode, document: normalized.document }
    : { ...identity, mode: normalized.mode, document: normalized.document }
}

export function listDrafts(userId: string): Draft[] {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeDraftForRead)
      .filter((draft): draft is Draft => draft !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

/** How a draft is written down; unpacked drafts are stored as they are. */
export type DraftPacker = (draft: Draft) => Draft

function writeAll(userId: string, drafts: Draft[], pack?: DraftPacker) {
  if (drafts.length === 0) localStorage.removeItem(keyFor(userId))
  else localStorage.setItem(keyFor(userId), JSON.stringify(pack ? drafts.map(pack) : drafts))
}

/** Every account's drafts on this device exactly as stored, for finding what they still name. */
export function storedDraftLists(): string[] {
  const lists: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(KEY_PREFIX)) lists.push(localStorage.getItem(key) ?? '')
  }
  return lists
}

/** Derive a human title from the first non-empty line of the source. */
export function deriveMarkdownTitle(source: string): string {
  const line = source
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0)
  if (!line) return '未命名草稿'
  return line.length > 24 ? line.slice(0, 24) + '…' : line
}

function deriveFreeformTitle(document: FreeformDocument): string {
  return document.slides[0]?.name?.trim() || '自由编辑作品'
}

function deriveTitle(data: SaveDraftInput): string {
  if (data.title?.trim()) return data.title.trim()
  if (data.mode === 'markdown-card') return deriveMarkdownTitle(data.document.source)
  return deriveFreeformTitle(data.document)
}

/**
 * Insert or update a draft. If `data.id` matches an existing draft it is
 * overwritten in place; otherwise a new draft is created. Returns the saved
 * draft (with a fresh id/timestamp/title filled in).
 */
export function saveDraft(userId: string, data: SaveDraftInput, pack?: DraftPacker): Draft {
  const normalized = normalizeDraftForWrite(data)
  if (!normalized) throw new Error('草稿内容无效')
  data = normalized
  const drafts = listDrafts(userId)
  const base = {
    id: data.id ?? crypto.randomUUID(),
    title: deriveTitle(data),
    schemaVersion: 2 as const,
    updatedAt: Date.now(),
  }

  const draft: Draft =
    data.mode === 'markdown-card'
      ? {
          ...base,
          mode: 'markdown-card',
          document: {
            ...data.document,
            images: data.document.images ?? collectImages(data.document.source),
          },
        }
      : {
          ...base,
          mode: 'freeform-slide',
          document: data.document,
        }

  const idx = drafts.findIndex((d) => d.id === draft.id)
  if (idx >= 0) drafts[idx] = draft
  else drafts.push(draft)

  writeAll(userId, drafts, pack)
  return draft
}

export function deleteDraft(userId: string, id: string, pack?: DraftPacker) {
  writeAll(
    userId,
    listDrafts(userId).filter((d) => d.id !== id),
    pack,
  )
}

export function draftTitle(draft: Draft): string {
  return draft.title
}

export type ImportDraftOutcome =
  | { ok: true; data: SaveDraftInput }
  | { ok: false; error: string }

/**
 * Parse an imported JSON file into save-ready draft data.
 *
 * Accepts the two document shapes the automation surface produces:
 * a freeform document (any version — normalized/migrated to v4) or a
 * markdown document envelope. Everything else is rejected with a
 * user-readable reason; nothing here touches storage.
 */
export function importDraftFromJson(text: string): ImportDraftOutcome {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: '文件不是有效的 JSON' }
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: 'JSON 顶层必须是文档对象' }
  }

  if (typeof parsed.documentVersion === 'number') {
    const document = normalizeFreeformDocument(parsed)
    if (!document) {
      return { ok: false, error: '自由画布文档未通过校验：需要 v1–v16 之一的完整文档结构' }
    }
    return { ok: true, data: { mode: 'freeform-slide', document } }
  }

  if (isString(parsed.source)) {
    const document = normalizeMarkdownDocument(parsed)
    if (!document) {
      return {
        ok: false,
        error: 'Markdown 文档缺少必填字段：source、platformId、themeId、fontFamily、profile',
      }
    }
    return { ok: true, data: { mode: 'markdown-card', document } }
  }

  return { ok: false, error: '无法识别的文档：需要自由画布文档或 Markdown 文档' }
}

export function draftSubtitle(draft: Draft): string {
  if (draft.mode === 'markdown-card') {
    return `Markdown · ${draft.document.source.length} 字`
  }
  return `自由编辑 · ${draft.document.slides.length} 页`
}

export function draftWorkspaceMode(draft: Draft): WorkspaceMode {
  return draft.mode
}
