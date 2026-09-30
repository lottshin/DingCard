// Templates people saved for themselves (0.17–0.20, "存为模板").
//
// Templates are curated in the repository now; to reuse your own work you
// duplicate a project. What was saved under `slicer.user-templates.<uid>`
// becomes ordinary projects the first time its owner opens the workbench.

import { normalizeDraftForRead, type SaveDraftInput } from '../drafts'

const KEY_PREFIX = 'slicer.user-templates.'

function keyFor(userId: string): string {
  return KEY_PREFIX + userId
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readEntries(userId: string): unknown[] | null {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeEntries(userId: string, entries: unknown[]) {
  try {
    if (entries.length === 0) localStorage.removeItem(keyFor(userId))
    else localStorage.setItem(keyFor(userId), JSON.stringify(entries))
  } catch {
    // Storage blocked: the next visit tries again.
  }
}

/** A stored template as a project to save, or null when it can't be read. */
export function legacyTemplateToProject(entry: unknown): SaveDraftInput | null {
  if (!isRecord(entry)) return null
  const draft = normalizeDraftForRead(entry.draft)
  if (!draft) return null
  const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : draft.title
  return draft.mode === 'freeform-slide'
    ? { mode: 'freeform-slide', title: name, document: draft.document }
    : { mode: 'markdown-card', title: name, document: draft.document }
}

/**
 * Save each of the user's stored templates as a project, then forget it.
 * Entries are removed one by one, so a failure part-way never duplicates the
 * ones already moved; unreadable entries are dropped. Returns how many moved.
 */
export async function migrateLegacyUserTemplates(
  userId: string,
  save: (input: SaveDraftInput) => Promise<unknown>,
): Promise<number> {
  const entries = readEntries(userId)
  if (entries === null) return 0
  let remaining = [...entries]
  let moved = 0
  while (remaining.length > 0) {
    const [entry, ...rest] = remaining
    const project = legacyTemplateToProject(entry)
    if (project) {
      await save(project)
      moved += 1
    }
    remaining = rest
    writeEntries(userId, remaining)
  }
  writeEntries(userId, [])
  return moved
}
