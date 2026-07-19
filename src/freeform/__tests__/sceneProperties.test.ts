import { describe, expect, it } from 'vitest'

import { MAX_EFFECTIVE_SCALE, MAX_SCENE_DEPTH, MIN_EFFECTIVE_SCALE } from '../constants'
import { reduceFreeformDocumentV3 } from '../document'
import {
  scenePropertiesForPath,
  scenePropertyMutation,
  type SceneProperties,
  type ScenePropertyEdit,
  type ScenePropertyMutationSuccess,
} from '../sceneProperties'
import {
  SCENE_EPSILON,
  identity,
  multiply,
  sceneNodeLocalMatrix,
  transformPoint,
} from '../sceneTransform'
import { findNodeAtPath } from '../sceneTree'
import type { Matrix2D, Point } from '../sceneTransform'
import type {
  FreeformDocument,
  FreeformGroupNode,
  FreeformSceneNode,
  FreeformShapeElement,
  FreeformTextElement,
  ScenePath,
} from '../types'

function shape(
  id: string,
  overrides: Partial<FreeformShapeElement> = {},
): FreeformShapeElement {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'shape',
    x: 10,
    y: 20,
    width: 100,
    height: 40,
    rotation: 0,
    scale: 1,
    shape: 'rect',
    fill: { type: 'solid', color: '#ffffff' },
    stroke: '#111111',
    strokeWidth: 4,
    ...overrides,
  }
}

function text(
  id: string,
  overrides: Partial<FreeformTextElement> = {},
): FreeformTextElement {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'text',
    x: 10,
    y: 20,
    width: 100,
    height: 40,
    rotation: 0,
    scale: 1,
    text: id,
    fontSize: 12,
    fontFamily: 'system-ui',
    textFill: { type: 'solid', color: '#111111' },
    align: 'left',
    fontWeight: 'normal',
    ...overrides,
  }
}

function group(
  id: string,
  children: FreeformSceneNode[],
  overrides: Partial<FreeformGroupNode> = {},
): FreeformGroupNode {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'group',
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    children,
    ...overrides,
  }
}

function documentWith(nodes: FreeformSceneNode[]): FreeformDocument {
  return {
    documentVersion: 3,
    activeSlideId: 'slide',
    slides: [{
      id: 'slide',
      name: 'Slide',
      width: 1080,
      height: 1080,
      background: { type: 'solid', color: '#ffffff' },
      nodes,
    }],
  }
}

function readProperties(nodes: readonly FreeformSceneNode[], path: ScenePath): SceneProperties {
  const result = scenePropertiesForPath(nodes, path)
  if (!result.ok) throw new Error(`property read failed: ${result.reason}`)
  return result.properties
}

function mutate(
  nodes: FreeformSceneNode[],
  path: ScenePath,
  edit: ScenePropertyEdit,
): { nodes: FreeformSceneNode[]; mutation: ScenePropertyMutationSuccess } {
  const mutation = scenePropertyMutation(nodes, path, edit)
  if (!mutation.ok) throw new Error(`property mutation failed: ${mutation.reason}`)
  if (!mutation.update) return { nodes, mutation }
  const document = documentWith(nodes)
  const next = mutation.category === 'geometry'
    ? reduceFreeformDocumentV3(document, {
        type: 'node/update-geometry',
        slideId: 'slide',
        updates: [mutation.update],
      })
    : reduceFreeformDocumentV3(document, {
        type: 'node/update-style',
        slideId: 'slide',
        updates: [mutation.update],
      })
  return { nodes: next.slides[0].nodes, mutation }
}

function nodeWorldMatrix(nodes: readonly FreeformSceneNode[], path: ScenePath): Matrix2D {
  let children = nodes
  let world = identity()
  for (const id of path) {
    const node = children.find((candidate) => candidate.id === id)
    if (!node) throw new Error('unknown path')
    world = multiply(world, sceneNodeLocalMatrix(node))
    children = node.type === 'group' ? node.children : []
  }
  return world
}

