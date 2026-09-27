import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  MAX_EFFECTIVE_SCALE,
  MAX_FREEFORM_SLIDES,
  MAX_SCENE_DEPTH,
  MAX_SCENE_NODES_PER_SLIDE,
  MIN_EFFECTIVE_SCALE,
} from '../constants'
import {
  mapFreeformDocumentLeaves,
  mapFreeformDocumentLeavesAsync,
  migrateFreeformDocumentV3ToV9,
  migrateLegacyFreeformDocumentToV9,
  normalizeFreeformDocument,
  normalizeFreeformDocumentV4,
  normalizeFreeformDocumentV5,
  normalizeFreeformDocumentV6,
  normalizeFreeformDocumentV7,
  normalizeFreeformDocumentV8,
  normalizeFreeformDocumentV9,
} from '../sceneDocument'
import {
  countSceneNodes,
  findNodeAtPath,
  flattenSceneLeaves,
  getChildrenAtPath,
  walkScene,
} from '../sceneTree'
import type {
  FreeformDocument,
  FreeformGroupNode,
  FreeformSceneLeaf,
  FreeformSceneNode,
  FreeformSlide,
  ImageFraming,
  ScenePath,
} from '../types'

function legacyText(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'text',
    x: 10,
    y: 20,
    width: 300,
    height: 120,
    rotation: 0,
    text: 'Legacy text',
    fontSize: 32,
    fontFamily: 'system-ui, sans-serif',
    textFill: { type: 'solid', color: '#18181b' },
    align: 'left',
    fontWeight: 'normal',
    ...overrides,
  }
}

function legacySlide(
  id: string,
  elements: unknown[] = [],
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name: 'Page',
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    elements,
    ...overrides,
  }
}

function legacyDocument(slides: unknown[], activeSlideId = 'slide-1', documentVersion = 2) {
  return { documentVersion, slides, activeSlideId }
}

function textLeaf(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'text',
    name: 'Text',
    locked: false,
    hidden: false,
    x: 10,
    y: 20,
    width: 300,
    height: 120,
    rotation: 0,
    scale: 1,
    text: 'Scene text',
    fontSize: 32,
    fontFamily: 'system-ui, sans-serif',
    textFill: { type: 'solid', color: '#18181b' },
    align: 'left',
    fontWeight: 'normal',
    ...overrides,
  }
}

function imageLeaf(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'image',
    name: 'Image',
    locked: false,
    hidden: false,
    x: 10,
    y: 20,
    width: 300,
    height: 120,
    rotation: 0,
    scale: 1,
    src: 'https://example.com/image.png',
    alt: 'Example',
    fit: 'cover',
    ...overrides,
  }
}

function shapeLeaf(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'shape',
    name: 'Shape',
    locked: false,
    hidden: false,
    x: 10,
    y: 20,
    width: 300,
    height: 120,
    rotation: 0,
    scale: 1,
    shape: 'rect',
    fill: { type: 'solid', color: '#fed7aa' },
    stroke: '#c2410c',
    strokeWidth: 0,
    ...overrides,
  }
}

function lineLeaf(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'line',
    name: 'Line',
    locked: false,
    hidden: false,
    x: 10,
    y: 20,
    width: 300,
    height: 80,
    rotation: 0,
    scale: 1,
    lineKind: 'line',
    stroke: '#18181b',
    strokeWidth: 6,
    ...overrides,
  }
}

function groupNode(
  id: string,
  children: unknown[] = [textLeaf(`${id}-leaf`)],
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    type: 'group',
    name: 'Group',
    locked: false,
    hidden: false,
    x: 100,
    y: 80,
    rotation: 0,
    scale: 1,
    children,
    ...overrides,
  }
}

function v3Slide(id: string, nodes: unknown[] = [], overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Page',
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes,
    ...overrides,
  }
}

function v3Document(slides: unknown[] = [v3Slide('slide-1')], activeSlideId = 'slide-1') {
  return { documentVersion: 3, slides, activeSlideId }
}

function framing(overrides: Partial<ImageFraming> = {}): ImageFraming {
  return { focusX: 0.5, focusY: 0.5, zoom: 1, ...overrides }
}

function v4ImageLeaf(id: string, overrides: Record<string, unknown> = {}) {
  return imageLeaf(id, { framing: framing(), ...overrides })
}

function v4ShapeImageLeaf(id: string, overrides: Record<string, unknown> = {}) {
  return shapeLeaf(id, {
    fill: {
      type: 'image',
      src: 'https://example.com/texture.png',
      fit: 'cover',
      framing: framing(),
    },
    ...overrides,
  })
}

function v4Document(slides: unknown[] = [v3Slide('slide-1')], activeSlideId = 'slide-1') {
  return { documentVersion: 4, slides, activeSlideId }
}

function nestedGroups(depth: number): unknown {
  let node: unknown = textLeaf(`node-${depth}`)
  for (let level = depth - 1; level >= 1; level -= 1) {
    node = groupNode(`node-${level}`, [node])
  }
  return node
}

describe('freeform scene types and limits', () => {
  it('uses the current recursive scene types', () => {
    expectTypeOf<FreeformDocument['documentVersion']>().toEqualTypeOf<9>()
    expectTypeOf<FreeformSlide>().toHaveProperty('nodes')
    expectTypeOf<FreeformSceneLeaf>().toHaveProperty('scale')
    expectTypeOf<FreeformGroupNode>().toHaveProperty('children')
    expectTypeOf<FreeformSceneNode>().not.toEqualTypeOf<never>()
    expectTypeOf<ScenePath>().toEqualTypeOf<readonly string[]>()
  })

  it('exports one shared set of scene safety limits', () => {
    expect(MAX_SCENE_DEPTH).toBe(32)
    expect(MAX_SCENE_NODES_PER_SLIDE).toBe(5000)
    expect(MAX_FREEFORM_SLIDES).toBe(500)
    expect(MIN_EFFECTIVE_SCALE).toBe(1e-4)
    expect(MAX_EFFECTIVE_SCALE).toBe(1e4)
  })
})

