import { describe, expect, it } from 'vitest'

import { collectMarkdownImageSources, markWordBreaks, parseBlocks } from '../markdown'

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

describe('reading furniture in blocks', () => {
  it('turns `[ ]` and `[x]` items into to-dos and leaves other items alone', () => {
    const [open, done, plain] = parseBlocks('- [ ] 买菜\n- [x] **交房租**\n- [链接](https://example.com)')
    expect(open.html).toContain('<ul class="task-list"><li class="task" data-done="false">买菜</li></ul>')
    expect(done.html).toContain('data-done="true"><strong>交房租</strong>')
    expect(plain.html).toContain('<ul><li><a href="https://example.com">链接</a></li></ul>')
    expect([open.kind, done.kind, plain.kind]).toEqual(['list', 'list', 'list'])
  })

  it('carries a picture\'s description for a caption', () => {
    const [picture] = parseBlocks('![旧城区的老楼|320](/templates/editorial-building.webp)')
    expect(picture.html).toContain('data-alt="旧城区的老楼"')
    expect(picture.html).toContain('style="width:320px;"')
  })

  it('marks word boundaries in Chinese headings and quotes, not inside words, tags or entities', () => {
    const marked = markWordBreaks('旅行的意义，<strong>也许就是在陌生的地方</strong> &amp; A&B')
    expect(marked.replace(/\u200B/g, '')).toBe('旅行的意义，<strong>也许就是在陌生的地方</strong> &amp; A&B')
    expect(marked).toContain('在\u200B陌生\u200B的\u200B地方</strong>')
    expect(marked).not.toMatch(/陌\u200B生/)
    expect(marked).toContain('&amp; A&B')
    // A short clause stays whole, so the line breaks at its comma.
    expect(markWordBreaks('失眠的夜里，我读完了一本书')).toBe('失眠的夜里，我读完了一本书')
    const [heading, quote, paragraph] = parseBlocks('## 迷路是认识一座城市最好的方式\n\n> 你不需要去很远很远的地方才看得见\n\n正文不需要标记')
    expect(heading.html).toContain('\u200B')
    expect(quote.html).toContain('\u200B')
    expect(paragraph.html).not.toContain('\u200B')
  })
})
