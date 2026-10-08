// Document tools — validate / inspect / edit freeform documents in Node.
//
// All heavy lifting is delegated to the shared frontend pure modules, so the
// MCP surface has exactly the same validation and reducer semantics as the
// in-app editor:
//
//   - normalizeFreeformDocument: strict v27 validation (+ v1–v26 migration)
//   - reduceFreeformDocument:    the exact action reducer the UI dispatches to

import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import { reduceFreeformDocument } from '../../../src/freeform/document'
import { DECORATIONS } from '../../../src/freeform/decorations'
import { ICONS } from '../../../src/freeform/icons'
import { deckStyle, type DeckStyle } from './styles'
import type {
  FreeformAction,
  FreeformDocument,
  FreeformSceneNode,
  SlideBackground,
} from '../../../src/freeform/types'

export type ValidateResult =
  | { ok: true; document: FreeformDocument }
  | { ok: false; error: string }

const VALIDATE_ERROR =
  '文档未通过自由画布 v39 校验：需要 documentVersion=1–39 之一（旧版自动迁移为 v39）、非空 slides、'
  + '合法的 activeSlideId，且每个节点的键必须与类型精确匹配（不允许多余或缺失键）。'

export function validateDocument(value: unknown): ValidateResult {
  const document = normalizeFreeformDocument(value)
  if (!document) return { ok: false, error: VALIDATE_ERROR }
  return { ok: true, document }
}

export interface NodeSummary {
  id: string
  name: string
  type: 'text' | 'image' | 'shape' | 'line' | 'path' | 'qrcode' | 'chart' | 'table' | 'timeline' | 'progress' | 'group'
  x: number
  y: number
  rotation: number
  width?: number
  height?: number
  locked: boolean
  hidden: boolean
  text?: string
  fontSize?: number
  fontFamily?: string
  shape?: 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'pentagon' | 'star' | 'hexagon' | 'heart' | 'bubble'
  /** A QR code element's payload: the text or URL it carries. */
  payload?: string
  /** A QR code element's centre logo: an image source (v25). */
  logoSrc?: string
  /** A QR code element's quiet zone in module units (v30). */
  quietZone?: number
  /** A chart's category labels. */
  labels?: string[]
  /** A chart's series (v26): each carries its own values and colour. */
  series?: Array<{ name?: string; values: number[]; color: string }>
  /** How a bar chart stacks its series (v27). */
  barMode?: 'grouped' | 'stacked' | 'percent'
  /** A chart's legend override (v31). */
  showLegend?: boolean
  /** A chart's axis-tick override (v33): `false` hides the y-axis grid lines
   *  and tick labels; absent keeps them drawn. */
  showTicks?: boolean
  /** A table's row count (v34), 2–12 including the header row. */
  rows?: number
  /** A table's column count (v34), 1–6. */
  cols?: number
  /** A table's cell texts (v34), row-major, exactly rows × cols of them,
   *  each up to 24 characters. */
  cells?: string[]
  /** A table's header row override (v34): `false` removes the bold first
   *  row; absent keeps it drawn. */
  headerRow?: boolean
  /** A table's zebra stripes (v34): `true` shades alternating body rows. */
  striped?: boolean
  /** A table's ink for text and grid lines (v35); a timeline's text colour (v37); absent keeps the defaults. */
  ink?: string
  /** A table's header fill (v35); absent tints the ink. */
  headerFill?: string
  /** A table's stripe fill (v35); absent tints the ink. */
  stripeFill?: string
  /** A table's relative column weights (v35), one per column; absent splits evenly. */
  colWidths?: number[]
  /** A timeline's entries (v36): 2–8 of them, each an optional short label and its text. */
  items?: Array<{ label?: string; text: string }>
  /** A timeline's spine and dot colour (v36), a progress's done colour (v38); absent keeps the blue accent. */
  accent?: string
  /** The timeline's entries side by side (v37); absent runs them down the left spine. */
  horizontal?: boolean
  /** A progress element's kind (v38): a bar across or a ring around. */
  progressKind?: 'bar' | 'ring'
  /** A progress element's done share (v38), 0–100 with at most one decimal. */
  value?: number
  /** A progress element's goal name (v39), above the bar or under the ring's share. */
  label?: string
  /** A progress element's track colour (v39); absent tints the accent to 14%. */
  trackFill?: string
  /** A path drawn from the built-in icon set: the icon's id. */
  icon?: string
  /** A piece of the decoration library (list_decorations), as one path or a group of its parts: its id. */
  decoration?: string
  /** The start of a path's drawing, for paths that aren't built-in icons. */
  d?: string
  children?: NodeSummary[]
}

