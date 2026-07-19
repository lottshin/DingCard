import { getChildrenAtPath } from './sceneTree'
import { moveElementsWithinSlide, moveSceneNodesWithinSlide } from './selection'
import {
  sceneNodeBoundsInParent,
  sceneNodeBoundsInWorld,
  sceneParentWorldMatrix,
  transformVector,
} from './sceneTransform'
import type { FreeformElement, FreeformSceneNode, FreeformSlide, ScenePath } from './types'

export interface SnapLine {
  axis: 'x' | 'y'
  position: number
  source: 'page' | 'element'
}

export interface SnapResult {
  dx: number
  dy: number
  lines: SnapLine[]
}

export interface SnapOptions {
  threshold: number
}

type Axis = SnapLine['axis']
type AnchorName = 'start' | 'center' | 'end'
type SnapSource = SnapLine['source']

interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

interface AxisAnchor {
  name: AnchorName
  position: number
}

interface AxisReference {
  position: number
  source: SnapSource
}

interface SnapCandidate {
  anchor: AxisAnchor
  distance: number
  reference: AxisReference
  snappedDelta: number
}

const DEFAULT_THRESHOLD = 6
const ANCHOR_PRIORITY: Record<AnchorName, number> = { center: 0, start: 1, end: 2 }
const SOURCE_PRIORITY: Record<SnapSource, number> = { page: 0, element: 1 }

export function snapDrag(
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  elements: FreeformElement[],
  selectedIds: string[],
  dx: number,
  dy: number,
  options: Partial<SnapOptions> = {},
): SnapResult {
  const selectedIdSet = new Set(selectedIds)
  const selectedElements = elements.filter((element) => selectedIdSet.has(element.id))
  const bounds = getGroupBounds(selectedElements)

  if (!bounds) {
    return { dx, dy, lines: [] }
  }

  const threshold = Math.max(0, options.threshold ?? DEFAULT_THRESHOLD)
  const clamped = clampMovement(slide, elements, selectedIds, dx, dy)
  const xSnap = snapAxis('x', slide, elements, selectedIdSet, bounds, clamped.dx, threshold)
  const ySnap = snapAxis('y', slide, elements, selectedIdSet, bounds, clamped.dy, threshold)
  const final = clampMovement(slide, elements, selectedIds, xSnap.delta, ySnap.delta)
  const lines: SnapLine[] = []

  if (xSnap.line && final.dx === xSnap.delta) {
    lines.push(xSnap.line)
  }
  if (ySnap.line && final.dy === ySnap.delta) {
    lines.push(ySnap.line)
  }

  return { dx: final.dx, dy: final.dy, lines }
}

function sceneSelectionBounds(
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
  selectedIds: ReadonlySet<string>,
): Bounds | null {
  const children = getChildrenAtPath(nodes, parentPath)
  if (!children) return null
  const bounds = children
    .filter((node) => selectedIds.has(node.id) && !node.hidden)
    .flatMap((node) => {
      const world = sceneNodeBoundsInWorld(nodes, [...parentPath, node.id])
      return world ? [{
        left: world.x,
        top: world.y,
        right: world.x + world.width,
        bottom: world.y + world.height,
      }] : []
    })
  if (bounds.length === 0) return null
  return bounds.reduce((union, current) => ({
    left: Math.min(union.left, current.left),
    top: Math.min(union.top, current.top),
    right: Math.max(union.right, current.right),
    bottom: Math.max(union.bottom, current.bottom),
  }))
}

function clampSceneMovement(
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
  selectedIds: readonly string[],
  dx: number,
  dy: number,
): Pick<SnapResult, 'dx' | 'dy'> {
  const patches = moveSceneNodesWithinSlide(slide, nodes, parentPath, selectedIds, dx, dy)
  const children = getChildrenAtPath(nodes, parentPath)
  const parentWorld = sceneParentWorldMatrix(nodes, parentPath)
  const first = patches[0]
  const original = children?.find((node) => node.id === first?.nodeId)
  if (!first || !original || !parentWorld) return { dx, dy }
  const worldDelta = transformVector(parentWorld, {
    x: first.patch.x - original.x,
    y: first.patch.y - original.y,
  })
  return { dx: worldDelta.x, dy: worldDelta.y }
}

function sceneAxisReferences(
  axis: Axis,
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
  selectedIds: ReadonlySet<string>,
): AxisReference[] {
  const pageSize = axis === 'x' ? slide.width : slide.height
  const pageReferences: AxisReference[] = [0, pageSize / 2, pageSize].map((position) => ({
    position,
    source: 'page',
  }))
  const children = getChildrenAtPath(nodes, parentPath) ?? []
  const nodeReferences = children
    .filter((node) => !selectedIds.has(node.id) && !node.hidden)
    .flatMap((node) => {
      const world = sceneNodeBoundsInWorld(nodes, [...parentPath, node.id])
      if (!world) return []
      return getAxisAnchors({
        left: world.x,
        top: world.y,
        right: world.x + world.width,
        bottom: world.y + world.height,
      }, axis).map((anchor) => ({
        position: anchor.position,
        source: 'element' as const,
      }))
    })
  return [...pageReferences, ...nodeReferences]
}

