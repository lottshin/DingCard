// Drag-time distance measurements (Figma-style red spacing lines). Pure math:
// given the dragged selection's world bounds and the other visible objects'
// bounds, produce one measurement per side — the nearest reference whose
// perpendicular span overlaps the dragged span, falling back to the page edge.

export interface WorldBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface MeasurementReference extends WorldBounds {
  source: 'element' | 'page'
}

export type MeasurementSide = 'left' | 'right' | 'top' | 'bottom'

export interface DragMeasurement {
  /** 'x' measures a horizontal gap (left/right sides); 'y' a vertical one. */
  axis: 'x' | 'y'
  side: MeasurementSide
  /** Dragged edge position in world units. */
  from: number
  /** Reference edge position in world units. */
  to: number
  /** Rounded gap in world pixels, always positive. */
  distance: number
  /** Perpendicular world position where the measurement line is drawn. */
  at: number
  source: 'element' | 'page'
}

/** Gaps larger than this (world px) are not worth annotating. */
export const MEASUREMENT_MAX_DISTANCE = 500

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

function overlapCenter(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return (Math.max(aStart, bStart) + Math.min(aEnd, bEnd)) / 2
}

interface SideSpec {
  side: MeasurementSide
  axis: 'x' | 'y'
  /** Dragged edge on the measuring axis. */
  draggedEdge: number
  /** Reference edge candidate on the measuring axis. */
  referenceEdge: (reference: WorldBounds) => number
  /** True when the reference sits on the measured side of the dragged edge. */
  isOnSide: (edge: number) => boolean
  /** Perpendicular span of a bounds on the measuring axis. */
  perpendicular: (bounds: WorldBounds) => [number, number]
  /** Page-edge candidate on this side (null when the side has no page edge). */
  pageEdge: number | null
}

function sideSpecs(
  dragged: WorldBounds,
  page: { width: number; height: number } | null,
): SideSpec[] {
  return [
    {
      side: 'left',
      axis: 'x',
      draggedEdge: dragged.x,
      referenceEdge: (reference) => reference.x + reference.width,
      isOnSide: (edge) => edge <= dragged.x,
      perpendicular: (bounds) => [bounds.y, bounds.y + bounds.height],
      pageEdge: page ? 0 : null,
    },
    {
      side: 'right',
      axis: 'x',
      draggedEdge: dragged.x + dragged.width,
      referenceEdge: (reference) => reference.x,
      isOnSide: (edge) => edge >= dragged.x + dragged.width,
      perpendicular: (bounds) => [bounds.y, bounds.y + bounds.height],
      pageEdge: page ? page.width : null,
    },
    {
      side: 'top',
      axis: 'y',
      draggedEdge: dragged.y,
      referenceEdge: (reference) => reference.y + reference.height,
      isOnSide: (edge) => edge <= dragged.y,
      perpendicular: (bounds) => [bounds.x, bounds.x + bounds.width],
      pageEdge: page ? 0 : null,
    },
    {
      side: 'bottom',
      axis: 'y',
      draggedEdge: dragged.y + dragged.height,
      referenceEdge: (reference) => reference.y,
      isOnSide: (edge) => edge >= dragged.y + dragged.height,
      perpendicular: (bounds) => [bounds.x, bounds.x + bounds.width],
      pageEdge: page ? page.height : null,
    },
  ]
}

/**
 * One measurement per side: the nearest element whose perpendicular span
 * overlaps the dragged span wins; otherwise the page edge on that side. A
 * null page (inside a group scope) disables the page-edge fallback — gaps
 * are measured between objects only. Flush (zero) or overlapping gaps are
 * skipped — the snap lines already mark exact alignment.
 */
export function measureDragDistances(
  dragged: WorldBounds,
  references: readonly MeasurementReference[],
  page: { width: number; height: number } | null,
  maxDistance: number = MEASUREMENT_MAX_DISTANCE,
): DragMeasurement[] {
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) return []
  const measurements: DragMeasurement[] = []

  for (const spec of sideSpecs(dragged, page)) {
    const [dragStart, dragEnd] = spec.perpendicular(dragged)
    let best: DragMeasurement | null = null
    // Any perpendicularly overlapping element on this side — even flush or
    // out of range — establishes the side's context and suppresses the page
    // edge fallback: an aligned neighbor already tells the story.
    let sawElementOnSide = false

    for (const reference of references) {
      if (reference.source !== 'element') continue
      const [refStart, refEnd] = spec.perpendicular(reference)
      if (!overlaps(dragStart, dragEnd, refStart, refEnd)) continue
      const edge = spec.referenceEdge(reference)
      if (!spec.isOnSide(edge)) continue
      sawElementOnSide = true
      const distance = Math.abs(spec.draggedEdge - edge)
      if (distance <= 0 || distance > maxDistance) continue
      if (best && distance >= best.distance) continue
      best = {
        axis: spec.axis,
        side: spec.side,
        from: spec.draggedEdge,
        to: edge,
        distance: Math.round(distance),
        at: overlapCenter(dragStart, dragEnd, refStart, refEnd),
        source: 'element',
      }
    }

    if (!best && !sawElementOnSide && spec.pageEdge !== null) {
      const distance = Math.abs(spec.draggedEdge - spec.pageEdge)
      if (distance > 0 && distance <= maxDistance) {
        best = {
          axis: spec.axis,
          side: spec.side,
          from: spec.draggedEdge,
          to: spec.pageEdge,
          distance: Math.round(distance),
          at: (dragStart + dragEnd) / 2,
          source: 'page',
        }
      }
    }

    if (best) measurements.push(best)
  }

  return measurements
}
