import { describe, expect, it } from 'vitest'

import {
  MAX_FREEFORM_SLIDES,
  MAX_SCENE_DEPTH,
  MAX_SCENE_NODES_PER_SLIDE,
} from '../constants'
import { reduceFreeformDocumentV3 } from '../document'
import {
  canApplySceneAction,
  cloneSceneNodes,
  createSceneGroup,
  deleteSceneNodes,
  getChildrenAtPath,
  insertSceneChildren,
  recenterSceneAncestors,
  removeNodesAtPath,
  reorderNodesAtPath,
  ungroupSceneGroups,
  updateChildrenAtPath,
  updateNodeAtPath,
  validateSelectionForParent,
} from '../sceneTree'
import {
  SCENE_EPSILON,
  boundsFromPoints,
  groupLocal,
  identity,
  leafLocal,
  matrixAlmostEqual,
  multiply,
  sceneNodeWithLocalMatrix,
  transformPoint,
  sceneNodeBoundsInParent,
} from '../sceneTransform'
import type { Matrix2D, Point } from '../sceneTransform'
import type {
  FreeformActionV3,
  FreeformDocumentV3,
  FreeformGroupNode,
  FreeformSceneLeaf,
  FreeformSceneNode,
  FreeformSlideV3,
  ScenePath,
} from '../types'

function textLeaf(
  id: string,
  overrides: Partial<FreeformSceneLeaf> = {},
): FreeformSceneLeaf {
  return {
    id,
    name: `Text ${id}`,
    locked: false,
    hidden: false,
    type: 'text',
    x: 10,
    y: 20,
    width: 120,
    height: 48,
    rotation: 0,
    scale: 1,
    text: id,
    fontSize: 24,
    fontFamily: 'system-ui',
    textFill: { type: 'solid', color: '#18181b' },
    align: 'left',
    fontWeight: 'normal',
    ...overrides,
  } as FreeformSceneLeaf
}

function shapeLeaf(
  id: string,
  overrides: Partial<FreeformSceneLeaf> = {},
): FreeformSceneLeaf {
  return {
    id,
    name: `Shape ${id}`,
    locked: false,
    hidden: false,
    type: 'shape',
    x: 80,
    y: 50,
    width: 90,
    height: 64,
    rotation: 18,
    scale: 1.25,
    shape: 'rect',
    fill: { type: 'image', src: 'img:shape-texture', fit: 'cover' },
    stroke: '#c2410c',
    strokeWidth: 7,
    ...overrides,
  } as FreeformSceneLeaf
}

function lineLeaf(
  id: string,
  overrides: Partial<FreeformSceneLeaf> = {},
): FreeformSceneLeaf {
  return {
    id,
    name: `Line ${id}`,
    locked: false,
    hidden: false,
    type: 'line',
    x: 190,
    y: 120,
    width: 140,
    height: 24,
    rotation: -22,
    scale: 0.8,
    lineKind: 'arrow',
    stroke: '#111111',
    strokeWidth: 5,
    ...overrides,
  } as FreeformSceneLeaf
}

function imageLeaf(
  id: string,
  overrides: Partial<FreeformSceneLeaf> = {},
): FreeformSceneLeaf {
  return {
    id,
    name: `Image ${id}`,
    locked: false,
    hidden: false,
    type: 'image',
    x: 30,
    y: 40,
    width: 100,
    height: 80,
    rotation: 0,
    scale: 1,
    src: 'img:photo',
    alt: 'Photo',
    fit: 'contain',
    ...overrides,
  } as FreeformSceneLeaf
}

function groupNode(
  id: string,
  children: FreeformSceneNode[],
  overrides: Partial<FreeformGroupNode> = {},
): FreeformGroupNode {
  return {
    id,
    name: `Group ${id}`,
    locked: false,
    hidden: false,
    type: 'group',
    x: 100,
    y: 80,
    rotation: 0,
    scale: 1,
    children,
    ...overrides,
  }
}

function slide(id: string, nodes: FreeformSceneNode[] = []): FreeformSlideV3 {
  return {
    id,
    name: id,
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes,
  }
}

function documentWith(
  nodes: FreeformSceneNode[],
  slides: FreeformSlideV3[] = [slide('slide-1', nodes)],
): FreeformDocumentV3 {
  return {
    documentVersion: 3,
    slides,
    activeSlideId: slides[0].id,
  }
}

interface LeafSnapshot {
  matrix: Matrix2D
  corners: Point[]
  visualLength: number
}

function localMatrix(node: FreeformSceneNode): Matrix2D {
  return node.type === 'group'
    ? groupLocal(node.x, node.y, node.rotation, node.scale)
    : leafLocal(node.x, node.y, node.width, node.height, node.rotation, node.scale)
}

function baseVisualLength(node: FreeformSceneLeaf): number {
  if (node.type === 'text') return node.fontSize
  if (node.type === 'shape' || node.type === 'line') return node.strokeWidth
  return 1
}

function snapshotLeaves(
  nodes: readonly FreeformSceneNode[],
  parentWorld: Matrix2D = identity(),
  result = new Map<string, LeafSnapshot>(),
): Map<string, LeafSnapshot> {
  for (const node of nodes) {
    const world = multiply(parentWorld, localMatrix(node))
    if (node.type === 'group') {
      snapshotLeaves(node.children, world, result)
      continue
    }
    const corners = [
      { x: 0, y: 0 },
      { x: node.width, y: 0 },
      { x: node.width, y: node.height },
      { x: 0, y: node.height },
    ].map((point) => transformPoint(world, point))
    result.set(node.id, {
      matrix: world,
      corners,
      visualLength: baseVisualLength(node) * Math.hypot(world[0], world[1]),
    })
  }
  return result
}

function expectSnapshotsEqual(
  actual: Map<string, LeafSnapshot>,
  expected: Map<string, LeafSnapshot>,
): void {
  expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort())
  for (const [id, expectedLeaf] of expected) {
    const actualLeaf = actual.get(id)
    expect(actualLeaf, id).toBeDefined()
    expect(matrixAlmostEqual(actualLeaf!.matrix, expectedLeaf.matrix, SCENE_EPSILON), id).toBe(true)
    expect(actualLeaf!.visualLength, id).toBeCloseTo(expectedLeaf.visualLength, 6)
    for (let index = 0; index < expectedLeaf.corners.length; index += 1) {
      expect(actualLeaf!.corners[index].x, `${id} corner ${index} x`).toBeCloseTo(
        expectedLeaf.corners[index].x,
        6,
      )
      expect(actualLeaf!.corners[index].y, `${id} corner ${index} y`).toBeCloseTo(
        expectedLeaf.corners[index].y,
        6,
      )
    }
  }
}

function directChildrenCenter(group: FreeformGroupNode): Point {
  const points: Point[] = []
  for (const child of group.children) {
    const bounds = sceneNodeBoundsInParent(child)
    expect(bounds).not.toBeNull()
    points.push(
      { x: bounds!.x, y: bounds!.y },
      { x: bounds!.x + bounds!.width, y: bounds!.y + bounds!.height },
    )
  }
  const bounds = boundsFromPoints(points)
  expect(bounds).not.toBeNull()
  return {
    x: bounds!.x + bounds!.width / 2,
    y: bounds!.y + bounds!.height / 2,
  }
}

