import { describe, expect, it } from 'vitest'

import type { Block, MarkdownBlockKind } from '../markdown'
import {
  formatMarkdownPageNumber,
  isMarkdownTemplateTheme,
  resolveMarkdownPageRole,
} from './markdownPresentation'

const block = (kind: MarkdownBlockKind): Block => ({ html: `<p>${kind}</p>`, raw: kind, kind })

describe('resolveMarkdownPageRole', () => {
  it('uses article for generic, legacy and unknown themes', () => {
    for (const themeId of ['light', 'template-editorial', 'missing-theme', '', null]) {
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
        themeId: 'template-editorial-archive',
        blocks: [],
        pageIndex: 0,
        includesLastContentBlock: false,
      }),
    ).toBe('article')

    expect(
      resolveMarkdownPageRole({
        themeId: 'template-editorial-archive',
        blocks: [block('heading'), block('paragraph')],
        pageIndex: 0,
        includesLastContentBlock: true,
      }),
    ).toBe('article')
  })

  it('prioritizes cover, quote, list, close and article in that order', () => {
    const resolve = (
      blocks: Block[],
      pageIndex: number,
      includesLastContentBlock: boolean,
    ) =>
      resolveMarkdownPageRole({
        themeId: 'template-public-theatre',
        blocks,
        pageIndex,
        includesLastContentBlock,
      })

    expect(resolve([block('heading')], 0, false)).toBe('cover')
    expect(resolve([block('blockquote')], 1, true)).toBe('quote')
    expect(resolve([block('list')], 2, true)).toBe('list')
    expect(resolve([block('paragraph')], 3, true)).toBe('close')
    expect(resolve([block('paragraph')], 2, false)).toBe('article')
  })

  it('ignores manual page-break blocks when checking for empty pages', () => {
    expect(
      resolveMarkdownPageRole({
        themeId: 'template-issue-cover',
        blocks: [{ html: '', raw: '---', kind: 'other', isBreak: true }],
        pageIndex: 2,
        includesLastContentBlock: true,
      }),
    ).toBe('article')
  })
})

describe('markdown template presentation helpers', () => {
  it.each([
    ['template-editorial-archive', true],
    ['template-public-theatre', true],
    ['template-issue-cover', true],
    ['template-editorial', false],
    ['light', false],
    ['', false],
    [undefined, false],
  ])('recognizes theme %j as %s', (themeId, expected) => {
    expect(isMarkdownTemplateTheme(themeId)).toBe(expected)
  })

  it.each([
    [0, 4, '01 / 04'],
    [8, 9, '09 / 09'],
    [0, 10, '01 / 10'],
    [-1, 0, '01 / 01'],
    [Number.NaN, Number.POSITIVE_INFINITY, '01 / 01'],
  ])('formats page %j of %j as %s', (pageIndex, pageCount, expected) => {
    expect(formatMarkdownPageNumber(pageIndex, pageCount)).toBe(expected)
  })
})
