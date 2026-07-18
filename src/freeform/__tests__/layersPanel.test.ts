import { describe, expect, it } from 'vitest'

import { layerDepthLabel, layerIndentPx } from '../FreeformLayersPanel'

describe('layer tree presentation', () => {
  it('caps visual indentation while preserving usable width at the maximum scene depth', () => {
    expect(layerIndentPx(1)).toBe(4)
    expect(layerIndentPx(5)).toBe(36)
    expect(layerIndentPx(13)).toBe(36)
    expect(layerIndentPx(32)).toBe(36)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to root indentation for an invalid aria level %s',
    (level) => {
      expect(layerIndentPx(level)).toBe(4)
    },
  )

  it('keeps exact deep hierarchy visible after indentation reaches its width cap', () => {
    expect(layerDepthLabel(5)).toBeNull()
    expect(layerDepthLabel(6)).toBe('6')
    expect(layerDepthLabel(25)).toBe('25')
    expect(layerDepthLabel(32)).toBe('32')
    expect(layerDepthLabel(33)).toBeNull()
    expect(layerDepthLabel(Number.NaN)).toBeNull()
  })
})
