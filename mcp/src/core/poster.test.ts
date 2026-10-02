import { describe, expect, test } from 'vitest'
import type { FreeformImageElement, FreeformShapeElement, FreeformTextElement } from '../../../src/freeform/types'
import { composePoster, normalizePosterContent } from './poster'
import { templateMarks } from './layoutIssues'
import { posterTemplateIds } from './templates'

const TALK = {
  title: '设计系统的第二年',
  subtitle: '从组件库到团队协作的一次复盘',
  details: ['时间：11 月 2 日 周日 15:00', '地点：叮卡办公室 7 层', '线上同步直播'],
  cta: '报名参加',
  tag: '内部分享',
  brand: '叮卡设计组',
}

function compose(templateId: string, content: unknown) {
  const result = composePoster(templateId, content)
  if (!result.ok) throw new Error(result.error)
  return result
}

const texts = (result: ReturnType<typeof compose>) => result.document.slides[0].nodes.filter((node): node is FreeformTextElement => node.type === 'text')
const named = (result: ReturnType<typeof compose>, name: string) => result.document.slides[0].nodes.find((node) => node.name === name)

describe('composePoster', () => {
  test('fills every slot it is given, labels from before the colon, at the template size', () => {
    const result = compose('talk-poster-freeform', TALK)
    expect(result.summary).toMatchObject({ width: 1080, height: 1920, overflowing: [], unplaced: [], unused: [] })
    const text = (name: string) => (named(result, name) as FreeformTextElement | undefined)?.text
    expect(text('标题')?.replace(/\n/g, '')).toBe('设计系统的第二年')
    expect(text('标签一')).toBe('时间')
    expect(text('信息一')).toBe('11 月 2 日 周日 15:00')
    // A line without a label keeps its words and loses the label.
    expect(named(result, '标签三')).toBeUndefined()
    expect(text('信息三')).toBe('线上同步直播')
    expect(text('按钮文字')).toBe('报名参加')
    expect(text('主办')).toBe('叮卡设计组')
  })

  test('leaves no sample text on any poster, and drops what it was not given with its frame', () => {
    const samples = templateMarks().samples
    for (const templateId of posterTemplateIds()) {
      const result = compose(templateId, { title: '只有一个标题' })
      for (const node of texts(result)) {
        expect(samples.has(node.text.trim()), `${templateId}: 「${node.text}」`).toBe(false)
      }
      const names = result.document.slides[0].nodes.map((node) => node.name)
      expect(names, templateId).not.toContain('按钮文字')
      expect(names, templateId).not.toContain('按钮底板')
    }
  })

  test('puts the picture in the picture slot, or a colour block in a photo frame and nothing where an illustration was', () => {
    const photo = compose('talk-poster-freeform', { ...TALK, image: 'https://example.com/hall.jpg' })
    const frame = named(photo, '主图') as FreeformShapeElement
    expect(frame.fill).toMatchObject({ type: 'image', src: 'https://example.com/hall.jpg', fit: 'cover' })
    const block = compose('talk-poster-freeform', TALK)
    expect((named(block, '主图') as FreeformShapeElement).fill).toEqual({ type: 'solid', color: '#d8d0c2' })

    const product = compose('product-card-freeform', { title: '新品', image: 'https://example.com/shoe.png' })
    expect((named(product, '主图') as FreeformImageElement).src).toBe('https://example.com/shoe.png')
    expect(named(compose('product-card-freeform', { title: '新品' }), '主图')).toBeUndefined()
  })

  test('shrinks long copy into its box, and reports what it could not place', () => {
    const long = compose('quote-card-freeform', { title: '把复杂的事情说得简单一些，再简单一些，是一种很难得、需要长期练习的能力。' })
    expect(long.summary.shrunk.map((item) => item.node)).toContain('标题')
    const extra = compose('quote-card-freeform', { title: '一句', details: ['第一行', '第二行'], cta: '按钮', image: 'https://example.com/a.png' })
    expect(extra.summary.unplaced).toEqual(['第二行'])
    expect(extra.summary.unused).toEqual(['cta', 'image'])
  })

  test('fills a menu line by line, item before the colon and price after, and keeps generic words checkable', () => {
    const items = ['美式：18', '拿铁：24', '摩卡：26', '冷萃：28', '可颂：16', '贝果：18', '司康：15', '芝士蛋糕：32', '多出来的一项：10']
    const result = compose('menu-freeform', { title: '今日菜单', details: items, brand: '街角咖啡' })
    const text = (name: string) => (named(result, name) as FreeformTextElement | undefined)?.text
    expect(text('菜品一')).toBe('美式')
    expect(text('价格一')).toBe('18')
    expect(text('菜品八')).toBe('芝士蛋糕')
    expect(result.summary.unplaced).toEqual(['多出来的一项：10'])
    // A menu may well be called 今日菜单 and cost 18: those are not left-over samples.
    const samples = templateMarks().samples
    expect(samples.has('今日菜单')).toBe(false)
    expect(samples.has('22')).toBe(false)
    const short = compose('menu-freeform', { title: '午市', details: ['牛肉面：28', '小馄饨：18'] })
    expect(named(short, '菜品三')).toBeUndefined()
    expect(named(short, '虚线三')).toBeUndefined()
  })

  test('puts the name on a certificate, and drops its line when there is none', () => {
    const named_ = compose('certificate-freeform', { title: '荣誉证书', recipient: '王小明', body: '在本学期表现优异，特发此证。', brand: '叮卡小学', details: ['二〇二六年七月'] })
    expect((named(named_, '获得者') as FreeformTextElement).text).toBe('王小明')
    expect(named(named_, '姓名线')).toBeDefined()
    expect(named(named_, '信息二')).toBeUndefined()
    const anonymous = compose('certificate-freeform', { title: '结业证书' })
    expect(named(anonymous, '获得者')).toBeUndefined()
    expect(named(anonymous, '姓名线')).toBeUndefined()
    expect(compose('talk-poster-freeform', { title: '讲座', recipient: '某人' }).summary.unused).toEqual(['recipient'])
  })

  test('draws a timetable at the size given, one colour per subject, and lists what it cannot fit', () => {
    const table = [
      ['', '周一', '周二', '周三'],
      ['上午', '语文', '数学', '语文'],
      ['下午', '数学', '体育', '美术'],
    ]
    const result = compose('timetable-freeform', { title: '暑期课表', table })
    const nodes = result.document.slides[0].nodes
    const cell = (row: number, column: number) => nodes.find((node) => node.name === `课表格 ${row}-${column}`) as FreeformShapeElement | undefined
    const words = (row: number, column: number) => (nodes.find((node) => node.name === `课表字 ${row}-${column}`) as FreeformTextElement | undefined)?.text
    // Three rows of four columns, filling the table's space, and nothing of the sample's week.
    expect(nodes.filter((node) => node.name.startsWith('课表格 '))).toHaveLength(12)
    expect(words(2, 2)).toBe('语文')
    expect(words(1, 1)).toBeUndefined()
    expect(cell(4, 1)).toBeUndefined()
    expect(cell(2, 2)!.fill).toEqual(cell(2, 4)!.fill)
    expect(cell(2, 3)!.fill).toEqual(cell(3, 2)!.fill)
    expect(cell(2, 2)!.fill).not.toEqual(cell(2, 3)!.fill)
    // The table still spans the template's width.
    const last = cell(1, 4)!
    expect(last.x + last.width).toBeCloseTo(90 + 1574, 0)

    const wide = compose('timetable-freeform', { title: '课表', table: [Array.from({ length: 10 }, (_, index) => `第${index + 1}列`)] })
    expect(wide.summary.unplaced).toEqual(['第 1 行第 9 列：第9列', '第 1 行第 10 列：第10列'])
    expect(compose('talk-poster-freeform', { title: '讲座', table: [['a']] }).summary.unused).toEqual(['table'])
    expect(normalizePosterContent({ title: 'a', table: ['语文'] })).toContain('table')
  })

  test('keeps the list card only with lines on it, and an illustration that is the design itself', () => {
    expect(named(compose('note-cover-freeform', { title: '标题' }), '清单卡')).toBeUndefined()
    expect(named(compose('note-cover-freeform', { title: '标题', details: ['第一条'] }), '清单卡')).toBeDefined()
    const grid = compose('moments-grid-freeform', { title: '新年快乐' })
    expect((named(grid, '主图') as FreeformShapeElement).fill).toMatchObject({ type: 'image', src: '/templates/grid-sunset.svg' })
    expect(grid.document.slides[0].guides).toHaveLength(4)
    const photo = compose('moments-grid-freeform', { title: '新年快乐', image: 'https://example.com/fireworks.jpg' })
    expect((named(photo, '主图') as FreeformShapeElement).fill).toMatchObject({ type: 'image', src: 'https://example.com/fireworks.jpg' })
  })

  test('turns away decks, unknown ids and content without a title', () => {
    expect(composePoster('editorial-freeform', TALK)).toMatchObject({ ok: false, error: expect.stringContaining('create_document_from_content') })
    expect(composePoster('nope', TALK)).toMatchObject({ ok: false })
    expect(normalizePosterContent({ title: ' ' })).toContain('标题')
    expect(normalizePosterContent({ title: 'a', details: 'x' })).toContain('details')
  })
})
