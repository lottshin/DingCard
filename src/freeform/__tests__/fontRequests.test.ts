import { describe, expect, it, vi } from 'vitest'
import {
  buildFreeformFontCSS,
  collectFreeformFontRequests,
  collectFreeformFontRequestsV3,
} from '../fontRequests'
import type {
  FreeformGroupNode,
  FreeformSceneLeaf,
  FreeformSceneNode,
  FreeformSlide,
  FreeformSlideV3,
  FreeformTextElement,
} from '../types'

function text(
  id: string,
  value: string,
  fontFamily: string,
  fontWeight: FreeformTextElement['fontWeight'],
): FreeformTextElement {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    rotation: 0,
    text: value,
    fontSize: 32,
    fontFamily,
    textFill: { type: 'solid', color: '#000000' },
    align: 'left',
    fontWeight,
  }
}

function slide(id: string, elements: FreeformTextElement[]): FreeformSlide {
  return {
    id,
    name: id,
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    elements,
  }
}

function sceneText(
  id: string,
  value: string,
  fontFamily: string,
  fontWeight: FreeformTextElement['fontWeight'],
): FreeformSceneLeaf {
  return {
    ...text(id, value, fontFamily, fontWeight),
    name: id,
    locked: false,
    hidden: true,
    scale: 1,
  }
}

function hiddenGroup(id: string, children: FreeformSceneNode[]): FreeformGroupNode {
  return {
    id,
    name: id,
    locked: false,
    hidden: true,
    type: 'group',
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    children,
  }
}

function sceneSlide(nodes: FreeformGroupNode[]): FreeformSlideV3 {
  return {
    id: 'scene-page',
    name: 'Scene page',
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes,
  }
}

describe('collectFreeformFontRequests', () => {
  it('groups text and actual weights by font family across slides', () => {
    const requests = collectFreeformFontRequests([
      slide('one', [
        text('a', '标题', "'Noto Serif SC', serif", 'bold'),
        text('b', '正文', "'Noto Serif SC', serif", 'normal'),
      ]),
      slide('two', [text('c', '落款', "'ZCOOL XiaoWei', serif", 'normal')]),
    ])

    expect(requests).toEqual([
      {
        fontFamily: "'Noto Serif SC', serif",
        text: '标题\n正文',
        fontWeights: ['bold', 'normal'],
      },
      {
        fontFamily: "'ZCOOL XiaoWei', serif",
        text: '落款',
        fontWeights: ['normal'],
      },
    ])
  })

  it('keeps successful font CSS when another family fails', async () => {
    const requests = collectFreeformFontRequests([
      slide('one', [
        text('a', '标题', "'Noto Serif SC', serif", 'bold'),
        text('b', '落款', "'ZCOOL XiaoWei', serif", 'normal'),
      ]),
    ])
    const builder = vi.fn(async (_text: string, fontFamily: string) => {
      if (fontFamily.includes('Noto Serif')) throw new Error('temporary font failure')
      return '@font-face { font-family: ZCOOL XiaoWei; }'
    })

    await expect(buildFreeformFontCSS(requests, builder)).resolves.toBe(
      '@font-face { font-family: ZCOOL XiaoWei; }',
    )
    expect(builder).toHaveBeenCalledTimes(2)
  })

  it('collects web-font text recursively even below hidden v3 ancestors', () => {
    const requests = collectFreeformFontRequestsV3([
      sceneSlide([
        hiddenGroup('outer', [
          hiddenGroup('inner', [
            sceneText('title', '隐藏标题', "'Noto Serif SC', serif", 'bold'),
            sceneText('body', '隐藏正文', "'Noto Serif SC', serif", 'normal'),
          ]),
        ]),
      ]),
    ])

    expect(requests).toEqual([{
      fontFamily: "'Noto Serif SC', serif",
      text: '隐藏标题\n隐藏正文',
      fontWeights: ['bold', 'normal'],
    }])
  })
})
