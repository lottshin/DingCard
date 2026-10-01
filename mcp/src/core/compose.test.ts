import { describe, expect, test } from 'vitest'
import type { FreeformDocument, FreeformTextElement } from '../../../src/freeform/types'
import { composeDeck, normalizeDeckContent, type DeckContent } from './compose'
import { templateMarks } from './layoutIssues'
import { freeformTemplateIds } from './templates'

const CJK = /[㐀-鿿]/

const RICH: DeckContent = {
  title: '一周早餐不重样',
  subtitle: '上班族的五分钟早餐清单',
  pages: [
    { title: '周一：燕麦杯', points: ['燕麦：前一晚泡好', '酸奶：选无糖的', '蓝莓：一小把就够'], quote: '早餐吃好，上午不慌 —— 营养师' },
    { title: '周二：鸡蛋三明治', body: '全麦面包、煎蛋、生菜和番茄，五分钟搞定。' },
    { title: '周三：南瓜小米粥', body: '暖胃又顶饱。', points: ['南瓜切块', '小米洗净', '一起煮二十分钟', '最后焖五分钟'] },
  ],
  ending: { title: '明天吃什么？', body: '把这一周存下来。', points: ['收藏这一套', '周末备好食材'], quote: '吃好早餐 —— 编辑部' },
}

function allTexts(document: FreeformDocument): FreeformTextElement[] {
  return document.slides.flatMap((slide) => slide.nodes.filter((node): node is FreeformTextElement => node.type === 'text'))
}

function compose(templateId: string, content: unknown = RICH) {
  const result = composeDeck(templateId, content)
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('composeDeck', () => {
  test('leaves no sample sentence from any template in a filled deck', () => {
    const samples = templateMarks().samples
    for (const templateId of freeformTemplateIds()) {
      const { document } = compose(templateId)
      for (const node of allTexts(document)) {
        expect(samples.has(node.text.trim()), `${templateId}: 「${node.text}」`).toBe(false)
      }
    }
  })

  test('keeps every word it was given, somewhere on its page', () => {
    for (const templateId of freeformTemplateIds()) {
      const { document } = compose(templateId)
      const pages = document.slides.map((slide) => slide.nodes
        .filter((node): node is FreeformTextElement => node.type === 'text')
        .map((node) => node.text)
        .join('\n'))
      const words = (text: string) => text.split(/[：:，。、；\s—]+/).filter((part) => CJK.test(part))
      const expectOn = (page: number, text: string) => {
        for (const word of words(text)) expect(pages[page], `${templateId} p${page + 1}: ${word}`).toContain(word)
      }
      RICH.pages.forEach((page, index) => {
        expectOn(index + 1, page.title)
        page.points?.forEach((point) => expectOn(index + 1, point))
        if (page.body) expectOn(index + 1, page.body)
      })
      RICH.ending!.points!.forEach((point) => expectOn(4, point))
    }
  })

  test('numbers the pages by where they sit and counts them', () => {
    const { document, summary } = compose('checklist-freeform')
    expect(summary.slideCount).toBe(5)
    const ending = document.slides[4].nodes.filter((node): node is FreeformTextElement => node.type === 'text')
    expect(ending.find((node) => node.name === '刊头')?.text).toBe('FINAL CHECK / 05')
    expect(ending.find((node) => node.name === '完成进度')?.text).toBe('05 / 05')
    const second = document.slides[2].nodes.filter((node): node is FreeformTextElement => node.type === 'text')
    expect(second.find((node) => node.name === '刊头')?.text).toBe('CHECKLIST / 03')
  })

  test('lists the page titles on a cover that has room for contents', () => {
    const { document } = compose('checklist-freeform')
    const cover = document.slides[0].nodes.filter((node): node is FreeformTextElement => node.type === 'text')
    expect(['检查项一', '检查项二', '检查项三'].map((name) => cover.find((node) => node.name === name)?.text))
      .toEqual(['周一：燕麦杯', '周二：鸡蛋三明治', '周三：南瓜小米粥'])
  })

  test('puts points past the items after them: in the paragraph below, else in the last item', () => {
    const editorial = compose('editorial-freeform').document.slides[3].nodes
      .filter((node): node is FreeformTextElement => node.type === 'text')
    // The editorial paragraph sits above its steps, so the fourth point joins the last step.
    expect(editorial.find((node) => node.name === '步骤三')?.text).toBe('03\n一起煮二十分钟；最后焖五分钟')
    const blueprint = compose('blueprint-freeform').document.slides[3].nodes
      .filter((node): node is FreeformTextElement => node.type === 'text')
    expect(blueprint.find((node) => node.name === '装配步骤')?.text).toContain('最后焖五分钟')
  })

  test('drops the closing page when there is none, and quotes keep their source', () => {
    const { document } = compose('editorial-freeform', { ...RICH, ending: undefined })
    expect(document.slides).toHaveLength(4)
    const first = document.slides[1].nodes.filter((node): node is FreeformTextElement => node.type === 'text')
    expect(first.find((node) => node.name === '引文')?.text).toBe('“早餐吃好，上午不慌”')
    expect(first.find((node) => node.name === '引文注释')?.text).toBe('营养师')
  })

  test('lets long copy take the free room below it before shrinking it', () => {
    const long = '牛油果压泥抹在吐司上，撒点黑胡椒和海盐，再加一个溏心蛋。'.repeat(3)
    const grown = compose('editorial-freeform', { title: '标题', pages: [{ title: '长正文', body: long }] })
    const lead = grown.document.slides[1].nodes.find((node) => node.name === '导语') as FreeformTextElement
    // The steps and the quote are gone, so the paragraph has the page below it.
    expect(lead.fontSize).toBe(34)
    expect(lead.height).toBeGreaterThan(130)
    expect(grown.summary.shrunk).toEqual([])

    // On a page that keeps its steps there is no room to grow into.
    const tight = compose('editorial-freeform', { title: '标题', pages: [{ title: '长正文', body: long, points: ['一', '二'] }] })
    const squeezed = tight.document.slides[1].nodes.find((node) => node.name === '导语') as FreeformTextElement
    expect(squeezed.fontSize).toBeLessThan(34)
    expect(tight.summary.shrunk.map((item) => item.node)).toContain('导语')

    const huge = compose('editorial-freeform', { title: '标题', pages: [{ title: '太长', body: long.repeat(12) }] })
    expect(huge.summary.overflowing.map((item) => item.node)).toContain('导语')
  })

  test('rejects content it cannot place', () => {
    expect(normalizeDeckContent(null)).toBe('content 需要是对象')
    expect(normalizeDeckContent({ title: ' ', pages: [{ title: 'a' }] })).toContain('封面标题')
    expect(normalizeDeckContent({ title: 'a', pages: [] })).toContain('至少要有一页')
    expect(normalizeDeckContent({ title: 'a', pages: [{ body: 'x' }] })).toContain('缺少 title')
    expect(composeDeck('editorial-archive-markdown', RICH)).toMatchObject({ ok: false })
  })
})