describe('strict v4/v5 freeform document contract', () => {
  it('uses versionless v4 runtime types with required image framing', () => {
    expectTypeOf<FreeformDocument['documentVersion']>().toEqualTypeOf<9>()
    expectTypeOf<Extract<FreeformSceneLeaf, { type: 'image' }>>()
      .toHaveProperty('framing')
      .toEqualTypeOf<ImageFraming>()
  })

  it('recursively migrates valid v3 images and image fills without mutating or sharing framing', () => {
    const raw = v3Document([
      v3Slide('slide-1', [
        imageLeaf('root-image'),
        groupNode('hidden-group', [
          imageLeaf('hidden-image', { hidden: true }),
          groupNode('deep-group', [
            shapeLeaf('deep-fill', {
              shape: 'triangle',
              fill: { type: 'image', src: 'img:texture', fit: 'contain' },
            }),
          ]),
        ], { hidden: true }),
      ]),
    ])
    const snapshot = structuredClone(raw)

    const migrated = migrateFreeformDocumentV3ToV9(raw)
    const rootImage = migrated?.slides[0].nodes[0]
    const hiddenGroup = migrated?.slides[0].nodes[1]
    const hiddenImage = hiddenGroup?.type === 'group' ? hiddenGroup.children[0] : undefined
    const deepGroup = hiddenGroup?.type === 'group' ? hiddenGroup.children[1] : undefined
    const deepFill = deepGroup?.type === 'group' ? deepGroup.children[0] : undefined

    expect(migrated?.documentVersion).toBe(9)
    expect(rootImage).toMatchObject({ type: 'image', framing: framing() })
    expect(hiddenImage).toMatchObject({ type: 'image', framing: framing() })
    expect(deepFill).toMatchObject({
      type: 'shape',
      fill: { type: 'image', framing: framing() },
    })
    if (
      rootImage?.type !== 'image'
      || hiddenImage?.type !== 'image'
      || deepFill?.type !== 'shape'
      || deepFill.fill.type !== 'image'
    ) {
      throw new Error('Expected recursively migrated image-bearing leaves')
    }
    expect(rootImage.framing).not.toBe(hiddenImage.framing)
    expect(rootImage.framing).not.toBe(deepFill.fill.framing)
    expect(hiddenImage.framing).not.toBe(deepFill.fill.framing)
    expect(raw).toEqual(snapshot)
  })

  it('strictly clones valid v4 framing at every nesting level', () => {
    const raw = v4Document([
      v3Slide('slide-1', [
        v4ImageLeaf('photo', { framing: framing({ focusX: 0.2, zoom: 2 }) }),
        groupNode('group', [
          v4ShapeImageLeaf('texture', {
            fill: {
              type: 'image',
              src: 'img:texture',
              fit: 'contain',
              framing: framing({ focusY: 0.8, zoom: 3 }),
            },
          }),
        ]),
      ]),
    ])
    const snapshot = structuredClone(raw)

    const normalized = normalizeFreeformDocumentV4(raw)

    expect(normalized).toEqual({ ...raw, documentVersion: 9 })
    expect(normalized).not.toBe(raw)
    const sourceImage = (raw.slides[0] as { nodes: Array<{ framing: ImageFraming }> }).nodes[0]
    const outputImage = normalized?.slides[0].nodes[0]
    expect(outputImage).not.toBe(sourceImage)
    if (outputImage?.type !== 'image') throw new Error('Expected image')
    expect(outputImage.framing).not.toBe(sourceImage.framing)
    expect(raw).toEqual(snapshot)
  })

  it.each([
    ['missing image framing', v4ImageLeaf('image', { framing: undefined })],
    ['extra framing key', v4ImageLeaf('image', { framing: { ...framing(), extra: true } })],
    ['non-finite focus', v4ImageLeaf('image', { framing: framing({ focusX: Number.NaN }) })],
    ['out-of-range focus', v4ImageLeaf('image', { framing: framing({ focusY: 1.01 }) })],
    ['out-of-range zoom', v4ImageLeaf('image', { framing: framing({ zoom: 4.01 }) })],
    ['extra image key', { ...v4ImageLeaf('image'), extra: true }],
    [
      'missing fill framing',
      v4ShapeImageLeaf('shape', {
        fill: { type: 'image', src: 'img:texture', fit: 'cover' },
      }),
    ],
    [
      'extra fill key',
      v4ShapeImageLeaf('shape', {
        fill: { type: 'image', src: 'img:texture', fit: 'cover', framing: framing(), extra: true },
      }),
    ],
  ])('atomically rejects %s', (_label, node) => {
    const raw = v4Document([v3Slide('slide-1', [node])])
    const snapshot = structuredClone(raw)

    expect(normalizeFreeformDocumentV4(raw)).toBeNull()
    expect(normalizeFreeformDocument(raw)).toBeNull()
    expect(raw).toEqual(snapshot)
  })

  it.each([
    ['document extra key', { ...v4Document(), extra: true }],
    ['slide extra key', v4Document([{ ...v3Slide('slide-1'), extra: true }])],
  ])('rejects exact-key violations without legacy fallback: %s', (_label, raw) => {
    expect(normalizeFreeformDocument(raw)).toBeNull()
  })

  it('normalizes every supported historical version and rejects unsupported versions', () => {
    const v1 = legacyDocument([legacySlide('slide-1')], 'slide-1', 1)
    const v2 = legacyDocument([legacySlide('slide-1')])
    const v3 = v3Document([v3Slide('slide-1', [imageLeaf('photo')])])
    const v4 = v4Document([v3Slide('slide-1', [v4ImageLeaf('photo')])])

    expect(normalizeFreeformDocument(v1)?.documentVersion).toBe(9)
    expect(normalizeFreeformDocument(v2)?.documentVersion).toBe(9)
    expect(normalizeFreeformDocument(v3)?.documentVersion).toBe(9)
    expect(normalizeFreeformDocument(v4)).toEqual({ ...v4, documentVersion: 9 })
    expect(normalizeFreeformDocument({ ...v4, documentVersion: 10 })).toBeNull()
    expect(normalizeFreeformDocument(null)).toBeNull()
  })

  it('versionless sync and async mappers own nested framing objects', async () => {
    const source = normalizeFreeformDocumentV4(v4Document([
      v3Slide('slide-1', [
        v4ImageLeaf('photo'),
        groupNode('group', [v4ShapeImageLeaf('texture')]),
      ]),
    ]))
    if (!source) throw new Error('Expected valid v4 source')

    const mapped = mapFreeformDocumentLeaves(source, (leaf) => leaf)
    const mappedAsync = await mapFreeformDocumentLeavesAsync(source, async (leaf) => leaf)
    const sourceImage = source.slides[0].nodes[0]
    const mappedImage = mapped.slides[0].nodes[0]
    const mappedAsyncImage = mappedAsync.slides[0].nodes[0]

    if (
      sourceImage.type !== 'image'
      || mappedImage.type !== 'image'
      || mappedAsyncImage.type !== 'image'
    ) {
      throw new Error('Expected mapped images')
    }
    expect(mappedImage.framing).not.toBe(sourceImage.framing)
    expect(mappedAsyncImage.framing).not.toBe(sourceImage.framing)
    expect(normalizeFreeformDocumentV9(mapped)).toEqual(mapped)
    expect(normalizeFreeformDocumentV9(mappedAsync)).toEqual(mappedAsync)
  })
})

