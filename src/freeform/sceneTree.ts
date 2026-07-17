import {
  MAX_EFFECTIVE_SCALE,
  MAX_SCENE_DEPTH,
  MAX_SCENE_NODES_PER_SLIDE,
  MIN_EFFECTIVE_SCALE,
} from './constants'
import { isHexColor } from './paint'
import {
  SCENE_EPSILON,
  boundsFromPoints,
  groupLocal,
  identity,
  multiply,
  sceneNodeBoundsInParent,
  sceneNodeLocalMatrix,
  sceneNodeWithLocalMatrix,
  transformVector,
  translation,
} from './sceneTransform'
import type { Matrix2D, Point, SceneBounds } from './sceneTransform'
import type {
  FreeformGroupNode,
  FreeformSceneLeaf,
  FreeformSceneNode,
  SceneIdFactory,
  ScenePath,
} from './types'

export type SceneVisitor = (
  node: FreeformSceneNode,
  path: ScenePath,
  depth: number,
) => void

function requireTraversalDepth(depth: number): void {
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_SCENE_DEPTH) {
    throw new RangeError(`scene depth must be an integer from 1 to ${MAX_SCENE_DEPTH}`)
  }
}

function walkSceneFrom(
  nodes: readonly FreeformSceneNode[],
  visitor: SceneVisitor,
  depth: number,
  parentPath: ScenePath,
): void {
  requireTraversalDepth(depth)

  for (const node of nodes) {
    const path = [...parentPath, node.id]
    visitor(node, path, depth)

    if (node.type === 'group' && node.children.length > 0) {
      walkSceneFrom(node.children, visitor, depth + 1, path)
    }
  }
}

/** Walk nodes depth-first without changing the input tree. Root depth is 1. */
export function walkScene(
  nodes: readonly FreeformSceneNode[],
  visitor: SceneVisitor,
  depth = 1,
): void {
  walkSceneFrom(nodes, visitor, depth, [])
}

export function flattenSceneLeaves(
  nodes: readonly FreeformSceneNode[],
): FreeformSceneLeaf[] {
  const leaves: FreeformSceneLeaf[] = []
  walkScene(nodes, (node) => {
    if (node.type !== 'group') leaves.push(node)
  })
  return leaves
}

export function countSceneNodes(nodes: readonly FreeformSceneNode[]): number {
  let count = 0
  walkScene(nodes, () => {
    count += 1
  })
  return count
}

export function findNodeAtPath(
  nodes: readonly FreeformSceneNode[],
  path: ScenePath,
): FreeformSceneNode | undefined {
  if (path.length === 0 || path.length > MAX_SCENE_DEPTH) return undefined

  let children = nodes
  let current: FreeformSceneNode | undefined

  for (let index = 0; index < path.length; index += 1) {
    current = children.find((node) => node.id === path[index])
    if (!current) return undefined
    if (index === path.length - 1) return current
    if (current.type !== 'group') return undefined
    children = current.children
  }

  return undefined
}

export function getChildrenAtPath(
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
): readonly FreeformSceneNode[] | undefined {
  if (parentPath.length === 0) return nodes
  const parent = findNodeAtPath(nodes, parentPath)
  return parent?.type === 'group' ? parent.children : undefined
}

export type SceneMutationError =
  | 'unknown-path'
  | 'empty-selection'
  | 'requires-two'
  | 'invalid-selection'
  | 'locked'
  | 'locked-parent'
  | 'hidden'
  | 'not-group'
  | 'boundary'
  | 'duplicate-id'
  | 'depth-limit'
  | 'node-limit'
  | 'invalid-node'
  | 'invalid-transform'

export type SceneMutationResult =
  | { ok: true; nodes: FreeformSceneNode[]; selectionIds: string[] }
  | { ok: false; reason: SceneMutationError }

export type ScenePermissionRequest =
  | {
      kind: 'metadata' | 'content' | 'style' | 'geometry' | 'structure'
      paths: readonly ScenePath[]
    }
  | { kind: 'insert'; parentPath: ScenePath }

export type SceneSelectionValidation =
  | {
      ok: true
      children: readonly FreeformSceneNode[]
      selectedNodes: FreeformSceneNode[]
      selectedIndices: number[]
    }
  | { ok: false; reason: SceneMutationError }

export type SceneReorderDirection = 'forward' | 'backward' | 'front' | 'back'

function sameNodeOrder(
  left: readonly FreeformSceneNode[],
  right: readonly FreeformSceneNode[],
): boolean {
  return left.length === right.length && left.every((node, index) => node === right[index])
}

