import { describe, expect, it } from 'vitest'

import type { Block, MarkdownBlockKind } from '../markdown'
import {
  isMarkdownTemplateTheme,
  markdownLookOf,
  MARKDOWN_TEMPLATE_THEME_IDS,
  resolveMarkdownPageRole,
} from './markdownPresentation'

const block = (kind: MarkdownBlockKind): Block => ({ html: `<p>${kind}</p>`, raw: kind, kind })

describe('resolveMarkdownPageRole', () => {
  it('uses article for plain, retired and unknown themes', () => {
    for (const themeId of ['light', 'template-editorial', 'template-editorial-archive', 'missing-theme', '', null]) {
      expect(
        resolveMarkdownPageRole({
          themeId,
          blocks: [block('blockquote')],
          pageIndex: 0,
          includesLastContentBlock: false,
        }),
      ).toBe('article')
    }
  })

  it('uses article for empty and single-page documents', () => {
    expect(
      resolveMarkdownPageRole({
        themeId: 'template-column',
        blocks: [],
        pageIndex: 0,
        includesLastContentBlock: false,
      }),
    ).toBe('article')

    expect(
      resolveMarkdownPageRole({
        themeId: 'template-column',
        blocks: [block('heading'), block('paragraph')],
        pageIndex: 0,
        includesLastContentBlock: true,
      }),
    ).toBe('article')
  })

  it('prioritizes cover, close, quote, list and article in that order', () => {
    const resolve = (
      blocks: Block[],
      pageIndex: number,
      includesLastContentBlock: boolean,
    ) =>
      resolveMarkdownPageRole({
        themeId: 'template-memo',
        blocks,
        pageIndex,
        includesLastContentBlock,
      })

    expect(resolve([block('heading')], 0, false)).toBe('cover')
    expect(resolve([block('blockquote')], 1, true)).toBe('close')
    expect(resolve([block('blockquote'), block('list')], 1, false)).toBe('quote')
    expect(resolve([block('list')], 2, false)).toBe('list')
    expect(resolve([block('paragraph')], 3, true)).toBe('close')
    expect(resolve([block('paragraph')], 2, false)).toBe('article')
  })

  it('ignores manual page-break blocks when checking for empty pages', () => {
    expect(
      resolveMarkdownPageRole({
        themeId: 'template-xuan',
        blocks: [{ html: '', raw: '---', kind: 'other', isBreak: true }],
        pageIndex: 2,
        includesLastContentBlock: true,
      }),
    ).toBe('article')
  })
})

describe('markdown template themes', () => {
  it('are the themes with a designed look', () => {
    expect(MARKDOWN_TEMPLATE_THEME_IDS).toEqual([
      'template-column',
      'template-memo',
      'template-letter',
      'template-night',
      'template-aurora',
      'template-doc',
      'template-xuan',
      'template-swiss',
      'template-journal',
    ])
  })

  it.each([
    ['template-column', true, 'column'],
    ['template-journal', true, 'journal'],
    ['template-editorial-archive', false, null],
    ['template-editorial', false, null],
    ['light', false, null],
    ['', false, null],
    [undefined, false, null],
  ])('recognizes theme %j', (themeId, expected, look) => {
    expect(isMarkdownTemplateTheme(themeId)).toBe(expected)
    expect(markdownLookOf(themeId)).toBe(look)
  })
})