describe('legacy freeform document migration', () => {
  it('turns v2 flat elements into root scene leaves without changing the shipping aliases', () => {
    const raw = legacyDocument([
      legacySlide('slide-1', [
        legacyText('text-1'),
        {
          id: 'image-1',
          type: 'image',
          x: 1,
          y: 2,
          width: 30,
          height: 40,
          rotation: -15,
          src: 'img:one',
          alt: 'Photo',
          fit: 'contain',
        },
        {
          id: 'shape-1',
          type: 'shape',
          x: 3,
          y: 4,
          width: 50,
          height: 60,
          rotation: 10,
          shape: 'ellipse',
          fill: { type: 'solid', color: '#fed7aa' },
          stroke: '#000000',
          strokeWidth: 2,
        },
        {
          id: 'line-1',
          type: 'line',
          x: 5,
          y: 6,
          width: 70,
          height: 20,
          rotation: 25,
          lineKind: 'arrow',
          stroke: '#111111',
          strokeWidth: 3,
        },
      ]),
    ])
    const snapshot = structuredClone(raw)

    const migrated = migrateLegacyFreeformDocumentToV9(raw)

    expect(raw).toEqual(snapshot)
    expect(migrated).not.toBeNull()
    expect(migrated?.documentVersion).toBe(9)
    expect(migrated?.slides[0].nodes.map((node) => node.id)).toEqual([
      'text-1',
      'image-1',
      'shape-1',
      'line-1',
    ])
    expect(migrated?.slides[0].nodes).toEqual([
      expect.objectContaining({ type: 'text', name: '文本', locked: false, hidden: false, scale: 1 }),
      expect.objectContaining({ type: 'image', name: '图片', locked: false, hidden: false, scale: 1 }),
      expect.objectContaining({ type: 'shape', name: '形状', locked: false, hidden: false, scale: 1 }),
      expect.objectContaining({ type: 'line', name: '箭头', locked: false, hidden: false, scale: 1 }),
    ])
    expect(migrated?.slides[0]).not.toBe(raw.slides[0])
    expect(migrated?.slides[0].nodes[0]).not.toBe((raw.slides[0] as { elements: unknown[] }).elements[0])
  })

  it('keeps duplicate node IDs that occur on different pages', () => {
    const migrated = migrateLegacyFreeformDocumentToV9(
      legacyDocument([
        legacySlide('slide-1', [legacyText('copied-id')]),
        legacySlide('slide-2', [legacyText('copied-id')]),
      ]),
    )

    expect(migrated?.slides.map((slide) => slide.nodes[0].id)).toEqual(['copied-id', 'copied-id'])
  })

  it('rewrites blank and same-page duplicate node IDs deterministically while reserving future source IDs', () => {
    const raw = legacyDocument([
      legacySlide('slide-1', [
        legacyText(''),
        legacyText('duplicate'),
        legacyText('duplicate'),
        legacyText('legacy-node-0-0'),
        legacyText('legacy-node-0-2'),
      ]),
    ])

    const first = migrateLegacyFreeformDocumentToV9(raw)
    const second = migrateLegacyFreeformDocumentToV9(structuredClone(raw))

    expect(first?.slides[0].nodes.map((node) => node.id)).toEqual([
      'legacy-node-0-0-1',
      'duplicate',
      'legacy-node-0-2-1',
      'legacy-node-0-0',
      'legacy-node-0-2',
    ])
    expect(second).toEqual(first)
  })

  it('rewrites blank and duplicate slide IDs deterministically and resolves the first valid old active match', () => {
    const raw = legacyDocument(
      [
        legacySlide('', [legacyText('a')]),
        legacySlide('duplicate', [legacyText('b')]),
        legacySlide('duplicate', [legacyText('c')]),
        legacySlide('legacy-slide-0', [legacyText('d')]),
        legacySlide('legacy-slide-2', [legacyText('e')]),
      ],
      'duplicate',
    )

    const migrated = migrateLegacyFreeformDocumentToV9(raw)

    expect(migrated?.slides.map((slide) => slide.id)).toEqual([
      'legacy-slide-0-1',
      'duplicate',
      'legacy-slide-2-1',
      'legacy-slide-0',
      'legacy-slide-2',
    ])
    expect(migrated?.activeSlideId).toBe('duplicate')
  })

  it('resolves an old active ID against the first surviving duplicate page', () => {
    const migrated = migrateLegacyFreeformDocumentToV9(
      legacyDocument(
        [
          legacySlide('duplicate', [], { width: 127 }),
          legacySlide('duplicate', [legacyText('survivor')]),
          legacySlide('duplicate', [legacyText('later')]),
        ],
        'duplicate',
      ),
    )

    expect(migrated?.slides.map((slide) => slide.id)).toEqual(['duplicate', 'legacy-slide-2'])
    expect(migrated?.activeSlideId).toBe('duplicate')
    expect(migrated?.slides[0].nodes[0].id).toBe('survivor')
  })

  it('maps a blank old active ID to that page deterministic migrated ID', () => {
    const migrated = migrateLegacyFreeformDocumentToV9(
      legacyDocument(
        [
          legacySlide('', [legacyText('blank-page')]),
          legacySlide('legacy-slide-0', [legacyText('reserved')]),
        ],
        '',
      ),
    )

    expect(migrated?.slides.map((slide) => slide.id)).toEqual([
      'legacy-slide-0-1',
      'legacy-slide-0',
    ])
    expect(migrated?.activeSlideId).toBe('legacy-slide-0-1')
  })

  it('skips damaged legacy elements and pages, preserves finite negative coordinates, and falls back active page', () => {
    const raw = legacyDocument(
      [
        legacySlide('bad-size', [legacyText('ignored')], { width: 127 }),
        legacySlide('good', [
          legacyText('negative', { x: -25, y: -40 }),
          legacyText('zero-width', { width: 0 }),
          legacyText('bad-required', { text: null }),
          { id: 'unknown', type: 'video' },
        ]),
      ],
      'missing',
      1,
    )

    const migrated = migrateLegacyFreeformDocumentToV9(raw)

    expect(migrated?.slides).toHaveLength(1)
    expect(migrated?.activeSlideId).toBe('good')
    expect(migrated?.slides[0].nodes).toEqual([
      expect.objectContaining({ id: 'negative', x: -25, y: -40, scale: 1 }),
    ])
  })

  it('keeps a valid legacy page as a blank scene when all its elements are damaged', () => {
    const migrated = migrateLegacyFreeformDocumentToV9(
      legacyDocument([
        legacySlide('slide-1', [
          legacyText('zero-width', { width: 0 }),
          legacyText('bad-text', { text: null }),
        ]),
      ]),
    )

    expect(migrated?.slides).toHaveLength(1)
    expect(migrated?.slides[0].nodes).toEqual([])
  })

  it('skips a legacy group-shaped element without promoting its children', () => {
    const migrated = migrateLegacyFreeformDocumentToV9(
      legacyDocument([
        legacySlide('slide-1', [
          {
            id: 'legacy-group',
            type: 'group',
            x: 10,
            y: 20,
            width: 300,
            height: 120,
            rotation: 0,
            children: [legacyText('must-not-be-promoted')],
          },
          legacyText('sibling'),
        ]),
      ]),
    )

    expect(migrated?.slides[0].nodes.map((node) => node.id)).toEqual(['sibling'])
  })

  it('keeps legacy style fallback behavior but emits a strict-valid v3 result', () => {
    const migrated = migrateLegacyFreeformDocumentToV9(
      legacyDocument([
        legacySlide('slide-1', [
          legacyText('text', {
            textFill: { type: 'solid', color: 'red' },
            align: 'bad',
            fontWeight: 'bad',
          }),
          shapeLeaf('shape', {
            name: undefined,
            locked: undefined,
            hidden: undefined,
            scale: undefined,
            fill: { type: 'solid', color: 'red' },
          }),
        ]),
      ]),
    )

    expect(migrated?.slides[0].nodes[0]).toMatchObject({
      textFill: { type: 'solid', color: '#18181b' },
      align: 'left',
      fontWeight: 'normal',
    })
    expect(migrated?.slides[0].nodes[1]).toMatchObject({
      fill: { type: 'solid', color: '#fed7aa' },
    })
    expect(normalizeFreeformDocumentV9(migrated)).toEqual(migrated)
  })

  it('fails when every legacy page is invalid', () => {
    expect(
      migrateLegacyFreeformDocumentToV9(
        legacyDocument([
          legacySlide('too-small', [], { height: 100 }),
          { id: 'broken', name: 'Broken', width: 1080, height: 1440, elements: null },
        ]),
      ),
    ).toBeNull()
  })

  it('rejects raw legacy limits before filtering instead of truncating', () => {
    const tooManyPages = Array.from({ length: MAX_FREEFORM_SLIDES + 1 }, (_, index) =>
      legacySlide(`slide-${index}`, [], { width: 1 }),
    )
    const tooManyElements = Array.from(
      { length: MAX_SCENE_NODES_PER_SLIDE + 1 },
      () => ({ broken: true }),
    )

    expect(migrateLegacyFreeformDocumentToV9(legacyDocument(tooManyPages))).toBeNull()
    expect(
      migrateLegacyFreeformDocumentToV9(
        legacyDocument([legacySlide('slide-1', tooManyElements)]),
      ),
    ).toBeNull()
  })

  it('round-trips migrated IDs, order, and node count through the strict reader', () => {
    const migrated = migrateLegacyFreeformDocumentToV9(
      legacyDocument([
        legacySlide('slide-1', [legacyText(''), legacyText('same'), legacyText('same')]),
        legacySlide('slide-2', [legacyText('same')]),
      ]),
    )
    const reread = normalizeFreeformDocumentV9(JSON.parse(JSON.stringify(migrated)))

    expect(reread).toEqual(migrated)
    expect(reread?.slides.map((slide) => slide.nodes.map((node) => node.id))).toEqual(
      migrated?.slides.map((slide) => slide.nodes.map((node) => node.id)),
    )
    expect(reread?.slides.map((slide) => countSceneNodes(slide.nodes))).toEqual(
      migrated?.slides.map((slide) => countSceneNodes(slide.nodes)),
    )
  })
})

