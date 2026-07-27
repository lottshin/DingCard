import { describe, expect, it } from 'vitest'

import {
  applyImageCropAspectRatio,
  createImageCropDraft,
  imageCropLocalDeltaFromScreen,
  imageCropScreenScale,
  imageCropDraftToUpdate,
  panImageCropDraft,
  projectImageCropHandle,
  type ImageCropBounds,
  type ImageCropHandle,
} from '../imageCrop'
import { calculateFramedImageGeometry } from '../imageFraming'
import {
  groupLocal,
  matrixAlmostEqual,
  multiply,
  sceneNodeLocalMatrix,
  transformVector,
  translation,
} from '../sceneTransform'
import type { Matrix2D, Point } from '../sceneTransform'
import type { FreeformImageElement } from '../types'

function imageNode(overrides: Partial<FreeformImageElement> = {}): FreeformImageElement {
  return {
    id: 'photo',
    name: 'Photo',
    locked: false,
    hidden: false,
    type: 'image',
    x: 120,
    y: 80,
    width: 200,
    height: 120,
    rotation: 30,
    scale: 1.25,
    src: 'img:photo',
    alt: '',
    fit: 'cover',
    framing: { focusX: 0.5, focusY: 0.5, zoom: 1 },
    ...overrides,
  }
}

function expectBoundsClose(actual: ImageCropBounds, expected: ImageCropBounds): void {
  expect(actual).toEqual({
    left: expect.closeTo(expected.left),
    top: expect.closeTo(expected.top),
    right: expect.closeTo(expected.right),
    bottom: expect.closeTo(expected.bottom),
  })
}

describe('image crop draft conversion', () => {
  it.each([
    ['wide', { width: 400, height: 200 }],
    ['tall', { width: 200, height: 400 }],
    ['square', { width: 300, height: 300 }],
  ])('creates a fixed-plane draft for a %s image', (_label, naturalSize) => {
    const startNode = imageNode()
    const expectedImage = calculateFramedImageGeometry({
      naturalSize,
      frameSize: { width: startNode.width, height: startNode.height },
      fit: 'cover',
      framing: startNode.framing,
    })

    const draft = createImageCropDraft({ startNode, naturalSize })

    expect(draft).toEqual({
      frame: { left: 0, top: 0, right: 200, bottom: 120 },
      image: {
        left: expectedImage!.left,
        top: expectedImage!.top,
        right: expectedImage!.left + expectedImage!.width,
        bottom: expectedImage!.top + expectedImage!.height,
      },
      framing: startNode.framing,
    })
    expect(draft!.framing).not.toBe(startNode.framing)
  })

  it.each([
    ['wide', { width: 400, height: 200 }],
    ['tall', { width: 200, height: 400 }],
    ['square', { width: 300, height: 300 }],
  ])('back-calculates a %s image without moving it in the start plane', (_label, naturalSize) => {
    const startNode = imageNode()
    const startDraft = createImageCropDraft({ startNode, naturalSize })!
    const draft = {
      ...startDraft,
      frame: { left: 20, top: 10, right: 180, bottom: 110 },
    }

    const update = imageCropDraftToUpdate({ startNode, naturalSize, draft })

    expect(update).not.toBeNull()
    const rerendered = calculateFramedImageGeometry({
      naturalSize,
      frameSize: { width: update!.width, height: update!.height },
      fit: 'cover',
      framing: update!.framing,
    })!
    expect({
      left: draft.frame.left + rerendered.left,
      top: draft.frame.top + rerendered.top,
      right: draft.frame.left + rerendered.left + rerendered.width,
      bottom: draft.frame.top + rerendered.top + rerendered.height,
    }).toEqual({
      left: expect.closeTo(startDraft.image.left),
      top: expect.closeTo(startDraft.image.top),
      right: expect.closeTo(startDraft.image.right),
      bottom: expect.closeTo(startDraft.image.bottom),
    })
    expect(matrixAlmostEqual(
      sceneNodeLocalMatrix({ ...startNode, ...update! }),
      multiply(sceneNodeLocalMatrix(startNode), translation(draft.frame.left, draft.frame.top)),
    )).toBe(true)
  })

  it('rejects invalid nodes, natural sizes, and partial crop geometry', () => {
    const startNode = imageNode()

    expect(createImageCropDraft({
      startNode: imageNode({ fit: 'contain' }),
      naturalSize: { width: 400, height: 200 },
    })).toBeNull()
    expect(createImageCropDraft({
      startNode,
      naturalSize: { width: Number.NaN, height: 200 },
    })).toBeNull()

    const draft = createImageCropDraft({
      startNode,
      naturalSize: { width: 400, height: 200 },
    })!
    expect(imageCropDraftToUpdate({
      startNode,
      naturalSize: { width: 400, height: 200 },
      draft: {
        ...draft,
        frame: { ...draft.frame, right: Number.NaN },
      },
    })).toBeNull()
    expect(imageCropDraftToUpdate({
      startNode,
      naturalSize: { width: 400, height: 200 },
      draft: {
        ...draft,
        frame: { ...draft.frame, left: draft.image.left - 1 },
      },
    })).toBeNull()
    expect(imageCropDraftToUpdate({
      startNode,
      naturalSize: { width: 400, height: 200 },
      draft: {
        ...draft,
        image: { ...draft.image, right: draft.image.right + 1 },
      },
    })).toBeNull()
  })
})

