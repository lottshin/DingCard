import { getChildrenAtPath } from './sceneTree'
import {
  invert,
  sceneNodeBoundsInParent,
  sceneNodeBoundsInWorld,
  sceneParentWorldMatrix,
  transformVector,
} from './sceneTransform'
import type { Point, SceneBounds } from './sceneTransform'
import type { FreeformElement, FreeformSceneNode, FreeformSlide, ScenePath } from './types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface SceneNodeMovePatch {
  nodeId: string
  patch: Pick<FreeformSceneNode, 'x' | 'y'>
}

interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export function filterLiveSelectionIds(
  elements: FreeformElement[],
  selectedIds: string[],
): string[] {
  const liveIds = new Set(elements.map((element) => element.id))
  return selectedIds.filter((id) => liveIds.has(id))
}

export function getElementsInMarquee(elements: FreeformElement[], rect: Rect): string[] {
  const marquee = normalizeRect(rect)

  return elements.filter((element) => intersects(elementBounds(element), marquee)).map((element) => element.id)
}

export function moveElementsWithinSlide(
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  elements: FreeformElement[],
  selectedIds: string[],
  dx: number,
  dy: number,
): Array<{ elementId: string; patch: Pick<FreeformElement, 'x' | 'y'> }> {
  const selectedIdSet = new Set(selectedIds)
  const selectedElements = elements.filter((element) => selectedIdSet.has(element.id))
  const groupBounds = getGroupBounds(selectedElements)

  if (!groupBounds) {
    return []
  }

  const clampedDx = clampDelta(dx, -groupBounds.left, slide.width - groupBounds.right)
  const clampedDy = clampDelta(dy, -groupBounds.top, slide.height - groupBounds.bottom)

  return selectedElements.map((element) => ({
    elementId: element.id,
    patch: {
      x: element.x + clampedDx,
      y: element.y + clampedDy,
    },
  }))
}

function sceneBoundsForSelection(
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
  selectedIds: readonly string[],
): SceneBounds | null {
  const selected = new Set(selectedIds)
  const children = getChildrenAtPath(nodes, parentPath)
  if (!children) return null
  const bounds: SceneBounds[] = []
  for (const node of children) {
    if (!selected.has(node.id) || node.hidden) continue
    const world = sceneNodeBoundsInWorld(nodes, [...parentPath, node.id])
    if (world) bounds.push(world)
  }
  if (bounds.length === 0) return null
  const left = Math.min(...bounds.map((bound) => bound.x))
  const top = Math.min(...bounds.map((bound) => bound.y))
  const right = Math.max(...bounds.map((bound) => bound.x + bound.width))
  const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function clampWorldDelta(
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  bounds: SceneBounds,
  dx: number,
  dy: number,
): Point {
  const minX = -bounds.x
  const maxX = slide.width - (bounds.x + bounds.width)
  const minY = -bounds.y
  const maxY = slide.height - (bounds.y + bounds.height)
  return {
    x: minX > maxX ? minX : Math.min(Math.max(dx, minX), maxX),
    y: minY > maxY ? minY : Math.min(Math.max(dy, minY), maxY),
  }
}

/** Select direct children by their page/world AABB, excluding hidden nodes. */
export function getSceneNodesInMarquee(
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
  rect: Rect,
): string[] {
  const children = getChildrenAtPath(nodes, parentPath)
  if (!children) return []
  const marquee = normalizeRect(rect)
  return children
    .filter((node) => !node.hidden)
    .filter((node) => {
      const bounds = sceneNodeBoundsInWorld(nodes, [...parentPath, node.id])
      return bounds
        ? intersects({
          left: bounds.x,
          top: bounds.y,
          right: bounds.x + bounds.width,
          bottom: bounds.y + bounds.height,
        }, marquee)
        : false
    })
    .map((node) => node.id)
}

/** Move direct scene children by a page/world delta converted into parent-local space. */
export function moveSceneNodesWithinSlide(
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
  selectedIds: readonly string[],
  dx: number,
  dy: number,
): SceneNodeMovePatch[] {
  const children = getChildrenAtPath(nodes, parentPath)
  const parentWorld = sceneParentWorldMatrix(nodes, parentPath)
  const inverseParent = parentWorld ? invert(parentWorld) : null
  const bounds = sceneBoundsForSelection(nodes, parentPath, selectedIds)
  if (!children || !parentWorld || !inverseParent || !bounds) return []
  const clamped = clampWorldDelta(slide, bounds, dx, dy)
  const localDelta = transformVector(inverseParent, clamped)
  const selected = new Set(selectedIds)
  return children
    .filter((node) => selected.has(node.id) && !node.hidden)
    .map((node) => ({
      nodeId: node.id,
      patch: { x: node.x + localDelta.x, y: node.y + localDelta.y },
    }))
}

function normalizeRect(rect: Rect): Bounds {
  const left = Math.min(rect.x, rect.x + rect.width)
  const right = Math.max(rect.x, rect.x + rect.width)
  const top = Math.min(rect.y, rect.y + rect.height)
  const bottom = Math.max(rect.y, rect.y + rect.height)

  return { left, top, right, bottom }
}

function elementBounds(element: FreeformElement): Bounds {
  const visual = sceneNodeBoundsInParent(element)
  if (visual) {
    return {
      left: visual.x,
      top: visual.y,
      right: visual.x + visual.width,
      bottom: visual.y + visual.height,
    }
  }
  return {
    left: element.x,
    top: element.y,
    right: element.x + element.width,
    bottom: element.y + element.height,
  }
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function getGroupBounds(elements: FreeformElement[]): Bounds | undefined {
  if (elements.length === 0) {
    return undefined
  }

  return elements.reduce<Bounds>(
    (bounds, element) => {
      const current = elementBounds(element)

      return {
        left: Math.min(bounds.left, current.left),
        top: Math.min(bounds.top, current.top),
        right: Math.max(bounds.right, current.right),
        bottom: Math.max(bounds.bottom, current.bottom),
      }
    },
    elementBounds(elements[0]),
  )
}

function clampDelta(delta: number, min: number, max: number): number {
  if (min > max) {
    return min
  }

  return Math.min(Math.max(delta, min), max)
}
