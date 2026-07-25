import { describe, expect, it } from 'vitest'

import { collectMarkdownImageSources, parseBlocks } from '../markdown'

describe('collectMarkdownImageSources', () => {
  it('collects nested markdown image hrefs once in first-seen order', () => {
    const source = [
      '![empty]()',
      '',
      '![cover](img:cover)',
      '',
      '- list ![duplicate](img:cover)',
      '- list ![photo](/uploads/photo.png)',
      '',
      '> quote ![remote](https://cdn.example/fill.png)',
      '',
      '| preview |',
      '| --- |',
      '| ![table](img:table) |',
    ].join('\n')

    expect(collectMarkdownImageSources(source)).toEqual([
      'img:cover',
      '/uploads/photo.png',
      'https://cdn.example/fill.png',
      'img:table',
    ])
  })

  it('ignores image-like text in fenced and inline code', () => {
    const source = [
      '```markdown',
      '![fenced](img:fenced)',
      '```',
      '',
      '`![inline](img:inline)`',
      '',
      '![real](img:real)',
    ].join('\n')

    expect(collectMarkdownImageSources(source)).toEqual(['img:real'])
  })

  it.each(['', '   \n\t', 'not ![a complete image]('])('returns an empty list for %j', (source) => {
    expect(collectMarkdownImageSources(source)).toEqual([])
  })
})

describe('parseBlocks block kinds', () => {
  it.each([
    ['# 标题', 'heading'],
    ['普通段落', 'paragraph'],
    ['> 一段引用', 'blockquote'],
    ['- 第一项', 'list'],
    ['```ts\nconst answer = 42\n```', 'code'],
    ['![建筑立面](/templates/editorial-building.webp)', 'image'],
    ['![建筑立面](/templates/editorial-building.webp) 旁边还有说明', 'paragraph'],
    ['<section>自定义内容</section>', 'other'],
  ])('classifies %j as %s', (source, expectedKind) => {
    const contentBlocks = parseBlocks(source).filter((block) => !block.isBreak)

    expect(contentBlocks).toHaveLength(1)
    expect(contentBlocks[0].kind).toBe(expectedKind)
  })

  it('keeps manual page breaks separate from content semantics', () => {
    const blocks = parseBlocks('第一页\n\n---\n\n第二页')
    const pageBreak = blocks.find((block) => block.isBreak)

    expect(pageBreak).toMatchObject({ kind: 'other', raw: '---', isBreak: true })
    expect(blocks.filter((block) => !block.isBreak).map((block) => block.kind)).toEqual([
      'paragraph',
      'paragraph',
    ])
  })
})