/**
 * Update one container. Unknown paths and updater no-ops preserve the exact
 * root reference; successful deep updates copy only the ancestor chain.
 */
export function updateChildrenAtPath(
  nodes: FreeformSceneNode[],
  parentPath: ScenePath,
  update: (children: readonly FreeformSceneNode[]) => readonly FreeformSceneNode[],
): FreeformSceneNode[] {
  if (parentPath.length === 0) {
    const updated = update(nodes)
    return updated === nodes ? nodes : [...updated]
  }
  if (parentPath.length > MAX_SCENE_DEPTH) return nodes

  const [parentId, ...remainingPath] = parentPath
  const index = nodes.findIndex((node) => node.id === parentId)
  if (index < 0) return nodes
  const parent = nodes[index]
  if (parent.type !== 'group') return nodes

  const children = updateChildrenAtPath(parent.children, remainingPath, update)
  if (children === parent.children) return nodes

  const next = [...nodes]
  next[index] = { ...parent, children }
  return next
}

/** Update exactly one node without changing siblings or unrelated branches. */
export function updateNodeAtPath(
  nodes: FreeformSceneNode[],
  nodePath: ScenePath,
  update: (node: FreeformSceneNode) => FreeformSceneNode,
): FreeformSceneNode[] {
  if (nodePath.length === 0 || nodePath.length > MAX_SCENE_DEPTH) return nodes
  const parentPath = nodePath.slice(0, -1)
  const nodeId = nodePath[nodePath.length - 1]
  return updateChildrenAtPath(nodes, parentPath, (children) => {
    const index = children.findIndex((node) => node.id === nodeId)
    if (index < 0) return children
    const updated = update(children[index])
    if (updated === children[index]) return children
    const next = [...children]
    next[index] = updated
    return next
  })
}

export function removeNodesAtPath(
  nodes: FreeformSceneNode[],
  parentPath: ScenePath,
  nodeIds: readonly string[],
): FreeformSceneNode[] {
  if (nodeIds.length === 0) return nodes
  const selected = new Set(nodeIds)
  return updateChildrenAtPath(nodes, parentPath, (children) => {
    const next = children.filter((node) => !selected.has(node.id))
    return next.length === children.length ? children : next
  })
}

function reorderSiblings(
  children: readonly FreeformSceneNode[],
  nodeIds: readonly string[],
  direction: SceneReorderDirection,
): readonly FreeformSceneNode[] {
  const selected = new Set(nodeIds)
  if (selected.size === 0 || !children.some((node) => selected.has(node.id))) return children

  let next: FreeformSceneNode[]
  if (direction === 'front') {
    next = [
      ...children.filter((node) => !selected.has(node.id)),
      ...children.filter((node) => selected.has(node.id)),
    ]
  } else if (direction === 'back') {
    next = [
      ...children.filter((node) => selected.has(node.id)),
      ...children.filter((node) => !selected.has(node.id)),
    ]
  } else {
    next = [...children]
    if (direction === 'forward') {
      for (let index = next.length - 2; index >= 0; index -= 1) {
        if (selected.has(next[index].id) && !selected.has(next[index + 1].id)) {
          ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
        }
      }
    } else {
      for (let index = 1; index < next.length; index += 1) {
        if (selected.has(next[index].id) && !selected.has(next[index - 1].id)) {
          ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
        }
      }
    }
  }
  return sameNodeOrder(children, next) ? children : next
}

export function reorderNodesAtPath(
  nodes: FreeformSceneNode[],
  parentPath: ScenePath,
  nodeIds: readonly string[],
  direction: SceneReorderDirection,
): FreeformSceneNode[] {
  if (nodeIds.length === 0) return nodes
  return updateChildrenAtPath(nodes, parentPath, (children) =>
    reorderSiblings(children, nodeIds, direction),
  )
}

function clonePaint<T extends object>(paint: T): T {
  return { ...paint }
}

function cloneSceneNode(
  node: FreeformSceneNode,
  createId: SceneIdFactory,
  depth: number,
): FreeformSceneNode {
  requireTraversalDepth(depth)
  const id = createId()
  if (node.type === 'group') {
    return {
      ...node,
      id,
      children: node.children.map((child) => cloneSceneNode(child, createId, depth + 1)),
    }
  }
  if (node.type === 'text') {
    return { ...node, id, textFill: clonePaint(node.textFill) }
  }
  if (node.type === 'shape') {
    return { ...node, id, fill: clonePaint(node.fill) }
  }
  return { ...node, id }
}

