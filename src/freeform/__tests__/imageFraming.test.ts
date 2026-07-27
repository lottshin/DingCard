import { describe, expect, it } from 'vitest'

import {
  MAX_IMAGE_ZOOM,
  MIN_IMAGE_ZOOM,
  calculateFramedImageGeometry,
  cloneImageFraming,
  createDefaultImageFraming,
  imageFramingEquals,
  isValidImageFraming,
  panImageFraming,
  panImageFramingFromScreen,
} from '../imageFraming'
import {
  SCENE_EPSILON,
  clockwiseRotation,
  groupLocal,
  multiply,
  transformVector,
  uniformScale,
} from '../sceneTransform'
import type { ImageFraming } from '../imageFraming'
import type { Matrix2D } from '../sceneTransform'

const DEFAULT_FRAMING: ImageFraming = { focusX: 0.5, focusY: 0.5, zoom: 1 }

describe('image framing value contract', () => {
  it('creates an owned centered framing value at 100 percent', () => {
    const first = createDefaultImageFraming()
    const second = createDefaultImageFraming()

    expect(first).toEqual(DEFAULT_FRAMING)
    expect(second).toEqual(DEFAULT_FRAMING)
    expect(first).not.toBe(second)
  })

  it.each([
    { focusX: 0, focusY: 0, zoom: MIN_IMAGE_ZOOM },
    { focusX: 1, focusY: 1, zoom: MAX_IMAGE_ZOOM },
    DEFAULT_FRAMING,
  ])('accepts a strict framing value %#', (value) => {
    expect(isValidImageFraming(value)).toBe(true)
  })

  it.each([
    null,
    [],
    {},
    { focusX: 0.5, focusY: 0.5 },
    { focusX: 0.5, focusY: 0.5, zoom: 1, extra: true },
    { focusX: '0.5', focusY: 0.5, zoom: 1 },
    { focusX: Number.NaN, focusY: 0.5, zoom: 1 },
    { focusX: 0.5, focusY: Number.POSITIVE_INFINITY, zoom: 1 },
    { focusX: 0.5, focusY: 0.5, zoom: Number.NEGATIVE_INFINITY },
    { focusX: -Number.EPSILON, focusY: 0.5, zoom: 1 },
    { focusX: 1 + Number.EPSILON, focusY: 0.5, zoom: 1 },
    { focusX: 0.5, focusY: -Number.EPSILON, zoom: 1 },
    { focusX: 0.5, focusY: 1 + Number.EPSILON, zoom: 1 },
    { focusX: 0.5, focusY: 0.5, zoom: MIN_IMAGE_ZOOM - Number.EPSILON },
    { focusX: 0.5, focusY: 0.5, zoom: MAX_IMAGE_ZOOM + SCENE_EPSILON },
  ])('rejects an invalid value without repairing it %#', (value) => {
    const before = value && typeof value === 'object' ? JSON.stringify(value) : value

    expect(isValidImageFraming(value)).toBe(false)
    expect(value && typeof value === 'object' ? JSON.stringify(value) : value).toBe(before)
  })

  it('clones values and compares every field with scene epsilon', () => {
    const source: ImageFraming = { focusX: 0.2, focusY: 0.7, zoom: 2.5 }
    const clone = cloneImageFraming(source)

    expect(clone).toEqual(source)
    expect(clone).not.toBe(source)
    expect(imageFramingEquals(source, {
      focusX: source.focusX + SCENE_EPSILON * 0.99,
      focusY: source.focusY - SCENE_EPSILON * 0.99,
      zoom: source.zoom + SCENE_EPSILON * 0.99,
    })).toBe(true)
    expect(imageFramingEquals(
      { focusX: 0, focusY: 0.5, zoom: 1 },
      { focusX: SCENE_EPSILON, focusY: 0.5, zoom: 1 },
    )).toBe(true)
    expect(imageFramingEquals(source, {
      ...source,
      focusX: source.focusX + SCENE_EPSILON * 1.01,
    })).toBe(false)
    expect(imageFramingEquals(source, {
      ...source,
      focusY: source.focusY - SCENE_EPSILON * 1.01,
    })).toBe(false)
    expect(imageFramingEquals(source, {
      ...source,
      zoom: source.zoom + SCENE_EPSILON * 1.01,
    })).toBe(false)
  })
})