describe('strict v3 freeform normalization', () => {
  it('accepts blank pages, single-child groups, cross-page IDs, and finite negative transforms', () => {
    const raw = v3Document([
      v3Slide('slide-1', []),
      v3Slide('slide-2', [
        groupNode('shared', [textLeaf('leaf', { x: -10, y: -20, rotation: -450 })], {
          x: -30,
          y: -40,
          rotation: -90,
        }),
      ]),
      v3Slide('slide-3', [textLeaf('shared')]),
    ])
    const snapshot = structuredClone(raw)

    const normalized = migrateFreeformDocumentV3ToV9(raw)

    expect(normalized).toEqual({ ...raw, documentVersion: 9 })
    expect(normalized).not.toBe(raw)
    expect(normalized?.slides[1]).not.toBe(raw.slides[1])
    expect(raw).toEqual(snapshot)
  })

  it('dispatches v1, v2, and v3 inputs while rejecting unknown versions', () => {
    const v1 = legacyDocument([legacySlide('slide-1')], 'slide-1', 1)
    const v2 = legacyDocument([legacySlide('slide-1')])
    const v3 = v3Document()

    expect(normalizeFreeformDocument(v1)?.documentVersion).toBe(9)
    expect(normalizeFreeformDocument(v2)?.documentVersion).toBe(9)
    expect(normalizeFreeformDocument(v3)).toEqual({ ...v3, documentVersion: 9 })
    expect(normalizeFreeformDocument({ ...v3, documentVersion: 10 })).toBeNull()
    expect(normalizeFreeformDocument(null)).toBeNull()
  })

  it('accepts string node names verbatim, including empty and whitespace-only names', () => {
    const raw = v3Document([
      v3Slide('slide-1', [
        textLeaf('empty-name', { name: '' }),
        groupNode('whitespace-name', [textLeaf('child')], { name: '   ' }),
      ]),
    ])

    const normalized = migrateFreeformDocumentV3ToV9(raw)

    expect(normalized).not.toBeNull()
    expect(normalized?.slides[0].nodes[0].name).toBe('')
    expect(normalized?.slides[0].nodes[1].name).toBe('   ')
    expect(normalized).toEqual({ ...raw, documentVersion: 9 })
  })

  it.each([
    ['no slides', v3Document([])],
    [
      'too many slides',
      v3Document(
        Array.from({ length: MAX_FREEFORM_SLIDES + 1 }, (_, index) => v3Slide(`slide-${index}`)),
      ),
    ],
    ['missing active slide', v3Document([v3Slide('slide-1')], 'missing')],
    ['blank slide ID', v3Document([v3Slide('   ')], '   ')],
    [
      'duplicate slide ID',
      v3Document([v3Slide('slide-1'), v3Slide('slide-1')]),
    ],
    ['fractional page width', v3Document([v3Slide('slide-1', [], { width: 1080.5 })])],
    ['page below range', v3Document([v3Slide('slide-1', [], { height: 127 })])],
    ['page above range', v3Document([v3Slide('slide-1', [], { width: 4097 })])],
    ['invalid background', v3Document([v3Slide('slide-1', [], { background: { type: 'solid', color: 'red' } })])],
    ['blank node ID', v3Document([v3Slide('slide-1', [textLeaf(' ')])])],
    [
      'duplicate nested node ID',
      v3Document([v3Slide('slide-1', [textLeaf('same'), groupNode('group', [textLeaf('same')])])]),
    ],
    ['empty group', v3Document([v3Slide('slide-1', [groupNode('group', [])])])],
    ['depth 33', v3Document([v3Slide('slide-1', [nestedGroups(MAX_SCENE_DEPTH + 1)])])],
    [
      'node 5001',
      v3Document([
        v3Slide(
          'slide-1',
          Array.from({ length: MAX_SCENE_NODES_PER_SLIDE + 1 }, (_, index) => textLeaf(`leaf-${index}`)),
        ),
      ]),
    ],
  ])('atomically rejects %s', (_label, raw) => {
    const snapshot = structuredClone(raw)

    expect(migrateFreeformDocumentV3ToV9(raw)).toBeNull()
    expect(raw).toEqual(snapshot)
  })

  it.each([
    ['leaf x NaN', textLeaf('leaf', { x: Number.NaN })],
    ['leaf y infinity', textLeaf('leaf', { y: Number.POSITIVE_INFINITY })],
    ['leaf rotation infinity', textLeaf('leaf', { rotation: Number.NEGATIVE_INFINITY })],
    ['leaf zero width', textLeaf('leaf', { width: 0 })],
    ['leaf negative height', textLeaf('leaf', { height: -1 })],
    ['leaf infinite width', textLeaf('leaf', { width: Number.POSITIVE_INFINITY })],
    ['leaf zero scale', textLeaf('leaf', { scale: 0 })],
    ['leaf NaN scale', textLeaf('leaf', { scale: Number.NaN })],
    ['group x NaN', groupNode('group', undefined, { x: Number.NaN })],
    ['group y infinity', groupNode('group', undefined, { y: Number.POSITIVE_INFINITY })],
    ['group rotation infinity', groupNode('group', undefined, { rotation: Number.POSITIVE_INFINITY })],
    ['group negative scale', groupNode('group', undefined, { scale: -1 })],
    ['group infinite scale', groupNode('group', undefined, { scale: Number.POSITIVE_INFINITY })],
  ])('rejects invalid geometry: %s', (_label, node) => {
    expect(migrateFreeformDocumentV3ToV9(v3Document([v3Slide('slide-1', [node])]))).toBeNull()
  })

  it('accepts inclusive world-scale limits and rejects underflow, overflow, and multiplication overflow', () => {
    const minimum = groupNode('minimum-parent', [textLeaf('minimum-leaf', { scale: 1e-2 })], {
      scale: 1e-2,
    })
    const maximum = groupNode('maximum-parent', [textLeaf('maximum-leaf', { scale: 100 })], {
      scale: 100,
    })
    const tooSmall = groupNode('small-parent', [textLeaf('small-leaf', { scale: 0.009 })], {
      scale: 1e-2,
    })
    const tooLarge = groupNode('large-parent', [textLeaf('large-leaf', { scale: 100.01 })], {
      scale: 100,
    })
    const overflow = groupNode('overflow-parent', [textLeaf('overflow-leaf', { scale: Number.MAX_VALUE })], {
      scale: MAX_EFFECTIVE_SCALE,
    })

    expect(migrateFreeformDocumentV3ToV9(v3Document([v3Slide('slide-1', [minimum, maximum])]))).not.toBeNull()
    expect(migrateFreeformDocumentV3ToV9(v3Document([v3Slide('slide-1', [tooSmall])]))).toBeNull()
    expect(migrateFreeformDocumentV3ToV9(v3Document([v3Slide('slide-1', [tooLarge])]))).toBeNull()
    expect(migrateFreeformDocumentV3ToV9(v3Document([v3Slide('slide-1', [overflow])]))).toBeNull()
  })

  it('allows local scales outside the shared range when every cumulative world scale is in range', () => {
    const growChild = groupNode('minimum-parent', [textLeaf('grow-child', { scale: 1e8 })], {
      scale: MIN_EFFECTIVE_SCALE,
    })
    const shrinkChild = groupNode('maximum-parent', [textLeaf('shrink-child', { scale: 1e-8 })], {
      scale: MAX_EFFECTIVE_SCALE,
    })

    const normalized = migrateFreeformDocumentV3ToV9(
      v3Document([v3Slide('slide-1', [growChild, shrinkChild])]),
    )

    expect(normalized).not.toBeNull()
    expect(normalized?.slides[0].nodes).toEqual([growChild, shrinkChild])
  })

  it.each([
    ['non-boolean locked', textLeaf('leaf', { locked: 0 })],
    ['non-boolean hidden', groupNode('group', undefined, { hidden: 'no' })],
    ['unknown node type', { ...textLeaf('leaf'), type: 'video' }],
    ['text body', textLeaf('leaf', { text: null })],
    ['text font size', textLeaf('leaf', { fontSize: Number.NaN })],
    ['text font family', textLeaf('leaf', { fontFamily: null })],
    ['text paint', textLeaf('leaf', { textFill: { type: 'solid', color: 'red' } })],
    ['text align', textLeaf('leaf', { align: 'justify' })],
    ['text weight', textLeaf('leaf', { fontWeight: '900' })],
    ['image source', imageLeaf('leaf', { src: null })],
    ['image alt', imageLeaf('leaf', { alt: null })],
    ['image fit', imageLeaf('leaf', { fit: 'stretch' })],
    ['shape kind', shapeLeaf('leaf', { shape: 'star' })],
    ['shape fill', shapeLeaf('leaf', { fill: { type: 'image', src: 'img:one', fit: 'stretch' } })],
    ['shape stroke', shapeLeaf('leaf', { stroke: null })],
    ['shape stroke width', shapeLeaf('leaf', { strokeWidth: Number.NaN })],
    ['line kind', lineLeaf('leaf', { lineKind: 'curve' })],
    ['line stroke', lineLeaf('leaf', { stroke: null })],
    ['line stroke width', lineLeaf('leaf', { strokeWidth: Number.POSITIVE_INFINITY })],
  ])('strictly rejects malformed node metadata/style: %s', (_label, node) => {
    expect(migrateFreeformDocumentV3ToV9(v3Document([v3Slide('slide-1', [node])]))).toBeNull()
  })
})

