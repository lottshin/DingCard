import {
  MAX_EFFECTIVE_SCALE,
  MAX_SCENE_DEPTH,
  MIN_EFFECTIVE_SCALE,
} from './constants'
import {
  SCENE_EPSILON,
  decomposeSimilarity,
  groupLocal,
  identity,
  invert,
  multiply,
  sceneNodeLocalMatrix,
  sceneNodesBoundsInParent,
  transformPoint,
  transformVector,
} from './sceneTransform'
import {
  validateSceneNodesForMutation,
} from './sceneTree'
import type { Matrix2D, Point, SceneBounds } from './sceneTransform'
import type {
  FreeformGroupNode,
  FreeformNodeGeometryUpdate,
  FreeformNodeStyleUpdate,
  FreeformSceneLeaf,
  FreeformSceneNode,
  ScenePath,
} from './types'

export type ScenePropertyReadError =
  | 'unknown-path'
  | 'invalid-scene'
  | 'invalid-transform'

export type ScenePropertyMutationError =
  | ScenePropertyReadError
  | 'invalid-value'
  | 'unsupported-property'
  | 'locked'
  | 'locked-descendant'

export type ScenePropertyEditability =
  | { kind: 'editable' }
  | { kind: 'locked'; sourcePath: ScenePath; sourceName: string }
  | { kind: 'locked-descendant'; sourcePath: ScenePath; sourceName: string }

export interface ScenePropertyBreadcrumb {
  name: string
  path: ScenePath
}

interface ScenePropertiesBase {
  path: ScenePath
  breadcrumbs: ScenePropertyBreadcrumb[]
  editability: ScenePropertyEditability
  x: number
  y: number
  width: number
  height: number
  rotation: number
  worldScale: number
}

export interface SceneLeafProperties extends ScenePropertiesBase {
  kind: 'leaf'
  node: FreeformSceneLeaf
  fontSize?: number
  strokeWidth?: number
}

export interface SceneGroupProperties extends ScenePropertiesBase {
  kind: 'group'
  node: FreeformGroupNode
  scalePercent: number
}

export type SceneProperties = SceneLeafProperties | SceneGroupProperties

export type ScenePropertyReadResult =
  | { ok: true; properties: SceneProperties }
  | { ok: false; reason: ScenePropertyReadError }

export type ScenePropertyEdit = {
  property:
    | 'x'
    | 'y'
    | 'width'
    | 'height'
    | 'rotation'
    | 'scalePercent'
    | 'fontSize'
    | 'strokeWidth'
  value: number
}

interface ScenePropertyMutationSuccessBase {
  ok: true
  resolvedValue: number
  clamped: boolean
}

export type ScenePropertyMutationSuccess =
  | (ScenePropertyMutationSuccessBase & {
      category: 'geometry'
      update: FreeformNodeGeometryUpdate | null
    })
  | (ScenePropertyMutationSuccessBase & {
      category: 'style'
      update: FreeformNodeStyleUpdate | null
    })

export type ScenePropertyMutationResult =
  | ScenePropertyMutationSuccess
  | { ok: false; reason: ScenePropertyMutationError }

interface ResolvedSceneProperties {
  properties: SceneProperties
  parentWorld: Matrix2D
  parentRotation: number
  parentScale: number
  localGroupBounds: SceneBounds | null
}

function normalizeRotation(value: number): number {
  const normalized = ((value % 360) + 360) % 360
  return (
    Object.is(normalized, -0) ||
    normalized <= SCENE_EPSILON ||
    360 - normalized <= SCENE_EPSILON
  ) ? 0 : normalized
}

function almostEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= SCENE_EPSILON
}

