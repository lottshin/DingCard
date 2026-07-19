import { describe, expect, it } from 'vitest'

import {
  dedupeScenePaths,
  directChildPathForScope,
  effectiveSceneState,
  fallbackScenePath,
  lockedDescendantSourcePathForSelection,
  nearestLockedNodePath,
  nearestLockedSourcePathForSelection,
  normalizeSceneSelection,
  reconcileSceneUiState,
  sceneLogicalBounds,
} from '../sceneSelection'
import type {
  FreeformGroupNode,
  FreeformSceneLeaf,
  FreeformSceneNode,
} from '../types'

function textLeaf(
  id: string,
  overrides: Partial<FreeformSceneLeaf> = {},
): FreeformSceneLeaf {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'text',
    x: 0,
    y: 0,
    width: 40,
    height: 20,
    rotation: 0,
    scale: 1,
    text: id,
    fontSize: 16,
    fontFamily: 'system-ui',
    textFill: { type: 'solid', color: '#111111' },
    align: 'left',
    fontWeight: 'normal',
    ...overrides,
  } as FreeformSceneLeaf
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

describe('scene selection', () => {
  it('reconciles stale paths when a document snapshot replaces a nested branch', () => {
    const current = {
      activeGroupPath: ['outer', 'inner'],
      selectionPaths: [['outer', 'inner', 'leaf']],
      identity: { activeSlideId: 'slide-1', draftId: 'draft-1', userId: 'user-1' },
    } as const
    const replacement = [group('outer', [textLeaf('sibling')])]

    expect(reconcileSceneUiState(replacement, current, current.identity)).toEqual({
      activeGroupPath: ['outer'],
      selectionPaths: [],
      identity: current.identity,
    })
  })

  it.each([
    ['active slide', 'slide-2', 'draft-1', 'user-1'],
    ['draft', 'slide-1', 'draft-2', 'user-1'],
    ['user', 'slide-1', 'draft-1', 'user-2'],
  ])('clears editing scope and selection when %s identity changes', (_label, activeSlideId, draftId, userId) => {
    const previous = {
      activeGroupPath: ['outer'],
      selectionPaths: [['outer', 'leaf']],
      identity: { activeSlideId: 'slide-1', draftId: 'draft-1', userId: 'user-1' },
    } as const
    const nextIdentity = { activeSlideId, draftId, userId }

    expect(reconcileSceneUiState([group('outer', [textLeaf('leaf')])], previous, nextIdentity)).toEqual({
      activeGroupPath: [],
      selectionPaths: [],
      identity: nextIdentity,
    })
  })

  it('keeps valid paths and filters selection atomically for an unchanged identity', () => {
    const state = {
      activeGroupPath: ['outer'],
      selectionPaths: [['outer', 'first'], ['outer', 'missing']],
      identity: { activeSlideId: 'slide-1', draftId: null, userId: null },
    } as const

    expect(reconcileSceneUiState(
      [group('outer', [textLeaf('first'), textLeaf('second')])],
      state,
      state.identity,
    )).toEqual({
      activeGroupPath: ['outer'],
      selectionPaths: [['outer', 'first']],
      identity: state.identity,
    })
  })

  it('inherits effective lock and hide independently without rewriting child state', () => {
    const leaf = textLeaf('leaf', { locked: false, hidden: false })
    const nodes = [
      group('outer', [
        group('inner', [leaf], { hidden: true }),
      ], { locked: true }),
    ]

    expect(effectiveSceneState(nodes, ['outer', 'inner', 'leaf'])).toEqual({
      locked: true,
      hidden: true,
    })
    expect(effectiveSceneState(nodes, ['missing'])).toBeNull()
    expect(leaf).toMatchObject({ locked: false, hidden: false })
  })

  it('finds the nearest node with its own lock flag along an effectively locked path', () => {
    const nodes = [
      group('outer', [
        group('inner', [textLeaf('leaf', { locked: true })], { locked: true }),
      ], { locked: true }),
    ]

    expect(nearestLockedNodePath(nodes, ['outer', 'inner', 'leaf'])).toEqual([
      'outer',
      'inner',
      'leaf',
    ])
    expect(nearestLockedNodePath(nodes, ['outer', 'inner'])).toEqual(['outer', 'inner'])
    expect(nearestLockedNodePath(nodes, ['outer'])).toEqual(['outer'])
    expect(nearestLockedNodePath([group('open', [textLeaf('leaf')])], ['open', 'leaf']))
      .toBeNull()
    expect(nearestLockedNodePath(nodes, ['outer', 'inner', 'leaf', 'fake-child']))
      .toBeNull()
    expect(nearestLockedNodePath(nodes, ['missing'])).toBeNull()
    expect(nearestLockedNodePath(nodes, [])).toBeNull()
  })

  it('finds one selected lock source with a single linear scene index pass', () => {
    let idReads = 0
    const nodes = Array.from({ length: 5_000 }, (_, index) => {
      const id = `node-${index}`
      const node = textLeaf(id, { locked: index === 4_999 })
      Object.defineProperty(node, 'id', {
        configurable: true,
        enumerable: true,
        get: () => {
          idReads += 1
          return id
        },
      })
      return node
    })
    const selection = [
      [],
      ['missing'],
      ...nodes.map((_node, index) => [`node-${index}`]),
    ]

    expect(nearestLockedSourcePathForSelection(nodes, selection)).toEqual(['node-4999'])
    expect(idReads).toBeLessThanOrEqual(nodes.length * 2)
    expect(nearestLockedSourcePathForSelection(nodes, [])).toBeNull()
    expect(nearestLockedSourcePathForSelection(nodes, [[], ['missing']])).toBeNull()

    const inherited = [
      group('outer', [group('inner', [textLeaf('leaf')])], { locked: true }),
    ]
    expect(nearestLockedSourcePathForSelection(inherited, [
      ['missing'],
      ['outer', 'inner', 'leaf'],
    ])).toEqual(['outer'])
  })

  it('finds a locked descendant source across single and multi-selection', () => {
    const nodes = [
      textLeaf('editable'),
      group('contains-lock', [
        textLeaf('open-child'),
        group('nested', [textLeaf('locked-child', { locked: true })]),
      ]),
      group('effectively-locked', [textLeaf('inherited')], { locked: true }),
    ]

    expect(lockedDescendantSourcePathForSelection(nodes, [
      ['editable'],
      ['contains-lock'],
    ])).toEqual(['contains-lock', 'nested', 'locked-child'])
    expect(lockedDescendantSourcePathForSelection(nodes, [['contains-lock', 'open-child']]))
      .toBeNull()
    expect(lockedDescendantSourcePathForSelection(nodes, [['effectively-locked']]))
      .toBeNull()
    expect(lockedDescendantSourcePathForSelection(nodes, [[], ['missing']])).toBeNull()
    expect(lockedDescendantSourcePathForSelection(nodes, [])).toBeNull()
  })

  it('returns null instead of throwing when an invalid tree exceeds the scene depth contract', () => {
    let node: FreeformSceneNode = textLeaf('leaf', { locked: true })
    for (let depth = 0; depth < 33; depth += 1) {
      node = group(`group-${depth}`, [node])
    }

    expect(() => nearestLockedSourcePathForSelection([node], [['group-32']])).not.toThrow()
    expect(nearestLockedSourcePathForSelection([node], [['group-32']])).toBeNull()
    expect(() => lockedDescendantSourcePathForSelection([node], [['group-32']])).not.toThrow()
    expect(lockedDescendantSourcePathForSelection([node], [['group-32']])).toBeNull()
  })

  it('maps a deep hit to the direct child of the active editing scope', () => {
    const nodes = [
      group('outer', [
        textLeaf('sibling'),
        group('inner', [textLeaf('leaf')]),
      ]),
    ]

    expect(directChildPathForScope(nodes, [], ['outer', 'inner', 'leaf'])).toEqual(['outer'])
    expect(directChildPathForScope(nodes, ['outer'], ['outer', 'inner', 'leaf'])).toEqual([
      'outer',
      'inner',
    ])
    expect(directChildPathForScope(nodes, ['outer', 'inner'], ['outer', 'inner', 'leaf'])).toEqual([
      'outer',
      'inner',
      'leaf',
    ])
    expect(directChildPathForScope(nodes, ['outer'], ['missing', 'leaf'])).toBeNull()
  })

  it('deduplicates ancestor and descendant paths while preserving request order', () => {
    expect(dedupeScenePaths([
      ['outer', 'inner', 'leaf'],
      ['sibling'],
      ['outer'],
      ['outer', 'inner'],
      ['sibling'],
    ])).toEqual([
      ['sibling'],
      ['outer'],
    ])
  })

  it('normalizes selection to unique direct children of one active parent', () => {
    const nodes = [
      group('outer', [
        textLeaf('first'),
        group('inner', [textLeaf('leaf')]),
      ]),
      textLeaf('root-leaf'),
    ]

    expect(normalizeSceneSelection(nodes, ['outer'], [
      ['outer', 'inner', 'leaf'],
      ['outer', 'first'],
      ['outer', 'inner'],
      ['root-leaf'],
      ['missing'],
    ])).toEqual([
      ['outer', 'inner'],
      ['outer', 'first'],
    ])
  })

  it('falls back to the nearest existing group ancestor and otherwise to root', () => {
    const nodes = [group('outer', [group('inner', [textLeaf('leaf')])])]

    expect(fallbackScenePath(nodes, ['outer', 'inner', 'deleted-child'])).toEqual([
      'outer',
      'inner',
    ])
    expect(fallbackScenePath(nodes, ['outer', 'leaf', 'deleted-child'])).toEqual(['outer'])
    expect(fallbackScenePath(nodes, ['missing', 'child'])).toEqual([])
    expect(fallbackScenePath(nodes, [])).toEqual([])
  })

  it('returns world logical bounds from the complete ancestor transform', () => {
    const nodes = [
      group('outer', [
        textLeaf('leaf', {
          x: 10,
          y: 5,
          width: 40,
          height: 20,
          scale: 1.5,
        }),
      ], {
        x: 100,
        y: 80,
        rotation: 90,
        scale: 2,
      }),
    ]

    const leafBounds = sceneLogicalBounds(nodes, ['outer', 'leaf'])
    const groupBounds = sceneLogicalBounds(nodes, ['outer'])
    expect(leafBounds).not.toBeNull()
    expect(groupBounds).not.toBeNull()
    for (const bounds of [leafBounds!, groupBounds!]) {
      expect(bounds.x).toBeCloseTo(40, 6)
      expect(bounds.y).toBeCloseTo(80, 6)
      expect(bounds.width).toBeCloseTo(60, 6)
      expect(bounds.height).toBeCloseTo(120, 6)
    }
    expect(sceneLogicalBounds(nodes, ['missing'])).toBeNull()
  })
})
