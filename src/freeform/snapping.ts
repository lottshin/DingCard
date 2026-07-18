import { moveElementsWithinSlide } from './selection'
import { sceneNodeBoundsInParent } from './sceneTransform'
import type { FreeformElement, FreeformSlide } from './types'

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