function copySceneNodeValue(node: FreeformSceneNode, depth: number): FreeformSceneNode {
  requireTraversalDepth(depth)
  if (node.type === 'group') {
    return {
      ...node,
      children: node.children.map((child) => copySceneNodeValue(child, depth + 1)),
    }
  }
  if (node.type === 'text') {
    return { ...node, textFill: clonePaint(node.textFill) }
  }
  if (node.type === 'shape') {
    return { ...node, fill: clonePaint(node.fill) }
  }
  return { ...node }
}

function copySceneNodeValues(nodes: readonly FreeformSceneNode[]): FreeformSceneNode[] {
  return nodes.map((node) => copySceneNodeValue(node, 1))
}

/** Deep-clone every group and leaf ID while retaining image/font source fields. */
export function cloneSceneNodes(
  nodes: readonly FreeformSceneNode[],
  createId: SceneIdFactory = () => crypto.randomUUID(),
): FreeformSceneNode[] {
  return nodes.map((node) => cloneSceneNode(node, createId, 1))
}

export function validateSelectionForParent(
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
  nodeIds: readonly string[],
): SceneSelectionValidation {
  if (nodeIds.length === 0) return { ok: false, reason: 'empty-selection' }
  const children = getChildrenAtPath(nodes, parentPath)
  if (!children) return { ok: false, reason: 'unknown-path' }
  const selected = new Set(nodeIds)
  if (selected.size !== nodeIds.length) return { ok: false, reason: 'invalid-selection' }

  const selectedNodes: FreeformSceneNode[] = []
  const selectedIndices: number[] = []
  children.forEach((node, index) => {
    if (selected.has(node.id)) {
      selectedNodes.push(node)
      selectedIndices.push(index)
    }
  })
  if (selectedNodes.length !== selected.size) {
    return { ok: false, reason: 'invalid-selection' }
  }
  return { ok: true, children, selectedNodes, selectedIndices }
}

function nodesAlongPath(
  nodes: readonly FreeformSceneNode[],
  nodePath: ScenePath,
): FreeformSceneNode[] | null {
  if (nodePath.length === 0 || nodePath.length > MAX_SCENE_DEPTH) return null
  const result: FreeformSceneNode[] = []
  let children = nodes
  for (let index = 0; index < nodePath.length; index += 1) {
    const node = children.find((candidate) => candidate.id === nodePath[index])
    if (!node) return null
    result.push(node)
    if (index < nodePath.length - 1) {
      if (node.type !== 'group') return null
      children = node.children
    }
  }
  return result
}

function subtreeContainsOwnLock(node: FreeformSceneNode): boolean {
  const pending: Array<{ node: FreeformSceneNode; depth: number }> = [{ node, depth: 1 }]
  while (pending.length > 0) {
    const current = pending.pop()!
    requireTraversalDepth(current.depth)
    if (current.node.locked) return true
    if (current.node.type === 'group') {
      for (const child of current.node.children) {
        pending.push({ node: child, depth: current.depth + 1 })
      }
    }
  }
  return false
}

function parentIsEffectivelyLocked(
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
): boolean | null {
  if (parentPath.length === 0) return false
  const ancestors = nodesAlongPath(nodes, parentPath)
  if (!ancestors || ancestors[ancestors.length - 1].type !== 'group') return null
  return ancestors.some((node) => node.locked)
}

function parentIsEffectivelyHidden(
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
): boolean | null {
  if (parentPath.length === 0) return false
  const ancestors = nodesAlongPath(nodes, parentPath)
  if (!ancestors || ancestors[ancestors.length - 1].type !== 'group') return null
  return ancestors.some((node) => node.hidden)
}

/** Reducer-level lock predicate shared by every path-based action category. */
export function canApplySceneAction(
  nodes: readonly FreeformSceneNode[],
  request: ScenePermissionRequest,
): boolean {
  if (request.kind === 'insert') {
    return parentIsEffectivelyLocked(nodes, request.parentPath) === false
  }
  if (request.paths.length === 0) return false
  for (const nodePath of request.paths) {
    const chain = nodesAlongPath(nodes, nodePath)
    if (!chain) return false
    if (request.kind === 'metadata') continue
    if (chain.some((node) => node.locked)) return false
    const target = chain[chain.length - 1]
    if (
      (request.kind === 'geometry' || request.kind === 'structure') &&
      subtreeContainsOwnLock(target)
    ) {
      return false
    }
  }
  return true
}

