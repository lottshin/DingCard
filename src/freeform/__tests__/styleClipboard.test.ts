import { describe, expect, it } from 'vitest'

import { copyStylePatch, pasteStylePatch, styleKeysForNodeType } from '../styleClipboard'
import type { FreeformSceneNode } from '../types'

const base = {
  id: 'node',
  name: 'node',
  locked: false,
  hidden: false,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  scale: 1,
}

const textNode: FreeformSceneNode = {
  ...base,
  type: 'text',
  text: '标题',
  fontSize: 42,
  fontFamily: ' sans',
  textFill: { type: 'linear-gradient', stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#1570ef' }], angle: 90 },
  align: 'center',
  fontWeight: 'bold',
  italic: true,
  vertical: true,
  stroke: '#101828',
  strokeWidth: 2,
  opacity: 0.8,
} as FreeformSceneNode

const shapeNode: FreeformSceneNode = {
  ...base,
  type: 'shape',
  shape: 'rect',
  fill: { type: 'solid', color: '#f79009' },
  stroke: '#000000',
  strokeWidth: 1,
  cornerRadius: 12,
} as FreeformSceneNode

describe('style clipboard', () => {
  it('exposes per-type key sets with the shared effect keys everywhere', () => {
    expect(styleKeysForNodeType('text')).toContain('fontSize')
    expect(styleKeysForNodeType('text')).toContain('opacity')
    expect(styleKeysForNodeType('shape')).toContain('fill')
    expect(styleKeysForNodeType('shape')).toContain('blendMode')
    expect(styleKeysForNodeType('line')).toContain('dash')
    expect(styleKeysForNodeType('line')).toContain('cap')
    expect(styleKeysForNodeType('image')).toContain('fit')
    expect(styleKeysForNodeType('image')).toContain('cornerRadius')
    expect(styleKeysForNodeType('qrcode')).toContain('quietZone')
    expect(styleKeysForNodeType('group')).toEqual([])
  })

  it('copies only the style fields the source leaf actually has', () => {
    const patch = copyStylePatch(textNode)
    expect(patch).toEqual({
      fontSize: 42,
      fontFamily: ' sans',
      textFill: { type: 'linear-gradient', stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#1570ef' }], angle: 90 },
      align: 'center',
      fontWeight: 'bold',
      italic: true,
      vertical: true,
      stroke: '#101828',
      strokeWidth: 2,
      opacity: 0.8,
    })
    // Geometry, content, and identity never ride along.
    expect(patch).not.toHaveProperty('x')
    expect(patch).not.toHaveProperty('text')

    const shapePatch = copyStylePatch(shapeNode)
    expect(shapePatch).toEqual({
      fill: { type: 'solid', color: '#f79009' },
      stroke: '#000000',
      strokeWidth: 1,
      cornerRadius: 12,
    })
  })

  it('rejects groups and leaves without any style fields', () => {
    expect(copyStylePatch({ ...base, type: 'group', children: [] } as FreeformSceneNode)).toBeNull()
    const bareImage = { ...base, type: 'image', src: '', alt: '', fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 } } as FreeformSceneNode
    expect(copyStylePatch(bareImage)).not.toBeNull()
    // A rounded picture carries its radius and frame to the next one.
    const roundedImage = {
      ...bareImage,
      cornerRadius: 40,
      stroke: '#ffffff',
      strokeWidth: 12,
    } as FreeformSceneNode
    expect(copyStylePatch(roundedImage)).toMatchObject({
      fit: 'cover',
      cornerRadius: 40,
      stroke: '#ffffff',
      strokeWidth: 12,
    })
  })

  it('narrows a copied patch to the keys the target type accepts', () => {
    const copied = copyStylePatch(textNode)!
    const ontoShape = pasteStylePatch(copied, 'shape')
    // Text typography stays behind; the outline stroke transfers to the border.
    expect(ontoShape).toEqual({ stroke: '#101828', strokeWidth: 2, opacity: 0.8 })
    expect(ontoShape).not.toHaveProperty('fontSize')
    expect(ontoShape).not.toHaveProperty('textFill')

    const ontoLine = pasteStylePatch(copyStylePatch(shapeNode)!, 'line')
    expect(ontoLine).toEqual({ stroke: '#000000', strokeWidth: 1 })

    const ontoText = pasteStylePatch(copyStylePatch(shapeNode)!, 'text')
    expect(ontoText).toEqual({ stroke: '#000000', strokeWidth: 1 })

    expect(pasteStylePatch(copied, 'group')).toEqual({})
  })

  it('carries the v21 parametric shape fields to shapes only', () => {
    const starNode = {
      ...base,
      type: 'shape',
      shape: 'star',
      fill: { type: 'solid', color: '#fbbf24' },
      stroke: '#92400e',
      strokeWidth: 0,
      starInnerRatio: 0.6,
    } as FreeformSceneNode
    const patch = copyStylePatch(starNode)!
    expect(patch).toMatchObject({ starInnerRatio: 0.6 })
    expect(pasteStylePatch(patch, 'shape')).toMatchObject({ starInnerRatio: 0.6 })
    expect(pasteStylePatch(patch, 'line')).not.toHaveProperty('starInnerRatio')
    expect(pasteStylePatch(patch, 'text')).not.toHaveProperty('starInnerRatio')
  })
})

describe('style clipboard with paths', () => {
  const pathNode = {
    ...base,
    width: 96,
    height: 96,
    type: 'path',
    d: 'M20 6 9 17l-5-5',
    viewBox: { x: 0, y: 0, width: 24, height: 24 },
    fill: { type: 'transparent' },
    stroke: '#1d4ed8',
    strokeWidth: 2,
    dash: 1,
    join: 'miter',
  } as FreeformSceneNode

  it('copies a path stroke in page pixels', () => {
    expect(styleKeysForNodeType('path')).toEqual(expect.arrayContaining(['fill', 'join', 'fillRule', 'opacity']))
    expect(copyStylePatch(pathNode)).toEqual({
      fill: { type: 'transparent' },
      stroke: '#1d4ed8',
      strokeWidth: 8,
      dash: 4,
      join: 'miter',
    })
  })

  it('pastes into a path in its viewBox units and drops what a path cannot take', () => {
    const fromLine = pasteStylePatch({ stroke: '#000000', strokeWidth: 6, dash: 3, cap: 'butt' }, 'path', 3)
    expect(fromLine).toEqual({ stroke: '#000000', strokeWidth: 2, dash: 1, cap: 'butt' })

    const fromShape = pasteStylePatch({
      fill: { type: 'image', src: 'a.png', fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 } },
      stroke: 'transparent',
      strokeWidth: 0,
      cornerRadius: 8,
    }, 'path', 4)
    expect(fromShape).toEqual({ strokeWidth: 0 })

    // A path's pixel stroke lands as-is on a shape.
    expect(pasteStylePatch(copyStylePatch(pathNode)!, 'shape')).toEqual({
      fill: { type: 'transparent' },
      stroke: '#1d4ed8',
      strokeWidth: 8,
    })
  })
})