describe('framed image geometry', () => {
  it.each([
    {
      label: 'wide image in a square frame',
      naturalSize: { width: 400, height: 200 },
      frameSize: { width: 100, height: 100 },
      expected: { left: -50, top: 0, width: 200, height: 100 },
    },
    {
      label: 'tall image in a square frame',
      naturalSize: { width: 200, height: 400 },
      frameSize: { width: 100, height: 100 },
      expected: { left: 0, top: -50, width: 100, height: 200 },
    },
    {
      label: 'square image in a wide frame',
      naturalSize: { width: 100, height: 100 },
      frameSize: { width: 200, height: 100 },
      expected: { left: 0, top: -50, width: 200, height: 200 },
    },
  ])('covers a frame for $label', ({ naturalSize, frameSize, expected }) => {
    expect(calculateFramedImageGeometry({
      naturalSize,
      frameSize,
      fit: 'cover',
      framing: DEFAULT_FRAMING,
    })).toEqual(expected)
  })

  it.each([
    {
      naturalSize: { width: 400, height: 200 },
      frameSize: { width: 100, height: 100 },
      expected: { left: 0, top: 25, width: 100, height: 50 },
    },
    {
      naturalSize: { width: 200, height: 400 },
      frameSize: { width: 100, height: 100 },
      expected: { left: 25, top: 0, width: 50, height: 100 },
    },
    {
      naturalSize: { width: 100, height: 100 },
      frameSize: { width: 200, height: 100 },
      expected: { left: 50, top: 0, width: 100, height: 100 },
    },
  ])('contains and centers an image independently of framing %#', ({ naturalSize, frameSize, expected }) => {
    const geometry = calculateFramedImageGeometry({
      naturalSize,
      frameSize,
      fit: 'contain',
      framing: { focusX: 0, focusY: 1, zoom: MAX_IMAGE_ZOOM },
    })

    expect(geometry).toEqual(expected)
  })

  it.each([
    [{ focusX: 0, focusY: 0, zoom: 1 }, { left: 0, top: 0 }],
    [{ focusX: 1, focusY: 0, zoom: 1 }, { left: -100, top: 0 }],
    [{ focusX: 0, focusY: 1, zoom: 1 }, { left: 0, top: 0 }],
    [{ focusX: 1, focusY: 1, zoom: 1 }, { left: -100, top: 0 }],
    [{ focusX: 0, focusY: 0, zoom: 4 }, { left: 0, top: 0 }],
    [{ focusX: 1, focusY: 0, zoom: 4 }, { left: -700, top: 0 }],
    [{ focusX: 0, focusY: 1, zoom: 4 }, { left: 0, top: -300 }],
    [{ focusX: 1, focusY: 1, zoom: 4 }, { left: -700, top: -300 }],
  ] as const)('clamps focus %# to the cover edges', (framing, position) => {
    const geometry = calculateFramedImageGeometry({
      naturalSize: { width: 400, height: 200 },
      frameSize: { width: 100, height: 100 },
      fit: 'cover',
      framing,
    })

    expect(geometry).toEqual(expect.objectContaining(position))
  })

  it.each([
    [{ width: 400, height: 200 }, { width: 100, height: 100 }, { focusX: 0.1, focusY: 0.9, zoom: 1 }],
    [{ width: 200, height: 400 }, { width: 240, height: 80 }, { focusX: 1, focusY: 0, zoom: 4 }],
    [{ width: 512, height: 512 }, { width: 81, height: 273 }, { focusX: 0.35, focusY: 0.65, zoom: 2.25 }],
  ] as const)('never leaves a positive cover gap %#', (naturalSize, frameSize, framing) => {
    const geometry = calculateFramedImageGeometry({ naturalSize, frameSize, fit: 'cover', framing })

    expect(geometry).not.toBeNull()
    expect(geometry!.left).toBeLessThanOrEqual(0)
    expect(geometry!.top).toBeLessThanOrEqual(0)
    expect(geometry!.left + geometry!.width).toBeGreaterThanOrEqual(frameSize.width)
    expect(geometry!.top + geometry!.height).toBeGreaterThanOrEqual(frameSize.height)
  })

  it('preserves cover and contain postconditions across floating-point rounding', () => {
    const cover = calculateFramedImageGeometry({
      naturalSize: { width: 7, height: 1 },
      frameSize: { width: 61, height: 1 },
      fit: 'cover',
      framing: DEFAULT_FRAMING,
    })
    const contain = calculateFramedImageGeometry({
      naturalSize: { width: 7, height: 1 },
      frameSize: { width: 29, height: 100 },
      fit: 'contain',
      framing: DEFAULT_FRAMING,
    })

    expect(cover).not.toBeNull()
    expect(cover!.left).toBeLessThanOrEqual(0)
    expect(cover!.left + cover!.width).toBeGreaterThanOrEqual(61)
    expect(contain).not.toBeNull()
    expect(contain!.left).toBeGreaterThanOrEqual(0)
    expect(contain!.left + contain!.width).toBeLessThanOrEqual(29)
  })

  it.each([
    [{ width: 0, height: 100 }, { width: 100, height: 100 }],
    [{ width: -1, height: 100 }, { width: 100, height: 100 }],
    [{ width: Number.NaN, height: 100 }, { width: 100, height: 100 }],
    [{ width: Number.POSITIVE_INFINITY, height: 100 }, { width: 100, height: 100 }],
    [{ width: 100, height: 100 }, { width: 0, height: 100 }],
    [{ width: 100, height: 100 }, { width: -1, height: 100 }],
    [{ width: 100, height: 100 }, { width: 100, height: Number.NaN }],
    [{ width: 100, height: 100 }, { width: 100, height: Number.POSITIVE_INFINITY }],
  ])('returns null for invalid image or frame dimensions %#', (naturalSize, frameSize) => {
    expect(calculateFramedImageGeometry({
      naturalSize,
      frameSize,
      fit: 'cover',
      framing: DEFAULT_FRAMING,
    })).toBeNull()
  })

  it('returns null for invalid fit or framing values at the public boundary', () => {
    expect(calculateFramedImageGeometry({
      naturalSize: { width: 100, height: 100 },
      frameSize: { width: 100, height: 100 },
      fit: 'stretch' as 'cover',
      framing: DEFAULT_FRAMING,
    })).toBeNull()
    expect(calculateFramedImageGeometry({
      naturalSize: { width: 100, height: 100 },
      frameSize: { width: 100, height: 100 },
      fit: 'cover',
      framing: { ...DEFAULT_FRAMING, zoom: Number.NaN },
    })).toBeNull()
  })
})