interface SceneValidationState {
  ids: Set<string>
  count: number
}

function isValidColorPaint(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const paint = value as Record<string, unknown>
  if (paint.type === 'solid') return isHexColor(paint.color)
  return (
    paint.type === 'linear-gradient' &&
    isHexColor(paint.from) &&
    isHexColor(paint.to) &&
    typeof paint.angle === 'number' &&
    Number.isFinite(paint.angle)
  )
}

function isValidShapeFill(value: unknown): boolean {
  if (isValidColorPaint(value)) return true
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const fill = value as Record<string, unknown>
  return (
    fill.type === 'image' &&
    typeof fill.src === 'string' &&
    (fill.fit === 'cover' || fill.fit === 'contain')
  )
}

function hasValidLeafFields(node: FreeformSceneNode): boolean {
  if (node.type === 'group') return true
  if (node.type === 'text') {
    return (
      typeof node.text === 'string' &&
      Number.isFinite(node.fontSize) &&
      typeof node.fontFamily === 'string' &&
      isValidColorPaint(node.textFill) &&
      (node.align === 'left' || node.align === 'center' || node.align === 'right') &&
      (node.fontWeight === 'normal' || node.fontWeight === 'bold')
    )
  }
  if (node.type === 'image') {
    return (
      typeof node.src === 'string' &&
      typeof node.alt === 'string' &&
      (node.fit === 'cover' || node.fit === 'contain')
    )
  }
  if (node.type === 'shape') {
    return (
      (node.shape === 'rect' || node.shape === 'ellipse' || node.shape === 'triangle') &&
      isValidShapeFill(node.fill) &&
      typeof node.stroke === 'string' &&
      Number.isFinite(node.strokeWidth)
    )
  }
  if (node.type === 'line') {
    return (
      (node.lineKind === 'line' || node.lineKind === 'arrow') &&
      typeof node.stroke === 'string' &&
      Number.isFinite(node.strokeWidth)
    )
  }
  return false
}

function validateSceneNodeList(
  nodes: readonly FreeformSceneNode[],
  depth: number,
  parentWorld: Matrix2D,
  parentScale: number,
  state: SceneValidationState,
): SceneMutationError | null {
  if (depth > MAX_SCENE_DEPTH) return 'depth-limit'
  for (const node of nodes) {
    if (typeof node.id !== 'string' || node.id.trim().length === 0 || state.ids.has(node.id)) {
      return 'duplicate-id'
    }
    if (
      typeof node.name !== 'string' ||
      typeof node.locked !== 'boolean' ||
      typeof node.hidden !== 'boolean' ||
      !hasValidLeafFields(node)
    ) {
      return 'invalid-node'
    }
    state.ids.add(node.id)
    state.count += 1
    if (state.count > MAX_SCENE_NODES_PER_SLIDE) return 'node-limit'
    if (
      !Number.isFinite(node.x) ||
      !Number.isFinite(node.y) ||
      !Number.isFinite(node.rotation) ||
      !Number.isFinite(node.scale) ||
      node.scale <= 0
    ) {
      return 'invalid-transform'
    }

    const effectiveScale = parentScale * node.scale
    if (
      !Number.isFinite(effectiveScale) ||
      effectiveScale < MIN_EFFECTIVE_SCALE ||
      effectiveScale > MAX_EFFECTIVE_SCALE
    ) {
      return 'invalid-transform'
    }

    let world: Matrix2D
    try {
      world = multiply(parentWorld, sceneNodeLocalMatrix(node))
    } catch {
      return 'invalid-transform'
    }

    if (node.type === 'group') {
      if (node.children.length === 0) return 'invalid-transform'
      const error = validateSceneNodeList(
        node.children,
        depth + 1,
        world,
        effectiveScale,
        state,
      )
      if (error) return error
    } else if (
      !Number.isFinite(node.width) ||
      !Number.isFinite(node.height) ||
      node.width <= 0 ||
      node.height <= 0
    ) {
      return 'invalid-transform'
    }
  }
  return null
}

/** Validate mutation invariants without cloning or normalizing valid values. */
export function validateSceneNodesForMutation(
  nodes: readonly FreeformSceneNode[],
): SceneMutationError | null {
  try {
    return validateSceneNodeList(nodes, 1, identity(), 1, { ids: new Set(), count: 0 })
  } catch {
    return 'invalid-transform'
  }
}

function collectSceneIds(nodes: readonly FreeformSceneNode[]): Set<string> {
  const ids = new Set<string>()
  walkScene(nodes, (node) => ids.add(node.id))
  return ids
}