function snapSceneAxis(
  axis: Axis,
  references: AxisReference[],
  bounds: Bounds,
  delta: number,
  threshold: number,
): { delta: number; line?: SnapLine } {
  const anchors = getAxisAnchors(bounds, axis).map((anchor) => ({
    ...anchor,
    position: anchor.position + delta,
  }))
  const candidates = references.flatMap((reference) => anchors
    .map((anchor): SnapCandidate => ({
      anchor,
      distance: Math.abs(reference.position - anchor.position),
      reference,
      snappedDelta: delta + reference.position - anchor.position,
    }))
    .filter((candidate) => candidate.distance <= threshold))
  candidates.sort(compareCandidates)
  const best = candidates[0]
  return best
    ? {
      delta: best.snappedDelta,
      line: { axis, position: best.reference.position, source: best.reference.source },
    }
    : { delta }
}

/** Snap a direct scene selection in page/world coordinates. */
export function snapSceneDrag(
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
  selectedIds: readonly string[],
  dx: number,
  dy: number,
  options: Partial<SnapOptions> = {},
): SnapResult {
  const selected = new Set(selectedIds)
  const bounds = sceneSelectionBounds(nodes, parentPath, selected)
  if (!bounds) return { dx, dy, lines: [] }
  const threshold = Math.max(0, options.threshold ?? DEFAULT_THRESHOLD)
  const clamped = clampSceneMovement(slide, nodes, parentPath, selectedIds, dx, dy)
  const xSnap = snapSceneAxis(
    'x',
    sceneAxisReferences('x', slide, nodes, parentPath, selected),
    bounds,
    clamped.dx,
    threshold,
  )
  const ySnap = snapSceneAxis(
    'y',
    sceneAxisReferences('y', slide, nodes, parentPath, selected),
    bounds,
    clamped.dy,
    threshold,
  )
  const final = clampSceneMovement(
    slide,
    nodes,
    parentPath,
    selectedIds,
    xSnap.delta,
    ySnap.delta,
  )
  const lines: SnapLine[] = []
  if (xSnap.line && Math.abs(final.dx - xSnap.delta) <= Number.EPSILON * 64) {
    lines.push(xSnap.line)
  }
  if (ySnap.line && Math.abs(final.dy - ySnap.delta) <= Number.EPSILON * 64) {
    lines.push(ySnap.line)
  }
  return { dx: final.dx, dy: final.dy, lines }
}

function clampMovement(
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  elements: FreeformElement[],
  selectedIds: string[],
  dx: number,
  dy: number,
): Pick<SnapResult, 'dx' | 'dy'> {
  const patches = moveElementsWithinSlide(slide, elements, selectedIds, dx, dy)
  const firstPatch = patches[0]

  if (!firstPatch) {
    return { dx, dy }
  }

  const original = elements.find((element) => element.id === firstPatch.elementId)
  if (!original) {
    return { dx, dy }
  }

  return {
    dx: firstPatch.patch.x - original.x,
    dy: firstPatch.patch.y - original.y,
  }
}

function snapAxis(
  axis: Axis,
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  elements: FreeformElement[],
  selectedIds: Set<string>,
  bounds: Bounds,
  delta: number,
  threshold: number,
): { delta: number; line?: SnapLine } {
  const anchors = getAxisAnchors(bounds, axis).map((anchor) => ({
    ...anchor,
    position: anchor.position + delta,
  }))
  const references = getAxisReferences(axis, slide, elements, selectedIds)
  const candidates = references.flatMap((reference) =>
    anchors
      .map((anchor): SnapCandidate => {
        const distance = Math.abs(reference.position - anchor.position)

        return {
          anchor,
          distance,
          reference,
          snappedDelta: delta + reference.position - anchor.position,
        }
      })
      .filter((candidate) => candidate.distance <= threshold),
  )

  candidates.sort(compareCandidates)
  const best = candidates[0]

  if (!best) {
    return { delta }
  }

  return {
    delta: best.snappedDelta,
    line: { axis, position: best.reference.position, source: best.reference.source },
  }
}

function compareCandidates(a: SnapCandidate, b: SnapCandidate): number {
  const distanceDelta = a.distance - b.distance
  if (distanceDelta !== 0) return distanceDelta

  const sourceDelta = SOURCE_PRIORITY[a.reference.source] - SOURCE_PRIORITY[b.reference.source]
  if (sourceDelta !== 0) return sourceDelta

  const anchorDelta = ANCHOR_PRIORITY[a.anchor.name] - ANCHOR_PRIORITY[b.anchor.name]
  if (anchorDelta !== 0) return anchorDelta

  return a.reference.position - b.reference.position
}

function getAxisReferences(
  axis: Axis,
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  elements: FreeformElement[],
  selectedIds: Set<string>,
): AxisReference[] {
  const pageSize = axis === 'x' ? slide.width : slide.height
  const pageReferences: AxisReference[] = [0, pageSize / 2, pageSize].map((position) => ({
    position,
    source: 'page',
  }))
  const elementReferences = elements
    .filter((element) => !selectedIds.has(element.id))
    .flatMap((element) =>
      getAxisAnchors(elementBounds(element), axis).map((anchor) => ({
        position: anchor.position,
        source: 'element' as const,
      })),
    )

  return [...pageReferences, ...elementReferences]
}

function getAxisAnchors(bounds: Bounds, axis: Axis): AxisAnchor[] {
  const start = axis === 'x' ? bounds.left : bounds.top
  const end = axis === 'x' ? bounds.right : bounds.bottom

  return [
    { name: 'start', position: start },
    { name: 'center', position: (start + end) / 2 },
    { name: 'end', position: end },
  ]
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
