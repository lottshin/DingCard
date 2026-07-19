import {
  boundsFromPoints,
  identity,
  multiply,
  sceneNodeLocalMatrix,
  transformPoint,
} from './sceneTransform'
import {
  buildScenePathIndex,
  findNodeAtPath,
  getChildrenAtPath,
  scenePathKey,
} from './sceneTree'
import type { Matrix2D, Point, SceneBounds } from './sceneTransform'
import type { FreeformSceneNode, ScenePath } from './types'

export interface EffectiveSceneState {
  locked: boolean
  hidden: boolean
}

export interface SceneUiIdentity {
  activeSlideId: string
  draftId: string | null
  userId: string | null
}

export interface SceneUiState {
  activeGroupPath: ScenePath
  selectionPaths: readonly ScenePath[]
  identity: SceneUiIdentity
}

function isPathPrefix(prefix: ScenePath, path: ScenePath): boolean {
  return prefix.length <= path.length && prefix.every((id, index) => id === path[index])
}

/** Resolve inherited lock/hidden state without changing any persisted node flag. */
export function effectiveSceneState(
  nodes: readonly FreeformSceneNode[],
  path: ScenePath,
): EffectiveSceneState | null {
  if (path.length === 0) return { locked: false, hidden: false }

  let children = nodes
  let locked = false
  let hidden = false
  for (let index = 0; index < path.length; index += 1) {
    const node = children.find((candidate) => candidate.id === path[index])
    if (!node) return null
    locked ||= node.locked
    hidden ||= node.hidden
    if (index < path.length - 1) {
      if (node.type !== 'group') return null
      children = node.children
    }
  }
  return { locked, hidden }
}

/** Return the closest node on a valid path whose own lock flag is set. */
export function nearestLockedNodePath(
  nodes: readonly FreeformSceneNode[],
  path: ScenePath,
): ScenePath | null {
  if (path.length === 0) return null

  let children = nodes
  let nearest: ScenePath | null = null
  for (let index = 0; index < path.length; index += 1) {
    const node = children.find((candidate) => candidate.id === path[index])
    if (!node) return null
    if (node.locked) nearest = path.slice(0, index + 1)
    if (index < path.length - 1) {
      if (node.type !== 'group') return null
      children = node.children
    }
  }
  return nearest
}

/** Resolve the first selected effective lock and its nearest own-lock source in one index pass. */
export function nearestLockedSourcePathForSelection(
  nodes: readonly FreeformSceneNode[],
  selectionPaths: readonly ScenePath[],
): ScenePath | null {
  if (selectionPaths.length === 0) return null
  let pathIndex: ReturnType<typeof buildScenePathIndex>
  try {
    pathIndex = buildScenePathIndex(nodes)
  } catch {
    return null
  }

  for (const path of selectionPaths) {
    if (path.length === 0) continue
    const selected = pathIndex.get(scenePathKey(path))
    if (!selected?.effectiveLocked) continue

    for (let length = path.length; length > 0; length -= 1) {
      const candidatePath = path.slice(0, length)
      if (pathIndex.get(scenePathKey(candidatePath))?.node.locked) return candidatePath
    }
  }

  return null
}

/** Return a lock source below an otherwise editable selected group. */
export function lockedDescendantSourcePathForSelection(
  nodes: readonly FreeformSceneNode[],
  selectionPaths: readonly ScenePath[],
): ScenePath | null {
  if (selectionPaths.length === 0) return null
  let pathIndex: ReturnType<typeof buildScenePathIndex>
  try {
    pathIndex = buildScenePathIndex(nodes)
  } catch {
    return null
  }

  for (const path of selectionPaths) {
    if (path.length === 0) continue
    const selected = pathIndex.get(scenePathKey(path))
    if (!selected || selected.effectiveLocked || !selected.subtreeLocked) continue
    const children = getChildrenAtPath(nodes, path)
    if (!children) continue

    const pending = children.map((node) => ({
      node,
      path: [...path, node.id],
    })).reverse()
    while (pending.length > 0) {
      const current = pending.pop()!
      if (current.node.locked) return current.path
      if (current.node.type === 'group') {
        for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
          const child = current.node.children[index]
          pending.push({ node: child, path: [...current.path, child.id] })
        }
      }
    }
  }

  return null
}

/** Map a deep canvas hit to the direct child selectable in one editing scope. */
export function directChildPathForScope(
  nodes: readonly FreeformSceneNode[],
  activeParentPath: ScenePath,
  hitPath: ScenePath,
): ScenePath | null {
  if (
    hitPath.length <= activeParentPath.length ||
    !isPathPrefix(activeParentPath, hitPath) ||
    getChildrenAtPath(nodes, activeParentPath) === undefined ||
    !findNodeAtPath(nodes, hitPath)
  ) {
    return null
  }

  const directPath = hitPath.slice(0, activeParentPath.length + 1)
  return findNodeAtPath(nodes, directPath) ? directPath : null
}