function countNodesSafely(nodes: readonly FreeformSceneNode[]): number {
  return countSceneNodes(nodes)
}

function subtreeDepth(node: FreeformSceneNode): number {
  let deepest = 0
  const pending: Array<{ node: FreeformSceneNode; depth: number }> = [{ node, depth: 1 }]
  while (pending.length > 0) {
    const current = pending.pop()!
    requireTraversalDepth(current.depth)
    deepest = Math.max(deepest, current.depth)
    if (current.node.type === 'group') {
      for (const child of current.node.children) {
        pending.push({ node: child, depth: current.depth + 1 })
      }
    }
  }
  return deepest
}

function unionNodeBounds(nodes: readonly FreeformSceneNode[]): SceneBounds | null {
  const corners: Point[] = []
  for (const node of nodes) {
    const bounds = sceneNodeBoundsInParent(node)
    if (!bounds) return null
    corners.push(
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height },
    )
  }
  return boundsFromPoints(corners)
}

function composeNodeWithMatrix(
  node: FreeformSceneNode,
  parentMatrix: Matrix2D,
  expectedScale: number,
): FreeformSceneNode | null {
  return sceneNodeWithLocalMatrix(
    node,
    multiply(parentMatrix, sceneNodeLocalMatrix(node)),
    expectedScale,
  )
}

function transformChildrenIntoParent(group: FreeformGroupNode): FreeformSceneNode[] | null {
  const groupMatrix = groupLocal(group.x, group.y, group.rotation, group.scale)
  const transformed: FreeformSceneNode[] = []
  for (const child of group.children) {
    const next = composeNodeWithMatrix(child, groupMatrix, group.scale * child.scale)
    if (!next) return null
    transformed.push(next)
  }
  return transformed
}

function flattenGroupIntoParent(group: FreeformGroupNode): FreeformSceneNode[] | null {
  const flattened: FreeformSceneNode[] = []
  const visit = (
    node: FreeformSceneNode,
    parentMatrix: Matrix2D,
    parentScale: number,
    depth: number,
  ): boolean => {
    requireTraversalDepth(depth)
    const matrix = multiply(parentMatrix, sceneNodeLocalMatrix(node))
    const expectedScale = parentScale * node.scale
    if (node.type === 'group') {
      return node.children.every((child) =>
        visit(child, matrix, expectedScale, depth + 1),
      )
    }
    const transformed = sceneNodeWithLocalMatrix(node, matrix, expectedScale)
    if (!transformed) return false
    flattened.push(transformed)
    return true
  }
  const parentMatrix = groupLocal(group.x, group.y, group.rotation, group.scale)
  for (const child of group.children) {
    if (!visit(child, parentMatrix, group.scale, 2)) return null
  }
  return flattened
}

export interface CreateSceneGroupOptions {
  id?: string
  name?: string
}

