import { describe, expect, test } from 'vitest'
import type { FreeformImageElement, FreeformShapeElement, FreeformTableElement, FreeformTextElement } from '../../../src/freeform/types'
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

  test('fills the chart slot with labels and series, keeping the template colours', () => {
    const result = compose('data-roundup-freeform', {
      title: '季度渠道盘点',
      chart: {
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [
          { name: '图文', values: [12, 18, 15, 24] },
          { name: '视频', values: [8, 14, 20, 30], color: '#e11d48' },
        ],
      },
    })
    const chart = result.document.slides[0].nodes.find((node) => node.type === 'chart')
    if (!chart || chart.type !== 'chart') throw new Error('Expected a chart')
    expect(chart.labels).toEqual(['Q1', 'Q2', 'Q3', 'Q4'])
    expect(chart.series.map((entry) => entry.name)).toEqual(['图文', '视频'])
    expect(chart.series[0].values).toEqual([12, 18, 15, 24])
    // The colour the content leaves out keeps the template's; the given one lands.
    expect(chart.series[0].color).toBe('#d9442a')
    expect(chart.series[1].color).toBe('#e11d48')
    // The template's stacking and kind stay as drawn.
    expect(chart.chartKind).toBe('bar')
    expect('barMode' in chart).toBe(false)

    // A ragged series rejects the whole poster with a reason.
    const ragged = composePoster('data-roundup-freeform', {
      title: '季度盘点',
      chart: { series: [{ name: '图文', values: [1, 2] }] },
    })
    expect(ragged.ok).toBe(false)
    if (!ragged.ok) expect(ragged.error).toContain('6 个数值')

    // A template with no chart slot reports chart as unused.
    const unused = compose('quote-card-freeform', { title: '一句', chart: { series: [{ values: [1] }] } })
    expect(unused.summary.unused).toContain('chart')
  })

  test('redraws the chart as the kind the content asks for, keeping the template colours', () => {
    const radar = compose('data-roundup-freeform', {
      title: '产品能力雷达',
      chart: {
        kind: 'radar',
        labels: ['洞察', '方案', '落地', '沟通', '数据', '复盘'],
        series: [
          { name: '入职', values: [4, 5, 3, 6, 4, 5] },
          { name: '现在', values: [8, 7, 9, 7, 8, 6] },
        ],
      },
    })
    const chart = radar.document.slides[0].nodes.find((node) => node.type === 'chart')
    if (!chart || chart.type !== 'chart') throw new Error('Expected a chart')
    expect(chart.chartKind).toBe('radar')
    expect(chart.labels).toEqual(['洞察', '方案', '落地', '沟通', '数据', '复盘'])
    expect(chart.series.map((entry) => entry.name)).toEqual(['入职', '现在'])
    // The template's one series colour carries over; a second series takes the default.
    expect(chart.series.map((entry) => entry.color)).toEqual(['#d9442a', '#1d4ed8'])

    const ring = compose('data-roundup-freeform', {
      title: '这一周的时间去哪了',
      chart: { kind: 'ring', labels: ['睡觉', '上班', '读书', '健身', '发呆'], series: [{ values: [56, 50, 12, 6, 10] }] },
      details: ['睡觉：56 小时', '上班：50 小时', '读书：12 小时'],
    })
    const ringChart = ring.document.slides[0].nodes.find((node) => node.type === 'chart')
    expect(ringChart?.type === 'chart' ? ringChart.chartKind : null).toBe('ring')
    // The stats split on the colon into their label and value nodes.
    expect((named(ring, '标签一') as FreeformTextElement | undefined)?.text).toBe('睡觉')
    expect((named(ring, '信息三') as FreeformTextElement | undefined)?.text).toBe('12 小时')

    // A kind the chart element doesn't draw is turned away.
    expect(normalizePosterContent({ title: 'a', chart: { kind: 'pie', series: [{ values: [1] }] } })).toContain('kind')
    // Without a kind the template's chart kind stays.
    const bare = compose('data-roundup-freeform', { title: '盘点', chart: { series: [{ values: [1, 2, 3, 4, 5, 6] }] } })
    const bareChart = bare.document.slides[0].nodes.find((node) => node.type === 'chart')
    expect(bareChart?.type === 'chart' ? bareChart.chartKind : null).toBe('bar')
  })

  test('fills the birthday card and keeps its confetti', () => {
    const result = compose('birthday-card-freeform', {
      title: '生日快乐',
      body: '愿你保持好奇，睡饱吃好，把日子过成自己喜欢的样子。',
      recipient: '小叮',
      brand: '— 爱你的大家',
    })
    expect((named(result, '正文') as FreeformTextElement | undefined)?.text).toContain('把日子过成自己喜欢的样子')
    expect((named(result, '名字') as FreeformTextElement | undefined)?.text).toBe('小叮')
    expect((named(result, '署名') as FreeformTextElement | undefined)?.text).toBe('— 爱你的大家')
    // The confetti is the design, not a sample: it stays.
    expect(result.document.slides[0].nodes.filter((node) => node.name.startsWith('彩纸'))).toHaveLength(18)
    // Without a recipient the name line goes with its slot.
    const bare = compose('birthday-card-freeform', { title: '生日快乐' })
    expect(named(bare, '名字')).toBeUndefined()
    expect(named(bare, '正文')).toBeUndefined()
  })

  test('puts the picture in the picture slot, and sets a poster that came without one on its text-only page', () => {
    const photo = compose('talk-poster-freeform', { ...TALK, image: 'https://example.com/hall.jpg' })
    const frame = named(photo, '主图') as FreeformShapeElement
    expect(frame.fill).toMatchObject({ type: 'image', src: 'https://example.com/hall.jpg', fit: 'cover' })
    expect(photo.summary.layout).toBeUndefined()
    // No photo: no empty frame, the title takes its place, large, broken between words.
    const plain = compose('talk-poster-freeform', TALK)
    expect(plain.summary.layout).toBe('text-only')
    expect(named(plain, '主图')).toBeUndefined()
    const title = named(plain, '标题') as FreeformTextElement
    expect(title.fontSize).toBeGreaterThan(152)
    expect(title.text.replace(/\n/g, '')).toBe('设计系统的第二年')
    expect(title.text.split('\n').some((line) => line.startsWith('的'))).toBe(false)

    const product = compose('product-card-freeform', { title: '新品', image: 'https://example.com/shoe.png' })
    expect((named(product, '主图') as FreeformImageElement).src).toBe('https://example.com/shoe.png')
    // The product's place goes to the price, set large in the circle; no price, no circle.
    const priced = compose('product-card-freeform', { title: '新品', tag: '¥59' })
    expect(named(priced, '主图')).toBeUndefined()
    expect(named(priced, '价格底')).toBeDefined()
    expect(named(compose('product-card-freeform', { title: '新品' }), '价格圈')).toBeUndefined()
    // A poster drawn without a picture has no other page.
    expect(compose('quote-card-freeform', { title: '一句' }).summary.layout).toBeUndefined()
  })

  test('shrinks long copy into its box, places what has no slot where it can, and reports the rest', () => {
    const long = compose('quote-card-freeform', { title: '把复杂的事情说得简单一些，再简单一些，是一种很难得、需要长期练习的能力。' })
    expect(long.summary.shrunk.map((item) => item.node)).toContain('标题')
    const extra = compose('quote-card-freeform', { title: '一句', details: ['第一行', '第二行'], cta: '按钮', image: 'https://example.com/a.png' })
    // The second line continues the one row under it; the button's words take the free sign-off.
    expect(extra.summary.unplaced).toEqual([])
    expect(extra.summary.moved).toEqual([
      { content: 'details', text: '第二行', node: '信息二' },
      { content: 'cta', text: '按钮', node: '品牌' },
    ])
    expect((named(extra, '品牌') as FreeformTextElement).text).toBe('按钮')
    // A picture has nowhere to go on a quote card: it is left out, and the hint says what to do.
    expect(extra.summary.unused).toEqual(['image'])
    expect(extra.summary.hint).toContain('图片')
    expect(extra.summary.hint).toContain('posterCapacity')
    expect(compose('quote-card-freeform', { title: '一句' }).summary.hint).toBeUndefined()
  })

  test('continues the information rows where the page has room, in the last row\'s look', () => {
    const lines = ['时间：周六 10:00', '地点：二楼', '费用：免费', '报名：扫码', '咨询：前台']
    const result = compose('flyer-freeform', { title: '开放日', details: lines, image: 'https://example.com/clay.png' })
    const node = (name: string) => named(result, name) as FreeformTextElement
    expect(result.summary.unplaced).toEqual([])
    expect(result.summary.moved).toEqual([
      { content: 'details', text: '报名：扫码', node: '信息四' },
      { content: 'details', text: '咨询：前台', node: '信息五' },
    ])
    // Label before the colon, same size, one row further down each time.
    expect([node('标签四').text, node('信息四').text]).toEqual(['报名', '扫码'])
    const pitch = node('信息三').y - node('信息二').y
    expect(node('信息四').y - node('信息三').y).toBeCloseTo(pitch, 0)
    expect(node('信息五').y - node('信息四').y).toBeCloseTo(pitch, 0)
    expect(node('信息四').fontSize).toBe(node('信息三').fontSize)
    // The rows keep clear of the button: on the sale poster the line under them takes the free sign-off.
    const sale = compose('sale-poster-freeform', { title: '周年庆', details: ['会员双倍积分', '满额赠帆布袋', '当天有效'], cta: '到店领取', image: 'https://example.com/cup.png' })
    expect(sale.summary.moved).toEqual([{ content: 'details', text: '当天有效', node: '品牌' }])
    expect(named(sale, '信息三')).toBeUndefined()
  })

  test('words without their own slot take a free one of a similar kind', () => {
    // A certificate's date line in its empty information row, a birthday card's subtitle in its message.
    const certificate = compose('certificate-freeform', { title: '最佳新人奖', recipient: '小林', cta: '颁奖日期：12 月 31 日' })
    expect(certificate.summary.moved).toEqual([{ content: 'cta', text: '颁奖日期：12 月 31 日', node: '信息一' }])
    expect((named(certificate, '信息一') as FreeformTextElement).text).toBe('颁奖日期：12 月 31 日')
    const birthday = compose('birthday-card-freeform', { title: '生日快乐', recipient: '阿澄', subtitle: '又长大一岁' })
    expect(birthday.summary.unused).toEqual([])
    expect((named(birthday, '正文') as FreeformTextElement).text).toBe('又长大一岁')
    // A card that says 生日快乐 is not a template left as it was.
    expect(templateMarks().samples.has('生日快乐')).toBe(false)
    // With the message taken, the subtitle has nowhere to go.
    const full = compose('birthday-card-freeform', { title: '生日快乐', subtitle: '又长大一岁', body: '愿望都灵' })
    expect(full.summary.unused).toEqual(['subtitle'])
    expect(full.summary.hint).toContain('副标题「又长大一岁」')
  })

  test('sets a short quote or invitation title large, broken between words, in the middle of its room', () => {
    const quote = compose('quote-card-freeform', { title: '慢慢来，比较快', subtitle: '—— 给焦虑的十一月' })
    const title = named(quote, '标题') as FreeformTextElement
    expect(title.fontSize).toBeGreaterThan(80)
    expect(title.verticalAlign).toBe('middle')
    // A long one still shrinks to fit, as before.
    const long = compose('quote-card-freeform', { title: '把复杂的事情说得简单一些，再简单一些，是一种很难得、需要长期练习的能力。' })
    expect((named(long, '标题') as FreeformTextElement).fontSize).toBeLessThan(80)
    const invitation = compose('invitation-freeform', { title: '乔迁小聚', details: ['时间：11 月 16 日 12:00'] })
    expect((named(invitation, '标题') as FreeformTextElement).fontSize).toBeGreaterThan(108)
  })

  test('moves a short invitation to the middle of its frame, and a short list to the middle of its rows', () => {
    const full = compose('invitation-freeform', { title: '年度设计之夜', subtitle: '诚邀您参加', details: ['时间：12 月 20 日', '地点：外滩源', '着装：深色正装'], cta: '敬请回复', brand: '叮卡团队' })
    const short = compose('invitation-freeform', { title: '乔迁小聚', details: ['时间：11 月 16 日 12:00'] })
    // With less on it, the column comes down from under the masthead.
    expect((named(short, '标题') as FreeformTextElement).y).toBeGreaterThan((named(full, '标题') as FreeformTextElement).y + 100)
    const prices = compose('price-list-freeform', { title: '理发价目表', details: ['剪发：45', '剪+吹：58'] })
    const first = named(prices, '项目一') as FreeformTextElement
    const second = named(prices, '项目二') as FreeformTextElement
    // Two rows of eight: 1.6 times as far apart at most, in the middle of the rows' span.
    expect(second.y - first.y).toBeCloseTo(96 * 1.6, 0)
    expect(first.y).toBeCloseTo(676 + (96 * 7 - 96 * 1.6) / 2, 0)
  })

  test('shrinks a badge\'s words further than copy so they stay inside it', () => {
    const result = compose('product-card-freeform', { title: '珐琅小奶锅', tag: '新品 9 折', image: 'https://example.com/pot.png' })
    const tag = named(result, '角标') as FreeformTextElement
    // Below the 72% copy may go, inside the badge, nothing left overflowing.
    expect(tag.fontSize).toBeLessThan(110 * 0.72)
    expect(tag.fontSize).toBeGreaterThanOrEqual(55)
    expect(result.summary.overflowing).toEqual([])
  })

  test('fills a menu line by line, item before the colon and price after, and keeps generic words checkable', () => {
    const items = ['美式：18', '拿铁：24', '摩卡：26', '冷萃：28', '可颂：16', '贝果：18', '司康：15', '芝士蛋糕：32', '多出来的一项：10']
    const result = compose('menu-freeform', { title: '今日菜单', details: items, brand: '街角咖啡' })
    const text = (name: string) => (named(result, name) as FreeformTextElement | undefined)?.text
    expect(text('菜品一')).toBe('美式')
    expect(text('价格一')).toBe('18')
    expect(text('菜品八')).toBe('芝士蛋糕')
    // No ninth row fits the card: the ninth item takes the free closing words under the list.
    expect(result.summary.unplaced).toEqual([])
    expect(result.summary.moved).toEqual([{ content: 'details', text: '多出来的一项：10', node: '正文' }])
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
    // Without a name line, a name takes the free subtitle, or is left out when that is taken too.
    expect(compose('talk-poster-freeform', { title: '讲座', recipient: '某人' }).summary.moved).toEqual([{ content: 'recipient', text: '某人', node: '副标题' }])
    expect(compose('talk-poster-freeform', { title: '讲座', subtitle: '一场分享', recipient: '某人' }).summary.unused).toEqual(['recipient'])
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

  test('refills the compare poster\'s table element at the content\'s size', () => {
    const table = [
      ['对比项', '自己装', '找师傅'],
      ['费用', '0 元', '150 元'],
      ['耗时', '一整天', '两小时'],
    ]
    const result = compose('compare-table-freeform', { title: '装灯泡，要不要请师傅', body: '手残党还是请师傅吧', table })
    const element = named(result, '对比表') as FreeformTableElement
    expect(element.rows).toBe(3)
    expect(element.cols).toBe(3)
    expect(element.cells).toEqual(['对比项', '自己装', '找师傅', '费用', '0 元', '150 元', '耗时', '一整天', '两小时'])
    // The template's rules and default header stay as drawn, and its colors,
    // type size and column weights ride along into the filled table.
    expect(element.grid).toBe('rows')
    expect(element.headerRow).toBeUndefined()
    expect(element.ink).toBe('#171717')
    expect(element.headerFill).toBe('#dbe2fb')
    expect(element.fontSize).toBe(38)
    expect(element.colWidths).toEqual([1.3, 1, 1])

    // A narrower table remaps the template's column weights; its colors stay.
    const twoCols = compose('compare-table-freeform', { title: '对比', table: [['只有一行', '两格'], ['第二行', '两格']] })
    const twoColsElement = named(twoCols, '对比表') as FreeformTableElement
    expect(twoColsElement.cols).toBe(2)
    expect(twoColsElement.colWidths).toEqual([1.3, 1])
    expect(twoColsElement.ink).toBe('#171717')
    expect(twoColsElement.lineColor).toBe('#c9c4b8')

    // Ragged rows fill out to the widest row, and a middle row of blanks keeps its place.
    const ragged = compose('compare-table-freeform', { title: '对比', table: [['只有一行', '两格'], [], ['第三行']] })
    const raggedElement = named(ragged, '对比表') as FreeformTableElement
    expect(raggedElement.rows).toBe(3)
    expect(raggedElement.cols).toBe(2)
    expect(raggedElement.cells).toEqual(['只有一行', '两格', '', '', '第三行', ''])

    // Columns past the element's six-column ceiling land in unplaced.
    const over = compose('compare-table-freeform', {
      title: '对比',
      table: [
        Array.from({ length: 7 }, (_, index) => `第${index + 1}列`),
        Array.from({ length: 7 }, (_, index) => `${index + 1}`),
      ],
    })
    expect(over.summary.unplaced).toEqual(['第 1 行第 7 列：第7列', '第 2 行第 7 列：7'])

    // Without table content the template's own table stays, like a kept illustration.
    const kept = compose('compare-table-freeform', { title: '怎么选，看这张表' })
    const keptElement = named(kept, '对比表') as FreeformTableElement
    expect(keptElement.cells).toContain('12 元/月')
  })

  test('fills the growth poster\'s steps from details lines, label before the colon', () => {
    const result = compose('growth-timeline-freeform', {
      title: '这一年，慢慢长大',
      subtitle: '五个节点，把一年的变化串起来',
      tag: '2026',
      body: '明年，把画画捡回来',
      brand: '@叮卡成长记录',
      details: ['3 月：注册账号，发出第一篇笔记', '6 月：接到第一单商单合作', '9 月：粉丝破万，开始做系列内容'],
    })
    const text = (name: string) => (named(result, name) as FreeformTextElement | undefined)?.text
    expect([text('标签一'), text('信息一')]).toEqual(['3 月', '注册账号，发出第一篇笔记'])
    expect([text('标签三'), text('信息三')]).toEqual(['9 月', '粉丝破万，开始做系列内容'])
    // Steps it wasn't given go with their dots; the three spread down the spine.
    expect(named(result, '信息四')).toBeUndefined()
    expect(named(result, '节点四')).toBeUndefined()
    expect(named(result, '节点三')).toBeDefined()
    const gap = (named(result, '信息二')!.y - named(result, '信息一')!.y)
    expect(gap).toBeGreaterThan(186)
    expect(result.summary.unused).toEqual([])
    expect(result.summary.unplaced).toEqual([])
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