/** Keep one highest requested path per subtree while preserving request order. */
export function dedupeScenePaths(paths: readonly ScenePath[]): ScenePath[] {
  const result: ScenePath[] = []
  paths.forEach((path, index) => {
    if (path.length === 0) return
    const shadowed = paths.some((candidate, candidateIndex) => {
      if (candidate.length === 0 || !isPathPrefix(candidate, path)) return false
      return candidate.length < path.length || candidateIndex < index
    })
    if (!shadowed) result.push([...path])
  })
  return result
}

/** Normalize arbitrary hits to unique direct children of one active parent. */
export function normalizeSceneSelection(
  nodes: readonly FreeformSceneNode[],
  activeParentPath: ScenePath,
  paths: readonly ScenePath[],
): ScenePath[] {
  const directPaths: ScenePath[] = []
  for (const path of paths) {
    const direct = directChildPathForScope(nodes, activeParentPath, path)
    if (direct) directPaths.push(direct)
  }
  return dedupeScenePaths(directPaths)
}

/** Fall back from a stale editing path to its nearest surviving group ancestor. */
export function fallbackScenePath(
  nodes: readonly FreeformSceneNode[],
  path: ScenePath,
): ScenePath {
  for (let length = path.length; length > 0; length -= 1) {
    const candidate = path.slice(0, length)
    if (findNodeAtPath(nodes, candidate)?.type === 'group') return candidate
  }
  return []
}

/**
 * Reconcile non-persisted selection state after any document/UI snapshot.
 * Identity changes start a fresh editing context; ordinary document changes
 * retain surviving paths but atomically fall back and filter stale selections.
 */
export function reconcileSceneUiState(
  nodes: readonly FreeformSceneNode[],
  state: SceneUiState,
  identity: SceneUiIdentity,
): SceneUiState {
  const identityChanged =
    state.identity.activeSlideId !== identity.activeSlideId ||
    state.identity.draftId !== identity.draftId ||
    state.identity.userId !== identity.userId
  if (identityChanged) {
    return {
      activeGroupPath: [],
      selectionPaths: [],
      identity: { ...identity },
    }
  }

  const activeGroupPath = fallbackScenePath(nodes, state.activeGroupPath)
  const selectionPaths = normalizeSceneSelection(nodes, activeGroupPath, state.selectionPaths)
  const activePathUnchanged = scenePathKey(activeGroupPath) === scenePathKey(state.activeGroupPath)
  const selectionUnchanged =
    selectionPaths.length === state.selectionPaths.length &&
    selectionPaths.every(
      (path, index) => scenePathKey(path) === scenePathKey(state.selectionPaths[index]),
    )
  if (activePathUnchanged && selectionUnchanged) return state
  return {
    activeGroupPath: [...activeGroupPath],
    selectionPaths: selectionPaths.map((path) => [...path]),
    identity: { ...identity },
  }
}

function parentWorldForPath(
  nodes: readonly FreeformSceneNode[],
  path: ScenePath,
): Matrix2D | null {
  let children = nodes
  let world = identity()
  for (let index = 0; index < path.length - 1; index += 1) {
    const node = children.find((candidate) => candidate.id === path[index])
    if (!node || node.type !== 'group') return null
    world = multiply(world, sceneNodeLocalMatrix(node))
    children = node.children
  }
  return world
}

function collectWorldLeafCorners(
  node: FreeformSceneNode,
  parentWorld: Matrix2D,
  points: Point[],
): void {
  const world = multiply(parentWorld, sceneNodeLocalMatrix(node))
  if (node.type === 'group') {
    for (const child of node.children) collectWorldLeafCorners(child, world, points)
    return
  }
  points.push(
    transformPoint(world, { x: 0, y: 0 }),
    transformPoint(world, { x: node.width, y: 0 }),
    transformPoint(world, { x: node.width, y: node.height }),
    transformPoint(world, { x: 0, y: node.height }),
  )
}

/** Return the world-space AABB for a leaf or a group's complete leaf subtree. */
export function sceneLogicalBounds(
  nodes: readonly FreeformSceneNode[],
  path: ScenePath,
): SceneBounds | null {
  const node = findNodeAtPath(nodes, path)
  if (!node) return null
  try {
    const parentWorld = parentWorldForPath(nodes, path)
    if (!parentWorld) return null
    const points: Point[] = []
    collectWorldLeafCorners(node, parentWorld, points)
    return boundsFromPoints(points)
  } catch {
    return null
  }
}