export function createSceneGroup(
  nodes: FreeformSceneNode[],
  parentPath: ScenePath,
  nodeIds: readonly string[],
  options: CreateSceneGroupOptions = {},
): SceneMutationResult {
  if (nodeIds.length === 0) return { ok: false, reason: 'empty-selection' }
  const selection = validateSelectionForParent(nodes, parentPath, nodeIds)
  if (!selection.ok) return selection
  if (selection.selectedNodes.length < 2) return { ok: false, reason: 'requires-two' }

  const parentLocked = parentIsEffectivelyLocked(nodes, parentPath)
  if (parentLocked === null) return { ok: false, reason: 'unknown-path' }
  if (parentLocked) return { ok: false, reason: 'locked-parent' }
  const parentHidden = parentIsEffectivelyHidden(nodes, parentPath)
  if (parentHidden === null) return { ok: false, reason: 'unknown-path' }
  if (parentHidden) return { ok: false, reason: 'hidden' }
  if (
    !canApplySceneAction(nodes, {
      kind: 'structure',
      paths: selection.selectedNodes.map((node) => [...parentPath, node.id]),
    })
  ) {
    return { ok: false, reason: 'locked' }
  }
  if (selection.selectedNodes.some((node) => node.hidden)) {
    return { ok: false, reason: 'hidden' }
  }

  const existingError = validateSceneNodesForMutation(nodes)
  if (existingError) return { ok: false, reason: existingError }
  if (countNodesSafely(nodes) >= MAX_SCENE_NODES_PER_SLIDE) {
    return { ok: false, reason: 'node-limit' }
  }
  const deepestSelected = Math.max(...selection.selectedNodes.map(subtreeDepth))
  if (parentPath.length + 1 + deepestSelected > MAX_SCENE_DEPTH) {
    return { ok: false, reason: 'depth-limit' }
  }

  const id = options.id ?? crypto.randomUUID()
  if (typeof id !== 'string' || id.trim().length === 0 || collectSceneIds(nodes).has(id)) {
    return { ok: false, reason: 'duplicate-id' }
  }

  try {
    const bounds = unionNodeBounds(selection.selectedNodes)
    if (!bounds) return { ok: false, reason: 'invalid-transform' }
    const center = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    }
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) {
      return { ok: false, reason: 'invalid-transform' }
    }
    const toGroup = translation(-center.x, -center.y)
    const children: FreeformSceneNode[] = []
    for (const selected of selection.selectedNodes) {
      const child = composeNodeWithMatrix(selected, toGroup, selected.scale)
      if (!child) return { ok: false, reason: 'invalid-transform' }
      children.push(child)
    }
    const group: FreeformGroupNode = {
      id,
      name: options.name ?? '组',
      locked: false,
      hidden: false,
      type: 'group',
      x: center.x,
      y: center.y,
      rotation: 0,
      scale: 1,
      children,
    }

    const selectedIds = new Set(nodeIds)
    const highestIndex = Math.max(...selection.selectedIndices)
    const insertionIndex = selection.children
      .slice(0, highestIndex)
      .filter((node) => !selectedIds.has(node.id)).length
    const remaining = selection.children.filter((node) => !selectedIds.has(node.id))
    const nextChildren = [
      ...remaining.slice(0, insertionIndex),
      group,
      ...remaining.slice(insertionIndex),
    ]
    const nextNodes = updateChildrenAtPath(nodes, parentPath, () => nextChildren)
    const error = validateSceneNodesForMutation(nextNodes)
    return error
      ? { ok: false, reason: error }
      : { ok: true, nodes: nextNodes, selectionIds: [id] }
  } catch {
    return { ok: false, reason: 'invalid-transform' }
  }
}

export function ungroupSceneGroups(
  nodes: FreeformSceneNode[],
  parentPath: ScenePath,
  groupIds: readonly string[],
  mode: 'one-level' | 'all-level',
): SceneMutationResult {
  const selection = validateSelectionForParent(nodes, parentPath, groupIds)
  if (!selection.ok) return selection
  if (selection.selectedNodes.some((node) => node.type !== 'group')) {
    return { ok: false, reason: 'not-group' }
  }
  if (
    !canApplySceneAction(nodes, {
      kind: 'structure',
      paths: selection.selectedNodes.map((node) => [...parentPath, node.id]),
    })
  ) {
    return { ok: false, reason: 'locked' }
  }
  if (parentIsEffectivelyLocked(nodes, parentPath)) {
    return { ok: false, reason: 'locked-parent' }
  }
  const existingError = validateSceneNodesForMutation(nodes)
  if (existingError) return { ok: false, reason: existingError }

  try {
    const selected = new Set(groupIds)
    const nextChildren: FreeformSceneNode[] = []
    const nextSelection: string[] = []
    for (const node of selection.children) {
      if (!selected.has(node.id)) {
        nextChildren.push(node)
        continue
      }
      if (node.type !== 'group') return { ok: false, reason: 'not-group' }
      const replacements =
        mode === 'all-level'
          ? flattenGroupIntoParent(node)
          : transformChildrenIntoParent(node)
      if (!replacements) return { ok: false, reason: 'invalid-transform' }
      nextChildren.push(...replacements)
      nextSelection.push(...replacements.map((replacement) => replacement.id))
    }
    const nextNodes = updateChildrenAtPath(nodes, parentPath, () => nextChildren)
    const error = validateSceneNodesForMutation(nextNodes)
    return error
      ? { ok: false, reason: error }
      : { ok: true, nodes: nextNodes, selectionIds: nextSelection }
  } catch {
    return { ok: false, reason: 'invalid-transform' }
  }
}

interface DeleteTraversalResult {
  nodes: FreeformSceneNode[]
  changed: boolean
  error: SceneMutationError | null
}

function collapseDegenerateGroup(
  group: FreeformGroupNode,
  depth = 1,
): FreeformSceneNode[] | null {
  requireTraversalDepth(depth)
  if (group.children.length === 0) {
    return []
  }
  if (group.children.length > 1) {
    return [group]
  }

  const lifted = transformChildrenIntoParent(group)
  if (!lifted) return null
  const liftedChild = lifted[0]
  if (liftedChild.type !== 'group' || liftedChild.children.length > 1) {
    return lifted
  }
  return collapseDegenerateGroup(liftedChild, depth + 1)
}

