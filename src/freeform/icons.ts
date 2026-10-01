// The built-in icon set as path nodes: lookup, search, and the node an icon
// becomes. Shared by the editor's Elements drawer and the MCP server.

import { ICONS, ICON_STROKE_WIDTH, ICON_VIEWBOX, type IconDefinition } from './iconLibrary'

export { ICONS, ICON_STROKE_WIDTH, ICON_VIEWBOX }
export type { IconDefinition }

const BY_ID = new Map(ICONS.map((icon) => [icon.id, icon]))
const BY_NAME = new Map(ICONS.map((icon) => [icon.zh, icon]))

export function iconById(id: string): IconDefinition | undefined {
  return BY_ID.get(id)
}

/** The icon a layer is named after (inserted icons take the Chinese name). */
export function iconByName(name: string): IconDefinition | undefined {
  return BY_NAME.get(name)
}

function haystack(icon: IconDefinition): string {
  return `${icon.id} ${icon.zh} ${icon.en} ${icon.keywords}`.toLowerCase()
}

/**
 * Icons matching every word of the query (id, either name, or keyword),
 * best first: exact names, exact keywords, names that start with the query,
 * then the rest in library order. An empty query returns the whole set.
 */
export function searchIcons(query: string): IconDefinition[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...ICONS]
  const whole = words.join(' ')
  const rank = (icon: IconDefinition) => {
    const names = [icon.id, icon.zh, icon.en.toLowerCase()]
    if (names.includes(whole)) return 0
    if (icon.keywords.toLowerCase().split(' ').includes(whole)) return 1
    if (names.some((name) => name.startsWith(whole))) return 2
    return 3
  }
  return ICONS
    .filter((icon) => {
      const text = haystack(icon)
      return words.every((word) => text.includes(word))
    })
    .map((icon, order) => ({ icon, order, rank: rank(icon) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((entry) => entry.icon)
}
