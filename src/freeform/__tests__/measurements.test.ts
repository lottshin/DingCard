import { describe, expect, it } from 'vitest'

import {
  measureDragDistances,
  MEASUREMENT_MAX_DISTANCE,
  type MeasurementReference,
} from '../measurements'

const PAGE = { width: 1080, height: 1440 }

function ref(x: number, y: number, width: number, height: number): MeasurementReference {
  return { x, y, width, height, source: 'element' }
}

describe('freeform drag measurements', () => {
  it('measures to the nearest overlapping element on each side', () => {
    const dragged = { x: 400, y: 400, width: 200, height: 200 }
    const references = [
      ref(100, 450, 100, 100),   // left, overlaps vertically
      ref(750, 400, 100, 200),   // right, overlaps vertically
      ref(450, 100, 100, 100),   // top, overlaps horizontally
      ref(420, 700, 150, 120),   // bottom, overlaps horizontally
    ]
    expect(measureDragDistances(dragged, references, PAGE)).toEqual([
      { axis: 'x', side: 'left', from: 400, to: 200, distance: 200, at: 500, source: 'element' },
      { axis: 'x', side: 'right', from: 600, to: 750, distance: 150, at: 500, source: 'element' },
      { axis: 'y', side: 'top', from: 400, to: 200, distance: 200, at: 500, source: 'element' },
      { axis: 'y', side: 'bottom', from: 600, to: 700, distance: 100, at: 495, source: 'element' },
    ])
  })

  it('ignores elements that do not overlap in the perpendicular axis', () => {
    const dragged = { x: 400, y: 400, width: 200, height: 200 }
    const references = [ref(100, 800, 100, 100)] // left but far below vertically
    // No overlap anywhere: every side falls back to its page edge, and the
    // far bottom edge (840 px) drops out of range.
    expect(measureDragDistances(dragged, references, PAGE)).toEqual([
      { axis: 'x', side: 'left', from: 400, to: 0, distance: 400, at: 500, source: 'page' },
      { axis: 'x', side: 'right', from: 600, to: 1080, distance: 480, at: 500, source: 'page' },
      { axis: 'y', side: 'top', from: 400, to: 0, distance: 400, at: 500, source: 'page' },
    ])
  })

  it('prefers the nearest element over the page edge', () => {
    const dragged = { x: 40, y: 400, width: 200, height: 200 }
    const references = [ref(0, 400, 20, 200)] // closer than the page edge
    const left = measureDragDistances(dragged, references, PAGE)
      .find(({ side }) => side === 'left')
    expect(left).toEqual({
      axis: 'x', side: 'left', from: 40, to: 20, distance: 20, at: 500, source: 'element',
    })
  })

  it('skips flush and overlapping gaps but keeps the other sides', () => {
    const dragged = { x: 400, y: 400, width: 200, height: 200 }
    const references = [
      ref(200, 400, 200, 200),   // flush left edge: gap 0, skipped
      ref(500, 350, 100, 50),    // overlaps the dragged bounds: skipped
    ]
    // The flush element owns the left side and the overlapping one owns the
    // top: aligned/overlapping neighbors suppress both element gaps and the
    // page-edge fallbacks; the far bottom edge drops out of range.
    const measurements = measureDragDistances(dragged, references, PAGE)
    expect(measurements.map(({ side, source }) => `${side}:${source}`)).toEqual([
      'right:page',
    ])
  })

  it('drops sides with no measurement within range', () => {
    const dragged = { x: 100, y: 100, width: 880, height: 1240 }
    // Every page gap is 100/100/100/100 — wait: left 100, right 100,
    // top 100, bottom 100, all within range. Shrink the max instead.
    const measurements = measureDragDistances(dragged, [], PAGE, 50)
    expect(measurements).toEqual([])
    expect(measureDragDistances(dragged, [], PAGE, 0)).toEqual([])
    // The default cap keeps near edges only.
    const far = { x: 10, y: 10, width: 1060, height: 1420 }
    expect(measureDragDistances(far, [], PAGE, MEASUREMENT_MAX_DISTANCE)).toEqual([
      { axis: 'x', side: 'left', from: 10, to: 0, distance: 10, at: 720, source: 'page' },
      { axis: 'x', side: 'right', from: 1070, to: 1080, distance: 10, at: 720, source: 'page' },
      { axis: 'y', side: 'top', from: 10, to: 0, distance: 10, at: 540, source: 'page' },
      { axis: 'y', side: 'bottom', from: 1430, to: 1440, distance: 10, at: 540, source: 'page' },
    ])
  })

  it('rounds fractional distances for display', () => {
    const dragged = { x: 400.4, y: 400, width: 200, height: 200 }
    const references = [ref(100, 400, 100, 200)]
    const left = measureDragDistances(dragged, references, PAGE)
      .find(({ side }) => side === 'left')
    expect(left?.distance).toBe(200)
  })

  it('disables the page-edge fallback with a null page (group scopes)', () => {
    const dragged = { x: 400, y: 400, width: 200, height: 200 }
    const references = [ref(100, 450, 100, 100)] // left only
    expect(measureDragDistances(dragged, references, null)).toEqual([
      { axis: 'x', side: 'left', from: 400, to: 200, distance: 200, at: 500, source: 'element' },
    ])
    // Without references nothing is measured at all.
    expect(measureDragDistances(dragged, [], null)).toEqual([])
  })
})
