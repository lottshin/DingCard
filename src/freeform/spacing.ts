// Equal-spacing guides: while an element drags, the gaps it leaves with its
// neighbours on each side are watched; when they match to within a couple of
// pixels, the drag snaps so they match exactly and a badge shows the shared
// gap. Pure math over leaf boxes — the workspace feeds it boxes in page
// coordinates and draws what it returns.

export interface SpaceGuideBox {
  id: string
  left: number
  top: number
  right: number
  bottom: number
}

export interface SpaceGap {
  /** The shared gap in page pixels, after the snap. */
  gap: number
  axis: 'x' | 'y'
  /** The two neighbours the gap is measured against, named for the badge. */
  before: string
  after: string
}

export type SpaceSnap =
  | { dx: 0; dy: 0; gaps: [] }
  | { dx: number; dy: 0; gaps: [SpaceGap] }
  | { dx: 0; dy: number; gaps: [SpaceGap] }

/** Within this many page pixels, nearly equal gaps count as equal. */
export const EQUAL_GAP_TOLERANCE = 4

/**
 * The equal-gap snap for one axis. The dragging element is `moving` at its
 * dragged (pre-snap) position; every other box sits still. A gap qualifies
 * when the moving element has a neighbour on each side on that axis (bands
 * overlapping by at least half), and the two gaps differ by at most the
 * tolerance. When both axes qualify, the stronger snap (smaller adjustment)
 * wins — Figma's behaviour, and the only way a two-axis snap could surprise.
 */
export function equalGapSnap(
  axis: 'x' | 'y',
  moving: SpaceGuideBox,
  others: readonly SpaceGuideBox[],
  tolerance: number = EQUAL_GAP_TOLERANCE,
): SpaceSnap | null {
  const axisKeys = axis === 'x'
    ? { start: 'left' as const, end: 'right' as const, crossStart: 'top' as const, crossEnd: 'bottom' as const }
    : { start: 'top' as const, end: 'bottom' as const, crossStart: 'left' as const, crossEnd: 'right' as const }
  const start = moving[axisKeys.start]
  const end = moving[axisKeys.end]
  const crossStart = moving[axisKeys.crossStart]
  const crossEnd = moving[axisKeys.crossEnd]
  const crossOverlap = (box: SpaceGuideBox) => {
    const own = crossEnd - crossStart
    const their = box[axisKeys.crossEnd] - box[axisKeys.crossStart]
    const overlap = Math.min(crossEnd, box[axisKeys.crossEnd]) - Math.max(crossStart, box[axisKeys.crossStart])
    return overlap >= Math.min(own, their) / 2
  }
  // The nearest neighbour whose end is at or before the moving start, and the
  // nearest whose start is at or after the moving end.
  let before: SpaceGuideBox | null = null
  let after: SpaceGuideBox | null = null
  for (const box of others) {
    if (!crossOverlap(box)) continue
    if (box[axisKeys.end] <= start + tolerance && (!before || box[axisKeys.end] > before[axisKeys.end])) before = box
    if (box[axisKeys.start] >= end - tolerance && (!after || box[axisKeys.start] < after[axisKeys.start])) after = box
  }
  if (!before || !after) return null
  const gapBefore = start - before[axisKeys.end]
  const gapAfter = after[axisKeys.start] - end
  const difference = Math.abs(gapBefore - gapAfter)
  if (difference > tolerance || difference === 0) return null
  // Equalise: nudge toward the wider gap's average.
  const average = (gapBefore + gapAfter) / 2
  if (axis === 'x') {
    return {
      dx: average - gapBefore,
      dy: 0,
      gaps: [{
        gap: average,
        axis,
        before: before.id,
        after: after.id,
      }],
    }
  }
  return {
    dx: 0,
    dy: average - gapBefore,
    gaps: [{
      gap: average,
      axis,
      before: before.id,
      after: after.id,
    }],
  }
}

/** The full two-axis snap: x and y gaps compete, the smaller nudge wins. */
export function equalSpaceSnap(
  moving: SpaceGuideBox,
  others: readonly SpaceGuideBox[],
  tolerance: number = EQUAL_GAP_TOLERANCE,
): SpaceSnap | null {
  const x = equalGapSnap('x', moving, others, tolerance)
  const y = equalGapSnap('y', moving, others, tolerance)
  const size = (snap: SpaceSnap | null) => (snap ? Math.abs(snap.dx) + Math.abs(snap.dy) : Infinity)
  if (size(x) <= size(y)) return x
  return y
}
