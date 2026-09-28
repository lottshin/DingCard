import { describe, expect, it } from 'vitest'

import {
  cloneGuides,
  guidesEqual,
  MAX_GUIDES_PER_SLIDE,
  normalizeSlideGuides,
} from '../guides'

describe('freeform page guides', () => {
  it('normalizes absent guides to an empty list', () => {
    expect(normalizeSlideGuides(undefined, 1080, 1440)).toEqual([])
  })

  it('accepts in-page guides on both axes with inclusive edges', () => {
    const guides = [
      { id: 'g1', axis: 'x', position: 0 },
      { id: 'g2', axis: 'x', position: 1080 },
      { id: 'g3', axis: 'y', position: 720 },
      { id: 'g4', axis: 'y', position: 1440 },
    ]
    expect(normalizeSlideGuides(guides, 1080, 1440)).toEqual(guides)
  })

  it('clones guide entries instead of aliasing inputs', () => {
    const input = [{ id: 'g1', axis: 'x', position: 10 }]
    const output = normalizeSlideGuides(input, 1080, 1440)
    expect(output).toEqual(input)
    expect(output?.[0]).not.toBe(input[0])
    expect(cloneGuides(output ?? [])[0]).not.toBe(output?.[0])
  })

  it('rejects out-of-page positions per axis', () => {
    expect(normalizeSlideGuides([{ id: 'g1', axis: 'x', position: 1080.5 }], 1080, 1440)).toBeNull()
    expect(normalizeSlideGuides([{ id: 'g1', axis: 'y', position: 1441 }], 1080, 1440)).toBeNull()
    expect(normalizeSlideGuides([{ id: 'g1', axis: 'x', position: -1 }], 1080, 1440)).toBeNull()
    expect(normalizeSlideGuides([{ id: 'g1', axis: 'x', position: Number.NaN }], 1080, 1440)).toBeNull()
    expect(normalizeSlideGuides([{ id: 'g1', axis: 'x', position: Number.POSITIVE_INFINITY }], 1080, 1440)).toBeNull()
  })

  it('rejects duplicate or blank ids, bad axes, and extra or missing keys', () => {
    const invalid: Array<[string, unknown]> = [
      ['duplicate ids', [{ id: 'g1', axis: 'x', position: 1 }, { id: 'g1', axis: 'y', position: 2 }]],
      ['blank id', [{ id: '   ', axis: 'x', position: 1 }]],
      ['unknown axis', [{ id: 'g1', axis: 'z', position: 1 }]],
      ['extra key', [{ id: 'g1', axis: 'x', position: 1, color: '#000000' }]],
      ['missing key', [{ id: 'g1', axis: 'x' }]],
      ['non-string id', [{ id: 7, axis: 'x', position: 1 }]],
      ['non-number position', [{ id: 'g1', axis: 'x', position: '100' }]],
      ['entry not an object', ['nope']],
    ]
    for (const [label, guides] of invalid) {
      expect(normalizeSlideGuides(guides, 1080, 1440), label).toBeNull()
    }
  })

  it('rejects non-array input', () => {
    expect(normalizeSlideGuides('nope', 1080, 1440)).toBeNull()
    expect(normalizeSlideGuides(null, 1080, 1440)).toBeNull()
  })

  it(`caps one page at ${MAX_GUIDES_PER_SLIDE} guides`, () => {
    const guides = Array.from({ length: MAX_GUIDES_PER_SLIDE }, (_, index) => ({
      id: `g${index}`,
      axis: 'x' as const,
      position: index,
    }))
    expect(normalizeSlideGuides(guides, 1080, 1440)).toHaveLength(MAX_GUIDES_PER_SLIDE)
    expect(
      normalizeSlideGuides([...guides, { id: 'extra', axis: 'x', position: 1 }], 1080, 1440),
    ).toBeNull()
  })

  it('compares guides by value', () => {
    expect(guidesEqual([{ id: 'g', axis: 'x', position: 1 }], [{ id: 'g', axis: 'x', position: 1 }])).toBe(true)
    expect(guidesEqual([{ id: 'g', axis: 'x', position: 1 }], [{ id: 'g', axis: 'x', position: 2 }])).toBe(false)
    expect(guidesEqual([{ id: 'g', axis: 'x', position: 1 }], [{ id: 'g', axis: 'y', position: 1 }])).toBe(false)
    expect(guidesEqual([], [{ id: 'g', axis: 'x', position: 1 }])).toBe(false)
    expect(guidesEqual([], [])).toBe(true)
  })
})