function deleteAtContainerPath(
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
  selected: ReadonlySet<string>,
  depth = 1,
): DeleteTraversalResult {
  requireTraversalDepth(depth)
  if (parentPath.length === 0) {
    const next = nodes.filter((node) => !selected.has(node.id))
    return {
      nodes: next,
      changed: next.length !== nodes.length,
      error: null,
    }
  }

  const [parentId, ...remaining] = parentPath
  const index = nodes.findIndex((node) => node.id === parentId)
  if (index < 0 || nodes[index].type !== 'group') {
    return {
      nodes: nodes as FreeformSceneNode[],
      changed: false,
      error: 'unknown-path',
    }
  }
  const group = nodes[index] as FreeformGroupNode
  const childResult = deleteAtContainerPath(group.children, remaining, selected, depth + 1)
  if (childResult.error || !childResult.changed) {
    return {
      nodes: nodes as FreeformSceneNode[],
      changed: false,
      error: childResult.error,
    }
  }

  let replacements: FreeformSceneNode[]
  if (childResult.nodes.length <= 1) {
    const cleanup = collapseDegenerateGroup({ ...group, children: childResult.nodes })
    if (!cleanup) {
      return {
        nodes: nodes as FreeformSceneNode[],
        changed: false,
        error: 'invalid-transform',
      }
    }
    replacements = cleanup
  } else {
    replacements = [{ ...group, children: childResult.nodes }]
  }

  return {
    nodes: [...nodes.slice(0, index), ...replacements, ...nodes.slice(index + 1)],
    changed: true,
    error: null,
  }
}

export function deleteSceneNodes(
  nodes: FreeformSceneNode[],
  parentPath: ScenePath,
  nodeIds: readonly string[],
): SceneMutationResult {
  const selection = validateSelectionForParent(nodes, parentPath, nodeIds)
  if (!selection.ok) return selection
  if (
    !canApplySceneAction(nodes, {
      kind: 'structure',
      paths: selection.selectedNodes.map((node) => [...parentPath, node.id]),
    })
  ) {
    return { ok: false, reason: 'locked' }
  }
  if (parentIsEffectivelyLocked(nodes, parentPath)) {
    return { ok: false, reason: 'locked-parent' }
  }

  try {
    const result = deleteAtContainerPath(nodes, parentPath, new Set(nodeIds))
    if (result.error) return { ok: false, reason: result.error }
    if (!result.changed) return { ok: false, reason: 'invalid-selection' }
    let nextNodes = result.nodes
    let survivingContainerPath: ScenePath = []
    for (let length = parentPath.length; length >= 1; length -= 1) {
      const candidatePath = parentPath.slice(0, length)
      const candidate = findNodeAtPath(nextNodes, candidatePath)
      if (candidate?.type === 'group') {
        survivingContainerPath = candidatePath
        break
      }
    }
    if (survivingContainerPath.length > 0) {
      const centered = recenterSceneContainerAndAncestors(nextNodes, survivingContainerPath)
      if (!centered.ok) return centered
      nextNodes = centered.nodes
    }
    const error = validateSceneNodesForMutation(nextNodes)
    return error
      ? { ok: false, reason: error }
      : { ok: true, nodes: nextNodes, selectionIds: [] }
  } catch {
    return { ok: false, reason: 'invalid-transform' }
  }
}

function recenterGroup(group: FreeformGroupNode): FreeformGroupNode | null {
  const bounds = unionNodeBounds(group.children)
  if (!bounds) return null
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return null
  if (Math.abs(center.x) <= SCENE_EPSILON && Math.abs(center.y) <= SCENE_EPSILON) {
    return group
  }

  const shift = translation(-center.x, -center.y)
  const children: FreeformSceneNode[] = []
  for (const child of group.children) {
    const shifted = composeNodeWithMatrix(child, shift, child.scale)
    if (!shifted) return null
    children.push(shifted)
  }
  const parentDelta = transformVector(
    groupLocal(0, 0, group.rotation, group.scale),
    center,
  )
  const x = group.x + parentDelta.x
  const y = group.y + parentDelta.y
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { ...group, x, y, children }
}

