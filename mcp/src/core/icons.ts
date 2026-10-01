// Icon tools — the editor's built-in icon set, as path data an agent can
// drop into a document. The icons come from the shared frontend source, so
// an icon inserted here is the same drawing the Elements panel inserts.

import {
  ICONS,
  ICON_STROKE_WIDTH,
  ICON_VIEWBOX,
  iconById,
  searchIcons,
  type IconDefinition,
} from '../../../src/freeform/icons'
import type { FreeformPathElement } from '../../../src/freeform/types'

/** How every icon is drawn: outlines in a 24 × 24 box. */
export const ICON_STYLE = {
  viewBox: { ...ICON_VIEWBOX },
  fill: { type: 'transparent' as const },
  stroke: '#18181b',
  strokeWidth: ICON_STROKE_WIDTH,
}

/** Matches beyond this many are counted but not returned. */
const SEARCH_LIMIT = 24

export interface IconEntry {
  id: string
  zh: string
  en: string
  keywords?: string
  d?: string
}

export interface IconListResult {
  ok: true
  total: number
  style: typeof ICON_STYLE
  icons: IconEntry[]
  missing?: string[]
  /** A complete path node for the first icon listed, ready for node/insert-children. */
  example?: FreeformPathElement
  usage: string
}

const USAGE = '每个图标就是一个 path 节点：d 用这里给的，viewBox、fill、stroke、strokeWidth 用 style 里的值，'
  + '再补上 id、name、locked、hidden、x、y、width、height、rotation、scale，用 apply_actions 的 node/insert-children 插入（见 example）。'
  + '盒子取正方形，大小随版面（如 64–160）；换颜色改 stroke，想要实心可以给 fill 一个颜色。'

const CATALOGUE_USAGE = '这里只有名字；用 query（中文或英文关键词）或 ids 再查一次拿到 d。'

function withPath(icon: IconDefinition): IconEntry {
  return { id: icon.id, zh: icon.zh, en: icon.en, keywords: icon.keywords, d: icon.d }
}

function exampleNode(icon: IconDefinition): FreeformPathElement {
  return {
    id: `icon-${icon.id}`,
    name: icon.zh,
    locked: false,
    hidden: false,
    type: 'path',
    x: 120,
    y: 120,
    width: 96,
    height: 96,
    rotation: 0,
    scale: 1,
    d: icon.d,
    viewBox: { ...ICON_STYLE.viewBox },
    fill: { type: 'transparent' },
    stroke: ICON_STYLE.stroke,
    strokeWidth: ICON_STYLE.strokeWidth,
  }
}

/**
 * The icon set: every name when asked for nothing in particular, the
 * drawings themselves for a search (best matches first) or a list of ids.
 */
export function listIcons(options: { query?: string; ids?: string[] } = {}): IconListResult {
  if (options.ids && options.ids.length > 0) {
    const found = options.ids.map((id) => iconById(id))
    const icons = found.filter((icon): icon is IconDefinition => icon !== undefined)
    const missing = options.ids.filter((_, index) => !found[index])
    return {
      ok: true,
      total: icons.length,
      style: ICON_STYLE,
      icons: icons.map(withPath),
      ...(missing.length > 0 ? { missing } : {}),
      ...(icons[0] ? { example: exampleNode(icons[0]) } : {}),
      usage: USAGE,
    }
  }
  if (options.query && options.query.trim()) {
    const matches = searchIcons(options.query)
    return {
      ok: true,
      total: matches.length,
      style: ICON_STYLE,
      icons: matches.slice(0, SEARCH_LIMIT).map(withPath),
      ...(matches[0] ? { example: exampleNode(matches[0]) } : {}),
      usage: matches.length > 0 ? USAGE : '没有匹配的图标：换个说法（中文或英文），或者不带参数看全部图标名。',
    }
  }
  return {
    ok: true,
    total: ICONS.length,
    style: ICON_STYLE,
    icons: ICONS.map((icon) => ({ id: icon.id, zh: icon.zh, en: icon.en })),
    usage: CATALOGUE_USAGE,
  }
}

/** Every icon with its drawing, for the dingcard://icons resource. */
export function iconCatalogue() {
  return { style: ICON_STYLE, icons: ICONS.map(withPath) }
}