function rotationAlmostEqual(left: number, right: number): boolean {
  const difference = Math.abs(left - right) % 360
  return Math.min(difference, 360 - difference) <= SCENE_EPSILON
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function readErrorForScene(nodes: readonly FreeformSceneNode[]): ScenePropertyReadError | null {
  const error = validateSceneNodesForMutation(nodes)
  if (!error) return null
  return error === 'invalid-transform' ? 'invalid-transform' : 'invalid-scene'
}

function lockedDescendant(
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
): { path: ScenePath; node: FreeformSceneNode } | null {
  for (const node of nodes) {
    const path = [...parentPath, node.id]
    if (node.locked) return { path, node }
    if (node.type === 'group') {
      const nested = lockedDescendant(node.children, path)
      if (nested) return nested
    }
  }
  return null
}

function editabilityFor(
  pathNodes: readonly FreeformSceneNode[],
  path: ScenePath,
  node: FreeformSceneNode,
): ScenePropertyEditability {
  for (let index = pathNodes.length - 1; index >= 0; index -= 1) {
    const candidate = pathNodes[index]
    if (candidate.locked) {
      return {
        kind: 'locked',
        sourcePath: path.slice(0, index + 1),
        sourceName: candidate.name,
      }
    }
  }
  if (node.type === 'group') {
    const locked = lockedDescendant(node.children, path)
    if (locked) {
      return {
        kind: 'locked-descendant',
        sourcePath: locked.path,
        sourceName: locked.node.name,
      }
    }
  }
  return { kind: 'editable' }
}

function resolveSceneProperties(
  nodes: readonly FreeformSceneNode[],
  path: ScenePath,
): { ok: true; value: ResolvedSceneProperties } | { ok: false; reason: ScenePropertyReadError } {
  if (!Array.isArray(path) || path.length === 0 || !path.every((id) => typeof id === 'string')) {
    return { ok: false, reason: 'unknown-path' }
  }
  const sceneError = readErrorForScene(nodes)
  if (sceneError) return { ok: false, reason: sceneError }
  if (path.length > MAX_SCENE_DEPTH) {
    return { ok: false, reason: 'unknown-path' }
  }

  try {
    let children = nodes
    let parentWorld = identity()
    let parentScaleProduct = 1
    const pathNodes: FreeformSceneNode[] = []
    const breadcrumbs: ScenePropertyBreadcrumb[] = [{ name: '页面', path: [] }]
    let target: FreeformSceneNode | null = null

    for (let index = 0; index < path.length; index += 1) {
      const node = children.find((candidate) => candidate.id === path[index])
      if (!node) return { ok: false, reason: 'unknown-path' }
      pathNodes.push(node)
      if (index === path.length - 1) {
        target = node
        break
      }
      if (node.type !== 'group') return { ok: false, reason: 'unknown-path' }
      parentWorld = multiply(parentWorld, sceneNodeLocalMatrix(node))
      parentScaleProduct *= node.scale
      breadcrumbs.push({ name: node.name, path: path.slice(0, index + 1) })
      children = node.children
    }
    if (!target) return { ok: false, reason: 'unknown-path' }

    const parentTransform = decomposeSimilarity(parentWorld)
    const world = multiply(parentWorld, sceneNodeLocalMatrix(target))
    const worldTransform = decomposeSimilarity(world)
    const worldScale = parentScaleProduct * target.scale
    if (!parentTransform || !worldTransform || !finitePositive(worldScale)) {
      return { ok: false, reason: 'invalid-transform' }
    }

    const common = {
      path: [...path],
      breadcrumbs,
      editability: editabilityFor(pathNodes, path, target),
      rotation: normalizeRotation(worldTransform.rotation),
      worldScale,
    }

    if (target.type !== 'group') {
      const center = transformPoint(world, {
        x: target.width / 2,
        y: target.height / 2,
      })
      const width = target.width * worldScale
      const height = target.height * worldScale
      const x = center.x - width / 2
      const y = center.y - height / 2
      if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        return { ok: false, reason: 'invalid-transform' }
      }
      const properties: SceneLeafProperties = {
        ...common,
        kind: 'leaf',
        node: target,
        x,
        y,
        width,
        height,
        ...(target.type === 'text'
          ? { fontSize: target.fontSize * worldScale }
          : {}),
        ...(target.type === 'shape' || target.type === 'line'
          ? { strokeWidth: target.strokeWidth * worldScale }
          : {}),
      }
      if (
        (properties.fontSize !== undefined && !Number.isFinite(properties.fontSize)) ||
        (properties.strokeWidth !== undefined && !Number.isFinite(properties.strokeWidth))
      ) {
        return { ok: false, reason: 'invalid-transform' }
      }
      return {
        ok: true,
        value: {
          properties,
          parentWorld,
          parentRotation: normalizeRotation(parentTransform.rotation),
          parentScale: parentScaleProduct,
          localGroupBounds: null,
        },
      }
    }

    const bounds = sceneNodesBoundsInParent(target.children)
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return { ok: false, reason: 'invalid-transform' }
    }
    const center = transformPoint(world, {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    })
    const width = bounds.width * worldScale
    const height = bounds.height * worldScale
    const scalePercent = worldScale * 100
    if (
      ![center.x, center.y, width, height, scalePercent].every(Number.isFinite) ||
      width <= 0 ||
      height <= 0
    ) {
      return { ok: false, reason: 'invalid-transform' }
    }
    return {
      ok: true,
      value: {
        properties: {
          ...common,
          kind: 'group',
          node: target,
          x: center.x,
          y: center.y,
          width,
          height,
          scalePercent,
        },
        parentWorld,
        parentRotation: normalizeRotation(parentTransform.rotation),
        parentScale: parentScaleProduct,
        localGroupBounds: bounds,
      },
    }
  } catch {
    return { ok: false, reason: 'invalid-transform' }
  }
}

