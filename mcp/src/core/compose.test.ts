import { describe, expect, test } from 'vitest'
import { TIMELINE_FONT_SIZE_MAX, timelineGeometry } from '../../../src/freeform/timeline'
import type { FreeformDocument, FreeformLineElement, FreeformTextElement } from '../../../src/freeform/types'
import { FREEFORM_DECK_LAYOUTS } from '../../../src/templates/registry'
import { composeDeck, largestFreeRectangleFor, layoutFor, normalizeDeckContent, type DeckContent } from './compose'
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

  test('takes a defense\'s 恳请各位老师批评指正 for words a deck may keep, not for copy left over', () => {
    const samples = templateMarks().samples
    expect(samples.has('恳请各位老师\n批评指正')).toBe(false)
    expect(samples.has('谢谢各位老师')).toBe(false)
    // The rest of the deck's samples still count.
    expect(samples.has('研究方法：\n问卷与街景分析')).toBe(true)
  })

  test('keeps every word it was given, somewhere on its page', () => {
    for (const templateId of freeformTemplateIds()) {
      const { document } = compose(templateId)
      // Lines a heading or a display paragraph was balanced into are read back as one.
      const pages = document.slides.map((slide) => slide.nodes
        .filter((node): node is FreeformTextElement => node.type === 'text')
        .map((node) => node.text.replace(/\n/g, ''))
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
    const onSection: DeckContent = { ...RICH, pages: RICH.pages.map((page) => ({ ...page, layout: 'section' as const })) }
    const editorial = compose('editorial-freeform', onSection).document.slides[3].nodes
      .filter((node): node is FreeformTextElement => node.type === 'text')
    // The editorial paragraph sits above its steps, so the fourth point joins the last step.
    expect(editorial.find((node) => node.name === '步骤三')?.text).toBe('03\n一起煮二十分钟；最后焖五分钟')
    const blueprint = compose('blueprint-freeform', onSection).document.slides[3].nodes
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
    const grown = compose('editorial-freeform', { title: '标题', pages: [{ title: '长正文', body: long, layout: 'section' }] })
    const lead = grown.document.slides[1].nodes.find((node) => node.name === '导语') as FreeformTextElement
    // The steps and the quote are gone, so the paragraph has the page below it.
    expect(lead.fontSize).toBe(38)
    expect(lead.height).toBeGreaterThan(130)
    expect(grown.summary.shrunk).toEqual([])

    // On a page that keeps its steps there is no room to grow into.
    const tight = compose('editorial-freeform', { title: '标题', pages: [{ title: '长正文', body: long, points: ['一', '二'], layout: 'section' }] })
    const squeezed = tight.document.slides[1].nodes.find((node) => node.name === '导语') as FreeformTextElement
    expect(squeezed.fontSize).toBeLessThan(38)
    expect(tight.summary.shrunk.map((item) => item.node)).toContain('导语')

    const huge = compose('editorial-freeform', { title: '标题', pages: [{ title: '太长', body: long.repeat(12), layout: 'section' }] })
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
          const { role, layout } = summary.pages[index]
          const series = templateId.replace(/-freeform$/, '') as keyof typeof FREEFORM_DECK_LAYOUTS
          const drawn = layout && layout !== 'section'
            ? FREEFORM_DECK_LAYOUTS[series]![layout]()
            : instance.document.slides[role === 'cover' ? 0 : role === 'section' ? 1 : 2]
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

  test('keeps a long step in its own column', () => {
    const onSection: DeckContent = { ...LONG, pages: LONG.pages.map((page) => ({ ...page, layout: 'section' as const })) }
    const steps = compose('editorial-freeform', onSection).document.slides[1].nodes
      .filter((node): node is FreeformTextElement => node.type === 'text' && node.name.startsWith('步骤'))
    expect(steps.map((node) => node.text)).toEqual(['01\n低角度的暖光：轮廓最清楚', '02\n天空还有颜色，别急着收工', '03\n路灯刚亮的那几分钟最好看'])
    // The columns still start where the template drew them.
    expect(steps.map((node) => node.x)).toEqual([88, 400, 712])
    expect(steps[0].x + steps[0].width).toBeLessThanOrEqual(steps[1].x)
    expect(steps[1].x + steps[1].width).toBeLessThanOrEqual(steps[2].x)
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
    // A heading that fits one line keeps it (the night flight's section page draws one).
    const onSection = { ...content, pages: content.pages.map((page) => ({ ...page, layout: 'section' as const })) }
    expect((compose('night-flight-freeform', onSection).document.slides[1].nodes
      .find((node) => node.name === '页标题') as FreeformTextElement).text).toBe('先把睡眠时间固定下来')
    // A title drawn as two texts splits where the two set most evenly, not at the first space.
    expect(heading('signal-freeform', 0, '标题上')).toBe('30 天养成')
    expect(heading('signal-freeform', 0, '标题下')).toBe('早起习惯')
  })

  test('sets a title between words a little smaller when its even break does not fit at its size', () => {
    const content = { title: '先把睡眠时间固定下来', pages: [{ title: '用一套固定的流程把内容做成系列', points: ['早睡一小时', '手机放门外', '每天同一时间起'] }] }
    // Six characters don't fit the brutalist cover's line at 140px: 时间 stays whole on the first line.
    const brutalist = compose('brutalist-freeform', content)
    const cover = brutalist.document.slides[0].nodes.find((node) => node.name === '主标题') as FreeformTextElement
    expect(cover.text).toBe('先把睡眠时间\n固定下来')
    expect(cover.fontSize).toBeLessThan(140)
    expect(cover.fontSize).toBeGreaterThanOrEqual(140 * 0.72)
    expect(brutalist.summary.shrunk).toContainEqual(expect.objectContaining({ page: 1, node: '主标题', from: 140, to: cover.fontSize }))
    // The signal list page's narrow title column takes five lines, each whole words.
    const signal = compose('signal-freeform', content)
    expect((signal.document.slides[1].nodes.find((node) => node.name === '主标题') as FreeformTextElement).text)
      .toBe('用一套\n固定的\n流程\n把内容\n做成系列')
  })

  test('takes a page from another deck template when the page names one', () => {
    const mixed = compose('editorial-freeform', {
      title: '一周早餐不重样',
      pages: [
        { title: '周一：燕麦杯', body: '前一晚泡好。' },
        { title: '周二：鸡蛋三明治', body: '五分钟搞定。', templateId: 'night-flight-freeform' },
      ],
      ending: { title: '明天吃什么？', body: '把这一周存下来。', templateId: 'checklist-freeform' },
    })
    expect(mixed.summary.pages.map((page) => [page.role, page.templateId])).toEqual([
      ['cover', 'editorial-freeform'],
      ['section', 'editorial-freeform'],
      ['section', 'night-flight-freeform'],
      ['ending', 'checklist-freeform'],
    ])
    // Each page looks like the template it came from, filled with its own words.
    const flight = instantiateTemplate('night-flight-freeform')
    const checklist = instantiateTemplate('checklist-freeform')
    if (flight.workspace !== 'freeform' || checklist.workspace !== 'freeform') throw new Error('expected freeform templates')
    expect(mixed.document.slides[2].background).toEqual(flight.document.slides[1].background)
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

  test('picks the inner page that suits what a page holds', () => {
    const all = new Set(['statement', 'list', 'data', 'closing'] as const)
    const chart = { kind: 'bar' as const, labels: ['一'], series: [{ values: [1] }] }
    expect(layoutFor({ title: 't', body: '一句话' }, all)).toBe('statement')
    expect(layoutFor({ title: 't', points: ['一', '二'] }, all)).toBe('statement')
    expect(layoutFor({ title: 't', body: 'b', points: ['一', '二', '三'] }, all)).toBe('list')
    expect(layoutFor({ title: 't', chart, points: ['一'] }, all)).toBe('data')
    // A quote keeps the section page, which draws one; so do a drawing with many points.
    expect(layoutFor({ title: 't', points: ['一', '二', '三'], quote: 'q' }, all)).toBe('section')
    expect(layoutFor({ title: 't', chart, points: ['一', '二', '三'] }, all)).toBe('section')
    // The page's own choice wins; one the deck doesn't draw falls back to the section page.
    expect(layoutFor({ title: 't', body: 'b', layout: 'list' }, all)).toBe('list')
    expect(layoutFor({ title: 't', body: 'b' }, new Set())).toBe('section')
    expect(layoutFor({ title: 't', body: 'b', layout: 'data' }, new Set(['list'] as const))).toBe('section')
    expect(normalizeDeckContent({ title: 'a', pages: [{ title: 'b', layout: 'grid' }] })).toContain('layout 只能是 section / statement / list / data')

    const { summary } = compose('editorial-freeform')
    expect(summary.pages.map((page) => page.layout)).toEqual([undefined, 'section', 'statement', 'list', undefined])
    // Every deck draws these pages, so the same content takes the same pages on each.
    for (const templateId of ['checklist-freeform', 'signal-freeform', 'night-flight-freeform', 'brutalist-freeform', 'blueprint-freeform']) {
      expect(compose(templateId).summary.pages.map((page) => page.layout), templateId).toEqual([undefined, 'section', 'statement', 'list', undefined])
    }
  })

  test('spreads fewer points down a list page, keeping them a list', () => {
    const rows = (points: string[]) => compose('editorial-freeform', { title: 't', pages: [{ title: '清单', points }] })
      .document.slides[1].nodes.filter((node): node is FreeformTextElement => node.type === 'text' && node.name.startsWith('要点'))
    const five = rows(['一', '二', '三', '四', '五'])
    const three = rows(['一', '二', '三'])
    expect(five.map((node) => node.text)).toEqual(['一', '二', '三', '四', '五'])
    const pitch = five[1].y - five[0].y
    // Three points take the room of more rows, at most 1.6 pitches apart, from the same first row.
    expect(three[0].y).toBe(five[0].y)
    expect(three[1].y - three[0].y).toBe(Math.round(pitch * 1.6))
    const page = compose('editorial-freeform', { title: 't', pages: [{ title: '清单', points: ['一', '二', '三'] }] }).document.slides[1]
    // A row's number and rule move with its point; unused rows go.
    expect(page.nodes.find((node) => node.name === '编号二')!.y - three[1].y).toBe(6)
    expect(page.nodes.some((node) => node.name === '要点四' || node.name === '编号四')).toBe(false)
  })

  test('sets a data page\'s drawing in the middle of its room, and a goal there as a ring', () => {
    const composed = compose('editorial-freeform', {
      title: 't',
      pages: [
        { title: '收入', table: { header: ['来源', '金额'], rows: [['广告', '3000'], ['带货', '2000']] } },
        { title: '年度目标', progress: { value: 62.5, label: '十万粉丝' } },
      ],
    })
    expect(composed.summary.pages.map((page) => page.layout)).toEqual([undefined, 'data', 'data'])
    const [table, progress] = composed.summary.placed!
    const rule = composed.document.slides[1].nodes.find((node) => node.name === '图表顶线') as FreeformLineElement
    const footer = composed.document.slides[1].nodes.find((node) => node.name === '页脚线') as FreeformLineElement
    // As much room above the table as below it, between the page's rule and its footer.
    const above = table.y - (rule.y + rule.height)
    const below = footer.y - (table.y + table.height)
    expect(Math.abs(above - below)).toBeLessThan(40)
    expect(table.height).toBe(3 * 96)
    const ring = composed.document.slides[2].nodes.find((node) => node.type === 'progress')
    expect(ring).toMatchObject({ progressKind: 'ring', value: 62.5, label: '十万粉丝' })
    expect(progress.width).toBe(progress.height)
    // The template's sample chart never stays.
    expect(composed.document.slides.flatMap((slide) => slide.nodes).some((node) => node.name === '示例图表')).toBe(false)
  })

  test('gives an ending that is only a sentence its closing page, and a cover without a subtitle the page titles', () => {
    const composed = compose('signal-freeform', {
      title: '公众号半年复盘',
      pages: [{ title: '阅读量翻了两番', body: '一句话。' }, { title: '下半年的打法', body: '月更栏目。' }],
      ending: { title: '明年见', body: '把节奏放慢，把标准提高。' },
    })
    expect(composed.summary.pages.map((page) => [page.role, page.layout])).toEqual([
      ['cover', undefined], ['section', 'statement'], ['section', 'statement'], ['ending', 'closing'],
    ])
    const ending = composed.document.slides[3].nodes.filter((node): node is FreeformTextElement => node.type === 'text')
    expect(ending.find((node) => node.name === '收束句')?.text).toBe('把节奏放慢，把标准提高。')
    expect(ending.some((node) => node.name === '行动标题')).toBe(false)
    const cover = composed.document.slides[0].nodes.filter((node): node is FreeformTextElement => node.type === 'text')
    expect(cover.find((node) => node.name === '主张')?.text).toBe('阅读量翻了两番 · 下半年的打法')
    // A longer contents line breaks between titles, never inside one.
    const many = compose('signal-freeform', { title: 't', pages: ['阅读量翻了两番', '什么内容涨粉', '下半年的打法'].map((title) => ({ title, body: 'b' })) })
    expect((many.document.slides[0].nodes.find((node) => node.name === '主张') as FreeformTextElement).text)
      .toBe('阅读量翻了两番 · 什么内容涨粉\n下半年的打法')
    // A cover lists as many titles as its lead holds, not every page.
    const seven = compose('editorial-freeform', { title: 't', pages: ['为什么要自己冲', '准备这五样', '粉水比决定浓淡', '三种烘焙怎么选', '一杯咖啡的四分钟', '我的练习进度', '最容易犯的错'].map((title) => ({ title, body: 'b' })) })
    const listed = (seven.document.slides[0].nodes.find((node) => node.name === '导语') as FreeformTextElement).text
    expect(listed.startsWith('为什么要自己冲 · 准备这五样')).toBe(true)
    expect(listed).not.toContain('最容易犯的错')
    expect(seven.summary.overflowing).toEqual([])
    // A claim on two lines breaks after its comma.
    const claim = compose('signal-freeform', { title: 't', pages: [{ title: '下半年的打法', body: '把复盘固定成月更栏目，教程做成系列。' }, { title: 'b', body: 'c' }] })
    expect((claim.document.slides[1].nodes.find((node) => node.name === '主张') as FreeformTextElement).text)
      .toBe('把复盘固定成月更栏目，\n教程做成系列。')
    // A subtitle given is the subtitle; an ending with points keeps the ending page.
    const told = compose('signal-freeform', { title: 't', subtitle: '副标题', pages: [{ title: 'a' }, { title: 'b' }], ending: { title: 'e', points: ['一'] } })
    expect((told.document.slides[0].nodes.find((node) => node.name === '主张') as FreeformTextElement).text).toBe('副标题')
    expect(told.summary.pages[3].layout).toBeUndefined()
  })

  test('closes up an editorial section page that has no paragraph', () => {
    const page = (content: DeckContent) => compose('editorial-freeform', content).document.slides[1].nodes
    const withLead = page({ title: 't', pages: [{ title: '周四到周日', body: '提前腌上。', points: ['周四', '周五'], quote: '十分钟出锅 —— 老王家' }] })
    const without = page({ title: 't', pages: [{ title: '周四到周日', points: ['周四', '周五'], quote: '十分钟出锅 —— 老王家' }] })
    const y = (nodes: typeof without, name: string) => nodes.find((node) => node.name === name)!.y
    // The rule, the steps and the quote move up into the paragraph's place; the footer stays.
    const lead = withLead.find((node) => node.name === '导语')!
    expect(y(without, '正文分隔线')).toBe(lead.y)
    expect(y(withLead, '引文底板') - y(without, '引文底板')).toBe(y(withLead, '正文分隔线') - lead.y)
    expect(y(without, '页脚线')).toBe(y(withLead, '页脚线'))
  })

  test('rejects content it cannot place', () => {
    expect(normalizeDeckContent(null)).toBe('content 需要是对象')
    expect(normalizeDeckContent({ title: ' ', pages: [{ title: 'a' }] })).toContain('封面标题')
    expect(normalizeDeckContent({ title: 'a', pages: [] })).toContain('至少要有一页')
    expect(normalizeDeckContent({ title: 'a', pages: [{ body: 'x' }] })).toContain('缺少 title')
    expect(composeDeck('column-markdown', RICH)).toMatchObject({ ok: false })
  })
})

describe('deck data elements', () => {
  test('places a chart, a table, a timeline and a progress on their pages', () => {
    const composed = composeDeck('editorial-freeform', {
      title: '公众号半年成绩单',
      pages: [
        {
          title: '阅读量一路涨',
          points: ['坚持周更', '标题花心思'],
          chart: {
            kind: 'ring',
            labels: ['一月', '二月', '三月'],
            series: [{ name: '阅读', values: [120, 240, 480] }],
          },
        },
        {
          title: '收入构成',
          table: { header: ['来源', '金额', '占比'], rows: [['广告', '3000', '60%'], ['带货', '2000', '40%']] },
        },
        {
          title: '这半年走过的节点',
          timeline: [
            { label: '3 月', text: '注册账号，发出第一篇笔记' },
            { label: '6 月', text: '粉丝破万' },
          ],
        },
        {
          title: '年度目标',
          progress: { value: 62.5, label: '十万粉丝' },
        },
      ],
    })
    expect(composed.ok).toBe(true)
    if (!composed.ok) return
    // Every drawing landed somewhere readable on its page.
    expect(composed.summary.placed).toHaveLength(4)
    expect(composed.summary.unplaced).toBeUndefined()
    const kinds = composed.summary.placed!.map((item) => item.kind)
    expect(kinds).toEqual(['chart', 'table', 'timeline', 'progress'])
    for (const item of composed.summary.placed!) {
      expect(item.width).toBeGreaterThan(0)
      expect(item.height).toBeGreaterThan(0)
    }
    const nodes = composed.document.slides.flatMap((slide) => slide.nodes)
    const chart = nodes.find((node) => node.type === 'chart')
    // A ring is parts of a whole: its values are on, so its key gives each slice its share.
    expect(chart).toMatchObject({
      type: 'chart',
      chartKind: 'ring',
      labels: ['一月', '二月', '三月'],
      series: [{ name: '阅读', values: [120, 240, 480] }],
      showValues: true,
    })
    const table = nodes.find((node) => node.type === 'table')
    expect(table).toMatchObject({
      type: 'table',
      rows: 3,
      cols: 3,
      cells: ['来源', '金额', '占比', '广告', '3000', '60%', '带货', '2000', '40%'],
    })
    const timeline = nodes.find((node) => node.type === 'timeline')
    expect(timeline).toMatchObject({
      type: 'timeline',
      items: [
        { label: '3 月', text: '注册账号，发出第一篇笔记' },
        { label: '6 月', text: '粉丝破万' },
      ],
    })
    const progress = nodes.find((node) => node.type === 'progress')
    expect(progress).toMatchObject({ type: 'progress', value: 62.5, label: '十万粉丝' })
    // Nothing the page draws overlaps the drawings.
    for (const slide of composed.document.slides) {
      for (const item of composed.summary.placed ?? []) {
        if (item.slideId !== slide.id) continue
        const element = slide.nodes.find((node) => node.name === item.node)
        expect(element).toBeDefined()
      }
    }
  })

  test('a plain table takes no header row, a timeline with room runs down its spine', () => {
    const composed = composeDeck('editorial-freeform', {
      title: '清单',
      pages: [
        { title: '排片表', table: { rows: [['9:00', '开幕式'], ['10:00', '圆桌']] } },
        { title: '流程', timeline: [{ text: '第一步' }, { text: '第二步' }, { text: '第三步' }], layout: 'section' },
        { title: '流程', timeline: [{ text: '第一步' }, { text: '第二步' }, { text: '第三步' }] },
      ],
    })
    expect(composed.ok).toBe(true)
    if (!composed.ok) return
    const nodes = composed.document.slides.flatMap((slide) => slide.nodes)
    const table = nodes.find((node) => node.type === 'table')
    expect(table).toMatchObject({ rows: 2, cols: 2, headerRow: false })
    const [stacked, across] = nodes.filter((node) => node.type === 'timeline')
    if (stacked?.type !== 'timeline' || across?.type !== 'timeline') throw new Error('no timelines')
    // Under a section page's words there is the height for three entries stacked, body-sized;
    // a data page gives each entry rows tall enough for display-sized words.
    expect(stacked.horizontal).toBeUndefined()
    expect(stacked.height).toBeGreaterThanOrEqual(3 * 104 * 0.8)
    expect(across.horizontal).toBeUndefined()
    expect(across.height).toBe(3 * 150)
    expect(timelineGeometry(across.width, across.height, across.items).fontSize).toBe(TIMELINE_FONT_SIZE_MAX)
  })

  test('a signal data page without a lead gives its drawing the lead\'s room', () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({ label: `${index + 1} 月`, text: '一件值得记下的事' }))
    const timelineOf = (page: Record<string, unknown>) => {
      const composed = composeDeck('signal-freeform', { title: '这一年', pages: [{ title: '节点', timeline: entries, ...page }] })
      if (!composed.ok) throw new Error(composed.error)
      const node = composed.document.slides[1].nodes.find((entry) => entry.type === 'timeline')
      if (node?.type !== 'timeline') throw new Error('no timeline')
      return node
    }
    // Eight entries under the band: the rule comes up into the lead's place and the entries
    // take its room, their words as large as the other decks set eight (28px, was 24px).
    const bare = timelineOf({})
    expect(bare.y).toBeLessThan(640)
    expect(timelineGeometry(bare.width, bare.height, bare.items).fontSize).toBeGreaterThanOrEqual(28)
    // With a lead the drawing keeps to the room under it.
    const led = timelineOf({ body: '一年里最重要的八个时刻。' })
    expect(led.y).toBeGreaterThan(bare.y + 100)
  })

  test('sets eight timeline entries in two columns when one column would leave them small', () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({ label: `${index + 1} 月`, text: '一件值得记下的事' }))
    for (const body of [undefined, '一年里最重要的八个时刻。']) {
      const composed = composeDeck('signal-freeform', { title: '这一年', pages: [{ title: '节点', ...(body ? { body } : {}), timeline: entries }] })
      if (!composed.ok) throw new Error(composed.error)
      const drawn = composed.document.slides[1].nodes.filter((node) => node.type === 'timeline')
      if (drawn[0]?.type !== 'timeline' || drawn[1]?.type !== 'timeline') throw new Error('expected two columns')
      // The left column takes the odd one; both read at display size, which one column of eight cannot.
      expect(drawn[0].items.map((item) => item.label)).toEqual(['1 月', '2 月', '3 月', '4 月'])
      expect(drawn[1].items.map((item) => item.label)).toEqual(['5 月', '6 月', '7 月', '8 月'])
      expect(drawn[1].x).toBeGreaterThan(drawn[0].x + drawn[0].width)
      expect(drawn[1].y).toBe(drawn[0].y)
      for (const node of drawn) expect(timelineGeometry(node.width, node.height, node.items).fontSize).toBe(TIMELINE_FONT_SIZE_MAX)
      // One column of eight in the same room would set its words at 28px.
      expect(timelineGeometry(952, 680, entries).fontSize).toBeLessThanOrEqual(28)
    }
    // Four entries read at display size in one column already.
    const four = composeDeck('signal-freeform', { title: '这一年', pages: [{ title: '节点', timeline: entries.slice(0, 4) }] })
    if (!four.ok) throw new Error(four.error)
    expect(four.document.slides[1].nodes.filter((node) => node.type === 'timeline')).toHaveLength(1)
  })

  test('takes the page column and the page colours', () => {
    const composed = composeDeck('night-flight-freeform', {
      title: '复盘',
      pages: [
        { title: '季度营收', chart: { kind: 'bar', labels: ['Q1', 'Q2'], series: [{ name: '去年', values: [3, 4] }, { name: '今年', values: [4, 6] }] } },
        { title: '门店', table: { header: ['门店', '营收'], rows: [['南山', '128'], ['福田', '96']] } },
      ],
    })
    expect(composed.ok).toBe(true)
    if (!composed.ok) return
    const nodes = composed.document.slides.flatMap((slide) => slide.nodes)
    const chart = nodes.find((node) => node.type === 'chart')
    if (!chart || chart.type !== 'chart') throw new Error('no chart')
    // Across the deck's ruled column, not a fixed 480px block.
    expect(chart.x).toBe(88)
    expect(chart.width).toBe(904)
    // Two unnamed colours: a quiet series and the deck's accent, never the same.
    expect(chart.series[0].color).not.toBe(chart.series[1].color)
    // Light words on the dark deck.
    expect(chart.ink).toBeDefined()
    const table = nodes.find((node) => node.type === 'table')
    if (!table || table.type !== 'table') throw new Error('no table')
    expect(table.ink).toBe(chart.ink)
  })

  test('takes the accent from a mark drawn as a path', () => {
    // Spotlight's only colour is the orange sun in the corner, a filled path.
    const composed = composeDeck('spotlight-freeform', {
      title: '复盘',
      pages: [{ title: '季度营收', chart: { kind: 'bar', labels: ['Q1', 'Q2', 'Q3'], series: [{ values: [3, 4, 6] }] } }],
    })
    if (!composed.ok) throw new Error(composed.error)
    const chart = composed.document.slides.flatMap((slide) => slide.nodes).find((node) => node.type === 'chart')
    if (!chart || chart.type !== 'chart') throw new Error('no chart')
    // The sun's orange, deepened a step to read on the paper.
    expect(chart.series[0].color).toBe('#e6511c')
  })

  test('rejects two data elements on one page and bad data', () => {
    expect(composeDeck('editorial-freeform', {
      title: 'a',
      pages: [{ title: 'b', chart: { kind: 'bar', labels: ['x'], series: [{ values: [1] }] }, progress: { value: 10 } }],
    })).toMatchObject({ ok: false, error: expect.stringContaining('只能带一种数据元素') })
    expect(composeDeck('editorial-freeform', {
      title: 'a',
      pages: [{ title: 'b', chart: { kind: 'pie', labels: ['x'], series: [{ values: [1] }] } }],
    })).toMatchObject({ ok: false, error: expect.stringContaining('chart.kind') })
    expect(composeDeck('editorial-freeform', {
      title: 'a',
      pages: [{ title: 'b', chart: { kind: 'bar', labels: ['x', 'y'], series: [{ values: [1] }] } }],
    })).toMatchObject({ ok: false, error: expect.stringContaining('values 长度要和 labels 一致') })
    expect(composeDeck('editorial-freeform', {
      title: 'a',
      pages: [{ title: 'b', table: { header: ['a', 'b'], rows: [['one']] } }],
    })).toMatchObject({ ok: false, error: expect.stringContaining('按行对齐') })
    expect(composeDeck('editorial-freeform', {
      title: 'a',
      pages: [{ title: 'b', table: { rows: Array.from({ length: 13 }, () => ['x']) } }],
    })).toMatchObject({ ok: false, error: expect.stringContaining('2–12 行') })
    expect(composeDeck('editorial-freeform', {
      title: 'a',
      pages: [{ title: 'b', timeline: [{ text: '只有一步' }] }],
    })).toMatchObject({ ok: false, error: expect.stringContaining('timeline') })
    expect(composeDeck('editorial-freeform', {
      title: 'a',
      pages: [{ title: 'b', progress: { value: 101 } }],
    })).toMatchObject({ ok: false, error: expect.stringContaining('progress.value') })
  })
})

