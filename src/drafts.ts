// Per-user draft storage, backed by localStorage.
//
// Drafts are namespaced by user id so two accounts in the same browser don't
// see each other's work. This is client-only and does not sync across devices.

import {
  DEFAULT_PAGE_PAINT,
  DEFAULT_SHAPE_PAINT,
  DEFAULT_TEXT_PAINT,
  normalizeColorPaint,
} from './freeform/paint'
import type {
  ColorPaint,
  FreeformDocument,
  FreeformElement,
  FreeformImageElement,
  FreeformLineElement,
  FreeformShapeElement,
  FreeformSlide,
  FreeformTextElement,
  ShapeFill,
  SlideBackground,
} from './freeform/types'
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

function isAlign(value: unknown): value is FreeformTextElement['align'] {
  return value === 'left' || value === 'center' || value === 'right'
}

function isFontWeight(value: unknown): value is FreeformTextElement['fontWeight'] {
  return value === 'normal' || value === 'bold'
}

function isFit(value: unknown): value is FreeformImageElement['fit'] {
  return value === 'cover' || value === 'contain'
}

function isShapeKind(value: unknown): value is FreeformShapeElement['shape'] {
  return value === 'rect' || value === 'ellipse' || value === 'triangle'
}

function isLineKind(value: unknown): value is FreeformLineElement['lineKind'] {
  return value === 'line' || value === 'arrow'
}

function normalizeSlideBackground(value: unknown): SlideBackground {
  if (isRecord(value) && value.type === 'transparent') return { type: 'transparent' }
  return normalizeColorPaint(value, DEFAULT_PAGE_PAINT)
}

function normalizeShapeFill(value: unknown): ShapeFill {
  if (isRecord(value) && value.type === 'image' && isString(value.src) && isFit(value.fit)) {
    return { type: 'image', src: value.src, fit: value.fit }
  }
  return normalizeColorPaint(value, DEFAULT_SHAPE_PAINT)
}

function normalizeTextFill(element: Record<string, unknown>): ColorPaint {
  const rawFill = isRecord(element.textFill)
    ? element.textFill
    : isString(element.color)
      ? { type: 'solid', color: element.color }
      : undefined
  return normalizeColorPaint(rawFill, DEFAULT_TEXT_PAINT)
}

function normalizeFreeformElement(value: unknown): FreeformElement | null {
  if (!isRecord(value)) return null
  if (
    !isString(value.id) ||
    !isString(value.type) ||
    !isNumber(value.x) ||
    !isNumber(value.y) ||
    !isNumber(value.width) ||
    !isNumber(value.height) ||
    !isNumber(value.rotation)
  ) {
    return null
  }

  const base = {
    id: value.id,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    rotation: value.rotation,
  }

  if (value.type === 'text') {
    if (!isString(value.text) || !isNumber(value.fontSize) || !isString(value.fontFamily)) return null
    return {
      ...base,
      type: 'text',
      text: value.text,
      fontSize: value.fontSize,
      fontFamily: value.fontFamily,
      textFill: normalizeTextFill(value),
      align: isAlign(value.align) ? value.align : 'left',
      fontWeight: isFontWeight(value.fontWeight) ? value.fontWeight : 'normal',
    }
  }

  if (value.type === 'image') {
    if (!isString(value.src)) return null
    return {
      ...base,
      type: 'image',
      src: value.src,
      alt: isString(value.alt) ? value.alt : 'Image',
      fit: isFit(value.fit) ? value.fit : 'cover',
    }
  }

  if (value.type === 'shape') {
    if (!isShapeKind(value.shape) || !isString(value.stroke) || !isNumber(value.strokeWidth)) return null
    return {
      ...base,
      type: 'shape',
      shape: value.shape,
      fill: normalizeShapeFill(value.fill),
      stroke: value.stroke,
      strokeWidth: value.strokeWidth,
    }
  }

  if (value.type === 'line') {
    if (!isLineKind(value.lineKind) || !isString(value.stroke) || !isNumber(value.strokeWidth)) return null
    return {
      ...base,
      type: 'line',
      lineKind: value.lineKind,
      stroke: value.stroke,
      strokeWidth: value.strokeWidth,
    }
  }

  return null
}

function normalizeFreeformSlide(value: unknown): FreeformSlide | null {
  if (!isRecord(value)) return null
  if (
    !isString(value.id) ||
    !isString(value.name) ||
    !isNumber(value.width) ||
    !isNumber(value.height) ||
    !Array.isArray(value.elements)
  ) {
    return null
  }

  return {
    id: value.id,
    name: value.name,
    width: value.width,
    height: value.height,
    background: normalizeSlideBackground(value.background),
    elements: value.elements
      .map(normalizeFreeformElement)
      .filter((element): element is FreeformElement => element !== null),
  }
}

function normalizeFreeformDocument(value: unknown): FreeformDocument | null {
  if (!isRecord(value)) return null
  if (
    (value.documentVersion !== 1 && value.documentVersion !== 2) ||
    !Array.isArray(value.slides) ||
    !isString(value.activeSlideId)
  ) {
    return null
  }

  const slides = value.slides
    .map(normalizeFreeformSlide)
    .filter((slide): slide is FreeformSlide => slide !== null)

  if (slides.length === 0) return null

  const activeSlideId = slides.some((slide) => slide.id === value.activeSlideId)
    ? value.activeSlideId
    : slides[0].id

  return {
    documentVersion: 2,
    activeSlideId,
    slides,
  }
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
export function saveDraft(userId: string, data: SaveDraftInput): Draft {
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
