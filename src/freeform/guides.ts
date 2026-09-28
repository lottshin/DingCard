import type { FreeformGuide } from './types'

export const MAX_GUIDES_PER_SLIDE = 64
export const GUIDE_KEYS = new Set(['id', 'axis', 'position'])

export function isGuideAxis(value: unknown): value is FreeformGuide['axis'] {
  return value === 'x' || value === 'y'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Strictly validate guide entries for one page: exact keys, unique non-blank
 * ids, axis x|y, and a finite position inside the page (inclusive edges).
 * Returns fresh clones, or null for any violation. An absent/empty input
 * normalizes to an empty list.
 */
export function normalizeSlideGuides(
  value: unknown,
  pageWidth: number,
  pageHeight: number,
): FreeformGuide[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_GUIDES_PER_SLIDE) return null
  const guides: FreeformGuide[] = []
  const ids = new Set<string>()
  for (const entry of value) {
    if (
      !isRecord(entry)
      || !('id' in entry && 'axis' in entry && 'position' in entry)
      || Object.keys(entry).length !== GUIDE_KEYS.size
      || typeof entry.id !== 'string'
      || entry.id.trim().length === 0
      || !isGuideAxis(entry.axis)
      || typeof entry.position !== 'number'
      || !Number.isFinite(entry.position)
    ) {
      return null
    }
    if (ids.has(entry.id)) return null
    ids.add(entry.id)
    const bound = entry.axis === 'x' ? pageWidth : pageHeight
    if (entry.position < 0 || entry.position > bound) return null
    guides.push({ id: entry.id, axis: entry.axis, position: entry.position })
  }
  return guides
}

export function cloneGuides(guides: readonly FreeformGuide[]): FreeformGuide[] {
  return guides.map((guide) => ({ ...guide }))
}

export function guidesEqual(a: readonly FreeformGuide[], b: readonly FreeformGuide[]): boolean {
  return (
    a.length === b.length
    && a.every((guide, index) => {
      const other = b[index]
      return (
        guide.id === other.id
        && guide.axis === other.axis
        && guide.position === other.position
      )
    })
  )
}