function expectMutationFailure(
  result: ReturnType<typeof createSceneGroup>,
  reason: string,
): void {
  expect(result).toEqual({ ok: false, reason })
}

function path(...ids: string[]): ScenePath {
  return ids
}

function makeIdFactory(ids: readonly string[]): () => string {
  let index = 0
  return () => ids[index++] ?? `generated-${index}`
}

describe('immutable scene path helpers', () => {
  it('copies only the updated ancestor chain and preserves unrelated references', () => {
    const untouchedRoot = imageLeaf('untouched-root')
    const untouchedBranch = groupNode('untouched-branch', [shapeLeaf('untouched-child')])
    const target = textLeaf('target')
    const inner = groupNode('inner', [target, lineLeaf('inner-sibling')])
    const outer = groupNode('outer', [inner, imageLeaf('outer-sibling')])
    const nodes = [untouchedRoot, outer, untouchedBranch]

    const next = updateNodeAtPath(nodes, path('outer', 'inner', 'target'), (node) => ({
      ...node,
      name: 'Renamed',
    }))

    expect(next).not.toBe(nodes)
    expect(next[0]).toBe(untouchedRoot)
    expect(next[2]).toBe(untouchedBranch)
    expect(next[1]).not.toBe(outer)
    expect((next[1] as FreeformGroupNode).children[0]).not.toBe(inner)
    expect((next[1] as FreeformGroupNode).children[1]).toBe(outer.children[1])
    expect(
      ((next[1] as FreeformGroupNode).children[0] as FreeformGroupNode).children[1],
    ).toBe(inner.children[1])
    expect(
      ((next[1] as FreeformGroupNode).children[0] as FreeformGroupNode).children[0].name,
    ).toBe('Renamed')
  })

  it('keeps the original root for unknown paths and same-node updates', () => {
    const nodes = [groupNode('group', [textLeaf('leaf')])]

    expect(updateNodeAtPath(nodes, path('missing'), (node) => ({ ...node }))).toBe(nodes)
    expect(updateNodeAtPath(nodes, path('group', 'missing'), (node) => ({ ...node }))).toBe(nodes)
    expect(updateNodeAtPath(nodes, path(), (node) => ({ ...node }))).toBe(nodes)
    expect(updateNodeAtPath(nodes, path('group', 'leaf'), (node) => node)).toBe(nodes)
    expect(updateChildrenAtPath(nodes, path('missing'), (children) => [...children])).toBe(nodes)
    expect(updateChildrenAtPath(nodes, path('group', 'leaf'), (children) => [...children])).toBe(nodes)
    expect(updateChildrenAtPath(nodes, path('group'), (children) => children)).toBe(nodes)
  })

  it('removes direct children immutably and treats empty or unknown selections as no-ops', () => {
    const a = textLeaf('a')
    const b = textLeaf('b')
    const group = groupNode('group', [a, b])
    const nodes = [group, shapeLeaf('root-sibling')]

    const next = removeNodesAtPath(nodes, path('group'), ['a'])

    expect(next).not.toBe(nodes)
    expect(next[1]).toBe(nodes[1])
    expect((next[0] as FreeformGroupNode).children).toEqual([b])
    expect(removeNodesAtPath(nodes, path('group'), [])).toBe(nodes)
    expect(removeNodesAtPath(nodes, path('group'), ['missing'])).toBe(nodes)
    expect(removeNodesAtPath(nodes, path('missing'), ['a'])).toBe(nodes)
  })

  it('reorders non-contiguous siblings as a stable block and preserves boundary references', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e'].map((id) => textLeaf(id))

    const forward = reorderNodesAtPath(nodes, [], ['b', 'd'], 'forward')
    const backward = reorderNodesAtPath(nodes, [], ['b', 'd'], 'backward')
    const front = reorderNodesAtPath(nodes, [], ['b', 'd'], 'front')
    const back = reorderNodesAtPath(nodes, [], ['b', 'd'], 'back')

    expect(forward.map((node) => node.id)).toEqual(['a', 'c', 'b', 'e', 'd'])
    expect(backward.map((node) => node.id)).toEqual(['b', 'a', 'd', 'c', 'e'])
    expect(front.map((node) => node.id)).toEqual(['a', 'c', 'e', 'b', 'd'])
    expect(back.map((node) => node.id)).toEqual(['b', 'd', 'a', 'c', 'e'])
    expect(reorderNodesAtPath(nodes, [], ['e'], 'forward')).toBe(nodes)
    expect(reorderNodesAtPath(nodes, [], ['a'], 'backward')).toBe(nodes)
    expect(reorderNodesAtPath(nodes, [], [], 'front')).toBe(nodes)
    expect(reorderNodesAtPath(nodes, [], ['missing'], 'front')).toBe(nodes)
    expect(reorderNodesAtPath(nodes, ['missing'], ['a'], 'front')).toBe(nodes)
  })

  it('validates only direct same-parent selections without mutating input', () => {
    const nodes = [
      textLeaf('root'),
      groupNode('group', [textLeaf('a'), groupNode('inner', [textLeaf('deep')])]),
    ]
    const snapshot = structuredClone(nodes)

    const valid = validateSelectionForParent(nodes, path('group'), ['inner', 'a'])

    expect(valid.ok).toBe(true)
    if (valid.ok) {
      expect(valid.selectedNodes.map((node) => node.id)).toEqual(['a', 'inner'])
      expect(valid.selectedIndices).toEqual([0, 1])
    }
    expect(validateSelectionForParent(nodes, path('group'), []).ok).toBe(false)
    expect(validateSelectionForParent(nodes, path('group'), ['deep']).ok).toBe(false)
    expect(validateSelectionForParent(nodes, path('missing'), ['a']).ok).toBe(false)
    expect(nodes).toEqual(snapshot)
  })

  it('deep-clones groups and leaves with deterministic fresh IDs and retained asset fields', () => {
    const source = [
      groupNode('group', [
        imageLeaf('image', { src: 'img:kept' }),
        groupNode('nested', [
          shapeLeaf('shape', {
            fill: { type: 'image', src: 'img:shape-kept', fit: 'contain' },
          }),
        ]),
      ]),
    ]
    const snapshot = structuredClone(source)
    const clone = cloneSceneNodes(
      source,
      makeIdFactory(['group-copy', 'image-copy', 'nested-copy', 'shape-copy']),
    )

    expect(source).toEqual(snapshot)
    expect(clone).not.toBe(source)
    expect(clone[0]).not.toBe(source[0])
    expect((clone[0] as FreeformGroupNode).children[0]).not.toBe(
      (source[0] as FreeformGroupNode).children[0],
    )
    expect(clone.map((node) => node.id)).toEqual(['group-copy'])
    expect(
      (clone[0] as FreeformGroupNode).children.map((node) => node.id),
    ).toEqual(['image-copy', 'nested-copy'])
    expect(
      ((clone[0] as FreeformGroupNode).children[1] as FreeformGroupNode).children[0].id,
    ).toBe('shape-copy')
    expect((clone[0] as FreeformGroupNode).children[0]).toMatchObject({ src: 'img:kept' })
    expect(
      ((clone[0] as FreeformGroupNode).children[1] as FreeformGroupNode).children[0],
    ).toMatchObject({ fill: { type: 'image', src: 'img:shape-kept', fit: 'contain' } })
  })
})

