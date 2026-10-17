import { describe, expect, test } from 'vitest'
import type { FreeformTextElement } from '../../../src/freeform/types'
import { balancedHeading, displayWords, fillingHeading, fittingFontSize, measureText, textFits, wordBrokenHeading } from './textFit'

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

  test('reads words the segmenter cuts into characters as a reader does', () => {
    // 复盘 and 栏目 come out as single characters: they pair up, but not with a word of its own
    // (的, 都); a measure word stays with its number, 第 or 每; a verb keeps its result.
    expect(displayWords('把复盘固定成每个月都更新的栏目')).toEqual(['把', '复盘', '固定成', '每个月', '都', '更新', '的', '栏目'])
    expect(displayWords('独立开发者的第一年收入复盘')).toEqual(['独立', '开发者', '的', '第一年', '收入', '复盘'])
  })

  test('breaks a title between words, a little smaller when it must', () => {
    // Six characters don't fit this line at 140px: the even break is set at the size it
    // fits (a CJK line measured as wide as it sets), not left to the browser to cut 时间 in
    // two. A title that fits a line keeps its size.
    const cover = box({ name: '主标题', width: 800, height: 400, fontSize: 140, fontWeight: 'bold' })
    expect(wordBrokenHeading(cover, '先把睡眠时间固定下来', 140, 100)).toEqual({ fontSize: 129, text: '先把睡眠时间\n固定下来' })
    expect(wordBrokenHeading(cover, '早起', 140, 100)).toEqual({ fontSize: 140, text: '早起' })
    // A narrow column takes the lines it needs, more than three, none a lone character.
    const column = box({ name: '主标题', width: 370, height: 520, fontSize: 88, fontWeight: 'bold' })
    expect(wordBrokenHeading(column, '用一套固定的流程把内容做成系列', 88, 63)).toEqual({ fontSize: 85, text: '用一套\n固定的\n流程\n把内容\n做成系列' })
    // An even break that would start a line with 的, or one only inside a word, gives way to
    // one a little smaller that breaks well.
    const wide = box({ name: '标题', width: 920, height: 300, fontSize: 103, fontWeight: 'bold' })
    expect(wordBrokenHeading(wide, '城郊三条适合新手的周末徒步路线', 103, 74)).toEqual({ fontSize: 99, text: '城郊三条适合新手的\n周末徒步路线' })
    expect(wordBrokenHeading(wide, '把复盘固定成每个月都更新的栏目', 103, 74)).toEqual({ fontSize: 99, text: '把复盘固定成每个月\n都更新的栏目' })
  })

  test('fills a display box with a title as large as it breaks between words', () => {
    const hero = box({ name: '标题', width: 952, height: 800, fontSize: 150, fontWeight: 'bold', lineHeight: 1.12, letterSpacing: -4 })
    const fill = (text: string) => fillingHeading(hero, text, 300, 3)
    // Suffixes and particles stay with the word before them.
    expect(fill('独立开发者茶话会')?.text).toBe('独立\n开发者\n茶话会')
    expect(fill('周年庆全场')?.text).toBe('周年庆\n全场')
    expect(fill('城市里的第二条路')?.text).toBe('城市里的\n第二条路')
    // A title in two halves breaks after its colon.
    const card = box({ name: '标题', width: 728, height: 640, fontSize: 112, fontWeight: 'bold', lineHeight: 1.24, letterSpacing: -2 })
    expect(fillingHeading(card, '周末去哪儿：城郊三条徒步线', 179, 3)?.text.split('\n')[0]).toBe('周末去哪儿：')
    // Two one-character words are kept together: 用好 stays one word.
    expect(fill('设计师如何用好 AI')?.text.split('\n').some((line) => line.startsWith('好'))).toBe(false)
    // Short titles grow to the width; no title grows past the cap.
    expect(fill('茶话会')?.fontSize).toBeGreaterThan(280)
    expect(fill('乔迁小聚')?.fontSize).toBeLessThanOrEqual(300)
    // Every line it breaks fits the box at the size it picks, measured as textFits measures.
    for (const title of ['为什么你应该开始写作', '独立开发者茶话会', '城市里的第二条路']) {
      const filled = fill(title)!
      expect(measureText(hero, filled.text, filled.fontSize).lines, title).toBe(filled.text.split('\n').length)
      expect(measureText(hero, filled.text, filled.fontSize).depth, title).toBeLessThanOrEqual(800 - 16)
    }
    // A title too long for three lines at the box's own size is left to the usual fit.
    expect(fill('先把睡眠时间固定下来的十四个字')).toBeNull()
    // Nothing smaller than the box's own size: that is the usual fit's job.
    expect(fillingHeading(box({ width: 400, height: 60, fontSize: 40 }), '一句放不进一行的很长很长的标题', 60, 1)).toBeNull()
  })
})
