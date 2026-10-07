// Favorite templates, one heart per tile in the gallery. The picked ids live
// in localStorage per browser, so a shortlist follows the device across
// sessions and drafts; the gallery's 收藏 filter shows just these.

const KEY = 'slicer.template.favorites.v1'

export function normalizeFavoriteTemplateIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || seen.has(entry)) continue
    seen.add(entry)
    ids.push(entry)
  }
  return ids
}

export function loadFavoriteTemplateIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return normalizeFavoriteTemplateIds(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveFavoriteTemplateIds(ids: readonly string[]): void {
  try {
    const normalized = normalizeFavoriteTemplateIds(ids)
    if (normalized.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(normalized))
  } catch {
    // Best-effort persistence: blocked storage keeps the session hearts working.
  }
}

/** Flip one template's heart; the list keeps its order. */
export function toggleFavoriteTemplateId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]
}