function leafCorners(nodes: readonly FreeformSceneNode[], path: ScenePath): Point[] {
  const node = findNodeAtPath(nodes, path)
  if (!node || node.type === 'group') throw new Error('leaf missing')
  const world = nodeWorldMatrix(nodes, path)
  return [
    { x: 0, y: 0 },
    { x: node.width, y: 0 },
    { x: node.width, y: node.height },
    { x: 0, y: node.height },
  ].map((point) => transformPoint(world, point))
}

function expectPointsClose(actual: readonly Point[], expected: readonly Point[]): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index].x, 6)
    expect(point.y).toBeCloseTo(expected[index].y, 6)
  })
}

function rotatedScene() {
  const editableLeaf = text('leaf', {
    x: 10,
    y: 20,
    width: 100,
    height: 40,
    rotation: 30,
    scale: 1.5,
    fontSize: 12,
  })
  const sibling = shape('sibling', { x: -80, y: -45, width: 30, height: 24 })
  return [group('parent', [editableLeaf, sibling], {
    x: 200,
    y: 150,
    rotation: 90,
    scale: 2,
  })]
}

describe('scene property coordinates', () => {
  it('reads leaf geometry and visual style from the complete world transform', () => {
    const nodes = rotatedScene()
    const path = ['parent', 'leaf']
    const properties = readProperties(nodes, path)
    const leaf = findNodeAtPath(nodes, path)
    const world = nodeWorldMatrix(nodes, path)
    if (!leaf || leaf.type !== 'text' || properties.kind !== 'leaf') throw new Error('fixture')
    const center = transformPoint(world, { x: leaf.width / 2, y: leaf.height / 2 })

    expect(properties.worldScale).toBeCloseTo(3)
    expect(properties.width).toBeCloseTo(300)
    expect(properties.height).toBeCloseTo(120)
    expect(properties.x).toBeCloseTo(center.x - 150)
    expect(properties.y).toBeCloseTo(center.y - 60)
    expect(properties.rotation).toBeCloseTo(120)
    expect(properties.fontSize).toBeCloseTo(36)
    expect(properties.breadcrumbs.map((item) => item.name)).toEqual(['页面', 'parent'])
  })

  it('round-trips a single page axis through reducer recentering without moving its sibling', () => {
    const nodes = rotatedScene()
    const path = ['parent', 'leaf']
    const before = readProperties(nodes, path)
    const siblingBefore = leafCorners(nodes, ['parent', 'sibling'])
    const result = mutate(nodes, path, { property: 'x', value: before.x + 47.25 })
    const after = readProperties(result.nodes, path)

    expect(after.x).toBeCloseTo(before.x + 47.25, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
    expect(after.width).toBeCloseTo(before.width, 6)
    expectPointsClose(leafCorners(result.nodes, ['parent', 'sibling']), siblingBefore)
  })

  it.each([
    ['width', 360],
    ['height', 144],
  ] as const)('round-trips leaf %s while preserving page x/y', (property, value) => {
    const nodes = rotatedScene()
    const path = ['parent', 'leaf']
    const before = readProperties(nodes, path)
    const result = mutate(nodes, path, { property, value })
    const after = readProperties(result.nodes, path)

    expect(after[property]).toBeCloseTo(value, 6)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('uses world scale for font and stroke writes', () => {
    const nodes = rotatedScene()
    const fontResult = mutate(nodes, ['parent', 'leaf'], { property: 'fontSize', value: 48 })
    const fontNode = findNodeAtPath(fontResult.nodes, ['parent', 'leaf'])
    expect(fontNode?.type === 'text' ? fontNode.fontSize : null).toBeCloseTo(16)
    expect(readProperties(fontResult.nodes, ['parent', 'leaf'])).toMatchObject({ fontSize: 48 })

    const strokeNodes = [group('parent', [shape('shape', { scale: 1.5, strokeWidth: 4 })], {
      scale: 2,
    })]
    const strokeResult = mutate(strokeNodes, ['parent', 'shape'], {
      property: 'strokeWidth',
      value: 18,
    })
    const strokeNode = findNodeAtPath(strokeResult.nodes, ['parent', 'shape'])
    expect(strokeNode?.type === 'shape' ? strokeNode.strokeWidth : null).toBeCloseTo(6)
  })

  it.each([
    [-180, 180],
    [180, 180],
    [270, 270],
    [360, 0],
    [720, 0],
  ])('normalizes requested world rotation %s to %s', (requested, expected) => {
    const nodes = [group('parent', [shape('leaf', { rotation: 20 })], { rotation: 350 })]
    const result = mutate(nodes, ['parent', 'leaf'], { property: 'rotation', value: requested })
    expect(result.mutation.resolvedValue).toBeCloseTo(expected)
    expect(readProperties(result.nodes, ['parent', 'leaf']).rotation).toBeCloseTo(expected)
  })

  it('keeps equivalent grouped and flattened leaf properties stable', () => {
    const source = [
      text('first', { x: 0, y: 0, scale: 1.25, fontSize: 16 }),
      shape('second', { x: 160, y: 20, scale: 0.75 }),
    ]
    const groupedDocument = reduceFreeformDocumentV3(documentWith(source), {
      type: 'group/create',
      slideId: 'slide',
      parentPath: [],
      nodeIds: ['first', 'second'],
      groupId: 'created-group',
    })
    const grouped = readProperties(groupedDocument.slides[0].nodes, ['created-group', 'first'])
    const flattenedDocument = reduceFreeformDocumentV3(groupedDocument, {
      type: 'group/ungroup',
      slideId: 'slide',
      parentPath: [],
      groupIds: ['created-group'],
      mode: 'one-level',
    })
    const flattened = readProperties(flattenedDocument.slides[0].nodes, ['first'])

    expect(flattened).toMatchObject({
      x: expect.closeTo(grouped.x, 6),
      y: expect.closeTo(grouped.y, 6),
      width: expect.closeTo(grouped.width, 6),
      height: expect.closeTo(grouped.height, 6),
      rotation: expect.closeTo(grouped.rotation, 6),
      fontSize: expect.closeTo(grouped.kind === 'leaf' ? grouped.fontSize ?? 0 : 0, 6),
    })
  })
})

describe('scene group properties', () => {
  function nonCenteredGroup(hiddenSecond = true) {
    return group('editable', [
      shape('first', { x: 10, y: 20, width: 100, height: 40 }),
      shape('second', {
        x: 180,
        y: -30,
        width: 60,
        height: 80,
        rotation: 10,
        scale: 0.8,
        hidden: hiddenSecond,
      }),
    ], {
      x: 40,
      y: 60,
      rotation: 25,
      scale: 1.2,
    })
  }

  it('reads a non-centered group without mutating or canonicalizing it', () => {
    const editable = nonCenteredGroup()
    const nodes = [group('parent', [editable], { x: 300, y: 220, rotation: 35, scale: 1.25 })]
    const snapshot = structuredClone(nodes)
    const properties = readProperties(nodes, ['parent', 'editable'])

    expect(properties.kind).toBe('group')
    expect(properties.editability).toEqual({ kind: 'editable' })
    expect(nodes).toEqual(snapshot)
    expect(nodes[0]).toBe(nodes[0])
    expect((nodes[0] as FreeformGroupNode).children[0]).toBe(editable)
  })

  it('includes hidden descendants in stable group bounds', () => {
    const hidden = readProperties([nonCenteredGroup(true)], ['editable'])
    const visible = readProperties([nonCenteredGroup(false)], ['editable'])

    expect(hidden.width).toBeCloseTo(visible.width, 6)
    expect(hidden.height).toBeCloseTo(visible.height, 6)
    expect(hidden.x).toBeCloseTo(visible.x, 6)
    expect(hidden.y).toBeCloseTo(visible.y, 6)
  })

  it.each([
    { property: 'x', offset: 33 },
    { property: 'y', offset: -27 },
    { property: 'rotation', value: 330 },
    { property: 'width', factor: 1.4 },
    { property: 'height', factor: 0.75 },
    { property: 'scalePercent', factor: 1.25 },
  ] as const)('round-trips a non-centered group $property with one path update', (edit) => {
    const nodes = [group('parent', [nonCenteredGroup()], {
      x: 300,
      y: 220,
      rotation: 35,
      scale: 1.25,
    })]
    const path = ['parent', 'editable']
    const before = readProperties(nodes, path)
    if (before.kind !== 'group') throw new Error('fixture')
    const value = edit.value !== undefined
      ? edit.value
      : edit.offset !== undefined
        ? before[edit.property] + edit.offset
        : before[edit.property] * edit.factor!
    const result = mutate(nodes, path, { property: edit.property, value })
    const after = readProperties(result.nodes, path)
    if (after.kind !== 'group') throw new Error('fixture')

    expect(after[edit.property]).toBeCloseTo(result.mutation.resolvedValue, 6)
    if (edit.property !== 'x') expect(after.x).toBeCloseTo(before.x, 6)
    if (edit.property !== 'y') expect(after.y).toBeCloseTo(before.y, 6)
    if (edit.property === 'width' || edit.property === 'height') {
      expect(after.width / after.height).toBeCloseTo(before.width / before.height, 6)
    }
  })

  it('clamps group scale against every current world effective scale before compensation', () => {
    const nodes = [group('ancestor', [group('editable', [shape('leaf', { scale: 100 })], {
      scale: 1,
    })], { scale: 0.01 })]
    const path = ['ancestor', 'editable']

    const high = mutate(nodes, path, { property: 'scalePercent', value: 1e9 })
    const highProperties = readProperties(high.nodes, path)
    expect(high.mutation.clamped).toBe(true)
    expect(high.mutation.resolvedValue).toBeCloseTo(10_000)
    expect(highProperties.kind === 'group' ? highProperties.scalePercent : 0).toBeCloseTo(10_000)

    const low = mutate(nodes, path, { property: 'scalePercent', value: 0.000001 })
    const lowProperties = readProperties(low.nodes, path)
    expect(low.mutation.clamped).toBe(true)
    expect(low.mutation.resolvedValue).toBeCloseTo(0.01)
    expect(lowProperties.kind === 'group' ? lowProperties.scalePercent : 0).toBeCloseTo(0.01)
  })

  it('preserves external sibling corners while recentering three ancestor levels', () => {
    const target = nonCenteredGroup(false)
    const nodes = [group('level-1', [
      shape('level-1-sibling', { x: -140, y: 60, locked: true }),
      group('level-2', [
        shape('level-2-sibling', { x: 220, y: -80 }),
        group('level-3', [
          shape('level-3-sibling', { x: -200, y: -110 }),
          target,
        ], { x: 40, y: 30, rotation: 17, scale: 0.9 }),
      ], { x: 80, y: 70, rotation: 23, scale: 1.1 }),
    ], { x: 420, y: 360, rotation: 31, scale: 1.2 })]
    const path = ['level-1', 'level-2', 'level-3', 'editable']
    const siblingPaths = [
      ['level-1', 'level-1-sibling'],
      ['level-1', 'level-2', 'level-2-sibling'],
      ['level-1', 'level-2', 'level-3', 'level-3-sibling'],
    ]
    const before = siblingPaths.map((siblingPath) => leafCorners(nodes, siblingPath))
    const properties = readProperties(nodes, path)
    const result = mutate(nodes, path, { property: 'width', value: properties.width * 1.3 })

    siblingPaths.forEach((siblingPath, index) => {
      expectPointsClose(leafCorners(result.nodes, siblingPath), before[index])
    })
  })

  it('uses stored scale products at a deep rotated maximum-scale boundary', () => {
    let selected: FreeformSceneNode = group('editable', [shape('leaf')], { scale: 1 })
    const path = Array.from({ length: 12 }, (_, index) => `ancestor-${index + 1}`)
    for (let index = path.length - 1; index >= 0; index -= 1) {
      selected = group(path[index], [selected], {
        rotation: 13 + index,
        scale: index % 2 === 0 ? 1.25 : 0.8,
      })
    }
    const selectedPath = [...path, 'editable']
    const nodes = [selected]
    const result = mutate(nodes, selectedPath, {
      property: 'scalePercent',
      value: MAX_EFFECTIVE_SCALE * 100,
    })
    const properties = readProperties(result.nodes, selectedPath)

    expect(result.nodes).not.toBe(nodes)
    expect(properties.kind === 'group' ? properties.scalePercent : 0)
      .toBeLessThanOrEqual(MAX_EFFECTIVE_SCALE * 100)
  })

  it('backs away from an upper clamp endpoint when reducer multiplication rounds upward', () => {
    const nodes = [group('ancestor', [group('editable', [shape('leaf')], {
      scale: 0.9197213622456715,
    })], { scale: 2.2439877722704304 })]
    const result = mutate(nodes, ['ancestor', 'editable'], {
      property: 'scalePercent',
      value: MAX_EFFECTIVE_SCALE * 100,
    })
    const properties = readProperties(result.nodes, ['ancestor', 'editable'])

    expect(result.nodes).not.toBe(nodes)
    expect(properties.kind === 'group' ? properties.scalePercent : 0)
      .toBeLessThanOrEqual(MAX_EFFECTIVE_SCALE * 100)
  })

  it.each(['width', 'height', 'scalePercent'] as const)(
    'reports a tiny request beyond the current upper clamp as a clamped no-op for %s',
    (property) => {
      const nodes = [group('editable', [shape('leaf')], { scale: MAX_EFFECTIVE_SCALE })]
      const before = readProperties(nodes, ['editable'])
      if (before.kind !== 'group') throw new Error('fixture')
      const result = mutate(nodes, ['editable'], {
        property,
        value: before[property] + SCENE_EPSILON / 2,
      })

      expect(result.mutation).toMatchObject({
        update: null,
        resolvedValue: before[property],
        clamped: true,
      })
    },
  )

  it.each(['width', 'height', 'scalePercent'] as const)(
    'reports a tiny request beyond the current lower clamp as a clamped no-op for %s',
    (property) => {
      const nodes = [group('editable', [shape('leaf')], { scale: MIN_EFFECTIVE_SCALE })]
      const before = readProperties(nodes, ['editable'])
      if (before.kind !== 'group') throw new Error('fixture')
      const result = mutate(nodes, ['editable'], {
        property,
        value: before[property] - SCENE_EPSILON / 2,
      })

      expect(result.mutation).toMatchObject({
        update: null,
        resolvedValue: before[property],
        clamped: true,
      })
    },
  )

  it('does not swallow a visible change near the upper bound', () => {
    const nodes = [group('editable', [shape('leaf')], {
      scale: MAX_EFFECTIVE_SCALE - 0.005,
    })]
    const before = readProperties(nodes, ['editable'])
    if (before.kind !== 'group') throw new Error('fixture')
    const result = mutate(nodes, ['editable'], {
      property: 'scalePercent',
      value: MAX_EFFECTIVE_SCALE * 100,
    })

    expect(result.mutation.update).not.toBeNull()
    const after = readProperties(result.nodes, ['editable'])
    expect(after.kind === 'group' ? after.scalePercent : 0)
      .toBeGreaterThan(before.scalePercent)
  })

  it('does not rewrite a large endpoint when the requested page width is unchanged', () => {
    const nodes = [group('editable', [shape('leaf', { width: 1e9 })], {
      scale: MAX_EFFECTIVE_SCALE,
    })]
    const before = readProperties(nodes, ['editable'])
    if (before.kind !== 'group') throw new Error('fixture')
    const result = mutate(nodes, ['editable'], {
      property: 'width',
      value: before.width,
    })

    expect(result.mutation).toMatchObject({
      update: null,
      resolvedValue: before.width,
      clamped: false,
    })
  })

  it.each([50, 200])(
    'keeps endpoint safety inside an extremely narrow valid ratio range for %s%%',
    (requestedScalePercent) => {
      const nearMaximum = MAX_EFFECTIVE_SCALE - Number.EPSILON * MAX_EFFECTIVE_SCALE
      const nodes = [group('editable', [
        shape('minimum-child', { scale: MIN_EFFECTIVE_SCALE }),
        shape('maximum-child', { scale: nearMaximum }),
      ])]
      const before = readProperties(nodes, ['editable'])
      if (before.kind !== 'group') throw new Error('fixture')
      const result = mutate(nodes, ['editable'], {
        property: 'scalePercent',
        value: requestedScalePercent,
      })

      expect(result.nodes).toBe(nodes)
      expect(result.mutation).toMatchObject({
        update: null,
        resolvedValue: before.scalePercent,
        clamped: true,
      })
    },
  )

  it('preserves tiny local scale edits when a large ancestor keeps world scale valid', () => {
    const nodes = [group('ancestor', [
      group('editable', [shape('leaf')], { scale: 1e-8 }),
    ], { scale: 1e4 })]
    const path = ['ancestor', 'editable']
    const before = readProperties(nodes, path)
    if (before.kind !== 'group') throw new Error('fixture')
    expect(before.scalePercent).toBeCloseTo(MIN_EFFECTIVE_SCALE * 100, 8)
    const result = mutate(nodes, path, {
      property: 'scalePercent',
      value: before.scalePercent * 2,
    })

    expect(result.mutation.update).not.toBeNull()
    const after = readProperties(result.nodes, path)
    expect(after.kind === 'group' ? after.scalePercent : 0)
      .toBeCloseTo(before.scalePercent * 2, 8)
  })
})

describe('scene property contracts', () => {
  it('distinguishes editable, effective lock, and locked descendant state', () => {
    const nodes = [
      shape('editable'),
      group('locked-parent', [shape('inherited')], { locked: true }),
      group('contains-lock', [shape('locked-child', { locked: true }), shape('other')]),
    ]

    expect(readProperties(nodes, ['editable']).editability).toEqual({ kind: 'editable' })
    expect(readProperties(nodes, ['locked-parent', 'inherited']).editability).toMatchObject({
      kind: 'locked',
      sourcePath: ['locked-parent'],
    })
    expect(readProperties(nodes, ['contains-lock']).editability).toMatchObject({
      kind: 'locked-descendant',
      sourcePath: ['contains-lock', 'locked-child'],
    })
    expect(scenePropertyMutation(nodes, ['locked-parent', 'inherited'], {
      property: 'x',
      value: 20,
    })).toEqual({ ok: false, reason: 'locked' })
    expect(scenePropertyMutation(nodes, ['contains-lock'], {
      property: 'rotation',
      value: 20,
    })).toEqual({ ok: false, reason: 'locked-descendant' })
  })

  it('returns a successful null update for normalized no-ops', () => {
    const nodes = [shape('leaf', { rotation: 0 })]
    const result = scenePropertyMutation(nodes, ['leaf'], { property: 'rotation', value: 720 })

    expect(result).toMatchObject({
      ok: true,
      update: null,
      resolvedValue: 0,
      clamped: false,
    })
  })

  it('treats equivalent rotations across the 360-degree boundary as a no-op', () => {
    const result = scenePropertyMutation([shape('leaf', { rotation: 0 })], ['leaf'], {
      property: 'rotation',
      value: 359.9999999,
    })

    expect(result).toMatchObject({ ok: true, update: null, resolvedValue: 0 })
  })

  it.each([
    [{ property: 'x', value: Number.NaN }, 'invalid-value'],
    [{ property: 'y', value: Number.POSITIVE_INFINITY }, 'invalid-value'],
    [{ property: 'width', value: 0 }, 'invalid-value'],
    [{ property: 'height', value: -1 }, 'invalid-value'],
    [{ property: 'fontSize', value: 0 }, 'invalid-value'],
    [{ property: 'scalePercent', value: 100 }, 'unsupported-property'],
  ] as const)('rejects invalid or unsupported edit %#', (edit, reason) => {
    expect(scenePropertyMutation([text('leaf')], ['leaf'], edit)).toEqual({ ok: false, reason })
  })

  it('returns stable failures for unknown and invalid scenes without throwing', () => {
    expect(scenePropertiesForPath([shape('leaf')], ['missing'])).toEqual({
      ok: false,
      reason: 'unknown-path',
    })
    expect(scenePropertiesForPath([group('empty', [])], ['empty'])).toEqual({
      ok: false,
      reason: 'invalid-transform',
    })
    expect(scenePropertiesForPath([
      group('overflow-parent', [shape('overflow', { x: Number.MAX_VALUE })], {
        x: Number.MAX_VALUE,
      }),
    ], ['overflow-parent', 'overflow'])).toEqual({
      ok: false,
      reason: 'invalid-transform',
    })
    expect(scenePropertiesForPath([shape('leaf')], null as unknown as ScenePath)).toEqual({
      ok: false,
      reason: 'unknown-path',
    })
    expect(scenePropertiesForPath([shape('leaf')], undefined as unknown as ScenePath)).toEqual({
      ok: false,
      reason: 'unknown-path',
    })
    expect(scenePropertyMutation(
      [shape('leaf')],
      ['leaf'],
      null as unknown as ScenePropertyEdit,
    )).toEqual({ ok: false, reason: 'invalid-value' })
    expect(scenePropertyMutation(
      [shape('leaf')],
      ['leaf'],
      undefined as unknown as ScenePropertyEdit,
    )).toEqual({ ok: false, reason: 'invalid-value' })

    const extremeRequestNodes = [group('minimum-parent', [shape('leaf')], {
      scale: MIN_EFFECTIVE_SCALE,
    })]
    expect(() => scenePropertyMutation(
      extremeRequestNodes,
      ['minimum-parent', 'leaf'],
      { property: 'x', value: Number.MAX_VALUE },
    )).not.toThrow()
    expect(scenePropertyMutation(
      extremeRequestNodes,
      ['minimum-parent', 'leaf'],
      { property: 'x', value: Number.MAX_VALUE },
    )).toEqual({ ok: false, reason: 'invalid-transform' })
  })

  it('reads the maximum valid depth and rejects an over-depth tree', () => {
    let atLimit: FreeformSceneNode = shape('depth-32')
    for (let depth = MAX_SCENE_DEPTH - 1; depth >= 1; depth -= 1) {
      atLimit = group(`depth-${depth}`, [atLimit])
    }
    const validPath = Array.from(
      { length: MAX_SCENE_DEPTH },
      (_, index) => index === MAX_SCENE_DEPTH - 1 ? 'depth-32' : `depth-${index + 1}`,
    )
    expect(scenePropertiesForPath([atLimit], validPath).ok).toBe(true)

    const overDepth = group('depth-0', [atLimit])
    expect(scenePropertiesForPath([overDepth], ['depth-0', ...validPath])).toEqual({
      ok: false,
      reason: 'invalid-scene',
    })
  })
})
