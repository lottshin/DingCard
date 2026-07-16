import { describe, expect, it } from 'vitest'

import { collectMarkdownImageSources } from '../markdown'

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
