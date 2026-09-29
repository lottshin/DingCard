// Document tools — validate / inspect / edit freeform documents in Node.
//
// All heavy lifting is delegated to the shared frontend pure modules, so the
// MCP surface has exactly the same validation and reducer semantics as the
// in-app editor:
//
//   - normalizeFreeformDocument: strict v11 validation (+ v1–v10 migration)
//   - reduceFreeformDocument:    the exact action reducer the UI dispatches to

import { normalizeFreeformDocument } from '../../../src/freeform/sceneDocument'
import { reduceFreeformDocument } from '../../../src/freeform/document'
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
  '文档未通过自由画布 v11 校验：需要 documentVersion=1–11 之一（旧版自动迁移为 v11）、非空 slides、'
  + '合法的 activeSlideId，且每个节点的键必须与类型精确匹配（不允许多余或缺失键）。'

export function validateDocument(value: unknown): ValidateResult {
  const document = normalizeFreeformDocument(value)
  if (!document) return { ok: false, error: VALIDATE_ERROR }
  return { ok: true, document }
}

export interface NodeSummary {
  id: string
  name: string
  type: 'text' | 'image' | 'shape' | 'line' | 'group'
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
  shape?: 'rect' | 'ellipse' | 'triangle' | 'star' | 'hexagon'
  children?: NodeSummary[]
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
  | { ok: true; slideCount: number; activeSlideId: string; slides: SlideSummary[] }
  | { ok: false; error: string }

function describeBackground(background: SlideBackground): string {
  if (background.type === 'transparent') return 'transparent'
  if (background.type === 'solid') return `solid ${background.color}`
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
    return { ...base, children: node.children.map(summarizeNode) }
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
    return { ok: false, error: '应用动作后文档未通过 v11 校验（不应发生，请反馈）' }
  }
  return { ok: true, document: finalCheck, changes }
}
