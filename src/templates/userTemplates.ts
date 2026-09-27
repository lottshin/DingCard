// Per-user saved templates, backed by localStorage.
//
// A user template stores the same document envelope as a draft
// (schemaVersion 2) with every local image reference already materialized
// inline, so the template renders anywhere — gallery preview, a fresh apply,
// another session — without the session image store. Templates are namespaced
// by user id, exactly like drafts; this is client-only and never syncs.

import {
  normalizeDraftForRead,
  normalizeDraftForWrite,
  type Draft,
  type SaveDraftInput,
} from '../drafts'
import type { TemplateDefinition, TemplateWorkspace } from './types'

const KEY_PREFIX = 'slicer.user-templates.'

export interface UserTemplate {
  id: string
  name: string
  createdAt: number
  pageCount: number
  draft: Draft
}

export interface SaveUserTemplateInput {
  name?: string
  /** Page count shown in the gallery; the workspace knows the live count. */
  pageCount: number
  draft: SaveDraftInput
}

function keyFor(userId: string): string {
  return KEY_PREFIX + userId
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeUserTemplate(raw: unknown): UserTemplate | null {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  if (!isFiniteNumber(raw.createdAt) || !isFiniteNumber(raw.pageCount)) return null
  const draft = normalizeDraftForRead(raw.draft)
  if (!draft) return null
  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    pageCount: raw.pageCount > 0 ? Math.round(raw.pageCount) : 1,
    draft,
  }
}

export function listUserTemplates(userId: string): UserTemplate[] {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeUserTemplate)
      .filter((template): template is UserTemplate => template !== null)
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

function writeAll(userId: string, templates: UserTemplate[]) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(templates))
  } catch {
    throw new Error('本地存储空间不足，模板保存失败')
  }
}

function deriveName(input: SaveUserTemplateInput): string {
  const trimmed = input.name?.trim()
  if (trimmed) return trimmed
  if (input.draft.title?.trim()) return input.draft.title.trim()
  return '未命名模板'
}

export function saveUserTemplate(userId: string, input: SaveUserTemplateInput): UserTemplate {
  const normalized = normalizeDraftForWrite(input.draft)
  if (!normalized) throw new Error('模板内容无效')
  const name = deriveName(input)
  const now = Date.now()
  const envelopeBase = {
    id: crypto.randomUUID(),
    title: name,
    schemaVersion: 2 as const,
    updatedAt: now,
  }
  const draft: Draft = normalized.mode === 'freeform-slide'
    ? { ...envelopeBase, mode: 'freeform-slide', document: normalized.document }
    : { ...envelopeBase, mode: 'markdown-card', document: normalized.document }
  const template: UserTemplate = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    pageCount: Math.max(1, Math.round(input.pageCount) || 1),
    draft,
  }
  writeAll(userId, [template, ...listUserTemplates(userId)])
  return template
}

export function deleteUserTemplate(userId: string, id: string) {
  writeAll(userId, listUserTemplates(userId).filter((template) => template.id !== id))
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function templateSubtitle(createdAt: number): string {
  const date = new Date(createdAt)
  return `保存于 ${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

/** Adapt a stored user template to the gallery's template-definition shape. */
export function userTemplateToDefinition(template: UserTemplate): TemplateDefinition {
  const draft = template.draft
  if (draft.mode === 'freeform-slide') {
    return {
      id: `user-${template.id}`,
      userTemplateId: template.id,
      series: 'user',
      workspace: 'freeform',
      title: template.name,
      description: templateSubtitle(template.createdAt),
      pageCount: template.pageCount,
      tags: ['自由编辑', '我的'],
      createFreeform: () => deepClone(draft.document),
    }
  }
  return {
    id: `user-${template.id}`,
    userTemplateId: template.id,
    series: 'user',
    workspace: 'markdown',
    title: template.name,
    description: templateSubtitle(template.createdAt),
    pageCount: template.pageCount,
    tags: ['Markdown', '我的'],
    createMarkdown: () => deepClone(draft.document),
  }
}

/** Replace local `img:` refs in markdown source with their resolved URLs. */
export function inlineImageRefs(source: string, images: Record<string, string>): string {
  let out = source
  for (const [ref, url] of Object.entries(images)) {
    if (!ref || !url) continue
    out = out.split(ref).join(url)
  }
  return out
}

export function userTemplateWorkspace(template: UserTemplate): TemplateWorkspace {
  return template.draft.mode === 'freeform-slide' ? 'freeform' : 'markdown'
}