describe('image crop handle projection', () => {
  const naturalSize = { width: 400, height: 200 }
  const minimumFrameSize = { width: 1, height: 1 }
  const inwardCases: Array<{
    handle: ImageCropHandle
    localDelta: Point
    expected: ImageCropBounds
  }> = [
    { handle: 'n', localDelta: { x: 0, y: 10 }, expected: { left: 0, top: 10, right: 200, bottom: 120 } },
    { handle: 'ne', localDelta: { x: -10, y: 10 }, expected: { left: 0, top: 10, right: 190, bottom: 120 } },
    { handle: 'e', localDelta: { x: -10, y: 0 }, expected: { left: 0, top: 0, right: 190, bottom: 120 } },
    { handle: 'se', localDelta: { x: -10, y: -10 }, expected: { left: 0, top: 0, right: 190, bottom: 110 } },
    { handle: 's', localDelta: { x: 0, y: -10 }, expected: { left: 0, top: 0, right: 200, bottom: 110 } },
    { handle: 'sw', localDelta: { x: 10, y: -10 }, expected: { left: 10, top: 0, right: 200, bottom: 110 } },
    { handle: 'w', localDelta: { x: 10, y: 0 }, expected: { left: 10, top: 0, right: 200, bottom: 120 } },
    { handle: 'nw', localDelta: { x: 10, y: 10 }, expected: { left: 10, top: 10, right: 200, bottom: 120 } },
  ]

  it.each(inwardCases)('moves only the $handle handle edges', ({ handle, localDelta, expected }) => {
    const startNode = imageNode()
    const startDraft = createImageCropDraft({ startNode, naturalSize })!

    const projected = projectImageCropHandle({
      startNode,
      naturalSize,
      startDraft,
      handle,
      localDelta,
      minimumFrameSize,
    })

    expect(projected).not.toBe(startDraft)
    expectBoundsClose(projected.frame, expected)
    expect(projected.image).toEqual(startDraft.image)
  })

  it.each([
    ['n', { x: 0, y: 10 }, { left: 0, top: 10, right: 200, bottom: 110 }],
    ['e', { x: -10, y: 0 }, { left: 10, top: 0, right: 190, bottom: 120 }],
    ['s', { x: 0, y: -10 }, { left: 0, top: 10, right: 200, bottom: 110 }],
    ['w', { x: 10, y: 0 }, { left: 10, top: 0, right: 190, bottom: 120 }],
  ] as const)('moves the %s edge symmetrically around the center', (handle, localDelta, expected) => {
    const startNode = imageNode()
    const startDraft = createImageCropDraft({ startNode, naturalSize })!
    const projected = projectImageCropHandle({
      startNode,
      naturalSize,
      startDraft,
      handle,
      localDelta,
      minimumFrameSize,
      symmetric: true,
    })

    expectBoundsClose(projected.frame, expected)
  })

  it('does not apply edge symmetry to a corner handle', () => {
    const startNode = imageNode()
    const startDraft = createImageCropDraft({ startNode, naturalSize })!

    const projected = projectImageCropHandle({
      startNode,
      naturalSize,
      startDraft,
      handle: 'ne',
      localDelta: { x: -10, y: 10 },
      minimumFrameSize,
      symmetric: true,
    })

    expectBoundsClose(projected.frame, { left: 0, top: 10, right: 190, bottom: 120 })
  })

  it('stops at the rendered image edge, caller minimum size, and maximum zoom', () => {
    const boundaryNode = imageNode({ framing: { focusX: 0.5, focusY: 0.5, zoom: 2 } })
    const boundaryDraft = createImageCropDraft({ startNode: boundaryNode, naturalSize })!
    const atImageEdge = projectImageCropHandle({
      startNode: boundaryNode,
      naturalSize,
      startDraft: boundaryDraft,
      handle: 'e',
      localDelta: { x: 500, y: 0 },
      minimumFrameSize,
    })
    expectBoundsClose(atImageEdge.frame, { left: 0, top: 0, right: 340, bottom: 120 })

    const minimumDraft = createImageCropDraft({ startNode: imageNode(), naturalSize })!
    const atMinimum = projectImageCropHandle({
      startNode: imageNode(),
      naturalSize,
      startDraft: minimumDraft,
      handle: 'e',
      localDelta: { x: -500, y: 0 },
      minimumFrameSize: { width: 40, height: 40 },
    })
    expectBoundsClose(atMinimum.frame, { left: 0, top: 0, right: 40, bottom: 120 })

    const zoomNode = imageNode({ width: 100, height: 100 })
    const zoomDraft = createImageCropDraft({ startNode: zoomNode, naturalSize })!
    const atMaximumZoom = projectImageCropHandle({
      startNode: zoomNode,
      naturalSize,
      startDraft: zoomDraft,
      handle: 'se',
      localDelta: { x: -95, y: -95 },
      minimumFrameSize,
    })
    expectBoundsClose(atMaximumZoom.frame, { left: 0, top: 0, right: 25, bottom: 25 })
    expect(atMaximumZoom.framing.zoom).toBeCloseTo(4)
  })

  it('crosses a legal cover-axis switch and stops at the first jointly exceeded boundary', () => {
    const switchNode = imageNode({ width: 100, height: 80 })
    const switchDraft = createImageCropDraft({ startNode: switchNode, naturalSize })!
    const crossed = projectImageCropHandle({
      startNode: switchNode,
      naturalSize,
      startDraft: switchDraft,
      handle: 's',
      localDelta: { x: 0, y: -60 },
      minimumFrameSize: { width: 10, height: 10 },
    })
    expectBoundsClose(crossed.frame, { left: 0, top: 0, right: 100, bottom: 20 })
    expect(crossed.framing.zoom).toBeCloseTo(1.6)

    const boundaryNode = imageNode({
      width: 100,
      height: 100,
      framing: { focusX: 0.5, focusY: 0.5, zoom: 2 },
    })
    const boundaryDraft = createImageCropDraft({ startNode: boundaryNode, naturalSize })!
    const stopped = projectImageCropHandle({
      startNode: boundaryNode,
      naturalSize,
      startDraft: boundaryDraft,
      handle: 'se',
      localDelta: { x: 500, y: 500 },
      minimumFrameSize,
    })
    expectBoundsClose(stopped.frame, { left: 0, top: 0, right: 150, bottom: 150 })
  })

  it('depends on total gesture displacement instead of pointer event sampling', () => {
    const startNode = imageNode({ width: 100, height: 100 })
    const startDraft = createImageCropDraft({ startNode, naturalSize })!
    const input = {
      startNode,
      naturalSize,
      startDraft,
      handle: 'se' as const,
      minimumFrameSize,
    }
    const oneEvent = projectImageCropHandle({ ...input, localDelta: { x: -95, y: -95 } })
    let manyEvents = startDraft
    for (let step = 1; step <= 120; step += 1) {
      manyEvents = projectImageCropHandle({
        ...input,
        localDelta: { x: (-95 * step) / 120, y: (-95 * step) / 120 },
      })
    }

    expectBoundsClose(manyEvents.frame, oneEvent.frame)
    expect(manyEvents.framing).toEqual({
      focusX: expect.closeTo(oneEvent.framing.focusX),
      focusY: expect.closeTo(oneEvent.framing.focusY),
      zoom: expect.closeTo(oneEvent.framing.zoom),
    })
  })

  it('keeps invalid gesture input on the exact starting draft reference', () => {
    const startNode = imageNode()
    const startDraft = createImageCropDraft({ startNode, naturalSize })!

    expect(projectImageCropHandle({
      startNode,
      naturalSize,
      startDraft,
      handle: 'e',
      localDelta: { x: Number.NaN, y: 0 },
      minimumFrameSize,
    })).toBe(startDraft)
    expect(projectImageCropHandle({
      startNode,
      naturalSize,
      startDraft,
      handle: 'e',
      localDelta: { x: 10, y: 0 },
      minimumFrameSize: { width: Number.POSITIVE_INFINITY, height: 1 },
    })).toBe(startDraft)
  })
})

