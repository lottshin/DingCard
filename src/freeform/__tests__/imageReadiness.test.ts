import { describe, expect, it } from 'vitest'

import {
  clearAllImageReadiness,
  clearImageReadinessForSlide,
  createImageReadinessState,
  imageDecodeIdentityEquals,
  readReadyImage,
  updateImageReadiness,
  type ImageDecodeIdentity,
  type ImageDecodeReport,
} from '../imageReadiness'

function identity(overrides: Partial<ImageDecodeIdentity> = {}): ImageDecodeIdentity {
  return {
    scopeGeneration: 3,
    slideId: 'slide-1',
    scenePathKey: '["group","image"]',
    logicalSrc: 'img:photo',
    resolvedSrc: 'data:image/png;base64,photo',
    ...overrides,
  }
}

function report(
  status: ImageDecodeReport['status'],
  overrides: Partial<ImageDecodeIdentity> = {},
): ImageDecodeReport {
  const currentIdentity = identity(overrides)
  return status === 'ready'
    ? { identity: currentIdentity, status, naturalWidth: 1600, naturalHeight: 900 }
    : { identity: currentIdentity, status }
}

describe('image readiness identity', () => {
  it('matches only the complete decode identity', () => {
    const expected = identity()
    expect(imageDecodeIdentityEquals(expected, { ...expected })).toBe(true)

    for (const candidate of [
      identity({ scopeGeneration: 4 }),
      identity({ slideId: 'slide-2' }),
      identity({ scenePathKey: '["image"]' }),
      identity({ logicalSrc: 'img:replacement' }),
      identity({ resolvedSrc: 'data:image/png;base64,replacement' }),
    ]) {
      expect(imageDecodeIdentityEquals(expected, candidate)).toBe(false)
    }
  })

  it('accepts ready only for the current identity and positive finite natural sizes', () => {
    const expected = identity()
    const empty = createImageReadinessState()
    const loading = updateImageReadiness(empty, report('loading'), expected)
    const ready = updateImageReadiness(loading, report('ready'), expected)

    expect(readReadyImage(ready, expected)).toEqual({ width: 1600, height: 900 })
    expect(readReadyImage(ready, identity({ logicalSrc: 'img:replacement' }))).toBeNull()

    for (const invalid of [
      { naturalWidth: 0, naturalHeight: 900 },
      { naturalWidth: 1600, naturalHeight: -1 },
      { naturalWidth: Number.NaN, naturalHeight: 900 },
      { naturalWidth: 1600, naturalHeight: Number.POSITIVE_INFINITY },
    ]) {
      const invalidReport: ImageDecodeReport = {
        identity: expected,
        status: 'ready',
        ...invalid,
      }
      expect(updateImageReadiness(loading, invalidReport, expected)).toBe(loading)
    }
  })

  it.each([
    ['old scope', { scopeGeneration: 2 }],
    ['old slide', { slideId: 'slide-old' }],
    ['old path', { scenePathKey: '["old"]' }],
    ['old logical source', { logicalSrc: 'img:old' }],
    ['old resolved source', { resolvedSrc: 'data:image/png;base64,old' }],
  ] as const)('rejects a late report from an %s', (_label, overrides) => {
    const state = createImageReadinessState()

    expect(updateImageReadiness(state, report('ready', overrides), identity())).toBe(state)
  })

  it('does not let a stale error overwrite ready without a new loading cycle', () => {
    const expected = identity()
    const loading = updateImageReadiness(
      createImageReadinessState(),
      report('loading'),
      expected,
    )
    const ready = updateImageReadiness(loading, report('ready'), expected)

    expect(updateImageReadiness(ready, report('error'), expected)).toBe(ready)

    const reloading = updateImageReadiness(ready, report('loading'), expected)
    const failed = updateImageReadiness(reloading, report('error'), expected)
    expect(failed).not.toBe(reloading)
    expect(readReadyImage(failed, expected)).toBeNull()
  })

  it('clears one slide without touching other slides and clears all on scope switch', () => {
    const first = identity()
    const second = identity({ slideId: 'slide-2', scenePathKey: '["image-2"]' })
    let state = createImageReadinessState()
    state = updateImageReadiness(state, report('ready'), first)
    state = updateImageReadiness(state, {
      identity: second,
      status: 'ready',
      naturalWidth: 800,
      naturalHeight: 1200,
    }, second)

    const clearedSlide = clearImageReadinessForSlide(state, 3, 'slide-1')
    expect(readReadyImage(clearedSlide, first)).toBeNull()
    expect(readReadyImage(clearedSlide, second)).toEqual({ width: 800, height: 1200 })
    expect(clearImageReadinessForSlide(clearedSlide, 3, 'missing')).toBe(clearedSlide)

    const clearedScope = clearAllImageReadiness(clearedSlide)
    expect(clearedScope.size).toBe(0)
    expect(clearAllImageReadiness(clearedScope)).toBe(clearedScope)
  })

  it('uses the caller current-tree identity to separate a replacement at the same path', () => {
    const standalone = identity({ logicalSrc: 'img:standalone' })
    const shapeFill = identity({ logicalSrc: 'img:shape-fill' })
    const state = updateImageReadiness(
      createImageReadinessState(),
      {
        identity: standalone,
        status: 'ready',
        naturalWidth: 1200,
        naturalHeight: 800,
      },
      standalone,
    )

    expect(updateImageReadiness(state, report('error', {
      logicalSrc: standalone.logicalSrc,
    }), shapeFill)).toBe(state)
    expect(readReadyImage(state, shapeFill)).toBeNull()
  })
})
