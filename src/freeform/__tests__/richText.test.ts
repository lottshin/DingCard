import { describe, expect, it } from 'vitest'
import {
  isStyledRun,
  normalizeRichTextSpans,
  rangeHasRichTextStyle,
  remapRichTextSpans,
  restyleRichTextRange,
  splitTextRuns,
  textRunStyle,
  usesV16SpanStyles,
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

describe('v16 highlight and underline spans', () => {
  it('validates the new styles and keeps only known keys', () => {
    expect(normalizeRichTextSpans([{ start: 0, end: 2, highlight: '#fef08a', underline: true }], TEXT.length))
      .toEqual([{ start: 0, end: 2, highlight: '#fef08a', underline: true }])
    expect(normalizeRichTextSpans([{ start: 0, end: 2, highlight: 'yellow' }], TEXT.length)).toBeNull()
    expect(normalizeRichTextSpans([{ start: 0, end: 2, underline: false }], TEXT.length)).toBeNull()
    expect(usesV16SpanStyles([{ start: 0, end: 2, bold: true }])).toBe(false)
    expect(usesV16SpanStyles([{ start: 0, end: 2, underline: true }])).toBe(true)
  })

  it('carries the new styles through edits and runs', () => {
    const spans: RichTextSpan[] = [{ start: 2, end: 4, highlight: '#fef08a', underline: true }]
    expect(remapRichTextSpans(spans, TEXT, `前${TEXT}`)).toEqual([{ start: 3, end: 5, highlight: '#fef08a', underline: true }])
    const runs = splitTextRuns(TEXT, spans)
    expect(runs[1]).toEqual({ text: '标题', highlight: '#fef08a', underline: true })
    expect(isStyledRun(runs[0])).toBe(false)
    expect(isStyledRun(runs[1])).toBe(true)
  })
})

describe('restyleRichTextRange', () => {
  const bold = (style: object) => ({ ...style, bold: true as const })

  it('adds a style to a range and keeps what is already there', () => {
    const colored: RichTextSpan[] = [{ start: 0, end: 4, color: '#ff0000' }]
    expect(restyleRichTextRange(colored, { start: 2, end: 6 }, bold, TEXT.length)).toEqual([
      { start: 0, end: 2, color: '#ff0000' },
      { start: 2, end: 4, bold: true, color: '#ff0000' },
      { start: 4, end: 6, bold: true },
    ])
  })

  it('joins neighbours that end up alike and drops unstyled stretches', () => {
    const split: RichTextSpan[] = [
      { start: 0, end: 2, bold: true },
      { start: 4, end: 6, bold: true },
    ]
    expect(restyleRichTextRange(split, { start: 2, end: 4 }, bold, TEXT.length))
      .toEqual([{ start: 0, end: 6, bold: true }])
    expect(restyleRichTextRange(split, { start: 0, end: 8 }, () => ({}), TEXT.length)).toEqual([])
    const unbold = ({ bold: _bold, ...rest }: { bold?: true }) => rest
    expect(restyleRichTextRange([{ start: 0, end: 6, bold: true, underline: true }], { start: 2, end: 4 }, unbold, TEXT.length))
      .toEqual([
        { start: 0, end: 2, bold: true, underline: true },
        { start: 2, end: 4, underline: true },
        { start: 4, end: 6, bold: true, underline: true },
      ])
  })

  it('rejects ranges outside the text', () => {
    expect(restyleRichTextRange([], { start: 2, end: 2 }, bold, TEXT.length)).toBeNull()
    expect(restyleRichTextRange([], { start: 0, end: 99 }, bold, TEXT.length)).toBeNull()
  })

  it('tells whether a whole range has a style', () => {
    const spans: RichTextSpan[] = [
      { start: 0, end: 2, bold: true },
      { start: 2, end: 4, bold: true, color: '#ff0000' },
    ]
    const isBold = (style: { bold?: true }) => style.bold === true
    expect(rangeHasRichTextStyle(spans, { start: 0, end: 4 }, isBold)).toBe(true)
    expect(rangeHasRichTextStyle(spans, { start: 1, end: 5 }, isBold)).toBe(false)
    expect(rangeHasRichTextStyle(undefined, { start: 0, end: 1 }, isBold)).toBe(false)
  })
})

describe('textRunStyle', () => {
  it('draws highlight and underline, with a solid colour over gradient text', () => {
    expect(textRunStyle({ text: 'a', bold: true, highlight: '#fef08a', underline: true })).toEqual({
      fontWeight: '700',
      backgroundColor: '#fef08a',
      textDecorationLine: 'underline',
    })
    expect(textRunStyle({ text: 'a', highlight: '#fef08a', underline: true }, '#111111')).toEqual({
      backgroundColor: '#fef08a',
      WebkitTextFillColor: '#111111',
      textDecorationLine: 'underline',
      textDecorationColor: '#111111',
    })
    // A coloured run in gradient text shows its own colour, not the gradient.
    expect(textRunStyle({ text: 'a', color: '#ff0000', underline: true }, '#111111')).toEqual({
      color: '#ff0000',
      WebkitTextFillColor: '#ff0000',
      textDecorationLine: 'underline',
      textDecorationColor: '#ff0000',
    })
    expect(textRunStyle({ text: 'a', bold: true }, '#111111')).toEqual({ fontWeight: '700' })
  })
})