export function scenePropertiesForPath(
  nodes: readonly FreeformSceneNode[],
  path: ScenePath,
): ScenePropertyReadResult {
  const result = resolveSceneProperties(nodes, path)
  return result.ok
    ? { ok: true, properties: result.value.properties }
    : result
}

function mutationFailureForEditability(
  editability: ScenePropertyEditability,
): { ok: false; reason: 'locked' | 'locked-descendant' } | null {
  if (editability.kind === 'locked') return { ok: false, reason: 'locked' }
  if (editability.kind === 'locked-descendant') {
    return { ok: false, reason: 'locked-descendant' }
  }
  return null
}

function geometrySuccess(
  path: ScenePath,
  patch: FreeformNodeGeometryUpdate['patch'] | null,
  resolvedValue: number,
  clamped = false,
): ScenePropertyMutationSuccess {
  return {
    ok: true,
    category: 'geometry',
    update: patch ? { path: [...path], patch } : null,
    resolvedValue,
    clamped,
  }
}

function styleSuccess(
  path: ScenePath,
  patch: FreeformNodeStyleUpdate['patch'] | null,
  resolvedValue: number,
): ScenePropertyMutationSuccess {
  return {
    ok: true,
    category: 'style',
    update: patch ? { path: [...path], patch } : null,
    resolvedValue,
    clamped: false,
  }
}

function groupScaleRatioBounds(
  group: FreeformGroupNode,
  currentWorldScale: number,
): { min: number; max: number } | null {
  let min = MIN_EFFECTIVE_SCALE / currentWorldScale
  let max = MAX_EFFECTIVE_SCALE / currentWorldScale
  const pending: Array<{ node: FreeformSceneNode; effectiveScale: number; depth: number }> = []
  for (const child of group.children) {
    pending.push({
      node: child,
      effectiveScale: currentWorldScale * child.scale,
      depth: 1,
    })
  }
  while (pending.length > 0) {
    const current = pending.pop()!
    if (
      current.depth > MAX_SCENE_DEPTH ||
      !finitePositive(current.effectiveScale)
    ) return null
    min = Math.max(min, MIN_EFFECTIVE_SCALE / current.effectiveScale)
    max = Math.min(max, MAX_EFFECTIVE_SCALE / current.effectiveScale)
    if (current.node.type === 'group') {
      for (const child of current.node.children) {
        pending.push({
          node: child,
          effectiveScale: current.effectiveScale * child.scale,
          depth: current.depth + 1,
        })
      }
    }
  }
  return finitePositive(min) && finitePositive(max) && min <= max ? { min, max } : null
}

function groupOriginForCenter(
  centerInParent: Point,
  localCenter: Point,
  rotation: number,
  scale: number,
): Point {
  const offset = transformVector(groupLocal(0, 0, rotation, scale), localCenter)
  return {
    x: centerInParent.x - offset.x,
    y: centerInParent.y - offset.y,
  }
}

function currentGroupCenterInParent(
  group: FreeformGroupNode,
  bounds: SceneBounds,
): Point {
  return transformPoint(groupLocal(group.x, group.y, group.rotation, group.scale), {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  })
}

