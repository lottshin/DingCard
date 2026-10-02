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

  test('turns away decks, unknown ids and content without a title', () => {
    expect(composePoster('editorial-freeform', TALK)).toMatchObject({ ok: false, error: expect.stringContaining('create_document_from_content') })
    expect(composePoster('nope', TALK)).toMatchObject({ ok: false })
    expect(normalizePosterContent({ title: ' ' })).toContain('标题')
    expect(normalizePosterContent({ title: 'a', details: 'x' })).toContain('details')
  })
})
