import { describe, expect, it } from 'vitest'
import { longImageLayout, longImageScale, MAX_CANVAS_SIDE } from '../exportLongImage'

const page = { width: 1080, height: 1440 }

describe('long image', () => {
  it('keeps the asked-for scale while the picture fits a canvas, and shrinks it just enough when it would not', () => {
    expect(longImageScale([page, page, page], 2)).toBe(2)
    const fifteen = Array.from({ length: 15 }, () => page)
    const scale = longImageScale(fifteen, 2)!
    expect(scale).toBeLessThan(2)
    expect(15 * 1440 * scale).toBeLessThanOrEqual(MAX_CANVAS_SIDE)
    expect(15 * 1440 * (scale + 0.01)).toBeGreaterThan(MAX_CANVAS_SIDE)
    // Fifty pages would be too small to read.
    expect(longImageScale(Array.from({ length: 50 }, () => page), 1)).toBeNull()
    expect(longImageScale([], 1)).toBeNull()
  })

  it('stacks the pages top to bottom, each centred on the widest page', () => {
    const layout = longImageLayout([page, { width: 1080, height: 1080 }, { width: 720, height: 1280 }], 1)
    expect(layout).toEqual({
      width: 1080,
      height: 3800,
      places: [
        { x: 0, y: 0, width: 1080, height: 1440 },
        { x: 0, y: 1440, width: 1080, height: 1080 },
        { x: 180, y: 2520, width: 720, height: 1280 },
      ],
    })
    expect(longImageLayout([page], 2)).toMatchObject({ width: 2160, height: 2880 })
  })
})
