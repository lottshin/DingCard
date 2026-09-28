// Recently-used colors shared by every paint popover. Colors land here when a
// picker session commits a color; the list is most-recent-first, de-duplicated,
// and capped. Persisted per browser so the swatches survive reloads.

export const RECENT_COLORS_MAX = 10

const KEY = 'slicer.recent-colors.v1'

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

export function normalizeRecentColors(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const colors: string[] = []
  for (const entry of value) {
    if (!isHex(entry)) continue
    const color = entry.toLowerCase()
    if (seen.has(color)) continue
    seen.add(color)
    colors.push(color)
    if (colors.length >= RECENT_COLORS_MAX) break
  }
  return colors
}

export function loadRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return normalizeRecentColors(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveRecentColors(colors: readonly string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeRecentColors(colors)))
  } catch {
    // Best-effort persistence: blocked storage keeps the session list working.
  }
}

/** Push a committed color to the front of the recents list (LRU, capped). */
export function pushRecentColor(
  colors: readonly string[],
  color: string,
): string[] {
  if (!isHex(color)) return [...colors]
  const next = color.toLowerCase()
  return normalizeRecentColors([next, ...colors])
}
