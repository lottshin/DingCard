import { describe, expect, it } from 'vitest'
import {
  codeLineOffsets,
  graphemeOffsets,
  preferNearbyBreak,
  preferredBreakOffsets,
} from './splitOversizedBlock'

describe('graphemeOffsets', () => {
  it('cuts between every character of plain text', () => {
    expect(graphemeOffsets('你好世界')).toEqual([1, 2, 3])
  })

  it('keeps surrogate pairs and combining marks whole', () => {
    // a + combining acute + b: the mark belongs to the first grapheme.
    expect(graphemeOffsets('a\u0301b')).toEqual([2])
    // An astral character is two UTF-16 units.
    expect(graphemeOffsets('\u{1D11E}x')).toEqual([2])
    expect(graphemeOffsets('a\u{1D11E}b')).toEqual([1, 3])
  })

  it('never offers the empty head or the empty tail', () => {
    expect(graphemeOffsets('')).toEqual([])
    expect(graphemeOffsets('x')).toEqual([])
    expect(graphemeOffsets('xy')).toEqual([1])
  })
})

describe('codeLineOffsets', () => {
  it('cuts just after each newline, not at the very end', () => {
    expect(codeLineOffsets('a\nb\nc')).toEqual([2, 4])
    expect(codeLineOffsets('a\n')).toEqual([])
    expect(codeLineOffsets('\na')).toEqual([1])
  })
})

describe('preferredBreakOffsets', () => {
  it('prefers the position right after punctuation', () => {
    // 你好，世界。再见 → offsets after ，(3) and 。(6)
    expect(preferredBreakOffsets('你好，世界。再见')).toEqual([3, 6])
  })

  it('includes spaces and ASCII punctuation', () => {
    // Breaks right after the space (6), the period (12) and the next space (13).
    expect(preferredBreakOffsets('hello world. again')).toEqual([6, 12, 13])
  })

  it('skips a punctuation mark that ends the text', () => {
    expect(preferredBreakOffsets('一句话。')).toEqual([])
  })
})

describe('preferNearbyBreak', () => {
  it('takes a preferred boundary within the window', () => {
    expect(preferNearbyBreak(5, [3, 6], 4)).toBe(3)
    expect(preferNearbyBreak(6, [3, 6], 4)).toBe(6)
  })

  it('keeps the measured best when no nicer boundary is close', () => {
    expect(preferNearbyBreak(50, [3, 6], 4)).toBe(50)
    expect(preferNearbyBreak(9, [3], 4)).toBe(9)
  })

  it('falls back to the best when there are no preferred boundaries at all', () => {
    expect(preferNearbyBreak(7, [], 30)).toBe(7)
  })

  it('ignores preferred boundaries past the best', () => {
    expect(preferNearbyBreak(4, [3, 6, 8], 30)).toBe(3)
  })
})