function recenterSceneContainerAndAncestors(
  nodes: FreeformSceneNode[],
  containerPath: ScenePath,
): SceneMutationResult {
  if (containerPath.length === 0) {
    return { ok: true, nodes, selectionIds: [] }
  }
  let invalid = false
  const centeredContainer = updateNodeAtPath(nodes, containerPath, (node) => {
    if (node.type !== 'group') {
      invalid = true
      return node
    }
    const centered = recenterGroup(node)
    if (!centered) {
      invalid = true
      return node
    }
    return centered
  })
  if (invalid) return { ok: false, reason: 'invalid-transform' }
  return recenterSceneAncestors(centeredContainer, containerPath)
}

/** Recenter affected ancestor groups from the nearest parent out to the root. */
export function recenterSceneAncestors(
  nodes: FreeformSceneNode[],
  changedPath: ScenePath,
): SceneMutationResult {
  if (!findNodeAtPath(nodes, changedPath)) return { ok: false, reason: 'unknown-path' }
  let next = nodes
  try {
    for (let length = changedPath.length - 1; length >= 1; length -= 1) {
      const ancestorPath = changedPath.slice(0, length)
      let invalid = false
      next = updateNodeAtPath(next, ancestorPath, (node) => {
        if (node.type !== 'group') {
          invalid = true
          return node
        }
        const centered = recenterGroup(node)
        if (!centered) {
          invalid = true
          return node
        }
        return centered
      })
      if (invalid) return { ok: false, reason: 'invalid-transform' }
    }
    const error = validateSceneNodesForMutation(next)
    return error
      ? { ok: false, reason: error }
      : { ok: true, nodes: next, selectionIds: [changedPath[changedPath.length - 1]] }
  } catch {
    return { ok: false, reason: 'invalid-transform' }
  }
}

export function insertSceneChildren(
  nodes: FreeformSceneNode[],
  parentPath: ScenePath,
  inserted: readonly FreeformSceneNode[],
  index?: number,
): SceneMutationResult {
  if (inserted.length === 0) return { ok: false, reason: 'empty-selection' }
  if (!canApplySceneAction(nodes, { kind: 'insert', parentPath })) {
    return { ok: false, reason: 'locked-parent' }
  }
  const children = getChildrenAtPath(nodes, parentPath)
  if (!children) return { ok: false, reason: 'unknown-path' }
  const insertAt = index ?? children.length
  if (!Number.isInteger(insertAt) || insertAt < 0 || insertAt > children.length) {
    return { ok: false, reason: 'boundary' }
  }
  if (countNodesSafely(nodes) + countNodesSafely(inserted) > MAX_SCENE_NODES_PER_SLIDE) {
    return { ok: false, reason: 'node-limit' }
  }
  if (
    inserted.some((node) => parentPath.length + subtreeDepth(node) > MAX_SCENE_DEPTH)
  ) {
    return { ok: false, reason: 'depth-limit' }
  }
  const existingIds = collectSceneIds(nodes)
  const insertedIds = collectSceneIds(inserted)
  if (
    insertedIds.size !== countNodesSafely(inserted) ||
    [...insertedIds].some((id) => existingIds.has(id) || id.trim().length === 0)
  ) {
    return { ok: false, reason: 'duplicate-id' }
  }
  const ownedInserted = copySceneNodeValues(inserted)
  const nextNodes = updateChildrenAtPath(nodes, parentPath, (current) => [
    ...current.slice(0, insertAt),
    ...ownedInserted,
    ...current.slice(insertAt),
  ])
  const centered = recenterSceneContainerAndAncestors(nextNodes, parentPath)
  if (!centered.ok) return centered
  const error = validateSceneNodesForMutation(centered.nodes)
  return error
    ? { ok: false, reason: error }
    : { ok: true, nodes: centered.nodes, selectionIds: ownedInserted.map((node) => node.id) }
}

export function cloneSceneNodesAtPath(
  nodes: FreeformSceneNode[],
  parentPath: ScenePath,
  nodeIds: readonly string[],
  createId?: SceneIdFactory,
): SceneMutationResult {
  const selection = validateSelectionForParent(nodes, parentPath, nodeIds)
  if (!selection.ok) return selection
  if (
    !canApplySceneAction(nodes, {
      kind: 'structure',
      paths: selection.selectedNodes.map((node) => [...parentPath, node.id]),
    })
  ) {
    return { ok: false, reason: 'locked' }
  }
  try {
    const clones = cloneSceneNodes(selection.selectedNodes, createId)
    const highestIndex = Math.max(...selection.selectedIndices)
    return insertSceneChildren(nodes, parentPath, clones, highestIndex + 1)
  } catch {
    return { ok: false, reason: 'invalid-transform' }
  }
}
