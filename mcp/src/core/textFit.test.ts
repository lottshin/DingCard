import { describe, expect, test } from 'vitest'
import type { FreeformTextElement } from '../../../src/freeform/types'
import { balancedHeading, fittingFontSize, measureText, textFits } from './textFit'

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

  test('lends only the lines the sample really fills', () => {
    // Eleven bold characters fill one 364px line (32px each), though the safe estimate wraps them.
    const row = box({ width: 380, height: 76, fontSize: 32, fontWeight: 'bold' })
    expect(measureText(row, '删掉不能支撑判断的材料', 32).lines).toBe(2)
    expect(measureText(row, '删掉不能支撑判断的材料', 32, true).lines).toBe(1)
    // So a two-line point gets no second line the box can't show.
    expect(textFits(row, '一起煮二十分钟；最后焖五分钟', 32, '删掉不能支撑判断的材料')).toBe(false)
  })

  test('breaks a heading of two or three lines where they come out even, at words and after a pause', () => {
    const heading = box({ width: 920, fontSize: 112 })
    // Eight characters a line: a full line over a lone "下来" becomes two even ones, between words.
    expect(balancedHeading(heading, '先把睡眠时间固定下来', 112)).toBe('先把睡眠时间\n固定下来')
    expect(balancedHeading(heading, '30 天养成早起习惯', 112)).toBe('30 天养成\n早起习惯')
    expect(balancedHeading(heading, '坚持的秘诀，是降低门槛', 112)).toBe('坚持的秘诀，\n是降低门槛')
    // A line never starts with closing punctuation.
    expect(balancedHeading(heading, '先别急着把它修成成品。', 112).split('\n')[1]).not.toMatch(/^。/)
    // Three lines come out even too, broken between words.
    const poster = box({ width: 752, fontSize: 158 })
    expect(balancedHeading(poster, '坚持的秘诀是降低门槛', 158)).toBe('坚持的\n秘诀是\n降低门槛')
    // One line, its own break, or more than three lines: left alone.
    expect(balancedHeading(heading, '早起习惯', 112)).toBe('早起习惯')
    expect(balancedHeading(heading, '先把睡眠\n时间固定下来', 112)).toBe('先把睡眠\n时间固定下来')
    const long = '一二三四五六七八九十'.repeat(4)
    expect(balancedHeading(heading, long, 112)).toBe(long)
  })
})

