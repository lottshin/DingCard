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
    expect(copyStylePatch({ ...base, type: 'image', src: '', alt: '', fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 } } as FreeformSceneNode)).not.toBeNull()
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
})
