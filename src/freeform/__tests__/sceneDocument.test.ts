import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  MAX_EFFECTIVE_SCALE,
  MAX_FREEFORM_SLIDES,
  MAX_SCENE_DEPTH,
  MAX_SCENE_NODES_PER_SLIDE,
  MIN_EFFECTIVE_SCALE,
} from '../constants'
import {
  mapFreeformDocumentV3Leaves,
  mapFreeformDocumentV3LeavesAsync,
  migrateLegacyFreeformDocumentToV3,
  normalizeFreeformDocumentToV3,
  normalizeFreeformDocumentV3,
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
  FreeformDocumentV3,
  FreeformGroupNode,
  FreeformSceneLeaf,
  FreeformSceneNode,
  FreeformSlide,
  FreeformSlideV3,
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

function nestedGroups(depth: number): unknown {
  let node: unknown = textLeaf(`node-${depth}`)
  for (let level = depth - 1; level >= 1; level -= 1) {
    node = groupNode(`node-${level}`, [node])
  }
  return node
}

describe('additive freeform v3 types and limits', () => {
  it('uses v3 scene types for the shipping aliases and compatibility names', () => {
    expectTypeOf<FreeformDocument['documentVersion']>().toEqualTypeOf<3>()
    expectTypeOf<FreeformSlide>().toHaveProperty('nodes')
    expectTypeOf<FreeformDocumentV3['documentVersion']>().toEqualTypeOf<3>()
    expectTypeOf<FreeformSlideV3>().toHaveProperty('nodes')
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

    const migrated = migrateLegacyFreeformDocumentToV3(raw)

    expect(raw).toEqual(snapshot)
    expect(migrated).not.toBeNull()
    expect(migrated?.documentVersion).toBe(3)
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
    const migrated = migrateLegacyFreeformDocumentToV3(
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

    const first = migrateLegacyFreeformDocumentToV3(raw)
    const second = migrateLegacyFreeformDocumentToV3(structuredClone(raw))

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

    const migrated = migrateLegacyFreeformDocumentToV3(raw)

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
    const migrated = migrateLegacyFreeformDocumentToV3(
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
    const migrated = migrateLegacyFreeformDocumentToV3(
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

    const migrated = migrateLegacyFreeformDocumentToV3(raw)

    expect(migrated?.slides).toHaveLength(1)
    expect(migrated?.activeSlideId).toBe('good')
    expect(migrated?.slides[0].nodes).toEqual([
      expect.objectContaining({ id: 'negative', x: -25, y: -40, scale: 1 }),
    ])
  })

  it('keeps a valid legacy page as a blank scene when all its elements are damaged', () => {
    const migrated = migrateLegacyFreeformDocumentToV3(
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
    const migrated = migrateLegacyFreeformDocumentToV3(
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
    const migrated = migrateLegacyFreeformDocumentToV3(
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
    expect(normalizeFreeformDocumentV3(migrated)).toEqual(migrated)
  })

  it('fails when every legacy page is invalid', () => {
    expect(
      migrateLegacyFreeformDocumentToV3(
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

    expect(migrateLegacyFreeformDocumentToV3(legacyDocument(tooManyPages))).toBeNull()
    expect(
      migrateLegacyFreeformDocumentToV3(
        legacyDocument([legacySlide('slide-1', tooManyElements)]),
      ),
    ).toBeNull()
  })

  it('round-trips migrated IDs, order, and node count through the strict reader', () => {
    const migrated = migrateLegacyFreeformDocumentToV3(
      legacyDocument([
        legacySlide('slide-1', [legacyText(''), legacyText('same'), legacyText('same')]),
        legacySlide('slide-2', [legacyText('same')]),
      ]),
    )
    const reread = normalizeFreeformDocumentV3(JSON.parse(JSON.stringify(migrated)))

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

    const normalized = normalizeFreeformDocumentV3(raw)

    expect(normalized).toEqual(raw)
    expect(normalized).not.toBe(raw)
    expect(normalized?.slides[1]).not.toBe(raw.slides[1])
    expect(raw).toEqual(snapshot)
  })

  it('dispatches v1, v2, and v3 inputs while rejecting unknown versions', () => {
    const v1 = legacyDocument([legacySlide('slide-1')], 'slide-1', 1)
    const v2 = legacyDocument([legacySlide('slide-1')])
    const v3 = v3Document()

    expect(normalizeFreeformDocumentToV3(v1)?.documentVersion).toBe(3)
    expect(normalizeFreeformDocumentToV3(v2)?.documentVersion).toBe(3)
    expect(normalizeFreeformDocumentToV3(v3)).toEqual(v3)
    expect(normalizeFreeformDocumentToV3({ ...v3, documentVersion: 4 })).toBeNull()
    expect(normalizeFreeformDocumentToV3(null)).toBeNull()
  })

  it('accepts string node names verbatim, including empty and whitespace-only names', () => {
    const raw = v3Document([
      v3Slide('slide-1', [
        textLeaf('empty-name', { name: '' }),
        groupNode('whitespace-name', [textLeaf('child')], { name: '   ' }),
      ]),
    ])

    const normalized = normalizeFreeformDocumentV3(raw)

    expect(normalized).not.toBeNull()
    expect(normalized?.slides[0].nodes[0].name).toBe('')
    expect(normalized?.slides[0].nodes[1].name).toBe('   ')
    expect(normalized).toEqual(raw)
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

    expect(normalizeFreeformDocumentV3(raw)).toBeNull()
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
    expect(normalizeFreeformDocumentV3(v3Document([v3Slide('slide-1', [node])]))).toBeNull()
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

    expect(normalizeFreeformDocumentV3(v3Document([v3Slide('slide-1', [minimum, maximum])]))).not.toBeNull()
    expect(normalizeFreeformDocumentV3(v3Document([v3Slide('slide-1', [tooSmall])]))).toBeNull()
    expect(normalizeFreeformDocumentV3(v3Document([v3Slide('slide-1', [tooLarge])]))).toBeNull()
    expect(normalizeFreeformDocumentV3(v3Document([v3Slide('slide-1', [overflow])]))).toBeNull()
  })

  it('allows local scales outside the shared range when every cumulative world scale is in range', () => {
    const growChild = groupNode('minimum-parent', [textLeaf('grow-child', { scale: 1e8 })], {
      scale: MIN_EFFECTIVE_SCALE,
    })
    const shrinkChild = groupNode('maximum-parent', [textLeaf('shrink-child', { scale: 1e-8 })], {
      scale: MAX_EFFECTIVE_SCALE,
    })

    const normalized = normalizeFreeformDocumentV3(
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
    expect(normalizeFreeformDocumentV3(v3Document([v3Slide('slide-1', [node])]))).toBeNull()
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

describe('immutable v3 document leaf mapping', () => {
  it('maps nested leaves across slides while owning slides, backgrounds, groups, and leaves', () => {
    const source = v3Document([
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
    ]) as FreeformDocumentV3
    const snapshot = structuredClone(source)

    const output = mapFreeformDocumentV3Leaves(source, (leaf) => (
      leaf.type === 'image' ? { ...leaf, src: 'data:image/png;base64,photo' } : leaf
    ))

    expect(output).not.toBe(source)
    expect(output.slides[0]).not.toBe(source.slides[0])
    expect(output.slides[1].background).not.toBe(source.slides[1].background)
    expect(output.slides[0].nodes[0]).not.toBe(source.slides[0].nodes[0])
    expect(
      ((output.slides[0].nodes[0] as FreeformGroupNode).children[0] as FreeformSceneLeaf),
    ).toMatchObject({ src: 'data:image/png;base64,photo' })
    expect(normalizeFreeformDocumentV3(output)).toEqual(output)
    expect(source).toEqual(snapshot)
  })

  it('rejects async mapping atomically and leaves the source document unchanged', async () => {
    const source = v3Document([v3Slide('slide-1', [
      groupNode('outer', [imageLeaf('photo'), shapeLeaf('failing')]),
    ])]) as FreeformDocumentV3
    const snapshot = structuredClone(source)
    let exposed: FreeformDocumentV3 | undefined

    await expect(
      mapFreeformDocumentV3LeavesAsync(source, async (leaf) => {
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
