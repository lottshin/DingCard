import { describe, expect, it } from 'vitest'

import {
  clearAllImageReadiness,
  clearImageReadinessForSlide,
  createImageReadinessState,
  imageCropReadinessInvalidation,
  imageDecodeIdentityEquals,
  readReadyImage,
  updateImageReadiness,
  waitForFramedImages,
  type ImageDecodeIdentity,
  type ImageDecodeReport,
  type ImageWaitClock,
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

  describe('crop session invalidation', () => {
    it.each([
      ['loading', report('loading')],
      ['error', report('error')],
    ] as const)('invalidates when the current image is %s', (_status, readiness) => {
      expect(imageCropReadinessInvalidation({
        sessionIdentity: identity(),
        currentIdentity: identity(),
        readiness,
      })).toEqual({ invalidate: true, reason: readiness.status })
    })

    it('keeps a crop session for a ready current image', () => {
      expect(imageCropReadinessInvalidation({
        sessionIdentity: identity(),
        currentIdentity: identity(),
        readiness: report('ready'),
      })).toEqual({ invalidate: false })
    })

    it.each([
      ['scope', identity({ scopeGeneration: 4 })],
      ['slide', identity({ slideId: 'slide-2' })],
      ['path', identity({ scenePathKey: '["replacement"]' })],
      ['source', identity({ logicalSrc: 'img:replacement' })],
      ['resolved source', identity({ resolvedSrc: 'data:image/png;base64,replacement' })],
    ] as const)('invalidates on a current-tree %s mismatch', (_label, currentIdentity) => {
      expect(imageCropReadinessInvalidation({
        sessionIdentity: identity(),
        currentIdentity,
        readiness: null,
      })).toEqual({ invalidate: true, reason: 'identity' })
    })

    it('invalidates when the current target disappears', () => {
      expect(imageCropReadinessInvalidation({
        sessionIdentity: identity(),
        currentIdentity: null,
        readiness: null,
      })).toEqual({ invalidate: true, reason: 'identity' })
    })

    it('ignores a late report for another identity while the current image remains ready', () => {
      expect(imageCropReadinessInvalidation({
        sessionIdentity: identity(),
        currentIdentity: identity(),
        readiness: report('error', { logicalSrc: 'img:old' }),
      })).toEqual({ invalidate: false })
    })
  })
})

interface FakeFramedImage {
  source: string
  complete: boolean
  naturalWidth: number
  naturalHeight: number
  decode: () => Promise<void>
  getAttribute: (name: string) => string | null
  addEventListener: () => void
  removeEventListener: () => void
}

function framedImage(
  overrides: Partial<FakeFramedImage> = {},
): FakeFramedImage {
  const image: FakeFramedImage = {
    source: 'data:image/png;base64,current',
    complete: true,
    naturalWidth: 1200,
    naturalHeight: 800,
    decode: async () => undefined,
    getAttribute: (name) => name === 'src' ? image.source : null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    ...overrides,
  }
  return image
}

function framedRoot(images: FakeFramedImage[]) {
  return {
    querySelectorAll: (selector: string) => {
      expect(selector).toBe('img[data-framed-image-content="true"]')
      return images
    },
  } as unknown as ParentNode
}

const NEVER_TIMEOUT_CLOCK: ImageWaitClock = {
  now: () => 0,
  wait: () => new Promise(() => undefined),
}

describe('framed image export readiness', () => {
  it('succeeds immediately for an empty artboard', async () => {
    await expect(waitForFramedImages(framedRoot([]), {
      timeoutMs: 0,
      clock: NEVER_TIMEOUT_CLOCK,
    })).resolves.toEqual({ ok: true })
  })

  it('decodes every image even when it is already complete', async () => {
    let firstDecodes = 0
    let secondDecodes = 0
    const first = framedImage({ decode: async () => { firstDecodes += 1 } })
    const second = framedImage({
      source: 'data:image/png;base64,second',
      decode: async () => { secondDecodes += 1 },
    })

    await expect(waitForFramedImages(framedRoot([first, second]), {
      timeoutMs: 100,
      clock: NEVER_TIMEOUT_CLOCK,
    })).resolves.toEqual({ ok: true })
    expect(firstDecodes).toBe(1)
    expect(secondDecodes).toBe(1)
  })

  it('restarts for the current source when a source changes during decode', async () => {
    let decodeCalls = 0
    const image = framedImage()
    image.decode = async () => {
      decodeCalls += 1
      if (decodeCalls === 1) image.source = 'data:image/png;base64,replacement'
    }

    await expect(waitForFramedImages(framedRoot([image]), {
      timeoutMs: 100,
      clock: NEVER_TIMEOUT_CLOCK,
    })).resolves.toEqual({ ok: true })
    expect(decodeCalls).toBe(2)
  })

  it('returns image-load for a current decode rejection', async () => {
    const image = framedImage({
      decode: async () => { throw new Error('decode failed') },
    })

    await expect(waitForFramedImages(framedRoot([image]), {
      timeoutMs: 100,
      clock: NEVER_TIMEOUT_CLOCK,
    })).resolves.toEqual({ ok: false, reason: 'image-load' })
  })

  it('returns timeout without hanging when decode never settles', async () => {
    let now = 10
    const clock: ImageWaitClock = {
      now: () => now,
      wait: async (milliseconds) => { now += milliseconds },
    }
    const image = framedImage({ decode: () => new Promise(() => undefined) })

    await expect(waitForFramedImages(framedRoot([image]), {
      timeoutMs: 75,
      clock,
    })).resolves.toEqual({ ok: false, reason: 'timeout' })
  })
})