describe('lossless grouping and ungrouping', () => {
  it('rejects arbitrary, non-finite, and non-positive expected scale overrides', () => {
    const node = textLeaf('override-guard', { scale: 2 })
    const matrix = leafLocal(
      node.x,
      node.y,
      node.width,
      node.height,
      node.rotation,
      node.scale,
    )

    expect(sceneNodeWithLocalMatrix(node, matrix, 3)).toBeNull()
    expect(sceneNodeWithLocalMatrix(node, matrix, Number.NaN)).toBeNull()
    expect(sceneNodeWithLocalMatrix(node, matrix, -2)).toBeNull()
  })

  it('preserves the exact logical scale at the upper boundary during one-level ungroup', () => {
    const boundaryLeaf = textLeaf('boundary-leaf', {
      x: -40,
      y: 25,
      rotation: 0.1,
      scale: 100_000,
    })
    const nodes = [
      groupNode('boundary-group', [boundaryLeaf], {
        x: 260,
        y: 180,
        rotation: 0.2,
        scale: 0.1,
      }),
    ]
    const before = snapshotLeaves(nodes)

    const result = ungroupSceneGroups(nodes, [], ['boundary-group'], 'one-level')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nodes[0].scale).toBe(10_000)
    expectSnapshotsEqual(snapshotLeaves(result.nodes), before)
  })

  it('preserves the exact logical scale during automatic one-child cleanup', () => {
    const boundaryLeaf = lineLeaf('boundary-leaf', {
      x: -30,
      y: 45,
      rotation: 0.1,
      scale: 100_000,
    })
    const nodes = [
      groupNode(
        'boundary-group',
        [boundaryLeaf, shapeLeaf('delete-me', { x: 240, y: 180 })],
        { x: 320, y: 210, rotation: 0.2, scale: 0.1 },
      ),
    ]
    const before = snapshotLeaves(nodes).get('boundary-leaf')!

    const result = deleteSceneNodes(nodes, ['boundary-group'], ['delete-me'])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nodes[0]).toMatchObject({ id: 'boundary-leaf', scale: 10_000 })
    expectSnapshotsEqual(
      new Map([['boundary-leaf', snapshotLeaves(result.nodes).get('boundary-leaf')!]]),
      new Map([['boundary-leaf', before]]),
    )
  })

  it('accumulates exact logical scale through every level of all-level ungroup', () => {
    const nodes = [
      groupNode(
        'outer-boundary',
        [
          groupNode(
            'inner-boundary',
            [textLeaf('deep-boundary', { rotation: 0.1, scale: 10_000 })],
            { x: -35, y: 70, rotation: 0.2, scale: 10 },
          ),
        ],
        { x: 300, y: 240, rotation: 0.2, scale: 0.1 },
      ),
    ]
    const before = snapshotLeaves(nodes)

    const result = ungroupSceneGroups(nodes, [], ['outer-boundary'], 'all-level')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nodes[0]).toMatchObject({ id: 'deep-boundary', scale: 10_000 })
    expectSnapshotsEqual(snapshotLeaves(result.nodes), before)
  })

  it('groups boundary-scale leaves inside a scaled parent without re-estimating their scale', () => {
    const nodes = [
      groupNode(
        'parent',
        [
          textLeaf('a', { x: -80, y: 20, rotation: 0.2, scale: 100_000 }),
          shapeLeaf('b', { x: 220, y: 160, rotation: 0.2, scale: 100_000 }),
        ],
        { x: 420, y: 300, rotation: 0.2, scale: 0.1 },
      ),
    ]
    const before = snapshotLeaves(nodes)

    const result = createSceneGroup(nodes, ['parent'], ['a', 'b'], {
      id: 'boundary-wrapper',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parent = result.nodes[0] as FreeformGroupNode
    const wrapper = parent.children[0] as FreeformGroupNode
    expect(wrapper.children.map((node) => node.scale)).toEqual([100_000, 100_000])
    expectSnapshotsEqual(snapshotLeaves(result.nodes), before)
  })

  it('groups non-contiguous siblings at the highest selected layer in source order', () => {
    const low = textLeaf('low', { x: 0, y: 0 })
    const selectedLow = textLeaf('selected-low', { x: 20, y: 10, rotation: 12 })
    const middle = shapeLeaf('middle')
    const selectedHigh = lineLeaf('selected-high', { x: 240, y: 160, rotation: -31 })
    const top = imageLeaf('top')
    const nodes = [low, selectedLow, middle, selectedHigh, top]
    const before = snapshotLeaves(nodes)

    const result = createSceneGroup(nodes, [], ['selected-high', 'selected-low'], {
      id: 'new-group',
      name: 'Selection',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nodes.map((node) => node.id)).toEqual(['low', 'middle', 'new-group', 'top'])
    const group = result.nodes[2] as FreeformGroupNode
    expect(group.children.map((node) => node.id)).toEqual(['selected-low', 'selected-high'])
    expect(group.name).toBe('Selection')
    expect(result.selectionIds).toEqual(['new-group'])
    expectSnapshotsEqual(snapshotLeaves(result.nodes), before)
  })

  it('uses the complete selected subtrees for group center and supports nested grouping', () => {
    const first = groupNode(
      'first-group',
      [textLeaf('deep-a', { x: -50, y: -20, width: 80, height: 30 })],
      { x: 100, y: 80, rotation: 25, scale: 1.3 },
    )
    const second = shapeLeaf('second', { x: 320, y: 220, rotation: -15 })
    const third = lineLeaf('third', { x: 500, y: 100 })
    const firstResult = createSceneGroup([first, second, third], [], ['first-group', 'second'], {
      id: 'inner-created',
    })
    expect(firstResult.ok).toBe(true)
    if (!firstResult.ok) return

    const secondResult = createSceneGroup(
      firstResult.nodes,
      [],
      ['inner-created', 'third'],
      { id: 'outer-created' },
    )

    expect(secondResult.ok).toBe(true)
    if (!secondResult.ok) return
    expect(secondResult.nodes).toHaveLength(1)
    const outer = secondResult.nodes[0] as FreeformGroupNode
    expect(outer.id).toBe('outer-created')
    expect(outer.children.map((node) => node.id)).toEqual(['inner-created', 'third'])
    expectSnapshotsEqual(snapshotLeaves(secondResult.nodes), snapshotLeaves([first, second, third]))
  })

  it('rejects too-small, mixed-parent, hidden, effectively locked, and locked-parent selections', () => {
    const nodes = [
      textLeaf('root'),
      groupNode('parent', [
        textLeaf('a'),
        textLeaf('hidden', { hidden: true }),
        textLeaf('locked', { locked: true }),
        groupNode('nested', [textLeaf('deep')]),
      ]),
      groupNode('locked-parent', [textLeaf('child-a'), textLeaf('child-b')], { locked: true }),
      groupNode('hidden-parent', [textLeaf('hidden-a'), textLeaf('hidden-b')], { hidden: true }),
    ]

    expectMutationFailure(createSceneGroup(nodes, ['parent'], ['a'], { id: 'g' }), 'requires-two')
    expectMutationFailure(createSceneGroup(nodes, ['parent'], [], { id: 'g' }), 'empty-selection')
    expectMutationFailure(createSceneGroup(nodes, ['parent'], ['a', 'deep'], { id: 'g' }), 'invalid-selection')
    expectMutationFailure(createSceneGroup(nodes, ['parent'], ['a', 'hidden'], { id: 'g' }), 'hidden')
    expectMutationFailure(createSceneGroup(nodes, ['parent'], ['a', 'locked'], { id: 'g' }), 'locked')
    expectMutationFailure(
      createSceneGroup(nodes, ['locked-parent'], ['child-a', 'child-b'], { id: 'g' }),
      'locked-parent',
    )
    expectMutationFailure(
      createSceneGroup(nodes, ['hidden-parent'], ['hidden-a', 'hidden-b'], { id: 'g' }),
      'hidden',
    )
  })

  it('ungroups one level and all levels without changing transformed leaf geometry', () => {
    const nested = groupNode(
      'nested',
      [shapeLeaf('shape'), lineLeaf('line')],
      { x: -30, y: 45, rotation: -18, scale: 0.65 },
    )
    const outer = groupNode(
      'outer',
      [textLeaf('text'), nested],
      { x: 260, y: 180, rotation: 41, scale: 1.8 },
    )
    const nodes = [imageLeaf('below'), outer, imageLeaf('above')]
    const before = snapshotLeaves(nodes)

    const oneLevel = ungroupSceneGroups(nodes, [], ['outer'], 'one-level')
    const allLevels = ungroupSceneGroups(nodes, [], ['outer'], 'all-level')

    expect(oneLevel.ok).toBe(true)
    if (oneLevel.ok) {
      expect(oneLevel.nodes.map((node) => node.id)).toEqual([
        'below',
        'text',
        'nested',
        'above',
      ])
      expectSnapshotsEqual(snapshotLeaves(oneLevel.nodes), before)
      expect(oneLevel.selectionIds).toEqual(['text', 'nested'])
    }
    expect(allLevels.ok).toBe(true)
    if (allLevels.ok) {
      expect(allLevels.nodes.map((node) => node.id)).toEqual([
        'below',
        'text',
        'shape',
        'line',
        'above',
      ])
      expectSnapshotsEqual(snapshotLeaves(allLevels.nodes), before)
      expect(allLevels.selectionIds).toEqual(['text', 'shape', 'line'])
    }
  })

  it('uses the same transform composition for explicit ungroup and automatic degenerate cleanup', () => {
    const only = groupNode(
      'only-group',
      [textLeaf('only-leaf', { x: -25, y: 15, rotation: 7, scale: 0.75 })],
      { x: 220, y: 160, rotation: 33, scale: 1.6 },
    )
    const explicit = ungroupSceneGroups([only], [], ['only-group'], 'one-level')
    const automatic = deleteSceneNodes(
      [groupNode('parent', [only, imageLeaf('delete-me')], { x: 30, y: 40, rotation: -12, scale: 0.9 })],
      ['parent'],
      ['delete-me'],
    )

    expect(explicit.ok).toBe(true)
    expect(automatic.ok).toBe(true)
    if (!explicit.ok || !automatic.ok) return
    const explicitLeaf = explicit.nodes[0]
    const automaticLeaf = automatic.nodes[0]
    const parentWorld = groupLocal(30, 40, -12, 0.9)
    expect(
      matrixAlmostEqual(
        multiply(parentWorld, localMatrix(explicitLeaf)),
        localMatrix(automaticLeaf),
      ),
    ).toBe(true)
    expect(automatic.selectionIds).toEqual([])
  })

  it('deletes empty groups, dissolves one-child groups, and cascades cleanup through ancestors', () => {
    const nodes = [
      groupNode('outer', [
        groupNode('middle', [
          groupNode('inner', [textLeaf('survivor'), textLeaf('delete-me')]),
        ]),
      ]),
      textLeaf('root-sibling'),
    ]
    const before = snapshotLeaves(nodes)

    const result = deleteSceneNodes(nodes, ['outer', 'middle', 'inner'], ['delete-me'])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nodes.map((node) => node.id)).toEqual(['survivor', 'root-sibling'])
    const after = snapshotLeaves(result.nodes)
    expect(matrixAlmostEqual(after.get('survivor')!.matrix, before.get('survivor')!.matrix)).toBe(true)

    const empty = deleteSceneNodes([groupNode('empty-after', [textLeaf('last')])], ['empty-after'], ['last'])
    expect(empty.ok).toBe(true)
    if (empty.ok) expect(empty.nodes).toEqual([])
  })

  it('recenters a rotated scaled group after deleting one of three children', () => {
    const grouped = createSceneGroup(
      [
        textLeaf('left', { x: 0, y: 20 }),
        shapeLeaf('middle', { x: 180, y: 60 }),
        lineLeaf('right', { x: 420, y: 150 }),
      ],
      [],
      ['left', 'middle', 'right'],
      { id: 'group' },
    )
    expect(grouped.ok).toBe(true)
    if (!grouped.ok) return
    const transformed = updateNodeAtPath(grouped.nodes, ['group'], (node) => ({
      ...node,
      rotation: 31,
      scale: 1.7,
    }))
    const before = snapshotLeaves(transformed)

    const deleted = deleteSceneNodes(transformed, ['group'], ['right'])

    expect(deleted.ok).toBe(true)
    if (!deleted.ok) return
    expectSnapshotsEqual(
      snapshotLeaves(deleted.nodes),
      new Map([...before].filter(([id]) => id !== 'right')),
    )
    const group = deleted.nodes[0] as FreeformGroupNode
    expect(group.id).toBe('group')
    expect(directChildrenCenter(group).x).toBeCloseTo(0, 6)
    expect(directChildrenCenter(group).y).toBeCloseTo(0, 6)
  })

  it('recenters a non-root group after inserting distant geometry without an extra world jump', () => {
    const grouped = createSceneGroup(
      [textLeaf('a', { x: 10, y: 20 }), shapeLeaf('b', { x: 190, y: 80 })],
      [],
      ['a', 'b'],
      { id: 'group' },
    )
    expect(grouped.ok).toBe(true)
    if (!grouped.ok) return
    const transformed = updateNodeAtPath(grouped.nodes, ['group'], (node) => ({
      ...node,
      rotation: -28,
      scale: 0.72,
    }))
    const inserted = lineLeaf('far', { x: 950, y: -420, rotation: 17, scale: 1.2 })
    const rawIntended = updateNodeAtPath(transformed, ['group'], (node) =>
      node.type === 'group' ? { ...node, children: [...node.children, inserted] } : node,
    )

    const result = insertSceneChildren(transformed, ['group'], [inserted])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expectSnapshotsEqual(snapshotLeaves(result.nodes), snapshotLeaves(rawIntended))
    const group = result.nodes[0] as FreeformGroupNode
    expect(directChildrenCenter(group).x).toBeCloseTo(0, 6)
    expect(directChildrenCenter(group).y).toBeCloseTo(0, 6)
  })

  it('recenters three rotated and scaled ancestor groups from inner to outer without geometry jumps', () => {
    const leaf = textLeaf('edited', { x: -40, y: 25, width: 100, height: 42, rotation: 11 })
    const stable = shapeLeaf('stable', { x: 130, y: -30 })
    const nodes = [
      groupNode(
        'outer',
        [
          groupNode(
            'middle',
            [
              groupNode('inner', [leaf, stable], {
                x: -35,
                y: 70,
                rotation: -19,
                scale: 0.8,
              }),
            ],
            { x: 140, y: -25, rotation: 27, scale: 1.45 },
          ),
        ],
        { x: 310, y: 240, rotation: 38, scale: 0.65 },
      ),
    ]
    const initial = snapshotLeaves(nodes)
    const edited = updateNodeAtPath(nodes, ['outer', 'middle', 'inner', 'edited'], (node) => ({
      ...node,
      x: node.x + 23.75,
      y: node.y - 14.5,
      ...(node.type === 'group' ? {} : { width: node.width + 37.25, height: node.height + 12 }),
    }))
    const intended = snapshotLeaves(edited)

    const result = recenterSceneAncestors(edited, ['outer', 'middle', 'inner', 'edited'])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expectSnapshotsEqual(snapshotLeaves(result.nodes), intended)
    expect(
      matrixAlmostEqual(
        snapshotLeaves(result.nodes).get('stable')!.matrix,
        initial.get('stable')!.matrix,
      ),
    ).toBe(true)
    expect(
      matrixAlmostEqual(
        snapshotLeaves(result.nodes).get('edited')!.matrix,
        initial.get('edited')!.matrix,
      ),
    ).toBe(false)
  })

  it('preserves text, stroked shape, arrow, and scaled nested-group visuals across repeated transforms', () => {
    const nodes = [
      textLeaf('text', { x: 20, y: 30, rotation: 8, scale: 1.1, fontSize: 31 }),
      shapeLeaf('shape', { x: 180, y: 75, strokeWidth: 9, scale: 0.7 }),
      lineLeaf('arrow', { x: 340, y: 170, strokeWidth: 6, scale: 1.4 }),
      groupNode(
        'pre-scaled',
        [imageLeaf('image'), lineLeaf('nested-line', { strokeWidth: 4 })],
        { x: 520, y: 240, rotation: -27, scale: 1.65 },
      ),
    ]
    const before = snapshotLeaves(nodes)
    const grouped = createSceneGroup(nodes, [], ['text', 'shape', 'arrow', 'pre-scaled'], {
      id: 'transform-group',
    })
    expect(grouped.ok).toBe(true)
    if (!grouped.ok) return
    expectSnapshotsEqual(snapshotLeaves(grouped.nodes), before)

    let transformedDocument = documentWith(grouped.nodes)
    transformedDocument = reduceFreeformDocumentV3(transformedDocument, {
      type: 'node/update-geometry',
      slideId: 'slide-1',
      updates: [{ path: ['transform-group'], patch: { rotation: 37, scale: 1.35 } }],
    })
    transformedDocument = reduceFreeformDocumentV3(transformedDocument, {
      type: 'node/update-geometry',
      slideId: 'slide-1',
      updates: [{ path: ['transform-group'], patch: { rotation: -23, scale: 0.82 } }],
    })
    const transformed = transformedDocument.slides[0].nodes
    const transformedSnapshot = snapshotLeaves(transformed)
    expectSnapshotsEqual(snapshotLeaves(transformed), transformedSnapshot)

    const oneLevel = ungroupSceneGroups(transformed, [], ['transform-group'], 'one-level')
    const allLevels = ungroupSceneGroups(transformed, [], ['transform-group'], 'all-level')

    expect(oneLevel.ok).toBe(true)
    expect(allLevels.ok).toBe(true)
    if (oneLevel.ok) expectSnapshotsEqual(snapshotLeaves(oneLevel.nodes), transformedSnapshot)
    if (allLevels.ok) expectSnapshotsEqual(snapshotLeaves(allLevels.nodes), transformedSnapshot)
  })
})