const ICON_BY_PATH = new Map(ICONS.map((icon) => [icon.d, icon.id]))

// A decoration's drawings don't change with its colour or words, so they name it.
const DECORATION_BY_PATH = new Map<string, string>()
for (const decoration of DECORATIONS) {
  for (const part of decoration.parts({ color: decoration.color, text: '' })) {
    if (part.kind === 'path' && !DECORATION_BY_PATH.has(part.d)) DECORATION_BY_PATH.set(part.d, decoration.id)
  }
}

/** The decoration a group is: every drawing in it is one of that decoration's parts. */
function groupDecoration(children: readonly FreeformSceneNode[]): string | undefined {
  const found = new Set(children.flatMap((child) => (child.type === 'path' ? [DECORATION_BY_PATH.get(child.d) ?? ''] : [])))
  if (found.size !== 1) return undefined
  const [id] = found
  return id || undefined
}

export interface SlideSummary {
  id: string
  name: string
  width: number
  height: number
  background: string
  nodeCount: number
  nodes: NodeSummary[]
}

export type InspectResult =
  | { ok: true; slideCount: number; activeSlideId: string; style: DeckStyle; slides: SlideSummary[] }
  | { ok: false; error: string }

function describeBackground(background: SlideBackground): string {
  if (background.type === 'transparent') return 'transparent'
  if (background.type === 'image') {
    const src = background.src.startsWith('data:') ? `${background.src.slice(0, 30)}…` : background.src
    return `image ${src} (${background.fit})`
  }
  if (background.type === 'solid') return `solid ${background.color}`
  if (background.type === 'pattern') {
    return `pattern ${background.pattern} (${background.color} base, ${background.patternColor} motif, ${background.size}px)`
  }
  if (background.type === 'radial-gradient') {
    const stops = background.stops.map((stop) => `${stop.color} @ ${Math.round(stop.offset * 100)}%`)
    return `radial-gradient ${stops.join(' -> ')}`
  }
  if ('stops' in background) {
    const stops = background.stops.map((stop) => `${stop.color} @ ${Math.round(stop.offset * 100)}%`)
    return `linear-gradient ${stops.join(' -> ')} @ ${background.angle}deg`
  }
  return `linear-gradient ${background.from} -> ${background.to} @ ${background.angle}deg`
}