describe('basic scene tree queries', () => {
  const nodes = [
    textLeaf('root-leaf'),
    groupNode('outer', [
      imageLeaf('inner-image'),
      groupNode('inner', [shapeLeaf('deep-shape')]),
    ]),
  ] as unknown as FreeformSceneNode[]

  it('walks depth-first with stable ID paths and root depth one', () => {
    const visits: Array<{ id: string; path: readonly string[]; depth: number }> = []

    walkScene(nodes, (node, path, depth) => {
      visits.push({ id: node.id, path, depth })
    }, 1)

    expect(visits).toEqual([
      { id: 'root-leaf', path: ['root-leaf'], depth: 1 },
      { id: 'outer', path: ['outer'], depth: 1 },
      { id: 'inner-image', path: ['outer', 'inner-image'], depth: 2 },
      { id: 'inner', path: ['outer', 'inner'], depth: 2 },
      { id: 'deep-shape', path: ['outer', 'inner', 'deep-shape'], depth: 3 },
    ])
  })

  it('flattens only leaves and counts groups plus leaves without mutation', () => {
    const snapshot = structuredClone(nodes)

    expect(flattenSceneLeaves(nodes).map((node) => node.id)).toEqual([
      'root-leaf',
      'inner-image',
      'deep-shape',
    ])
    expect(countSceneNodes(nodes)).toBe(5)
    expect(nodes).toEqual(snapshot)
  })

  it('treats an empty parent path as root and returns undefined for unknown or leaf paths', () => {
    expect(getChildrenAtPath(nodes, [])).toBe(nodes)
    expect(findNodeAtPath(nodes, ['outer', 'inner', 'deep-shape'])?.id).toBe('deep-shape')
    expect(findNodeAtPath(nodes, [])).toBeUndefined()
    expect(findNodeAtPath(nodes, ['missing'])).toBeUndefined()
    expect(findNodeAtPath(nodes, ['outer', 'missing'])).toBeUndefined()
    expect(getChildrenAtPath(nodes, ['outer'])?.map((node) => node.id)).toEqual([
      'inner-image',
      'inner',
    ])
    expect(getChildrenAtPath(nodes, ['root-leaf'])).toBeUndefined()
    expect(getChildrenAtPath(nodes, ['outer', 'missing'])).toBeUndefined()
  })

  it('enforces the shared depth boundary explicitly', () => {
    const atLimit = [nestedGroups(MAX_SCENE_DEPTH)] as FreeformSceneNode[]
    const overLimit = [nestedGroups(MAX_SCENE_DEPTH + 1)] as FreeformSceneNode[]

    expect(countSceneNodes(atLimit)).toBe(MAX_SCENE_DEPTH)
    expect(() => walkScene(atLimit, () => undefined, 0)).toThrow(RangeError)
    expect(() => walkScene(atLimit, () => undefined, MAX_SCENE_DEPTH + 1)).toThrow(RangeError)
    expect(() => countSceneNodes(overLimit)).toThrow(RangeError)
    expect(flattenSceneLeaves(atLimit)).toHaveLength(1)
    expect(findNodeAtPath(atLimit, Array(MAX_SCENE_DEPTH + 1).fill('missing'))).toBeUndefined()
    expect(getChildrenAtPath(atLimit, Array(MAX_SCENE_DEPTH + 1).fill('missing'))).toBeUndefined()
  })
})

describe('immutable v4 document leaf mapping', () => {
  it('maps nested leaves across slides while owning slides, backgrounds, groups, and leaves', () => {
    const source = migrateFreeformDocumentV3ToV9(v3Document([
      v3Slide('slide-1', [
        groupNode('outer', [
          imageLeaf('photo', { src: 'img:photo', hidden: true }),
          groupNode('inner', [
            shapeLeaf('texture', {
              hidden: true,
              fill: { type: 'image', src: 'img:texture', fit: 'contain' },
            }),
          ], { hidden: true }),
        ], { hidden: true }),
      ]),
      v3Slide('slide-2', [textLeaf('caption')], {
        background: {
          type: 'linear-gradient',
          from: '#111111',
          to: '#222222',
          angle: 45,
        },
      }),
    ]))
    if (!source) throw new Error('Expected valid migrated source')
    const snapshot = structuredClone(source)

    const output = mapFreeformDocumentLeaves(source, (leaf) => (
      leaf.type === 'image' ? { ...leaf, src: 'data:image/png;base64,photo' } : leaf
    ))

    expect(output).not.toBe(source)
    expect(output.slides[0]).not.toBe(source.slides[0])
    expect(output.slides[1].background).not.toBe(source.slides[1].background)
    expect(output.slides[0].nodes[0]).not.toBe(source.slides[0].nodes[0])
    expect(
      ((output.slides[0].nodes[0] as FreeformGroupNode).children[0] as FreeformSceneLeaf),
    ).toMatchObject({ src: 'data:image/png;base64,photo' })
    expect(normalizeFreeformDocumentV9(output)).toEqual(output)
    expect(source).toEqual(snapshot)
  })

  it('rejects async mapping atomically and leaves the source document unchanged', async () => {
    const source = migrateFreeformDocumentV3ToV9(v3Document([v3Slide('slide-1', [
      groupNode('outer', [imageLeaf('photo'), shapeLeaf('failing')]),
    ])]))
    if (!source) throw new Error('Expected valid migrated source')
    const snapshot = structuredClone(source)
    let exposed: FreeformDocument | undefined

    await expect(
      mapFreeformDocumentLeavesAsync(source, async (leaf) => {
        if (leaf.id === 'failing') throw new Error('conversion failed')
        return leaf
      }).then((document) => {
        exposed = document
        return document
      }),
    ).rejects.toThrow('conversion failed')

    expect(exposed).toBeUndefined()
    expect(source).toEqual(snapshot)
  })
})