describe('v3 reducer permission and atomicity boundary', () => {
  it('allows lock, hide, and rename metadata through own, ancestor, and parent locks', () => {
    const nodes = [
      groupNode(
        'locked-parent',
        [textLeaf('child', { locked: true, hidden: false, name: 'Old' })],
        { locked: true },
      ),
    ]
    const original = documentWith(nodes)

    const unlocked = reduceFreeformDocumentV3(original, {
      type: 'node/set-locked',
      slideId: 'slide-1',
      path: ['locked-parent', 'child'],
      locked: false,
    })
    const hidden = reduceFreeformDocumentV3(unlocked, {
      type: 'node/set-hidden',
      slideId: 'slide-1',
      path: ['locked-parent', 'child'],
      hidden: true,
    })
    const renamed = reduceFreeformDocumentV3(hidden, {
      type: 'node/rename',
      slideId: 'slide-1',
      path: ['locked-parent', 'child'],
      name: 'Renamed',
    })

    const child = getChildrenAtPath(renamed.slides[0].nodes, ['locked-parent'])?.[0]
    expect(child).toMatchObject({ locked: false, hidden: true, name: 'Renamed' })
    expect(renamed).not.toBe(original)
    expect(
      reduceFreeformDocumentV3(renamed, {
        type: 'node/rename',
        slideId: 'slide-1',
        path: ['locked-parent', 'child'],
        name: 'Renamed',
      }),
    ).toBe(renamed)
  })

  it('rejects content, style, geometry, and structure changes for effectively locked targets', () => {
    const lockedLeaf = textLeaf('locked-leaf', { locked: true })
    const inherited = textLeaf('inherited')
    const group = groupNode('locked-group', [inherited, textLeaf('sibling')], { locked: true })
    const document = documentWith([lockedLeaf, group, textLeaf('free')])
    const actions: FreeformActionV3[] = [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{ path: ['locked-leaf'], patch: { text: 'blocked' } }],
      },
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['locked-group', 'inherited'], patch: { fontSize: 99 } }],
      },
      {
        type: 'node/update-geometry',
        slideId: 'slide-1',
        updates: [{ path: ['locked-group', 'inherited'], patch: { x: 99 } }],
      },
      { type: 'node/delete', slideId: 'slide-1', parentPath: [], nodeIds: ['locked-leaf'] },
      {
        type: 'node/reorder',
        slideId: 'slide-1',
        parentPath: [],
        nodeIds: ['locked-leaf'],
        direction: 'front',
      },
      {
        type: 'node/clone',
        slideId: 'slide-1',
        parentPath: [],
        nodeIds: ['locked-leaf'],
        idFactory: makeIdFactory(['copy']),
      },
      {
        type: 'group/create',
        slideId: 'slide-1',
        parentPath: [],
        nodeIds: ['locked-leaf', 'free'],
        groupId: 'new-group',
      },
      {
        type: 'group/ungroup',
        slideId: 'slide-1',
        parentPath: [],
        groupIds: ['locked-group'],
        mode: 'one-level',
      },
    ]

    for (const action of actions) {
      expect(reduceFreeformDocumentV3(document, action), action.type).toBe(document)
    }
  })

  it('rejects mixed batches atomically when one target is locked or unknown', () => {
    const nodes = [textLeaf('free'), textLeaf('locked', { locked: true })]
    const document = documentWith(nodes)

    const mixed = reduceFreeformDocumentV3(document, {
      type: 'node/update-content',
      slideId: 'slide-1',
      updates: [
        { path: ['free'], patch: { text: 'must-not-commit' } },
        { path: ['locked'], patch: { text: 'blocked' } },
      ],
    })
    const unknown = reduceFreeformDocumentV3(document, {
      type: 'node/update-geometry',
      slideId: 'slide-1',
      updates: [
        { path: ['free'], patch: { x: 200 } },
        { path: ['missing'], patch: { x: 300 } },
      ],
    })

    expect(mixed).toBe(document)
    expect(unknown).toBe(document)
    expect((document.slides[0].nodes[0] as Extract<FreeformSceneLeaf, { type: 'text' }>).text).toBe('free')
  })

  it('rejects runtime patch fields outside each category whitelist', () => {
    const document = documentWith([textLeaf('leaf', { locked: true })])
    const maliciousActions = [
      {
        type: 'node/update-content',
        slideId: 'slide-1',
        updates: [{ path: ['leaf'], patch: { text: 'changed', locked: false } }],
      },
      {
        type: 'node/update-style',
        slideId: 'slide-1',
        updates: [{ path: ['leaf'], patch: { fontSize: 90, id: 'stolen' } }],
      },
      {
        type: 'node/update-geometry',
        slideId: 'slide-1',
        updates: [{ path: ['leaf'], patch: { x: 500, type: 'group', children: [] } }],
      },
    ] as unknown as FreeformActionV3[]

    for (const action of maliciousActions) {
      expect(reduceFreeformDocumentV3(document, action), action.type).toBe(document)
    }
    expect(document.slides[0].nodes[0]).toMatchObject({ id: 'leaf', type: 'text', locked: true })
  })

  it('owns accepted style payloads for v3 and compatibility updates', () => {
    const document = documentWith([
      textLeaf('text'),
      shapeLeaf('shape', { fill: { type: 'solid', color: '#fed7aa' } }),
    ])
    const textFill = {
      type: 'linear-gradient' as const,
      from: '#111111',
      to: '#eeeeee',
      angle: 45,
    }
    const textResult = reduceFreeformDocumentV3(document, {
      type: 'node/update-style',
      slideId: 'slide-1',
      updates: [{ path: ['text'], patch: { textFill } }],
    })
    textFill.from = '#ff0000'
    expect(textResult.slides[0].nodes[0]).toMatchObject({
      textFill: { type: 'linear-gradient', from: '#111111', to: '#eeeeee', angle: 45 },
    })

    const shapeFill = {
      type: 'image' as const,
      src: 'img:owned-fill',
      fit: 'contain' as const,
    }
    const shapeResult = reduceFreeformDocumentV3(document, {
      type: 'element/update',
      slideId: 'slide-1',
      elementId: 'shape',
      patch: { fill: shapeFill },
    })
    shapeFill.src = 'img:mutated-after-dispatch'
    expect(shapeResult.slides[0].nodes[1]).toMatchObject({
      fill: { type: 'image', src: 'img:owned-fill', fit: 'contain' },
    })
  })

  it('rejects insertion into a locked parent but allows housekeeping beside a locked descendant', () => {
    const lockedParent = groupNode('locked-parent', [textLeaf('existing')], { locked: true })
    const openParent = groupNode('open-parent', [
      textLeaf('locked-child', { locked: true }),
      textLeaf('open-child'),
    ])
    const document = documentWith([lockedParent, openParent])
    const blocked = reduceFreeformDocumentV3(document, {
      type: 'node/insert-children',
      slideId: 'slide-1',
      parentPath: ['locked-parent'],
      nodes: [textLeaf('blocked-new')],
    })
    const allowed = reduceFreeformDocumentV3(document, {
      type: 'node/insert-children',
      slideId: 'slide-1',
      parentPath: ['open-parent'],
      nodes: [textLeaf('allowed-new', { x: 900, y: -500 })],
    })

    expect(blocked).toBe(document)
    expect(allowed).not.toBe(document)
    expect(
      getChildrenAtPath(allowed.slides[0].nodes, ['open-parent'])?.map((node) => node.id),
    ).toEqual(['locked-child', 'open-child', 'allowed-new'])
  })

  it('protects own-locked descendants from ancestor structural mutations and cleanup', () => {
    const protectedGroup = groupNode('protected-group', [
      textLeaf('locked-child', { locked: true }),
      textLeaf('deletable-child'),
    ])
    const document = documentWith([
      protectedGroup,
      textLeaf('peer-a'),
      textLeaf('peer-b'),
    ])
    const actions: FreeformActionV3[] = [
      { type: 'node/delete', slideId: 'slide-1', parentPath: [], nodeIds: ['protected-group'] },
      {
        type: 'node/reorder',
        slideId: 'slide-1',
        parentPath: [],
        nodeIds: ['protected-group'],
        direction: 'front',
      },
      {
        type: 'node/clone',
        slideId: 'slide-1',
        parentPath: [],
        nodeIds: ['protected-group'],
        idFactory: makeIdFactory(['clone-group', 'clone-locked', 'clone-open']),
      },
      {
        type: 'group/create',
        slideId: 'slide-1',
        parentPath: [],
        nodeIds: ['protected-group', 'peer-a'],
        groupId: 'wrapper',
      },
      {
        type: 'group/ungroup',
        slideId: 'slide-1',
        parentPath: [],
        groupIds: ['protected-group'],
        mode: 'one-level',
      },
    ]

    for (const action of actions) {
      expect(reduceFreeformDocumentV3(document, action), action.type).toBe(document)
    }

    const groupOpenSiblings = reduceFreeformDocumentV3(document, {
      type: 'group/create',
      slideId: 'slide-1',
      parentPath: [],
      nodeIds: ['peer-a', 'peer-b'],
      groupId: 'safe-wrapper',
    })
    expect(groupOpenSiblings).not.toBe(document)

    const beforeCleanup = snapshotLeaves(document.slides[0].nodes).get('locked-child')!
    const cleaned = reduceFreeformDocumentV3(document, {
      type: 'node/delete',
      slideId: 'slide-1',
      parentPath: ['protected-group'],
      nodeIds: ['deletable-child'],
    })
    expect(cleaned).not.toBe(document)
    expect(cleaned.slides[0].nodes[0]).toMatchObject({ id: 'locked-child', locked: true })
    expectSnapshotsEqual(
      new Map([['locked-child', snapshotLeaves(cleaned.slides[0].nodes).get('locked-child')!]]),
      new Map([['locked-child', beforeCleanup]]),
    )
  })

  it('uses canApplySceneAction as the shared permission predicate without mutation', () => {
    const nodes = [
      groupNode('outer', [textLeaf('free'), textLeaf('locked', { locked: true })]),
    ]
    const snapshot = structuredClone(nodes)

    expect(canApplySceneAction(nodes, { kind: 'metadata', paths: [['outer', 'locked']] })).toBe(true)
    expect(canApplySceneAction(nodes, { kind: 'content', paths: [['outer', 'free']] })).toBe(true)
    expect(canApplySceneAction(nodes, { kind: 'content', paths: [['outer', 'locked']] })).toBe(false)
    expect(canApplySceneAction(nodes, { kind: 'structure', paths: [['outer']] })).toBe(false)
    expect(canApplySceneAction(nodes, { kind: 'insert', parentPath: ['outer'] })).toBe(true)
    expect(canApplySceneAction(nodes, { kind: 'insert', parentPath: ['missing'] })).toBe(false)
    expect(nodes).toEqual(snapshot)
  })
})

