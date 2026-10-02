// Decoration tools — the editor's decoration library (hand-drawn lines,
// stickers, labels) for agents: list what there is, then place a few on a page
// in one call. The drawings come from the shared frontend source, so a
// decoration placed here is the one the Elements panel drops in.

import {
  DECORATION_CATEGORIES,
  DECORATIONS,
  createDecorationNode,
  decorationBounds,
  decorationById,
  decorationSize,
  decorationStretches,
  searchDecorations,
  type DecorationCategory,
  type DecorationDefinition,
} from '../../../src/freeform/decorations'
import type { FreeformDocument, FreeformSceneNode } from '../../../src/freeform/types'
import { applyActions } from './document'

export interface DecorationEntry {
  id: string
  zh: string
  en: string
  category: DecorationCategory
  keywords: string
  /** Width over height of what it draws. */
  aspect: number
  /** The colour it comes in; `color` repaints it. */
  color: string
  /** Labels: the words they come with (`text` replaces them). */
  text?: string
  /** A single drawing that stretches to any height; everything else keeps its proportions. */
  stretches: boolean
  /** How wide it lands on a 1080 px page when no width is given. */
  defaultWidth: number
}

export interface DecorationListResult {
  ok: true
  total: number
  categories: Array<{ id: DecorationCategory; name: string; count: number }>
  decorations: DecorationEntry[]
  missing?: string[]
  usage: string
}

const USAGE = '用 add_decorations 放到页面上：items 里每项给 decoration（这里的 id）、x、y（盒子左上角，页面坐标）、width（不给就按页面短边的默认比例），'
  + '可选 color（#RRGGBB，换掉它本来的主色）、text（标签上的字）、rotation（度）、below（放在某个顶层节点下面一层，如把荧光笔、胶带垫在文字下）。'
  + '高度按 aspect 自动算；只有 stretches 为 true 的单笔画能用 height 拉伸。手绘圈、下划线这类放在要强调的文字上或旁边，贴纸放在留白处，别压住正文。'

function entry(decoration: DecorationDefinition): DecorationEntry {
  const bounds = decorationBounds(decoration)
  return {
    id: decoration.id,
    zh: decoration.zh,
    en: decoration.en,
    category: decoration.category,
    keywords: decoration.keywords,
    aspect: Math.round((bounds.width / bounds.height) * 100) / 100,
    color: decoration.color,
    ...(decoration.text ? { text: decoration.text.zh } : {}),
    stretches: decorationStretches(decoration),
    defaultWidth: decorationSize(decoration, { width: 1080, height: 1080 }).width,
  }
}

/** The library: everything, a search (Chinese or English), one category, or a list of ids. */
export function listDecorations(options: { query?: string; category?: string; ids?: string[] } = {}): DecorationListResult {
  const categories = DECORATION_CATEGORIES.map((category) => ({
    id: category.id,
    name: category.zh,
    count: DECORATIONS.filter((decoration) => decoration.category === category.id).length,
  }))
  if (options.ids && options.ids.length > 0) {
    const found = options.ids.map((id) => decorationById(id))
    const missing = options.ids.filter((_, index) => !found[index])
    return {
      ok: true,
      total: found.filter(Boolean).length,
      categories,
      decorations: found.filter((decoration): decoration is DecorationDefinition => decoration !== undefined).map(entry),
      ...(missing.length > 0 ? { missing } : {}),
      usage: USAGE,
    }
  }
  const matches = searchDecorations(options.query ?? '')
    .filter((decoration) => !options.category || decoration.category === options.category)
  return {
    ok: true,
    total: matches.length,
    categories,
    decorations: matches.map(entry),
    usage: matches.length > 0 ? USAGE : '没有匹配的装饰：换个说法（中文或英文），或者不带参数看全部。',
  }
}

export interface DecorationItem {
  decoration: string
  x: number
  y: number
  width?: number
  height?: number
  color?: string
  text?: string
  rotation?: number
  /** Put it just under this top-level node (its id or layer name). */
  below?: string
}

