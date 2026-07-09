// Per-user draft storage, backed by localStorage.
//
// Drafts are namespaced by user id so two accounts in the same browser don't
// see each other's work. Like auth.ts this is client-only and does not sync
// across devices; the API is async-shaped so a backend can replace it later.

import type { Profile } from './theme'
import { collectImages } from './imageStore'

const KEY_PREFIX = 'slicer.drafts.'

/** Everything needed to fully restore an editing session. */
export interface Draft {
  id: string
  title: string
  source: string
  platformId: string
  themeId: string
  fontFamily: string
  profile: Profile
  updatedAt: number
  /** ref → dataURL for every image used in `source`, so drafts survive the
   *  session-scoped image store being cleared. */
  images?: Record<string, string>
}

function keyFor(userId: string): string {
  return KEY_PREFIX + userId
}

export function listDrafts(userId: string): Draft[] {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    const drafts: Draft[] = raw ? JSON.parse(raw) : []
    // newest first
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function writeAll(userId: string, drafts: Draft[]) {
  localStorage.setItem(keyFor(userId), JSON.stringify(drafts))
}

/** Derive a human title from the first non-empty line of the source. */
function deriveTitle(source: string): string {
  const line = source
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0)
  if (!line) return '未命名草稿'
  return line.length > 24 ? line.slice(0, 24) + '…' : line
}

/**
 * Insert or update a draft. If `data.id` matches an existing draft it is
 * overwritten in place; otherwise a new draft is created. Returns the saved
 * draft (with a fresh id/timestamp/title filled in).
 */
export function saveDraft(
  userId: string,
  data: Omit<Draft, 'id' | 'updatedAt' | 'title'> & { id?: string; title?: string },
): Draft {
  const drafts = listDrafts(userId)
  const draft: Draft = {
    id: data.id ?? crypto.randomUUID(),
    title: data.title?.trim() || deriveTitle(data.source),
    source: data.source,
    platformId: data.platformId,
    themeId: data.themeId,
    fontFamily: data.fontFamily,
    profile: data.profile,
    images: collectImages(data.source),
    updatedAt: Date.now(),
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