function summarizeNode(node: FreeformSceneNode): NodeSummary {
  const base: NodeSummary = {
    id: node.id,
    name: node.name,
    type: node.type,
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    locked: node.locked,
    hidden: node.hidden,
  }
  if (node.type === 'group') {
    const decoration = groupDecoration(node.children)
    return { ...base, ...(decoration ? { decoration } : {}), children: node.children.map(summarizeNode) }
  }
  const leaf = { ...base, width: node.width, height: node.height }
  if (node.type === 'text') {
    return {
      ...leaf,
      text: node.text.length > 80 ? `${node.text.slice(0, 80)}…` : node.text,
      fontSize: node.fontSize,
      fontFamily: node.fontFamily,
    }
  }
  if (node.type === 'shape') {
    return { ...leaf, shape: node.shape }
  }
  if (node.type === 'qrcode') {
    return {
      ...leaf,
      payload: node.payload,
      ...(node.logoSrc !== undefined ? { logoSrc: node.logoSrc } : {}),
      ...(node.quietZone !== undefined ? { quietZone: node.quietZone } : {}),
    }
  }
  if (node.type === 'chart') {
    return {
      ...leaf,
      labels: node.labels,
      series: node.series,
      ...(node.barMode !== undefined ? { barMode: node.barMode } : {}),
      ...(node.showLegend !== undefined ? { showLegend: node.showLegend } : {}),
      ...(node.showTicks !== undefined ? { showTicks: node.showTicks } : {}),
    }
  }
  if (node.type === 'table') {
    return {
      ...leaf,
      rows: node.rows,
      cols: node.cols,
      cells: node.cells,
      ...(node.headerRow !== undefined ? { headerRow: node.headerRow } : {}),
      ...(node.striped !== undefined ? { striped: node.striped } : {}),
      ...(node.ink !== undefined ? { ink: node.ink } : {}),
      ...(node.headerFill !== undefined ? { headerFill: node.headerFill } : {}),
      ...(node.stripeFill !== undefined ? { stripeFill: node.stripeFill } : {}),
      ...(node.colWidths !== undefined ? { colWidths: [...node.colWidths] } : {}),
    }
  }
  if (node.type === 'timeline') {
    return {
      ...leaf,
      items: node.items.map((item) => ({
        text: item.text,
        ...('label' in item ? { label: item.label } : {}),
      })),
      ...(node.accent !== undefined ? { accent: node.accent } : {}),
      ...(node.horizontal !== undefined ? { horizontal: node.horizontal } : {}),
      ...(node.ink !== undefined ? { ink: node.ink } : {}),
    }
  }
  if (node.type === 'progress') {
    return {
      ...leaf,
      progressKind: node.progressKind,
      value: node.value,
      ...(node.accent !== undefined ? { accent: node.accent } : {}),
      ...(node.label !== undefined ? { label: node.label } : {}),
      ...(node.trackFill !== undefined ? { trackFill: node.trackFill } : {}),
    }
  }
  if (node.type === 'path') {
    const icon = ICON_BY_PATH.get(node.d)
    if (icon) return { ...leaf, icon }
    const decoration = DECORATION_BY_PATH.get(node.d)
    if (decoration) return { ...leaf, decoration }
    return { ...leaf, d: node.d.length > 60 ? `${node.d.slice(0, 60)}…` : node.d }
  }
  return leaf
}

function countNodes(nodes: readonly FreeformSceneNode[]): number {
  let count = 0
  for (const node of nodes) {
    count += 1
    if (node.type === 'group') count += countNodes(node.children)
  }
  return count
}

export function inspectDocument(value: unknown): InspectResult {
  const validated = validateDocument(value)
  if (!validated.ok) return { ok: false, error: validated.error }
  const document = validated.document
  return {
    ok: true,
    slideCount: document.slides.length,
    activeSlideId: document.activeSlideId,
    style: deckStyle(document),
    slides: document.slides.map((slide) => ({
      id: slide.id,
      name: slide.name,
      width: slide.width,
      height: slide.height,
      background: describeBackground(slide.background),
      nodeCount: countNodes(slide.nodes),
      nodes: slide.nodes.map(summarizeNode),
    })),
  }
}

export type ApplyActionsResult =
  | { ok: true; document: FreeformDocument; changes: boolean[] }
  | { ok: false; error: string }

/** Deterministic JSON comparison: key order never matters. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function applyActions(value: unknown, actions: unknown): ApplyActionsResult {
  const validated = validateDocument(value)
  if (!validated.ok) return { ok: false, error: `输入${validated.error}` }
  if (!Array.isArray(actions)) {
    return { ok: false, error: 'actions 必须是 FreeformAction 对象数组' }
  }
  let document = validated.document
  const changes: boolean[] = []
  for (const action of actions) {
    const next = reduceFreeformDocument(document, action as FreeformAction)
    changes.push(stableJson(next) !== stableJson(document))
    document = next
  }
  const finalCheck = normalizeFreeformDocument(document)
  if (!finalCheck) {
    return { ok: false, error: '应用动作后文档未通过 v20 校验（不应发生，请反馈）' }
  }
  return { ok: true, document: finalCheck, changes }
}
