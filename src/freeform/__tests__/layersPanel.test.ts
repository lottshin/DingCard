import { describe, expect, it } from 'vitest'

import { layerIndentPx } from '../FreeformLayersPanel'

describe('layer tree presentation', () => {
  it('caps visual indentation while preserving usable width at the maximum scene depth', () => {
    expect(layerIndentPx(1)).toBe(4)
    expect(layerIndentPx(7)).toBe(76)
    expect(layerIndentPx(13)).toBe(76)
    expect(layerIndentPx(32)).toBe(76)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to root indentation for an invalid aria level %s',
    (level) => {
      expect(layerIndentPx(level)).toBe(4)
    },
  )
})