describe('largestFreeRectangleFor', () => {
  test('finds the whole page when nothing blocks, and the band a line leaves', () => {
    // An empty page is free almost everywhere.
    const empty = largestFreeRectangleFor(1080, 1440, [])
    expect(empty.width * empty.height).toBeGreaterThan(1000 * 1300)
    // A divider near the bottom leaves a wide band above it.
    const band = largestFreeRectangleFor(1080, 1440, [{ x: 88, y: 1294, width: 904, height: 12 }])
    expect(band.width).toBeGreaterThanOrEqual(1000)
    expect(band.height).toBeGreaterThan(1200)
    // A body of copy in the middle leaves the lower half.
    const half = largestFreeRectangleFor(1080, 1440, [
      { x: 80, y: 192, width: 920, height: 300 },
      { x: 88, y: 1294, width: 904, height: 12 },
    ])
    expect(half.width).toBeGreaterThanOrEqual(880)
    expect(half.height).toBeGreaterThanOrEqual(700)
    // A tall strip beside the copy is not mistaken for the best room when a
    // wider band sits below: areas are compared, not edges.
    const strip = largestFreeRectangleFor(1080, 1440, [
      { x: 80, y: 24, width: 920, height: 1400 },
    ])
    expect(strip.width).toBeLessThanOrEqual(56)
    expect(strip.height).toBeGreaterThan(1300)
  })
})