export interface PlacedDecoration {
  decoration: string
  nodeId: string
  name: string
  /** For apply_actions: the node sits at the top of the page. */
  path: string[]
  box: { x: number; y: number; width: number; height: number }
}

export type PlaceDecorationsResult =
  | { ok: true; document: FreeformDocument; slideId: string; added: PlacedDecoration[]; notes: string[] }
  | { ok: false; error: string }

const HEX = /^#[0-9a-fA-F]{6}$/

/** The box a placed node covers, for the answer (a group's from its children). */
function boxOf(node: FreeformSceneNode, placed: { x: number; y: number; width: number; height: number }) {
  return node.type === 'group' ? placed : { x: node.x, y: node.y, width: node.width, height: node.height }
}

/** Place decorations on one page of a document, in order, each on top unless it goes `below` a node. */
export function placeDecorations(
  document: FreeformDocument,
  slideId: string | undefined,
  items: readonly DecorationItem[],
  newId: () => string = () => crypto.randomUUID(),
): PlaceDecorationsResult {
  const slide = document.slides.find((candidate) => candidate.id === (slideId ?? document.activeSlideId))
  if (!slide) return { ok: false, error: `没有这一页：${slideId}（slideId 用 inspect_document 里的页面 id）` }
  if (items.length === 0) return { ok: false, error: 'items 至少要有一项' }
  const unknown = items.filter((item) => !decorationById(item.decoration)).map((item) => item.decoration)
  if (unknown.length > 0) return { ok: false, error: `没有这些装饰：${unknown.join('、')}（先用 list_decorations 查 id）` }
  const badColor = items.find((item) => item.color !== undefined && !HEX.test(item.color))
  if (badColor) return { ok: false, error: `color 要写成 #RRGGBB：${badColor.color}` }

  let current = document
  const added: PlacedDecoration[] = []
  const notes: string[] = []
  for (const item of items) {
    const decoration = decorationById(item.decoration)!
    const page = current.slides.find((candidate) => candidate.id === slide.id)!
    const width = item.width ?? decorationSize(decoration, page).width
    if (!(width > 0)) return { ok: false, error: `${item.decoration} 的 width 要大于 0` }
    if (item.text !== undefined && !decoration.text) notes.push(`${item.decoration} 不是标签，text 没有用上。`)
    if (item.height !== undefined && !decorationStretches(decoration)) notes.push(`${item.decoration} 带文字或由几部分组成，按比例放，height 没有用上。`)
    const bounds = decorationBounds(decoration)
    const height = decorationStretches(decoration) && item.height !== undefined ? item.height : (width * bounds.height) / bounds.width
    let node = createDecorationNode(decoration, { x: item.x, y: item.y, width, height: item.height, color: item.color, text: item.text }, newId)
    if (item.rotation !== undefined) node = { ...node, rotation: item.rotation }
    let index: number | undefined
    if (item.below !== undefined) {
      index = page.nodes.findIndex((candidate) => candidate.id === item.below || candidate.name === item.below)
      if (index < 0) {
        notes.push(`这一页顶层没有「${item.below}」，${decoration.zh}放在了最上层。`)
        index = undefined
      }
    }
    const applied = applyActions(current, [{ type: 'node/insert-children', slideId: slide.id, parentPath: [], nodes: [node], ...(index !== undefined ? { index } : {}) }])
    if (!applied.ok) return { ok: false, error: applied.error }
    if (!applied.changes[0]) return { ok: false, error: `${decoration.zh}放不上去（页面节点太多，或这一页被锁定）` }
    current = applied.document
    added.push({
      decoration: decoration.id,
      nodeId: node.id,
      name: node.name,
      path: [node.id],
      box: boxOf(node, { x: item.x, y: item.y, width, height }),
    })
  }
  return { ok: true, document: current, slideId: slide.id, added, notes }
}
