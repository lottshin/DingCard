import { describe, expect, it } from 'vitest'
import {
  insertRichTextSpan,
  normalizeRichTextSpans,
  remapRichTextSpans,
  splitTextRuns,
} from '../richText'
import type { RichTextSpan } from '../types'

const TEXT = '黑体标题正文六字'

describe('normalizeRichTextSpans', () => {
  it('accepts valid spans and returns them canonically ordered and owned', () => {
    const spans: RichTextSpan[] = [
      { start: 4, end: 6, bold: true },
      { start: 0, end: 2, color: '#ff0000' },
    ]
    const normalized = normalizeRichTextSpans(spans, TEXT.length)
    expect(normalized).toEqual([
      { start: 0, end: 2, color: '#ff0000' },
      { start: 4, end: 6, bold: true },
    ])
    expect(normalized).not.toBe(spans)
  })

  it('allows an empty array so patches can clear spans', () => {
    expect(normalizeRichTextSpans([], TEXT.length)).toEqual([])
  })

  it.each([
    ['not an array', 'nope'],
    ['unknown key', [{ start: 0, end: 2, italic: true }]],
    ['missing end', [{ start: 0 }]],
    ['start equals end', [{ start: 2, end: 2, bold: true }]],
    ['negative start', [{ start: -1, end: 2, bold: true }]],
    ['non-integer bounds', [{ start: 0.5, end: 2, bold: true }]],
    ['end past text length', [{ start: 0, end: TEXT.length + 1, bold: true }]],
    ['overlapping spans', [{ start: 0, end: 3, bold: true }, { start: 2, end: 5, bold: true }]],
    ['non-hex color', [{ start: 0, end: 2, color: 'red' }]],
    ['bold must be true', [{ start: 0, end: 2, bold: false }]],
    ['no styling at all', [{ start: 0, end: 2 }]],
  ])('rejects %s', (_label, value) => {
    expect(normalizeRichTextSpans(value, TEXT.length)).toBeNull()
  })
})

describe('remapRichTextSpans', () => {
  it('keeps spans unchanged when the text is unchanged', () => {
    const spans: RichTextSpan[] = [{ start: 1, end: 3, bold: true }]
    expect(remapRichTextSpans(spans, TEXT, TEXT)).toBe(spans)
  })

  it('shifts spans when text is inserted before them', () => {
    const spans: RichTextSpan[] = [{ start: 2, end: 4, bold: true }]
    const next = remapRichTextSpans(spans, TEXT, '前缀' + TEXT)
    expect(next).toEqual([{ start: 4, end: 6, bold: true }])
  })

  it('keeps spans stable when text is appended', () => {
    const spans: RichTextSpan[] = [{ start: 0, end: 2, color: '#00ff00' }]
    expect(remapRichTextSpans(spans, TEXT, TEXT + '尾巴')).toEqual([
      { start: 0, end: 2, color: '#00ff00' },
    ])
  })

  it('shrinks a span when text inside it is deleted', () => {
    const spans: RichTextSpan[] = [{ start: 2, end: 6, bold: true }]
    const next = remapRichTextSpans(spans, TEXT, TEXT.slice(0, 3) + TEXT.slice(4))
    expect(next).toEqual([{ start: 2, end: 5, bold: true }])
  })

  it('drops spans fully inside the replaced region and returns undefined when nothing survives', () => {
    const spans: RichTextSpan[] = [{ start: 1, end: 3, bold: true }]
    expect(remapRichTextSpans(spans, TEXT, '完全换掉')).toBeUndefined()
    expect(remapRichTextSpans([], TEXT, '完全换掉')).toEqual([])
    expect(remapRichTextSpans(undefined, TEXT, '完全换掉')).toBeUndefined()
  })
})

describe('insertRichTextSpan', () => {
  it('adds a span and subtracts its range from a straddling existing span', () => {
    const existing: RichTextSpan[] = [{ start: 0, end: 4, bold: true }]
    const next = insertRichTextSpan(existing, { start: 2, end: 3, color: '#ff0000' }, TEXT.length)
    expect(next).toEqual([
      { start: 0, end: 2, bold: true },
      { start: 2, end: 3, color: '#ff0000' },
      { start: 3, end: 4, bold: true },
    ])
  })

  it('rejects invalid incoming spans', () => {
    expect(insertRichTextSpan([], { start: 0, end: 99, bold: true }, TEXT.length)).toBeNull()
    expect(insertRichTextSpan([], { start: 3, end: 1, bold: true }, TEXT.length)).toBeNull()
  })
})

describe('splitTextRuns', () => {
  it('returns a single plain run without spans', () => {
    expect(splitTextRuns(TEXT, undefined)).toEqual([{ text: TEXT }])
    expect(splitTextRuns(TEXT, [])).toEqual([{ text: TEXT }])
  })

  it('splits into ordered runs at span boundaries', () => {
    const spans: RichTextSpan[] = [
      { start: 0, end: 2, bold: true },
      { start: 4, end: 6, color: '#ff0000' },
    ]
    expect(splitTextRuns(TEXT, spans)).toEqual([
      { text: '黑体', bold: true },
      { text: '标题' },
      { text: '正文', color: '#ff0000' },
      { text: '六字' },
    ])
  })
})