describe('strict v5 freeform document contract', () => {
  it('accepts optional canonical spans on v5 text nodes and clones them', () => {
    const spans = [
      { start: 0, end: 2, bold: true },
      { start: 4, end: 6, color: '#ff0000' },
    ]
    const raw = {
      ...v4Document([v3Slide('slide-1', [textLeaf('text-1', { spans })])]),
      documentVersion: 5,
    }

    const normalized = normalizeFreeformDocumentV5(raw)

    expect(normalized).not.toBeNull()
    const node = normalized?.slides[0].nodes[0]
    if (!node || node.type !== 'text') throw new Error('expected a text node')
    expect(node.spans).toEqual(spans)
    expect(node.spans).not.toBe(spans)
  })

  it('accepts v5 text nodes without spans and omits the key', () => {
    const raw = {
      ...v4Document([v3Slide('slide-1', [textLeaf('text-1')])]),
      documentVersion: 5,
    }

    const normalized = normalizeFreeformDocumentV5(raw)

    const node = normalized?.slides[0].nodes[0]
    if (!node || node.type !== 'text') throw new Error('expected a text node')
    expect('spans' in node).toBe(false)
  })

  it('normalizes any historical version to v9 while still accepting v6 through v8 documents', () => {
    const v4 = v4Document([v3Slide('slide-1', [textLeaf('text-1')])])
    expect(normalizeFreeformDocument(v4)?.documentVersion).toBe(9)
    const v6 = { ...v4, documentVersion: 6 }
    expect(normalizeFreeformDocument(v6)?.documentVersion).toBe(9)
  })

  it.each([
    ['out of bounds', [{ start: 0, end: 11, bold: true }]],
    ['overlapping spans', [{ start: 0, end: 3, bold: true }, { start: 2, end: 5, bold: true }]],
    ['empty span array', []],
    ['non-hex color', [{ start: 0, end: 2, color: 'red' }]],
    ['unstyled span', [{ start: 0, end: 2 }]],
  ])('rejects v5 text nodes with %s', (_label, spans) => {
    const raw = {
      ...v4Document([v3Slide('slide-1', [textLeaf('text-1', { spans })])]),
      documentVersion: 5,
    }
    expect(normalizeFreeformDocumentV5(raw)).toBeNull()
  })

  it('rejects spans on v4 documents (spans are a v5 feature)', () => {
    const raw = v4Document([
      v3Slide('slide-1', [textLeaf('text-1', { spans: [{ start: 0, end: 2, bold: true }] })]),
    ])
    expect(normalizeFreeformDocumentV4(raw)).toBeNull()
    expect(normalizeFreeformDocument(raw)).toBeNull()
  })
})

describe('strict v6 freeform document contract', () => {
  it('accepts optional appearance fields on v6 leaves and clones them', () => {
    const shadow = { color: '#101828', blur: 24, offsetX: 0, offsetY: 8 }
    const raw = {
      ...v4Document([
        v3Slide('slide-1', [
          textLeaf('text-1', {
            lineHeight: 1.4,
            letterSpacing: 2,
            italic: true,
            opacity: 0.85,
            shadow,
          }),
          shapeLeaf('shape-1', { cornerRadius: 24, opacity: 0.6, shadow }),
          v4ImageLeaf('image-1', { opacity: 0.9, shadow }),
          lineLeaf('line-1', { opacity: 0.75, shadow }),
        ]),
      ]),
      documentVersion: 6,
    }

    const normalized = normalizeFreeformDocumentV6(raw)

    expect(normalized).not.toBeNull()
    const [text, shape, image, line] = normalized?.slides[0].nodes ?? []
    if (!text || text.type !== 'text') throw new Error('expected a text node')
    if (!shape || shape.type !== 'shape') throw new Error('expected a shape node')
    if (!image || image.type !== 'image') throw new Error('expected an image node')
    if (!line || line.type !== 'line') throw new Error('expected a line node')
    expect(text.lineHeight).toBe(1.4)
    expect(text.letterSpacing).toBe(2)
    expect(text.italic).toBe(true)
    expect(text.opacity).toBe(0.85)
    expect(text.shadow).toEqual(shadow)
    expect(text.shadow).not.toBe(shadow)
    expect(shape.cornerRadius).toBe(24)
    expect(shape.opacity).toBe(0.6)
    expect(shape.shadow).toEqual(shadow)
    expect(shape.shadow).not.toBe(shadow)
    expect(image.opacity).toBe(0.9)
    expect(image.shadow).not.toBe(shadow)
    expect(line.opacity).toBe(0.75)
    expect(line.shadow).not.toBe(shadow)
  })

  it('accepts v6 leaves without appearance fields and omits the keys', () => {
    const raw = {
      ...v4Document([v3Slide('slide-1', [textLeaf('text-1'), shapeLeaf('shape-1')])]),
      documentVersion: 6,
    }

    const normalized = normalizeFreeformDocumentV6(raw)

    for (const node of normalized?.slides[0].nodes ?? []) {
      if (node.type !== 'text' && node.type !== 'shape') continue
      expect('opacity' in node).toBe(false)
      expect('shadow' in node).toBe(false)
      if (node.type === 'text') {
        expect('lineHeight' in node).toBe(false)
        expect('letterSpacing' in node).toBe(false)
        expect('italic' in node).toBe(false)
      } else {
        expect('cornerRadius' in node).toBe(false)
      }
    }
  })

  it('accepts inclusive appearance bounds and rejects out-of-range values atomically', () => {
    const shadow = { color: '#000000', blur: 0, offsetX: -1000, offsetY: 1000 }
    const inclusive = {
      ...v4Document([v3Slide('slide-1', [
        textLeaf('text-1', { lineHeight: 4, letterSpacing: -50, opacity: 0, shadow }),
        shapeLeaf('shape-1', { cornerRadius: 2000, opacity: 1, shadow }),
      ])]),
      documentVersion: 6,
    }
    expect(normalizeFreeformDocumentV6(inclusive)).not.toBeNull()

    const cases: Array<[string, Record<string, unknown>]> = [
      ['negative opacity', textLeaf('text-1', { opacity: -0.01 })],
      ['opacity above one', textLeaf('text-1', { opacity: 1.01 })],
      ['lineHeight below range', textLeaf('text-1', { lineHeight: 0.49 })],
      ['lineHeight above range', textLeaf('text-1', { lineHeight: 4.01 })],
      ['letterSpacing below range', textLeaf('text-1', { letterSpacing: -50.1 })],
      ['letterSpacing above range', textLeaf('text-1', { letterSpacing: 200.1 })],
      ['italic false', textLeaf('text-1', { italic: false })],
      ['cornerRadius negative', shapeLeaf('shape-1', { cornerRadius: -1 })],
      ['cornerRadius above range', shapeLeaf('shape-1', { cornerRadius: 2001 })],
      ['shadow extra key', textLeaf('text-1', { shadow: { ...shadow, spread: 2 } })],
      ['shadow missing key', textLeaf('text-1', { shadow: { color: '#000000', blur: 4, offsetX: 0 } })],
      ['shadow non-hex color', textLeaf('text-1', { shadow: { ...shadow, color: 'black' } })],
      ['shadow blur above range', textLeaf('text-1', { shadow: { ...shadow, blur: 401 } })],
      ['shadow offset below range', shapeLeaf('shape-1', { shadow: { ...shadow, offsetX: -1000.5 } })],
      ['cornerRadius on text', textLeaf('text-1', { cornerRadius: 8 })],
      ['lineHeight on shape', shapeLeaf('shape-1', { lineHeight: 1.5 })],
    ]
    for (const [label, node] of cases) {
      const raw = {
        ...v4Document([v3Slide('slide-1', [node])]),
        documentVersion: 6,
      }
      expect(normalizeFreeformDocumentV6(raw)).toBeNull()
      expect(normalizeFreeformDocument(raw)).toBeNull()
      expect(label).toBeTruthy()
    }
  })

  it('rejects appearance fields on v5 documents (appearance is a v6 feature)', () => {
    const raw = {
      ...v4Document([v3Slide('slide-1', [textLeaf('text-1', { opacity: 0.5 })])]),
      documentVersion: 5,
    }
    expect(normalizeFreeformDocumentV5(raw)).toBeNull()
    expect(normalizeFreeformDocument(raw)).toBeNull()
  })

  it('round-trips v6 documents through the normalizer unchanged', () => {
    const raw = {
      ...v4Document([v3Slide('slide-1', [
        textLeaf('text-1', {
          spans: [{ start: 0, end: 2, bold: true }],
          lineHeight: 1.3,
          opacity: 0.9,
          shadow: { color: '#000000', blur: 12, offsetX: 0, offsetY: 4 },
        }),
        shapeLeaf('shape-1', { cornerRadius: 32 }),
      ])]),
      documentVersion: 6,
    }
    const normalized = normalizeFreeformDocumentV6(raw)
    expect(normalized).not.toBeNull()
    expect(normalizeFreeformDocumentV9(normalized)).toEqual(normalized)
  })
})

