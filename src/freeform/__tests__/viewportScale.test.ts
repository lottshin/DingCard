import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ZOOM_PERCENT,
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  ZOOM_STEP,
  calculateFitScale,
  calculateRenderScale,
  clampZoomPercent,
} from '../viewportScale'

describe('viewport scale', () => {
  it('fits portrait, landscape, and square pages by the limiting axis', () => {
    expect(calculateFitScale(976, 682, 1080, 1920)).toBeCloseTo(682 / 1920)
    expect(calculateFitScale(616, 566, 1920, 1080)).toBeCloseTo(616 / 1920)
    expect(calculateFitScale(976, 682, 1080, 1080)).toBeCloseTo(682 / 1080)
  })

  it('supports both smallest and largest legal custom pages without a fit floor', () => {
    expect(calculateFitScale(976, 682, 128, 128)).toBeCloseTo(682 / 128)
    expect(calculateFitScale(976, 682, 4096, 4096)).toBeCloseTo(682 / 4096)
    expect(calculateFitScale(976, 682, 4096, 4096)).toBeLessThan(0.2)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'returns null for an invalid dimension %s',
    (invalid) => {
      expect(calculateFitScale(invalid, 682, 1080, 1920)).toBeNull()
      expect(calculateFitScale(976, invalid, 1080, 1920)).toBeNull()
      expect(calculateFitScale(976, 682, invalid, 1920)).toBeNull()
      expect(calculateFitScale(976, 682, 1080, invalid)).toBeNull()
    },
  )

  it('combines fit scale with the user-facing percentage', () => {
    expect(calculateRenderScale(0.4, 50)).toBeCloseTo(0.2)
    expect(calculateRenderScale(0.4, 100)).toBeCloseTo(0.4)
    expect(calculateRenderScale(0.4, 150)).toBeCloseTo(0.6)
    expect(calculateRenderScale(null, 100)).toBeNull()
    expect(calculateRenderScale(0.4, Number.NaN)).toBeNull()
  })

  it('exposes and enforces the approved zoom bounds', () => {
    expect({ DEFAULT_ZOOM_PERCENT, MIN_ZOOM_PERCENT, MAX_ZOOM_PERCENT, ZOOM_STEP }).toEqual({
      DEFAULT_ZOOM_PERCENT: 100,
      MIN_ZOOM_PERCENT: 10,
      MAX_ZOOM_PERCENT: 400,
      ZOOM_STEP: 10,
    })
    expect(clampZoomPercent(-10)).toBe(10)
    expect(clampZoomPercent(105)).toBe(105)
    expect(clampZoomPercent(500)).toBe(400)
    expect(clampZoomPercent(Number.NaN)).toBe(100)
  })
})
