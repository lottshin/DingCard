import { describe, expect, it } from 'vitest'

import {
  dedupeScenePaths,
  directChildPathForScope,
  effectiveSceneState,
  fallbackScenePath,
  normalizeSceneSelection,
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
