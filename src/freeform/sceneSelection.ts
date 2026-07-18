import {
  boundsFromPoints,
  identity,
  multiply,
  sceneNodeLocalMatrix,
  transformPoint,
} from './sceneTransform'
import { findNodeAtPath, getChildrenAtPath } from './sceneTree'
import type { Matrix2D, Point, SceneBounds } from './sceneTransform'
import type { FreeformSceneNode, ScenePath } from './types'

export interface EffectiveSceneState {
  locked: boolean
  hidden: boolean
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
