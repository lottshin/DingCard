import { describe, expect, test } from 'vitest'
import type { FreeformDocument, FreeformTextElement } from '../../../src/freeform/types'
import { composeDeck, normalizeDeckContent, type DeckContent } from './compose'
import { templateMarks } from './layoutIssues'
import { freeformTemplateIds, instantiateTemplate } from './templates'

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

/** Points long enough to need more than one line in most items. */
const LONG: DeckContent = {
  title: '日落前十分钟的街头摄影',
  subtitle: '一台手机就够，关键是等光',
  pages: [
    { title: '光线最好的时候', points: ['低角度的暖光：轮廓最清楚', '天空还有颜色，别急着收工', '路灯刚亮的那几分钟最好看'] },
    {
      title: '霓虹下的第一条街道',
      body: '先找一面会反光的墙，再等人走进画面。',
      points: ['把最亮的招牌拍成一整页的主角：注释说明一下为什么', '雨后的路面会反光，倒影比招牌更好看：低一点机位'],
    },
    { title: '构图', points: ['人物放在三分线上，留出他要走去的方向', '前景压一点暗部，画面更有层次'], quote: '等光比找角度更重要 —— 一位老摄影师' },
  ],
  ending: { title: '出门前检查一下', points: ['电量和存储空间都够吗', '镜头擦干净了吗', '想好今天只拍一种光'] },
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
    expect(lead.fontSize).toBe(38)
    expect(lead.height).toBeGreaterThan(130)
    expect(grown.summary.shrunk).toEqual([])

    // On a page that keeps its steps there is no room to grow into.
    const tight = compose('editorial-freeform', { title: '标题', pages: [{ title: '长正文', body: long, points: ['一', '二'] }] })
    const squeezed = tight.document.slides[1].nodes.find((node) => node.name === '导语') as FreeformTextElement
    expect(squeezed.fontSize).toBeLessThan(38)
    expect(tight.summary.shrunk.map((item) => item.node)).toContain('导语')

    const huge = compose('editorial-freeform', { title: '标题', pages: [{ title: '太长', body: long.repeat(12) }] })
    expect(huge.summary.overflowing.map((item) => item.node)).toContain('导语')
  })

  test('never runs the copy it writes into another text', () => {
    const overlap = (a: FreeformTextElement, b: FreeformTextElement) =>
      Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x)
      && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
    for (const templateId of freeformTemplateIds()) {
      const instance = instantiateTemplate(templateId)
      if (instance.workspace !== 'freeform') continue
      for (const content of [RICH, LONG]) {
        const { document, summary } = compose(templateId, content)
        document.slides.forEach((slide, index) => {
          const role = summary.pages[index].role
          const drawn = instance.document.slides[role === 'cover' ? 0 : role === 'section' ? 1 : 2]
          // Texts the template itself draws over each other are its own choice.
          const untouched = (node: FreeformTextElement) => drawn.nodes.some((other) =>
            other.type === 'text' && other.name === node.name && other.text === node.text
            && other.x === node.x && other.y === node.y && other.width === node.width && other.height === node.height)
          const texts = slide.nodes.filter((node): node is FreeformTextElement => node.type === 'text')
          texts.forEach((a, at) => texts.slice(at + 1).forEach((b) => {
            if (!overlap(a, b)) return
            expect(untouched(a) && untouched(b), `${templateId} p${index + 1}: ${a.name} / ${b.name}`).toBe(true)
          }))
        })
      }
    }
  })

  test('keeps a long step in its own column, and a sign title off the note under it', () => {
    const steps = compose('editorial-freeform', LONG).document.slides[1].nodes
      .filter((node): node is FreeformTextElement => node.type === 'text' && node.name.startsWith('步骤'))
    expect(steps.map((node) => node.text)).toEqual(['01\n低角度的暖光：轮廓最清楚', '02\n天空还有颜色，别急着收工', '03\n路灯刚亮的那几分钟最好看'])
    // The columns still start where the template drew them.
    expect(steps.map((node) => node.x)).toEqual([88, 400, 712])
    expect(steps[0].x + steps[0].width).toBeLessThanOrEqual(steps[1].x)
    expect(steps[1].x + steps[1].width).toBeLessThanOrEqual(steps[2].x)

    const neon = compose('neon-freeform', LONG).document.slides[2].nodes
    const title = neon.find((node) => node.name === '灯牌标题二') as FreeformTextElement
    const note = neon.find((node) => node.name === '灯牌注释二') as FreeformTextElement
    const card = neon.find((node) => node.name === '灯牌底板二')!
    // The point's own words, its two lines broken evenly.
    expect([title.text.replace(/\n/g, ''), note.text]).toEqual(['把最亮的招牌拍成一整页的主角', '注释说明一下为什么'])
    expect(title.y + title.height).toBeLessThanOrEqual(note.y)
    expect(title.y).toBeGreaterThanOrEqual(card.y)
  })

  test('keeps points in the items when they fit the room the items can grow into', () => {
    const page = compose('signal-freeform', LONG).document.slides[3].nodes
      .filter((node): node is FreeformTextElement => node.type === 'text')
    expect(page.find((node) => node.name === '证据一')?.text.replace(/\n/g, '')).toBe('人物放在三分线上，留出他要走去的方向')
    expect(page.find((node) => node.name === '证据二')?.text.replace(/\n/g, '')).toBe('前景压一点暗部，画面更有层次')
    expect(page.some((node) => node.name === '左栏正文')).toBe(false)
  })

  test('sets headings in even lines, broken between words', () => {
    const content = { title: '30 天养成早起习惯', pages: [{ title: '先把睡眠时间固定下来', body: '先固定入睡时间。' }] }
    const heading = (templateId: string, page: number, name: string) => (compose(templateId, content).document.slides[page].nodes
      .find((node) => node.name === name) as FreeformTextElement).text
    expect(heading('editorial-freeform', 0, '主标题')).toBe('30 天养成\n早起习惯')
    expect(heading('editorial-freeform', 1, '标题')).toBe('先把睡眠时间\n固定下来')
    // A heading that fits one line keeps it.
    expect(heading('night-flight-freeform', 1, '页标题')).toBe('先把睡眠时间固定下来')
    // A title drawn as two texts splits where the two set most evenly, not at the first space.
    expect(heading('signal-freeform', 0, '标题上')).toBe('30 天养成')
    expect(heading('signal-freeform', 0, '标题下')).toBe('早起习惯')
  })

  test('takes a page from another deck template when the page names one', () => {
    const mixed = compose('editorial-freeform', {
      title: '一周早餐不重样',
      pages: [
        { title: '周一：燕麦杯', body: '前一晚泡好。' },
        { title: '周二：鸡蛋三明治', body: '五分钟搞定。', templateId: 'neon-freeform' },
      ],
      ending: { title: '明天吃什么？', body: '把这一周存下来。', templateId: 'checklist-freeform' },
    })
    expect(mixed.summary.pages.map((page) => [page.role, page.templateId])).toEqual([
      ['cover', 'editorial-freeform'],
      ['section', 'editorial-freeform'],
      ['section', 'neon-freeform'],
      ['ending', 'checklist-freeform'],
    ])
    // Each page looks like the template it came from, filled with its own words.
    const neon = instantiateTemplate('neon-freeform')
    const checklist = instantiateTemplate('checklist-freeform')
    if (neon.workspace !== 'freeform' || checklist.workspace !== 'freeform') throw new Error('expected freeform templates')
    expect(mixed.document.slides[2].background).toEqual(neon.document.slides[1].background)
    expect(mixed.document.slides[3].background).toEqual(checklist.document.slides[2].background)
    const words = (index: number) => mixed.document.slides[index].nodes.flatMap((node) => (node.type === 'text' ? [node.text.replace(/\n/g, '')] : []))
    expect(words(2)).toContain('周二：鸡蛋三明治')
    expect(words(3)).toContain('明天吃什么？')

    // Only deck templates lend pages.
    expect(composeDeck('editorial-freeform', { title: 'a', pages: [{ title: 'b', templateId: 'talk-poster-freeform' }] }))
      .toMatchObject({ ok: false, error: expect.stringContaining('第 1 个小节') })
    expect(composeDeck('editorial-freeform', { title: 'a', pages: [{ title: 'b' }], ending: { title: 'c', templateId: 'nope' } }))
      .toMatchObject({ ok: false, error: expect.stringContaining('结尾页') })
  })

  test('rejects content it cannot place', () => {
    expect(normalizeDeckContent(null)).toBe('content 需要是对象')
    expect(normalizeDeckContent({ title: ' ', pages: [{ title: 'a' }] })).toContain('封面标题')
    expect(normalizeDeckContent({ title: 'a', pages: [] })).toContain('至少要有一页')
    expect(normalizeDeckContent({ title: 'a', pages: [{ body: 'x' }] })).toContain('缺少 title')
    expect(composeDeck('editorial-archive-markdown', RICH)).toMatchObject({ ok: false })
  })
})
