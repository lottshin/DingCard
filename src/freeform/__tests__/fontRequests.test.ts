import { describe, expect, it, vi } from 'vitest'
import { buildFreeformFontCSS, collectFreeformFontRequests } from '../fontRequests'
import type { FreeformSlide, FreeformTextElement } from '../types'

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
})