describe('v3 reducer safety limits and stable failures', () => {
  it('supports the existing slide actions at the v3 cut-over boundary', () => {
    const original = documentWith([textLeaf('a')])
    const added = reduceFreeformDocumentV3(original, {
      type: 'slide/add-after-active',
      slideId: 'slide-2',
    })
    expect(added).not.toBe(original)
    expect(added.activeSlideId).toBe('slide-2')
    expect(added.slides.map((candidate) => candidate.id)).toEqual(['slide-1', 'slide-2'])

    const selected = reduceFreeformDocumentV3(added, {
      type: 'slide/select',
      slideId: 'slide-1',
    })
    const updated = reduceFreeformDocumentV3(selected, {
      type: 'slide/update',
      slideId: 'slide-1',
      patch: {
        name: 'Renamed page',
        background: { type: 'solid', color: '#fef3c7' },
      },
    })
    const resized = reduceFreeformDocumentV3(updated, {
      type: 'slide/resize',
      slideId: 'slide-1',
      width: 1920,
      height: 1080,
    })
    expect(resized.slides[0]).toMatchObject({
      name: 'Renamed page',
      background: { type: 'solid', color: '#fef3c7' },
      width: 1920,
      height: 1080,
    })

    const deleted = reduceFreeformDocumentV3(resized, {
      type: 'slide/delete',
      slideId: 'slide-1',
    })
    expect(deleted.slides.map((candidate) => candidate.id)).toEqual(['slide-2'])
    expect(deleted.activeSlideId).toBe('slide-2')
    expect(
      reduceFreeformDocumentV3(deleted, {
        type: 'slide/delete',
        slideId: 'slide-2',
      }),
    ).toBe(deleted)
  })

  it('supports successful compatibility delete and reorder on root leaves', () => {
    const original = documentWith([textLeaf('a'), textLeaf('b'), textLeaf('c')])
    const reordered = reduceFreeformDocumentV3(original, {
      type: 'element/reorder',
      slideId: 'slide-1',
      elementIds: ['b'],
      direction: 'front',
    })
    expect(reordered.slides[0].nodes.map((node) => node.id)).toEqual(['a', 'c', 'b'])

    const deleted = reduceFreeformDocumentV3(reordered, {
      type: 'element/delete',
      slideId: 'slide-1',
      elementIds: ['b'],
    })
    expect(deleted.slides[0].nodes.map((node) => node.id)).toEqual(['a', 'c'])
  })

  it('keeps temporary root element adapters behind the same lock and limit defenses', () => {
    const original = documentWith([
      textLeaf('locked-root', { locked: true }),
      textLeaf('free-root'),
    ])
    const added = reduceFreeformDocumentV3(original, {
      type: 'element/add',
      slideId: 'slide-1',
      element: {
        id: 'adapter-added',
        type: 'text',
        x: 30,
        y: 40,
        width: 180,
        height: 60,
        rotation: 0,
        text: 'Adapter',
        fontSize: 32,
        fontFamily: 'system-ui',
        textFill: { type: 'solid', color: '#18181b' },
        align: 'left',
        fontWeight: 'normal',
      },
    })

    expect(added).not.toBe(original)
    expect(added.slides[0].nodes[added.slides[0].nodes.length - 1]).toMatchObject({
      id: 'adapter-added',
      name: '文本',
      locked: false,
      hidden: false,
      scale: 1,
    })
    expect(
      reduceFreeformDocumentV3(original, {
        type: 'element/update',
        slideId: 'slide-1',
        elementId: 'locked-root',
        patch: { x: 999 },
      }),
    ).toBe(original)
    expect(
      reduceFreeformDocumentV3(original, {
        type: 'element/delete',
        slideId: 'slide-1',
        elementIds: ['locked-root'],
      }),
    ).toBe(original)
    expect(
      reduceFreeformDocumentV3(original, {
        type: 'element/reorder',
        slideId: 'slide-1',
        elementIds: ['locked-root'],
        direction: 'front',
      }),
    ).toBe(original)

    const updated = reduceFreeformDocumentV3(original, {
      type: 'element/update',
      slideId: 'slide-1',
      elementId: 'free-root',
      patch: { text: 'Updated', x: 75, fontSize: 28 },
    })
    expect(updated).not.toBe(original)
    expect(updated.slides[0].nodes[1]).toMatchObject({ text: 'Updated', x: 75, fontSize: 28 })
  })

  it('atomically rejects malformed runtime children that strict v3 could not read back', () => {
    const original = documentWith([textLeaf('existing')])
    const malformed = [
      textLeaf('bad-paint', {
        textFill: { type: 'solid', color: 'red' },
      } as Partial<FreeformSceneLeaf>),
      { ...textLeaf('bad-lock'), locked: 'yes' },
      { ...textLeaf('bad-type'), type: 'video' },
    ]

    for (const node of malformed) {
      const action = {
        type: 'node/insert-children',
        slideId: 'slide-1',
        parentPath: [],
        nodes: [node],
      } as unknown as FreeformActionV3
      expect(reduceFreeformDocumentV3(original, action)).toBe(original)
    }
  })

  it('deep-owns inserted subtrees while preserving their provided IDs', () => {
    const original = documentWith([textLeaf('existing')])
    const inserted = groupNode('inserted-group', [
      shapeLeaf('inserted-shape', {
        fill: { type: 'image', src: 'img:owned', fit: 'cover' },
      }),
    ])

    const result = reduceFreeformDocumentV3(original, {
      type: 'node/insert-children',
      slideId: 'slide-1',
      parentPath: [],
      nodes: [inserted],
    })
    inserted.name = 'Mutated group'
    inserted.children[0].id = 'mutated-id'
    ;(inserted.children[0] as Extract<FreeformSceneLeaf, { type: 'shape' }>).fill = {
      type: 'solid',
      color: '#000000',
    }
    inserted.children.push(textLeaf('late-child'))

    expect(result.slides[0].nodes[1]).toMatchObject({
      id: 'inserted-group',
      name: 'Group inserted-group',
      children: [
        expect.objectContaining({
          id: 'inserted-shape',
          fill: { type: 'image', src: 'img:owned', fit: 'cover' },
        }),
      ],
    })
    expect((result.slides[0].nodes[1] as FreeformGroupNode).children).toHaveLength(1)
  })

  it('duplicates a slide with fresh recursive IDs and retained nested fields', () => {
    const original = documentWith([
      groupNode('group', [
        imageLeaf('image', { src: 'img:retained' }),
        groupNode('nested', [
          shapeLeaf('shape', {
            fill: { type: 'image', src: 'img:fill-retained', fit: 'contain' },
          }),
        ]),
      ]),
    ])

    const duplicated = reduceFreeformDocumentV3(original, {
      type: 'slide/duplicate',
      slideId: 'slide-1',
      duplicateSlideId: 'slide-copy',
      nodeIdFactory: makeIdFactory(['group-copy', 'image-copy', 'nested-copy', 'shape-copy']),
    })

    expect(duplicated).not.toBe(original)
    expect(duplicated.activeSlideId).toBe('slide-copy')
    expect(duplicated.slides.map((candidate) => candidate.id)).toEqual(['slide-1', 'slide-copy'])
    const copy = duplicated.slides[1]
    expect(copy.nodes[0].id).toBe('group-copy')
    const copiedGroup = copy.nodes[0] as FreeformGroupNode
    expect(copiedGroup.children.map((node) => node.id)).toEqual(['image-copy', 'nested-copy'])
    expect(copiedGroup.children[0]).toMatchObject({ src: 'img:retained' })
    expect((copiedGroup.children[1] as FreeformGroupNode).children[0]).toMatchObject({
      id: 'shape-copy',
      fill: { type: 'image', src: 'img:fill-retained', fit: 'contain' },
    })
    expect(original.slides).toHaveLength(1)
  })

  it('rejects duplicate-page factories that reuse or permute any source node ID', () => {
    const original = documentWith([
      groupNode('group', [
        imageLeaf('image'),
        groupNode('nested', [shapeLeaf('shape')]),
      ]),
    ])
    const reusedFactories = [
      ['group', 'image', 'nested', 'shape'],
      ['image', 'group', 'shape', 'nested'],
    ]

    reusedFactories.forEach((ids, index) => {
      const result = reduceFreeformDocumentV3(original, {
        type: 'slide/duplicate',
        slideId: 'slide-1',
        duplicateSlideId: `slide-copy-${index}`,
        nodeIdFactory: makeIdFactory(ids),
      })
      expect(result).toBe(original)
    })
  })

  it('rejects grouping that would push a selected depth-32 node to depth 33', () => {
    let child: FreeformSceneNode = textLeaf('depth-32')
    const parentIds: string[] = []
    for (let depth = MAX_SCENE_DEPTH - 1; depth >= 1; depth -= 1) {
      const id = `group-${depth}`
      parentIds.unshift(id)
      child = groupNode(id, [child, textLeaf(`sibling-${depth}`)])
    }
    const nodes = [child]
    const deepestParentPath = Array.from(
      { length: MAX_SCENE_DEPTH - 1 },
      (_, index) => `group-${index + 1}`,
    )
    const document = documentWith(nodes)

    const result = reduceFreeformDocumentV3(document, {
      type: 'group/create',
      slideId: 'slide-1',
      parentPath: deepestParentPath,
      nodeIds: ['depth-32', `sibling-${MAX_SCENE_DEPTH - 1}`],
      groupId: 'too-deep',
    })

    expect(result).toBe(document)
  })

  it('rejects insert, clone, and grouping beyond 5000 nodes without partial changes', () => {
    const nodes = Array.from({ length: MAX_SCENE_NODES_PER_SLIDE }, (_, index) =>
      textLeaf(`leaf-${index}`),
    )
    const document = documentWith(nodes)

    expect(
      reduceFreeformDocumentV3(document, {
        type: 'node/insert-children',
        slideId: 'slide-1',
        parentPath: [],
        nodes: [textLeaf('overflow')],
      }),
    ).toBe(document)
    expect(
      reduceFreeformDocumentV3(document, {
        type: 'node/clone',
        slideId: 'slide-1',
        parentPath: [],
        nodeIds: ['leaf-0'],
        idFactory: makeIdFactory(['clone']),
      }),
    ).toBe(document)
    expect(
      reduceFreeformDocumentV3(document, {
        type: 'group/create',
        slideId: 'slide-1',
        parentPath: [],
        nodeIds: ['leaf-0', 'leaf-1'],
        groupId: 'group-overflow',
      }),
    ).toBe(document)
  })

  it('rejects slide/add-after-active at 500 pages and duplicate slide IDs', () => {
    const slides = Array.from({ length: MAX_FREEFORM_SLIDES }, (_, index) =>
      slide(`slide-${index}`),
    )
    const full = documentWith([], slides)
    const one = documentWith([], [slide('slide-1')])

    expect(
      reduceFreeformDocumentV3(full, {
        type: 'slide/add-after-active',
        slideId: 'new-slide',
      }),
    ).toBe(full)
    expect(
      reduceFreeformDocumentV3(one, {
        type: 'slide/add-after-active',
        slideId: 'slide-1',
      }),
    ).toBe(one)
  })

  it('rejects page-scoped node ID collisions for group, insert, and clone atomically', () => {
    const document = documentWith([textLeaf('a'), textLeaf('b'), textLeaf('taken')])

    expect(
      reduceFreeformDocumentV3(document, {
        type: 'group/create',
        slideId: 'slide-1',
        parentPath: [],
        nodeIds: ['a', 'b'],
        groupId: 'taken',
      }),
    ).toBe(document)
    expect(
      reduceFreeformDocumentV3(document, {
        type: 'node/insert-children',
        slideId: 'slide-1',
        parentPath: [],
        nodes: [textLeaf('taken'), textLeaf('new')],
      }),
    ).toBe(document)
    expect(
      reduceFreeformDocumentV3(document, {
        type: 'node/clone',
        slideId: 'slide-1',
        parentPath: [],
        nodeIds: ['a', 'b'],
        idFactory: makeIdFactory(['fresh', 'taken']),
      }),
    ).toBe(document)
  })

  it('rejects invalid local transforms, effective-scale overflow, and finite geometry overflow without throwing', () => {
    const document = documentWith([
      groupNode('group', [textLeaf('child', { scale: 2 })]),
      textLeaf('extreme'),
    ])
    const actions = [
      {
        type: 'node/update-geometry',
        slideId: 'slide-1',
        updates: [{ path: ['group'], patch: { scale: 6000 } }],
      },
      {
        type: 'node/update-geometry',
        slideId: 'slide-1',
        updates: [{ path: ['group'], patch: { scale: -1 } }],
      },
      {
        type: 'node/update-geometry',
        slideId: 'slide-1',
        updates: [{ path: ['extreme'], patch: { x: Number.MAX_VALUE, width: Number.MAX_VALUE } }],
      },
      {
        type: 'node/update-geometry',
        slideId: 'slide-1',
        updates: [{ path: ['extreme'], patch: { rotation: Number.NaN } }],
      },
    ] as FreeformActionV3[]

    for (const action of actions) {
      expect(() => reduceFreeformDocumentV3(document, action)).not.toThrow()
      expect(reduceFreeformDocumentV3(document, action), action.type).toBe(document)
    }
  })

  it('accepts compensating local scales when every effective world scale remains in range', () => {
    const document = documentWith([
      groupNode('parent', [textLeaf('child', { scale: 1e8 })], { scale: 1e-4 }),
    ])

    const result = reduceFreeformDocumentV3(document, {
      type: 'node/update-geometry',
      slideId: 'slide-1',
      updates: [{ path: ['parent'], patch: { scale: 1e-4 } }],
    })

    expect(result).toBe(document)
    const ungrouped = reduceFreeformDocumentV3(document, {
      type: 'group/ungroup',
      slideId: 'slide-1',
      parentPath: [],
      groupIds: ['parent'],
      mode: 'one-level',
    })
    expect(ungrouped).not.toBe(document)
    expect(ungrouped.slides[0].nodes[0].scale).toBeCloseTo(1e4)
  })
})