describe('strict v7 freeform document contract', () => {
  const filter = { brightness: 1.1, contrast: 1.2, saturation: 1.4, blur: 6 }
  const shadow = { color: '#101828', blur: 24, offsetX: 0, offsetY: 8 }

  it('accepts optional v7 fields on leaves and clones them', () => {
    const raw = {
      ...v4Document([
        v3Slide('slide-1', [
          textLeaf('text-1', { filter, blendMode: 'multiply' }),
          shapeLeaf('star-1', { shape: 'star', filter: { blur: 4 }, blendMode: 'screen' }),
          shapeLeaf('hex-1', { shape: 'hexagon' }),
          v4ImageLeaf('image-1', { blendMode: 'overlay' }),
          lineLeaf('line-1', { dash: 18, cap: 'butt', filter: { brightness: 0.5 } }),
        ]),
      ]),
      documentVersion: 7,
    }

    const normalized = normalizeFreeformDocumentV7(raw)

    expect(normalized).not.toBeNull()
    const [text, star, hexagon, image, line] = normalized?.slides[0].nodes ?? []
    if (!text || text.type !== 'text') throw new Error('expected a text node')
    if (!star || star.type !== 'shape') throw new Error('expected a star shape')
    if (!hexagon || hexagon.type !== 'shape') throw new Error('expected a hexagon shape')
    if (!image || image.type !== 'image') throw new Error('expected an image node')
    if (!line || line.type !== 'line') throw new Error('expected a line node')
    expect(text.filter).toEqual(filter)
    expect(text.filter).not.toBe(filter)
    expect(text.blendMode).toBe('multiply')
    expect(star.shape).toBe('star')
    expect(star.filter).toEqual({ blur: 4 })
    expect(star.blendMode).toBe('screen')
    expect(hexagon.shape).toBe('hexagon')
    expect(image.blendMode).toBe('overlay')
    expect(line.dash).toBe(18)
    expect(line.cap).toBe('butt')
    expect(line.filter).toEqual({ brightness: 0.5 })
  })

  it('accepts v7 leaves without the optional keys and omits them', () => {
    const raw = {
      ...v4Document([v3Slide('slide-1', [textLeaf('text-1'), shapeLeaf('shape-1'), lineLeaf('line-1')])]),
      documentVersion: 7,
    }

    const normalized = normalizeFreeformDocumentV7(raw)

    for (const node of normalized?.slides[0].nodes ?? []) {
      expect('filter' in node).toBe(false)
      expect('blendMode' in node).toBe(false)
      if (node.type === 'line') {
        expect('dash' in node).toBe(false)
        expect('cap' in node).toBe(false)
      }
    }
  })

  it('accepts inclusive v7 bounds and rejects invalid values atomically', () => {
    const inclusive = {
      ...v4Document([v3Slide('slide-1', [
        textLeaf('text-1', { filter: { brightness: 3, contrast: 0, saturation: 3, blur: 100 } }),
        lineLeaf('line-1', { dash: 500, cap: 'square' }),
      ])]),
      documentVersion: 7,
    }
    expect(normalizeFreeformDocumentV7(inclusive)).not.toBeNull()

    const cases: Array<[string, Record<string, unknown>]> = [
      ['empty filter object', textLeaf('text-1', { filter: {} })],
      ['filter extra key', textLeaf('text-1', { filter: { brightness: 1, hue: 90 } })],
      ['filter brightness above range', textLeaf('text-1', { filter: { brightness: 3.01 } })],
      ['filter blur above range', textLeaf('text-1', { filter: { blur: 101 } })],
      ['filter negative contrast', textLeaf('text-1', { filter: { contrast: -0.1 } })],
      ['unknown blend mode', textLeaf('text-1', { blendMode: 'dissolve' })],
      ['dash below range', lineLeaf('line-1', { dash: 0 })],
      ['dash above range', lineLeaf('line-1', { dash: 501 })],
      ['unknown cap', lineLeaf('line-1', { cap: 'flat' })],
      ['dash on text', textLeaf('text-1', { dash: 8 })],
    ]
    for (const [_label, node] of cases) {
      const raw = {
        ...v4Document([v3Slide('slide-1', [node])]),
        documentVersion: 7,
      }
      expect(normalizeFreeformDocumentV7(raw)).toBeNull()
      expect(normalizeFreeformDocument(raw)).toBeNull()
    }
  })

  it('rejects v7 fields and shapes on v6 documents (they are v7 features)', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['filter', textLeaf('text-1', { filter: { blur: 4 } })],
      ['blend mode', textLeaf('text-1', { blendMode: 'screen' })],
      ['dash', lineLeaf('line-1', { dash: 12 })],
      ['cap', lineLeaf('line-1', { cap: 'butt' })],
      ['star shape', shapeLeaf('star-1', { shape: 'star' })],
      ['hexagon shape', shapeLeaf('hex-1', { shape: 'hexagon' })],
    ]
    for (const [_label, node] of cases) {
      const raw = {
        ...v4Document([v3Slide('slide-1', [node])]),
        documentVersion: 6,
      }
      expect(normalizeFreeformDocumentV6(raw)).toBeNull()
      expect(normalizeFreeformDocument(raw)).toBeNull()
    }
  })

  it('round-trips v7 documents through the normalizer unchanged', () => {
    const raw = {
      ...v4Document([v3Slide('slide-1', [
        textLeaf('text-1', {
          spans: [{ start: 0, end: 2, bold: true }],
          lineHeight: 1.3,
          opacity: 0.9,
          shadow,
          filter: { saturation: 1.2 },
          blendMode: 'soft-light',
        }),
        shapeLeaf('shape-1', { shape: 'star', cornerRadius: 32 }),
        lineLeaf('line-1', { dash: 16, cap: 'round' }),
      ])]),
      documentVersion: 7,
    }
    const normalized = normalizeFreeformDocumentV7(raw)
    expect(normalized).not.toBeNull()
    expect(normalizeFreeformDocumentV9(normalized)).toEqual(normalized)
  })
})

