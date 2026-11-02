import { describe, expect, it } from 'vitest'
import { parseBlocks } from './markdown'

/** The text of a block, without its tags or the spaces between them. */
const plainText = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, '')

describe('parseBlocks', () => {
  it('keeps a long picture line as one picture', () => {
    // A picture whose address is long enough to need splitting: the line must
    // stay one picture, with its "!" and its address intact.
    const url = `data:image/png;base64,${'A'.repeat(200)}`
    const blocks = parseBlocks(`![很高的图](${url})`)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('image')
    expect(blocks[0].html).toContain('<img')
    expect(blocks[0].html).toContain(url)
  })

  it('does not cut a line inside a link address', () => {
    const url = 'https://example.com/a;b?q=1'
    const blocks = parseBlocks(`一段很长的话${'字'.repeat(100)}。看这个 [链接](${url}) 后面还有${'内容'.repeat(60)}。`)

    expect(blocks.length).toBe(2)
    // The address is whole: no block holds a piece of it.
    expect(blocks.some((block) => block.html.includes(`href="${url}"`))).toBe(true)
    const joined = blocks.map((block) => plainText(block.html)).join('')
    expect(joined).toContain('链接')
    expect(joined).toContain('字'.repeat(100))
    expect(joined).toContain('内容'.repeat(60))
  })

  it('splits a long line at its punctuation and keeps every character', () => {
    const first = '第一句'.repeat(30)
    const second = '第二句'.repeat(30)
    const blocks = parseBlocks(`${first}。${second}！`)

    expect(blocks.length).toBeGreaterThan(1)
    const joined = blocks.map((block) => plainText(block.html)).join('')
    expect(joined).toBe(`${first}。${second}！`)
  })

  it('keeps a long list item whole enough to read', () => {
    const item = `${'很长的一条列表项'.repeat(20)}，后面还有${'一些内容'.repeat(20)}。`
    const blocks = parseBlocks(`- ${item}`)

    const joined = blocks.map((block) => plainText(block.html)).join('')
    expect(joined).toContain('很长的一条列表项'.repeat(20))
    expect(joined).toContain('一些内容'.repeat(20))
  })
})