describe('image crop screen transforms', () => {
  it.each([
    {
      label: 'a 30 degree image',
      matrix: sceneNodeLocalMatrix(imageNode({ rotation: 30, scale: 1.2 })),
      renderScale: 1,
    },
    {
      label: 'a 90 degree image in a scaled group',
      matrix: multiply(
        groupLocal(300, 120, -20, 2),
        sceneNodeLocalMatrix(imageNode({ rotation: 90, scale: 0.75 })),
      ),
      renderScale: 1.5,
    },
    {
      label: 'an image in two rotated scaled groups',
      matrix: multiply(
        groupLocal(40, 30, 30, 1.5),
        multiply(
          groupLocal(70, 50, -90, 0.8),
          sceneNodeLocalMatrix(imageNode({ rotation: 30, scale: 1.25 })),
        ),
      ),
      renderScale: 0.8,
    },
  ])('converts screen movement through $label in the fixed start plane', ({ matrix, renderScale }) => {
    const expectedLocal = { x: 13, y: -7 }
    const worldDelta = transformVector(matrix, expectedLocal)
    const screenDelta = {
      x: worldDelta.x * renderScale,
      y: worldDelta.y * renderScale,
    }

    expect(imageCropLocalDeltaFromScreen({
      screenDelta,
      renderScale,
      startWorldMatrix: matrix,
    })).toEqual({
      x: expect.closeTo(expectedLocal.x),
      y: expect.closeTo(expectedLocal.y),
    })
  })

  it('keeps the 40-world-pixel frame limit separate from a 24-screen-pixel hit target', () => {
    const startNode = imageNode({ scale: 1.25 })
    const startWorldMatrix = multiply(
      groupLocal(30, 40, 0, 1.6),
      sceneNodeLocalMatrix(startNode),
    )
    const worldScale = 2
    const startDraft = createImageCropDraft({
      startNode,
      naturalSize: { width: 400, height: 200 },
    })!
    const projected = projectImageCropHandle({
      startNode,
      naturalSize: { width: 400, height: 200 },
      startDraft,
      handle: 'e',
      localDelta: { x: -500, y: 0 },
      minimumFrameSize: { width: 40 / worldScale, height: 40 / worldScale },
    })
    expect(projected.frame.right - projected.frame.left).toBeCloseTo(20)
    expect((projected.frame.right - projected.frame.left) * worldScale).toBeCloseTo(40)

    const screenScale = imageCropScreenScale({
      renderScale: 1.5,
      startWorldMatrix,
    })!
    expect(screenScale).toBeCloseTo(3)
    const localHitTarget = 24 / screenScale
    expect(localHitTarget * screenScale).toBeCloseTo(24)
  })

  it.each([
    { renderScale: 0, startWorldMatrix: [1, 0, 0, 1, 0, 0] as Matrix2D },
    { renderScale: Number.NaN, startWorldMatrix: [1, 0, 0, 1, 0, 0] as Matrix2D },
    { renderScale: 1, startWorldMatrix: [1, 0, 0, 0, 0, 0] as Matrix2D },
    { renderScale: 1, startWorldMatrix: [Number.NaN, 0, 0, 1, 0, 0] as Matrix2D },
  ])('returns null for an invalid screen transform %#', ({ renderScale, startWorldMatrix }) => {
    const input = {
      screenDelta: { x: 10, y: 5 },
      renderScale,
      startWorldMatrix,
    }
    expect(imageCropLocalDeltaFromScreen(input)).toBeNull()
    expect(imageCropScreenScale(input)).toBeNull()
  })
})

