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
  'lineHeight',
  'letterSpacing',
  'italic',
  'vertical',
  'stroke',
  'strokeWidth',
] as const
const SHAPE_STYLE_KEYS = ['fill', 'stroke', 'strokeWidth', 'cornerRadius'] as const
const LINE_STYLE_KEYS = ['stroke', 'strokeWidth', 'dash', 'cap'] as const
const IMAGE_STYLE_KEYS = ['fit'] as const

export function styleKeysForNodeType(type: FreeformSceneNode['type']): readonly string[] {
  switch (type) {
    case 'text': return [...TEXT_STYLE_KEYS, ...SHARED_STYLE_KEYS]
    case 'shape': return [...SHAPE_STYLE_KEYS, ...SHARED_STYLE_KEYS]
    case 'line': return [...LINE_STYLE_KEYS, ...SHARED_STYLE_KEYS]
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
  return Object.keys(patch).length > 0 ? (patch as FreeformNodeStylePatch) : null
}

/** Narrow a stored patch to the keys the target node type accepts. */
export function pasteStylePatch(
  patch: FreeformNodeStylePatch,
  targetType: FreeformSceneNode['type'],
): FreeformNodeStylePatch {
  if (targetType === 'group') return {}
  const allowed = new Set(styleKeysForNodeType(targetType))
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (allowed.has(key) && value !== undefined) result[key] = value
  }
  return result as FreeformNodeStylePatch
}
