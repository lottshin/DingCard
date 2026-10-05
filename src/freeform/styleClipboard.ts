import { isHexColor } from './paint'
import { pathStrokeScale } from './pathData'
import type { FreeformNodeStylePatch, FreeformSceneNode } from './types'

/**
 * Copy/paste style between leaves. Geometry, content, image sources, and
 * semantic kind switches (shape silhouette, line kind) deliberately stay out;
 * only paint, typography, and effect fields move.
 */
const SHARED_STYLE_KEYS = ['opacity', 'shadow', 'filter', 'blendMode'] as const
const TEXT_STYLE_KEYS = [
  'fontSize',
  'fontFamily',
  'textFill',
  'align',
  'fontWeight',
  'verticalAlign',
  'paragraphSpacing',
  'list',
  'lineHeight',
  'letterSpacing',
  'italic',
  'vertical',
  'stroke',
  'strokeWidth',
  'effect',
] as const
const SHAPE_STYLE_KEYS = ['fill', 'stroke', 'strokeWidth', 'cornerRadius', 'starInnerRatio', 'bubbleTailX'] as const
const LINE_STYLE_KEYS = ['stroke', 'strokeWidth', 'dash', 'cap'] as const
const PATH_STYLE_KEYS = ['fill', 'stroke', 'strokeWidth', 'dash', 'cap', 'join', 'fillRule'] as const
const IMAGE_STYLE_KEYS = ['fit'] as const

export function styleKeysForNodeType(type: FreeformSceneNode['type']): readonly string[] {
  switch (type) {
    case 'text': return [...TEXT_STYLE_KEYS, ...SHARED_STYLE_KEYS]
    case 'shape': return [...SHAPE_STYLE_KEYS, ...SHARED_STYLE_KEYS]
    case 'line': return [...LINE_STYLE_KEYS, ...SHARED_STYLE_KEYS]
    case 'path': return [...PATH_STYLE_KEYS, ...SHARED_STYLE_KEYS]
    case 'image': return [...IMAGE_STYLE_KEYS, ...SHARED_STYLE_KEYS]
    default: return []
  }
}

/** Extract the copyable style patch from a leaf; null for groups or empty styles. */
export function copyStylePatch(node: FreeformSceneNode): FreeformNodeStylePatch | null {
  if (node.type === 'group') return null
  const patch: Record<string, unknown> = {}
  for (const key of styleKeysForNodeType(node.type)) {
    const value = (node as unknown as Record<string, unknown>)[key]
    if (value !== undefined) patch[key] = value
  }
  // A path measures its stroke in viewBox units; the clipboard holds pixels.
  if (node.type === 'path') {
    const scale = pathStrokeScale(node.viewBox, node.width, node.height)
    patch.strokeWidth = node.strokeWidth * scale
    if (node.dash !== undefined) patch.dash = node.dash * scale
  }
  return Object.keys(patch).length > 0 ? (patch as FreeformNodeStylePatch) : null
}

/**
 * Narrow a stored patch to the keys the target node type accepts. A path
 * target passes its stroke scale, so pixel stroke widths land in its viewBox
 * units.
 */
export function pasteStylePatch(
  patch: FreeformNodeStylePatch,
  targetType: FreeformSceneNode['type'],
  strokeScale = 1,
): FreeformNodeStylePatch {
  if (targetType === 'group') return {}
  const allowed = new Set(styleKeysForNodeType(targetType))
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key) || value === undefined) continue
    // Paths take no picture fills, and their strokes are always hex colors.
    if (targetType === 'path' && key === 'fill' && (value as { type?: unknown }).type === 'image') continue
    if (targetType === 'path' && key === 'stroke' && !isHexColor(value)) continue
    if (targetType === 'path' && (key === 'strokeWidth' || key === 'dash') && typeof value === 'number') {
      result[key] = value / strokeScale
      continue
    }
    result[key] = value
  }
  return result as FreeformNodeStylePatch
}