describe('image crop picture movement', () => {
  const naturalSize = { width: 400, height: 200 }

  it.each([
    ['right', { x: 1, y: 0 }, { left: -149, top: -50, right: 251, bottom: 150 }],
    ['left', { x: -10, y: 0 }, { left: -160, top: -50, right: 240, bottom: 150 }],
    ['down', { x: 0, y: 1 }, { left: -150, top: -49, right: 250, bottom: 151 }],
    ['up', { x: 0, y: -10 }, { left: -150, top: -60, right: 250, bottom: 140 }],
  ] as const)('moves the rendered picture 1px or 10px %s', (_label, localDelta, expected) => {
    const startNode = imageNode({
      width: 100,
      height: 100,
      framing: { focusX: 0.5, focusY: 0.5, zoom: 2 },
    })
    const draft = createImageCropDraft({ startNode, naturalSize })!

    const moved = panImageCropDraft({ draft, localDelta })

    expect(moved).not.toBe(draft)
    expectBoundsClose(moved.image, expected)
    expect(moved.frame).toEqual(draft.frame)
  })

  it.each([
    ['right', { x: 1_000, y: 0 }, { left: 0, top: -50, right: 400, bottom: 150 }],
    ['left', { x: -1_000, y: 0 }, { left: -300, top: -50, right: 100, bottom: 150 }],
    ['down', { x: 0, y: 1_000 }, { left: -150, top: 0, right: 250, bottom: 200 }],
    ['up', { x: 0, y: -1_000 }, { left: -150, top: -100, right: 250, bottom: 100 }],
  ] as const)('clamps picture movement at the %s cover edge', (_label, localDelta, expected) => {
    const startNode = imageNode({
      width: 100,
      height: 100,
      framing: { focusX: 0.5, focusY: 0.5, zoom: 2 },
    })
    const draft = createImageCropDraft({ startNode, naturalSize })!
    const moved = panImageCropDraft({ draft, localDelta })

    expectBoundsClose(moved.image, expected)
  })

  it('preserves the draft reference for invalid or fully clamped movement', () => {
    const draft = createImageCropDraft({
      startNode: imageNode({ width: 100, height: 100 }),
      naturalSize,
    })!
    expect(panImageCropDraft({
      draft,
      localDelta: { x: Number.NaN, y: 0 },
    })).toBe(draft)

    const atTopLeft = panImageCropDraft({
      draft: createImageCropDraft({
        startNode: imageNode({
          width: 100,
          height: 100,
          framing: { focusX: 0, focusY: 0, zoom: 2 },
        }),
        naturalSize,
      })!,
      localDelta: { x: 1_000, y: 1_000 },
    })
    expect(panImageCropDraft({
      draft: atTopLeft,
      localDelta: { x: 1, y: 1 },
    })).toBe(atTopLeft)
  })
})

