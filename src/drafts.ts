// Per-user draft storage, backed by localStorage.
//
// Drafts are namespaced by user id so two accounts in the same browser don't
// see each other's work. This is client-only and does not sync across devices.

import { normalizeFreeformDocumentToV3 } from './freeform/sceneDocument'
import type { FreeformDocumentV3 } from './freeform/types'
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
  document: FreeformDocumentV3
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
      document: FreeformDocumentV3
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

function isMarkdownDocument(value: unknown): value is MarkdownCardDocument {
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
      const document = normalizeFreeformDocumentToV3(raw.document)
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

function writeAll(userId: string, drafts: Draft[]) {
  localStorage.setItem(keyFor(userId), JSON.stringify(drafts))
}

/** Derive a human title from the first non-empty line of the source. */
function deriveMarkdownTitle(source: string): string {
  const line = source
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0)
  if (!line) return '未命名草稿'
  return line.length > 24 ? line.slice(0, 24) + '…' : line
}

function deriveFreeformTitle(document: FreeformDocumentV3): string {
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
export function saveDraft(userId: string, data: SaveDraftInput): Draft {
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

  writeAll(userId, drafts)
  return draft
}

export function deleteDraft(userId: string, id: string) {
  writeAll(
    userId,
    listDrafts(userId).filter((d) => d.id !== id),
  )
}

export function draftTitle(draft: Draft): string {
  return draft.title
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