function scenePropertyMutationUnsafe(
  nodes: readonly FreeformSceneNode[],
  path: ScenePath,
  edit: ScenePropertyEdit,
): ScenePropertyMutationResult {
  if (
    edit === null ||
    typeof edit !== 'object' ||
    typeof (edit as { value?: unknown }).value !== 'number' ||
    !Number.isFinite((edit as { value: number }).value)
  ) return { ok: false, reason: 'invalid-value' }
  const resolved = resolveSceneProperties(nodes, path)
  if (!resolved.ok) return resolved
  const state = resolved.value
  const { properties } = state
  const permissionFailure = mutationFailureForEditability(properties.editability)
  if (permissionFailure) return permissionFailure

  if (properties.kind === 'leaf') {
    const node = properties.node
    if (edit.property === 'scalePercent') {
      return { ok: false, reason: 'unsupported-property' }
    }
    if (edit.property === 'fontSize') {
      if (node.type !== 'text') return { ok: false, reason: 'unsupported-property' }
      if (!finitePositive(edit.value)) return { ok: false, reason: 'invalid-value' }
      if (almostEqual(properties.fontSize ?? Number.NaN, edit.value)) {
        return styleSuccess(path, null, edit.value)
      }
      const fontSize = edit.value / properties.worldScale
      if (!finitePositive(fontSize)) return { ok: false, reason: 'invalid-transform' }
      return styleSuccess(path, { fontSize }, edit.value)
    }
    if (edit.property === 'strokeWidth') {
      if (node.type !== 'shape' && node.type !== 'line') {
        return { ok: false, reason: 'unsupported-property' }
      }
      const valid = node.type === 'shape'
        ? finiteNonNegative(edit.value)
        : finitePositive(edit.value)
      if (!valid) return { ok: false, reason: 'invalid-value' }
      if (almostEqual(properties.strokeWidth ?? Number.NaN, edit.value)) {
        return styleSuccess(path, null, edit.value)
      }
      const strokeWidth = edit.value / properties.worldScale
      if (
        !Number.isFinite(strokeWidth) ||
        (node.type === 'shape' ? strokeWidth < 0 : strokeWidth <= 0)
      ) return { ok: false, reason: 'invalid-transform' }
      return styleSuccess(path, { strokeWidth }, edit.value)
    }
    if (
      edit.property !== 'x' &&
      edit.property !== 'y' &&
      edit.property !== 'width' &&
      edit.property !== 'height' &&
      edit.property !== 'rotation'
    ) return { ok: false, reason: 'unsupported-property' }
    if (
      (edit.property === 'width' || edit.property === 'height') &&
      !finitePositive(edit.value)
    ) return { ok: false, reason: 'invalid-value' }

    const resolvedValue = edit.property === 'rotation'
      ? normalizeRotation(edit.value)
      : edit.value
    if (
      edit.property === 'rotation'
        ? rotationAlmostEqual(properties.rotation, resolvedValue)
        : almostEqual(properties[edit.property], resolvedValue)
    ) {
      return geometrySuccess(path, null, resolvedValue)
    }
    if (edit.property === 'rotation') {
      const rotation = normalizeRotation(resolvedValue - state.parentRotation)
      return geometrySuccess(path, { rotation }, resolvedValue)
    }

    const width = edit.property === 'width' ? resolvedValue : properties.width
    const height = edit.property === 'height' ? resolvedValue : properties.height
    const x = edit.property === 'x' ? resolvedValue : properties.x
    const y = edit.property === 'y' ? resolvedValue : properties.y
    const baseWidth = width / properties.worldScale
    const baseHeight = height / properties.worldScale
    const inverseParent = invert(state.parentWorld)
    if (!inverseParent || !finitePositive(baseWidth) || !finitePositive(baseHeight)) {
      return { ok: false, reason: 'invalid-transform' }
    }
    const center = transformPoint(inverseParent, {
      x: x + width / 2,
      y: y + height / 2,
    })
    const localX = center.x - baseWidth / 2
    const localY = center.y - baseHeight / 2
    if (![localX, localY].every(Number.isFinite)) {
      return { ok: false, reason: 'invalid-transform' }
    }
    return geometrySuccess(path, {
      x: localX,
      y: localY,
      ...(edit.property === 'width' ? { width: baseWidth } : {}),
      ...(edit.property === 'height' ? { height: baseHeight } : {}),
    }, resolvedValue)
  }

  if (edit.property === 'fontSize' || edit.property === 'strokeWidth') {
    return { ok: false, reason: 'unsupported-property' }
  }
  if (
    edit.property !== 'x' &&
    edit.property !== 'y' &&
    edit.property !== 'width' &&
    edit.property !== 'height' &&
    edit.property !== 'rotation' &&
    edit.property !== 'scalePercent'
  ) return { ok: false, reason: 'unsupported-property' }
  if (
    (edit.property === 'width' ||
      edit.property === 'height' ||
      edit.property === 'scalePercent') &&
    !finitePositive(edit.value)
  ) return { ok: false, reason: 'invalid-value' }

  const node = properties.node
  const bounds = state.localGroupBounds
  if (!bounds) return { ok: false, reason: 'invalid-transform' }
  const inverseParent = invert(state.parentWorld)
  if (!inverseParent) return { ok: false, reason: 'invalid-transform' }
  const localCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }

  if (edit.property === 'x' || edit.property === 'y') {
    if (almostEqual(properties[edit.property], edit.value)) {
      return geometrySuccess(path, null, edit.value)
    }
    const pageDelta = edit.property === 'x'
      ? { x: edit.value - properties.x, y: 0 }
      : { x: 0, y: edit.value - properties.y }
    const localDelta = transformVector(inverseParent, pageDelta)
    const x = node.x + localDelta.x
    const y = node.y + localDelta.y
    if (![x, y].every(Number.isFinite)) {
      return { ok: false, reason: 'invalid-transform' }
    }
    return geometrySuccess(path, { x, y }, edit.value)
  }

  const centerInParent = currentGroupCenterInParent(node, bounds)
  if (edit.property === 'rotation') {
    const resolvedValue = normalizeRotation(edit.value)
    if (rotationAlmostEqual(properties.rotation, resolvedValue)) {
      return geometrySuccess(path, null, resolvedValue)
    }
    const rotation = normalizeRotation(resolvedValue - state.parentRotation)
    const origin = groupOriginForCenter(centerInParent, localCenter, rotation, node.scale)
    if (![origin.x, origin.y].every(Number.isFinite)) {
      return { ok: false, reason: 'invalid-transform' }
    }
    return geometrySuccess(path, { x: origin.x, y: origin.y, rotation }, resolvedValue)
  }

  const requestedWorldScale = edit.property === 'scalePercent'
    ? edit.value / 100
    : edit.property === 'width'
      ? edit.value / bounds.width
      : edit.value / bounds.height
  const requestedLocalScale = requestedWorldScale / state.parentScale
  if (!finitePositive(requestedLocalScale)) {
    return { ok: false, reason: 'invalid-transform' }
  }
  const ratioBounds = groupScaleRatioBounds(node, properties.worldScale)
  if (!ratioBounds) return { ok: false, reason: 'invalid-transform' }
  const requestedRatio = requestedLocalScale / node.scale
  const ratioWasClamped = requestedRatio < ratioBounds.min || requestedRatio > ratioBounds.max
  let finalRatio = Math.min(Math.max(requestedRatio, ratioBounds.min), ratioBounds.max)
  if (!ratioWasClamped && almostEqual(edit.value, properties[edit.property])) {
    return geometrySuccess(path, null, edit.value)
  }
  const scaleSafetyMargin = Number.EPSILON * 32
  let endpointAdjusted = false
  if (
    ratioBounds.max > ratioBounds.min &&
    requestedRatio >= ratioBounds.max &&
    finalRatio === ratioBounds.max
  ) {
    finalRatio = Math.max(
      ratioBounds.min,
      ratioBounds.max * (1 - scaleSafetyMargin),
    )
    endpointAdjusted = true
  } else if (
    ratioBounds.max > ratioBounds.min &&
    requestedRatio <= ratioBounds.min &&
    finalRatio === ratioBounds.min
  ) {
    finalRatio = Math.min(
      ratioBounds.max,
      ratioBounds.min * (1 + scaleSafetyMargin),
    )
    endpointAdjusted = true
  }
  const scale = node.scale * finalRatio
  if (!finitePositive(scale)) return { ok: false, reason: 'invalid-transform' }
  const resolvedValue = edit.property === 'scalePercent'
    ? state.parentScale * scale * 100
    : edit.property === 'width'
      ? bounds.width * state.parentScale * scale
      : bounds.height * state.parentScale * scale
  const clamped = ratioWasClamped || endpointAdjusted
  if (almostEqual(resolvedValue, properties[edit.property])) {
    return geometrySuccess(
      path,
      null,
      clamped ? properties[edit.property] : resolvedValue,
      clamped,
    )
  }
  const origin = groupOriginForCenter(centerInParent, localCenter, node.rotation, scale)
  if (![origin.x, origin.y, resolvedValue].every(Number.isFinite)) {
    return { ok: false, reason: 'invalid-transform' }
  }
  return geometrySuccess(
    path,
    { x: origin.x, y: origin.y, scale },
    resolvedValue,
    clamped,
  )
}

export function scenePropertyMutation(
  nodes: readonly FreeformSceneNode[],
  path: ScenePath,
  edit: ScenePropertyEdit,
): ScenePropertyMutationResult {
  try {
    return scenePropertyMutationUnsafe(nodes, path, edit)
  } catch {
    return { ok: false, reason: 'invalid-transform' }
  }
}