describe('image crop aspect ratio presets', () => {
  const naturalSize = { width: 400, height: 200 }
  const cases: Array<{
    label: string
    ratio: number | 'original'
    expected: ImageCropBounds
  }> = [
    { label: 'original', ratio: 'original', expected: { left: 0, top: 10, right: 160, bottom: 90 } },
    { label: '1:1', ratio: 1, expected: { left: 30, top: 0, right: 130, bottom: 100 } },
    { label: '4:3', ratio: 4 / 3, expected: { left: 40 / 3, top: 0, right: 440 / 3, bottom: 100 } },
    { label: '3:4', ratio: 3 / 4, expected: { left: 42.5, top: 0, right: 117.5, bottom: 100 } },
    { label: '16:9', ratio: 16 / 9, expected: { left: 0, top: 5, right: 160, bottom: 95 } },
    { label: '9:16', ratio: 9 / 16, expected: { left: 51.875, top: 0, right: 108.125, bottom: 100 } },
  ]

  it.each(cases)('inscribes the $label preset around the current frame center', ({ ratio, expected }) => {
    const startNode = imageNode({ width: 160, height: 100 })
    const draft = createImageCropDraft({ startNode, naturalSize })!

    const adjusted = applyImageCropAspectRatio({
      startNode,
      naturalSize,
      draft,
      ratio,
      minimumFrameSize: { width: 1, height: 1 },
    })

    expect(adjusted).not.toBe(draft)
    expectBoundsClose(adjusted.frame, expected)
    expect(adjusted.image).toEqual(draft.image)
    expect(adjusted.frame.left).toBeGreaterThanOrEqual(draft.frame.left)
    expect(adjusted.frame.top).toBeGreaterThanOrEqual(draft.frame.top)
    expect(adjusted.frame.right).toBeLessThanOrEqual(draft.frame.right)
    expect(adjusted.frame.bottom).toBeLessThanOrEqual(draft.frame.bottom)
    const expectedRatio = ratio === 'original' ? naturalSize.width / naturalSize.height : ratio
    expect(
      (adjusted.frame.right - adjusted.frame.left)
      / (adjusted.frame.bottom - adjusted.frame.top),
    ).toBeCloseTo(expectedRatio)
  })

  it('returns the original reference instead of approximating a blocked ratio', () => {
    const startNode = imageNode({ width: 160, height: 100 })
    const draft = createImageCropDraft({ startNode, naturalSize })!
    expect(applyImageCropAspectRatio({
      startNode,
      naturalSize,
      draft,
      ratio: 9 / 16,
      minimumFrameSize: { width: 60, height: 40 },
    })).toBe(draft)
    expect(applyImageCropAspectRatio({
      startNode,
      naturalSize,
      draft,
      ratio: 16 / 9,
      minimumFrameSize: { width: 40, height: 95 },
    })).toBe(draft)

    const zoomNode = imageNode({
      width: 400,
      height: 100,
      framing: { focusX: 0.5, focusY: 0.5, zoom: 2 },
    })
    const zoomDraft = createImageCropDraft({
      startNode: zoomNode,
      naturalSize: { width: 100, height: 100 },
    })!
    expect(applyImageCropAspectRatio({
      startNode: zoomNode,
      naturalSize: { width: 100, height: 100 },
      draft: zoomDraft,
      ratio: 1,
      minimumFrameSize: { width: 1, height: 1 },
    })).toBe(zoomDraft)
  })

  it('keeps invalid and already-matching ratio commands as no-ops', () => {
    const startNode = imageNode({ width: 160, height: 100 })
    const draft = createImageCropDraft({ startNode, naturalSize })!
    expect(applyImageCropAspectRatio({
      startNode,
      naturalSize,
      draft,
      ratio: 0,
      minimumFrameSize: { width: 1, height: 1 },
    })).toBe(draft)
    expect(applyImageCropAspectRatio({
      startNode,
      naturalSize,
      draft,
      ratio: 1.6,
      minimumFrameSize: { width: 1, height: 1 },
    })).toBe(draft)
  })
})
