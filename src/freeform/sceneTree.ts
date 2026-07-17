import { MAX_SCENE_DEPTH } from './constants'
import type {
  FreeformSceneLeaf,
  FreeformSceneNode,
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