describe('strict v8 freeform document contract', () => {
  const stops = [
    { offset: 0, color: '#111111' },
    { offset: 0.5, color: '#f97316' },
    { offset: 1, color: '#ffffff' },
  ]

  it('accepts text outlines and multi-stop gradients on v8 documents and clones them', () => {
    const raw = {
      ...v4Document([
        v3Slide('slide-1', [
          textLeaf('text-1', {
            stroke: '#f97316',
            strokeWidth: 3,
            textFill: { type: 'linear-gradient', stops, angle: 90 },
          }),
          shapeLeaf('shape-1', {
            fill: { type: 'linear-gradient', stops, angle: 45 },
          }),
        ]),
      ]),
      documentVersion: 8,
    }

    const normalized = normalizeFreeformDocumentV8(raw)
    expect(normalized).not.toBeNull()
    const [text, shape] = normalized?.slides[0].nodes ?? []
    if (text?.type !== 'text' || shape?.type !== 'shape') throw new Error('Expected text and shape')
    expect(text.stroke).toBe('#f97316')
    expect(text.strokeWidth).toBe(3)
    expect(text.textFill).toEqual({ type: 'linear-gradient', stops, angle: 90 })
    expect(shape.fill).toEqual({ type: 'linear-gradient', stops, angle: 45 })
    expect(normalizeFreeformDocumentV9(normalized)).toEqual(normalized)
  })

  it('rejects v8 fields on v7 documents (they are v8 features)', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['text outline', textLeaf('text-1', { stroke: '#111111', strokeWidth: 2 })],
      ['text outline width only', textLeaf('text-1', { strokeWidth: 2 })],
      [
        'stops gradient text fill',
        textLeaf('text-1', {
          textFill: { type: 'linear-gradient', stops, angle: 45 },
        }),
      ],
      [
        'stops gradient shape fill',
        shapeLeaf('shape-1', {
          fill: { type: 'linear-gradient', stops, angle: 45 },
        }),
      ],
      [
        'stops gradient page background',
        v3Slide('slide-1', [textLeaf('text-1')], {
          background: { type: 'linear-gradient', stops, angle: 45 },
        }),
      ],
    ]
    for (const [_label, node] of cases) {
      const raw = {
        ...v4Document([node]),
        documentVersion: 7,
      }
      expect(normalizeFreeformDocumentV7(raw)).toBeNull()
      expect(normalizeFreeformDocument(raw)).toBeNull()
    }
  })

  it('accepts inclusive v8 bounds and rejects invalid values atomically', () => {
    const eightStops = Array.from({ length: 8 }, (_, index) => ({
      offset: index / 7,
      color: index % 2 === 0 ? '#111111' : '#ffffff',
    }))
    const inclusive = {
      ...v4Document([v3Slide('slide-1', [
        textLeaf('text-1', { stroke: '#111111', strokeWidth: 100 }),
        textLeaf('text-2', { stroke: '#ffffff', strokeWidth: 0.5 }),
        shapeLeaf('shape-1', {
          fill: { type: 'linear-gradient', stops: eightStops, angle: 359 },
        }),
      ])]),
      documentVersion: 8,
    }
    expect(normalizeFreeformDocumentV8(inclusive)).not.toBeNull()

    const invalid: Array<[string, Record<string, unknown>]> = [
      ['non-hex stroke', textLeaf('text-1', { stroke: 'orange', strokeWidth: 2 })],
      ['zero stroke width', textLeaf('text-1', { stroke: '#111111', strokeWidth: 0 })],
      ['stroke width above range', textLeaf('text-1', { stroke: '#111111', strokeWidth: 100.5 })],
      [
        'single stop',
        textLeaf('text-1', {
          textFill: { type: 'linear-gradient', stops: [stops[0]], angle: 45 },
        }),
      ],
      [
        'nine stops',
        textLeaf('text-1', {
          textFill: {
            type: 'linear-gradient',
            stops: [...eightStops, { offset: 1.5, color: '#000000' }],
            angle: 45,
          },
        }),
      ],
      [
        'descending offsets',
        textLeaf('text-1', {
          textFill: {
            type: 'linear-gradient',
            stops: [{ offset: 0.7, color: '#111111' }, { offset: 0.3, color: '#ffffff' }],
            angle: 45,
          },
        }),
      ],
      [
        'equal offsets',
        textLeaf('text-1', {
          textFill: {
            type: 'linear-gradient',
            stops: [{ offset: 0.5, color: '#111111' }, { offset: 0.5, color: '#ffffff' }],
            angle: 45,
          },
        }),
      ],
      [
        'offset below range',
        textLeaf('text-1', {
          textFill: {
            type: 'linear-gradient',
            stops: [{ offset: -0.1, color: '#111111' }, { offset: 1, color: '#ffffff' }],
            angle: 45,
          },
        }),
      ],
      [
        'offset above range',
        textLeaf('text-1', {
          textFill: {
            type: 'linear-gradient',
            stops: [{ offset: 0, color: '#111111' }, { offset: 1.1, color: '#ffffff' }],
            angle: 45,
          },
        }),
      ],
      [
        'stop extra key',
        textLeaf('text-1', {
          textFill: {
            type: 'linear-gradient',
            stops: [{ offset: 0, color: '#111111', extra: 1 }, { offset: 1, color: '#ffffff' }],
            angle: 45,
          },
        }),
      ],
      [
        'non-hex stop color',
        textLeaf('text-1', {
          textFill: {
            type: 'linear-gradient',
            stops: [{ offset: 0, color: 'red' }, { offset: 1, color: '#ffffff' }],
            angle: 45,
          },
        }),
      ],
      [
        'stops alongside from and to',
        textLeaf('text-1', {
          textFill: {
            type: 'linear-gradient',
            from: '#111111',
            to: '#ffffff',
            stops,
            angle: 45,
          },
        }),
      ],
    ]
    for (const [_label, node] of invalid) {
      const raw = {
        ...v4Document([v3Slide('slide-1', [node])]),
        documentVersion: 8,
      }
      expect(normalizeFreeformDocumentV8(raw)).toBeNull()
      expect(normalizeFreeformDocument(raw)).toBeNull()
    }
  })

  it('maps leaves while preserving every optional appearance field', async () => {
    const source = normalizeFreeformDocumentV8({
      ...v4Document([v3Slide('slide-1', [
        textLeaf('text-1', {
          spans: [{ start: 0, end: 2, bold: true }],
          lineHeight: 1.4,
          letterSpacing: 2,
          italic: true,
          opacity: 0.85,
          shadow: { color: '#101828', blur: 18, offsetX: 0, offsetY: 6 },
          filter: { brightness: 1.1 },
          blendMode: 'multiply',
          stroke: '#111111',
          strokeWidth: 2,
          textFill: { type: 'linear-gradient', stops, angle: 90 },
        }),
        shapeLeaf('shape-1', {
          cornerRadius: 24,
          opacity: 0.9,
          fill: { type: 'linear-gradient', stops, angle: 45 },
        }),
        lineLeaf('line-1', { dash: 14, cap: 'butt', opacity: 0.7 }),
      ])]),
      documentVersion: 8,
    })
    if (!source) throw new Error('Expected valid v8 source')

    const output = mapFreeformDocumentLeaves(source, (leaf) => leaf)
    expect(output.slides[0].nodes).toEqual(source.slides[0].nodes)
    expect(normalizeFreeformDocumentV9(output)).toEqual(output)

    const asyncOutput = await mapFreeformDocumentLeavesAsync(source, async (leaf) => leaf)
    expect(asyncOutput.slides[0].nodes).toEqual(source.slides[0].nodes)
  })
})

describe('strict v9 freeform document contract', () => {
  it('accepts vertical text on v9 documents and rejects it on v8 inputs', () => {
    const raw = {
      ...v4Document([v3Slide('slide-1', [
        textLeaf('text-1', { vertical: true, italic: true }),
      ])]),
      documentVersion: 9,
    }

    const normalized = normalizeFreeformDocumentV9(raw)
    expect(normalized).not.toBeNull()
    const [text] = normalized?.slides[0].nodes ?? []
    expect(text).toMatchObject({ vertical: true, italic: true })
    expect(normalizeFreeformDocumentV9(normalized)).toEqual(normalized)

    const legacy = { ...v4Document([v3Slide('slide-1', [textLeaf('text-1', { vertical: true })])]), documentVersion: 8 }
    expect(normalizeFreeformDocumentV8(legacy)).toBeNull()
    expect(normalizeFreeformDocument(legacy)).toBeNull()
  })

  it('rejects non-true vertical values and vertical on non-text leaves', () => {
    const invalid: Array<[string, Record<string, unknown>]> = [
      ['vertical false', textLeaf('text-1', { vertical: false })],
      ['vertical string', textLeaf('text-1', { vertical: 'yes' })],
      ['vertical on shape', shapeLeaf('shape-1', { vertical: true })],
      ['vertical on line', lineLeaf('line-1', { vertical: true })],
    ]
    for (const [_label, node] of invalid) {
      const raw = {
        ...v4Document([v3Slide('slide-1', [node])]),
        documentVersion: 9,
      }
      expect(normalizeFreeformDocumentV9(raw)).toBeNull()
      expect(normalizeFreeformDocument(raw)).toBeNull()
    }
  })
})