describe('image framing pan conversion', () => {
  const naturalSize = { width: 400, height: 200 }
  const frameSize = { width: 100, height: 100 }
  const framing: ImageFraming = { focusX: 0.5, focusY: 0.5, zoom: 2 }

  it('moves with local deltas and reverses an unclamped move', () => {
    const moved = panImageFraming({
      naturalSize,
      frameSize,
      framing,
      localDelta: { x: 20, y: -10 },
    })

    expect(moved).toEqual(expect.objectContaining({
      focusX: expect.closeTo(0.45),
      focusY: expect.closeTo(0.55),
      zoom: 2,
    }))
    expect(panImageFraming({
      naturalSize,
      frameSize,
      framing: moved,
      localDelta: { x: -20, y: 10 },
    })).toEqual(expect.objectContaining({
      focusX: expect.closeTo(framing.focusX),
      focusY: expect.closeTo(framing.focusY),
      zoom: framing.zoom,
    }))
  })

  it('returns the original reference when a clamp or epsilon makes the picture stationary', () => {
    const atLeftEdge: ImageFraming = { focusX: 0, focusY: 0.5, zoom: 1 }

    expect(panImageFraming({
      naturalSize,
      frameSize,
      framing: atLeftEdge,
      localDelta: { x: 100, y: 0 },
    })).toBe(atLeftEdge)
    expect(panImageFraming({
      naturalSize,
      frameSize,
      framing,
      localDelta: { x: SCENE_EPSILON / 10, y: 0 },
    })).toBe(framing)
  })

  it('does not compare local pixel movement with normalized framing epsilon', () => {
    const tinyFraming: ImageFraming = { focusX: 0.5, focusY: 0.5, zoom: 2 }
    const moved = panImageFraming({
      naturalSize: { width: 4e-7, height: 2e-7 },
      frameSize: { width: 1e-7, height: 1e-7 },
      framing: tinyFraming,
      localDelta: { x: 1e-7, y: 0 },
    })

    expect(moved).not.toBe(tinyFraming)
    expect(moved).toEqual({ focusX: 0.25, focusY: 0.5, zoom: 2 })
  })

  it('converts screen displacement through inverse world and render transforms', () => {
    const worldMatrix = multiply(
      groupLocal(300, 120, 90, 2),
      multiply(clockwiseRotation(-30), uniformScale(0.75)),
    )
    const renderScale = 1.5
    const expectedLocalDelta = { x: 12, y: -7 }
    const worldDelta = transformVector(worldMatrix, expectedLocalDelta)
    const screenDelta = {
      x: worldDelta.x * renderScale,
      y: worldDelta.y * renderScale,
    }
    const expected = panImageFraming({
      naturalSize,
      frameSize,
      framing,
      localDelta: expectedLocalDelta,
    })

    expect(panImageFramingFromScreen({
      naturalSize,
      frameSize,
      framing,
      screenDelta,
      renderScale,
      worldMatrix,
    })).toEqual(expect.objectContaining({
      focusX: expect.closeTo(expected.focusX),
      focusY: expect.closeTo(expected.focusY),
      zoom: expected.zoom,
    }))
  })

  it('returns the original reference for invalid local pan inputs', () => {
    const invalidSizes = [
      [{ width: 0, height: 200 }, frameSize],
      [{ width: Number.NaN, height: 200 }, frameSize],
      [naturalSize, { width: -1, height: 100 }],
      [naturalSize, { width: 100, height: Number.POSITIVE_INFINITY }],
    ] as const

    for (const [invalidNaturalSize, invalidFrameSize] of invalidSizes) {
      expect(panImageFraming({
        naturalSize: invalidNaturalSize,
        frameSize: invalidFrameSize,
        framing,
        localDelta: { x: 10, y: 0 },
      })).toBe(framing)
    }
    const invalidFraming = { ...framing, zoom: Number.NaN }
    expect(panImageFraming({
      naturalSize,
      frameSize,
      framing: invalidFraming,
      localDelta: { x: 10, y: 0 },
    })).toBe(invalidFraming)
    expect(panImageFraming({
      naturalSize,
      frameSize,
      framing,
      localDelta: { x: Number.NaN, y: 0 },
    })).toBe(framing)
  })

  it.each([
    { renderScale: 0, worldMatrix: uniformScale(1), screenDelta: { x: 10, y: 0 } },
    { renderScale: -1, worldMatrix: uniformScale(1), screenDelta: { x: 10, y: 0 } },
    { renderScale: Number.NaN, worldMatrix: uniformScale(1), screenDelta: { x: 10, y: 0 } },
    { renderScale: 1, worldMatrix: [1, 0, 0, 0, 0, 0] as Matrix2D, screenDelta: { x: 10, y: 0 } },
    { renderScale: 1, worldMatrix: [Number.NaN, 0, 0, 1, 0, 0] as Matrix2D, screenDelta: { x: 10, y: 0 } },
    { renderScale: 1, worldMatrix: uniformScale(1), screenDelta: { x: Number.POSITIVE_INFINITY, y: 0 } },
  ])('returns the original reference for invalid screen pan input %#', ({
    renderScale,
    worldMatrix,
    screenDelta,
  }) => {
    expect(panImageFramingFromScreen({
      naturalSize,
      frameSize,
      framing,
      screenDelta,
      renderScale,
      worldMatrix,
    })).toBe(framing)
  })
})
