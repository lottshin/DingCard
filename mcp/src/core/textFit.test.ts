import { describe, expect, test } from 'vitest'
import type { FreeformTextElement } from '../../../src/freeform/types'
import { fittingFontSize, measureText, textFits } from './textFit'

const box = (overrides: Partial<FreeformTextElement> = {}): FreeformTextElement => ({
  id: 'text',
  name: '正文',
  locked: false,
  hidden: false,
  type: 'text',
  x: 0,
  y: 0,
  width: 416,
  height: 120,
  rotation: 0,
  scale: 1,
  text: '',
  fontSize: 40,
  fontFamily: 'PingFang SC',
  textFill: { type: 'solid', color: '#111111' },
  align: 'left',
  fontWeight: 'normal',
  ...overrides,
})

describe('text fitting', () => {
  test('wraps Chinese by the character and keeps words of Latin text together', () => {
    // 400px of room at 40px a character: ten characters a line, with some slack.
    expect(measureText(box(), '一二三四五六七八九', 40).lines).toBe(1)
    expect(measureText(box(), '一二三四五六七八九十一二三四五六七八', 40).lines).toBe(2)
    expect(measureText(box(), 'hello world hello world hello', 40).lines).toBe(2)
    expect(measureText(box(), '第一行\n第二行\n第三行', 40).lines).toBe(3)
  })

  test('counts line height, letter spacing and vertical flow', () => {
    expect(measureText(box({ lineHeight: 2 }), '一行', 40).depth).toBe(80)
    expect(measureText(box({ letterSpacing: 20 }), '一二三四五六七', 40).lines).toBe(2)
    expect(measureText(box({ vertical: true, height: 216 }), '一二三四五六', 40).lines).toBe(2)
  })

  test('finds the largest size that fits, down to the floor', () => {
    const node = box()
    expect(textFits(node, '两行字两行字两行字两行字', 40)).toBe(true)
    expect(textFits(node, '一二三四五六七八九十'.repeat(3), 40)).toBe(false)
    const size = fittingFontSize(node, '一二三四五六七八九十'.repeat(3))
    expect(size).not.toBeNull()
    expect(size!).toBeLessThan(40)
    expect(textFits(node, '一二三四五六七八九十'.repeat(3), size!)).toBe(true)
    expect(fittingFontSize(node, '一二三四五六七八九十'.repeat(20))).toBeNull()
  })

  test('lends a tight box the room its own sample needed', () => {
    const tight = box({ height: 40, fontSize: 40 })
    expect(textFits(tight, '同样长', 40)).toBe(false)
    expect(textFits(tight, '同样长', 40, '原来的')).toBe(true)
  })
})
