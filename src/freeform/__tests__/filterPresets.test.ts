import { describe, expect, it } from 'vitest'
import { cloneSceneFilter, sceneFilterCss } from '../appearance'
import { FILTER_PRESETS, filterPresetCss } from '../filterPresets'

describe('filter presets', () => {
  it('offers a non-empty gallery of unique looks', () => {
    expect(FILTER_PRESETS.length).toBeGreaterThanOrEqual(8)
    expect(new Set(FILTER_PRESETS.map((preset) => preset.id)).size).toBe(FILTER_PRESETS.length)
    expect(new Set(FILTER_PRESETS.map((preset) => preset.name)).size).toBe(FILTER_PRESETS.length)
  })

  it('keeps every preset a valid v18 filter stack', () => {
    for (const preset of FILTER_PRESETS) {
      expect(cloneSceneFilter(preset.filter, true)).toEqual(preset.filter)
      expect(filterPresetCss(preset)).toBe(sceneFilterCss(preset.filter))
    }
  })

  it('uses the extended keys only where v18 allows them', () => {
    const extendedKeys = ['hue', 'grayscale', 'sepia'] as const
    for (const preset of FILTER_PRESETS) {
      const usesExtended = extendedKeys.some((key) => preset.filter[key] !== undefined)
      // Every preset that needs the v18 keys must be rejected as a pre-v18
      // stack; the base-only ones must pass both ways.
      expect(cloneSceneFilter(preset.filter, false) === null).toBe(usesExtended)
    }
  })

  it('rejects out-of-range extended values', () => {
    expect(cloneSceneFilter({ hue: 361 }, true)).toBeNull()
    expect(cloneSceneFilter({ grayscale: 1.5 }, true)).toBeNull()
    expect(cloneSceneFilter({ sepia: -0.1 }, true)).toBeNull()
    expect(cloneSceneFilter({ hue: 360, grayscale: 1, sepia: 1 }, true)).toEqual({ hue: 360, grayscale: 1, sepia: 1 })
  })

  it('serializes the extended keys into the CSS filter order', () => {
    expect(sceneFilterCss({ grayscale: 1, brightness: 1.1, hue: 345, sepia: 0.5, blur: 2 }))
      .toBe('brightness(1.1) grayscale(1) sepia(0.5) hue-rotate(345deg) blur(2px)')
  })
})
