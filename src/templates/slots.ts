// Where content goes in each freeform template. Templates are drawn with
// sample copy; filling one from an outline (dingcard-mcp) replaces every
// sample with the reader's own words or removes it, so no sample sentence
// survives into a finished deck. Nodes are named in the template factories
// (registry.ts); anything not listed here is decoration and stays as drawn.

import type { ColorPaint } from '../freeform/types'
import { TIMETABLE_SAMPLE, TIMETABLE_TABLE, tableCellNames, type TableLayout } from './tables'
import type { FreeformDeckSeriesId, FreeformPosterSeriesId } from './types'

/** One fillable text, with the shapes, lines and labels that only make sense beside it. */
export interface SlotItem {
  text: string
  /** A secondary line under the item (filled from "要点：说明"). */
  note?: string
  /** Removed together with the item when there is nothing to put in it. */
  extras?: readonly string[]
}

export interface SlideSlots {
  /** The page's heading; two names split one title over two lines (signal's cover). */
  title: string | readonly [string, string]
  /** The paragraph: cover subtitle, page body, closing sentence. */
  lead?: string
  leadExtras?: readonly string[]
  /** One point per item, in order; unused items go with their extras. */
  items?: readonly SlotItem[]
  /** Decoration for the item block as a whole, removed when no item is shown. */
  itemsExtras?: readonly string[]
  /** Items show their two-digit number on the first line ("01\n要点"). */
  numberedItems?: boolean
  /** A single text that takes all points, one per line. */
  list?: string
  listExtras?: readonly string[]
  quote?: SlotItem
  /** Cover only: the deck's page titles, as items or one list. */
  toc?: { items?: readonly SlotItem[]; list?: string; extras?: readonly string[] }
  /** Texts carrying the page number: the first two-digit number becomes the page, a second one the total. */
  numbers?: readonly string[]
  /** Sample copy with no content of its own: always removed. */
  remove?: readonly SlotItem[]
}

export interface TemplateSlots {
  cover: SlideSlots
  section: SlideSlots
  ending: SlideSlots
}

const steps = (names: readonly [string, string, string]): SlotItem[] => names.map((text) => ({ text }))

export const FREEFORM_TEMPLATE_SLOTS: Record<FreeformDeckSeriesId, TemplateSlots> = {
  editorial: {
    cover: {
      title: '主标题',
      lead: '导语',
      numbers: ['大期号'],
      remove: [{ text: '署名' }, { text: '页脚主题' }],
    },
    section: {
      title: '标题',
      lead: '导语',
      items: steps(['步骤一', '步骤二', '步骤三']),
      itemsExtras: ['正文分隔线'],
      numberedItems: true,
      quote: { text: '引文', note: '引文注释', extras: ['引文底板', '引文竖线'] },
      numbers: ['页码', '页脚'],
    },
    ending: {
      title: '标题',
      lead: '正文',
      list: '结尾清单',
      listExtras: ['正文线'],
      numbers: ['刊头', '页码'],
    },
  },
  checklist: {
    cover: {
      title: '主标题',
      lead: '导语',
      toc: {
        items: [
          { text: '检查项一', extras: ['复选框一', '勾一'] },
          { text: '检查项二', extras: ['复选框二', '清单线二'] },
          { text: '检查项三', extras: ['复选框三', '清单线三'] },
        ],
        extras: ['清单线一'],
      },
      numbers: ['边栏页码'],
    },
    section: {
      title: '页标题',
      lead: '批注',
      leadExtras: ['批注底板'],
      items: [
        { text: '步骤一', note: '说明一', extras: ['编号一', '编号底板一', '步骤线一'] },
        { text: '步骤二', note: '说明二', extras: ['编号二', '编号底板二', '步骤线二'] },
        { text: '步骤三', note: '说明三', extras: ['编号三', '编号底板三', '步骤线三'] },
      ],
      numbers: ['刊头'],
    },
    ending: {
      title: '标题',
      lead: '结论',
      items: [
        { text: '验收项一', extras: ['勾一', '完成点一', '验收线一'] },
        { text: '验收项二', extras: ['勾二', '完成点二', '验收线二'] },
        { text: '验收项三', extras: ['勾三', '完成点三', '验收线三'] },
      ],
      numbers: ['刊头', '完成进度'],
    },
  },
  signal: {
    cover: {
      title: ['标题上', '标题下'],
      lead: '主张',
      numbers: ['圆点编号', '刊头'],
      remove: [{ text: '说明' }],
    },
    section: {
      title: '主标题',
      lead: '左栏正文',
      items: [
        { text: '证据一', extras: ['证据编号一', '证据线一'] },
        { text: '证据二', extras: ['证据编号二', '证据线二'] },
        { text: '证据三', extras: ['证据编号三', '证据线三'] },
      ],
      quote: { text: '结论', extras: ['红色结论栏'] },
      numbers: ['页码', '页脚'],
    },
    ending: {
      title: '主标题',
      lead: '收束句',
      items: [{ text: '行动标题', note: '行动说明', extras: ['行动底板'] }],
      numbers: ['刊头', '页码'],
    },
  },
  'night-flight': {
    cover: {
      title: '主标题',
      lead: '导语',
      numbers: ['页脚'],
    },
    section: {
      title: '页标题',
      lead: '注释',
      items: [
        { text: '记录一', extras: ['时间一', '时间点一', '时间轴一', '记录线一'] },
        { text: '记录二', extras: ['时间二', '时间点二', '时间轴二', '记录线二'] },
        { text: '记录三', extras: ['时间三', '时间点三'] },
      ],
      numbers: ['刊头'],
    },
    ending: {
      title: '主标题',
      lead: '提问',
      items: steps(['节点一', '节点二', '节点三']),
      quote: { text: '结论', note: '补充结论', extras: ['结论底板'] },
      numbers: ['路线编号'],
    },
  },
  neon: {
    cover: {
      title: '主标题',
      lead: '导语',
      remove: [{ text: '期号' }, { text: '页脚' }],
    },
    section: {
      title: '灯牌标题一',
      lead: '注释',
      leadExtras: ['注释线', '信号星'],
      items: [{ text: '灯牌标题二', note: '灯牌注释二', extras: ['灯牌底板二'] }],
      numbers: ['刊头', '页脚'],
      remove: [{ text: '灯牌注释一' }],
    },
    ending: {
      title: '主标题',
      lead: '正文',
      quote: { text: '结论', extras: ['结论灯牌'] },
      numbers: ['刊头'],
    },
  },
  brutalist: {
    cover: {
      title: '主标题',
      lead: '导语',
      numbers: ['期号', '印章文字'],
      remove: [{ text: '说明' }, { text: '页脚词' }],
    },
    section: {
      title: '页标题',
      items: [
        { text: '规则一', note: '注释一', extras: ['编号一', '编号块一', '规则线一'] },
        { text: '规则二', note: '注释二', extras: ['编号二', '编号块二', '规则线二'] },
        { text: '规则三', note: '注释三', extras: ['编号三', '编号块三', '规则线三'] },
      ],
      numbers: ['刊头'],
    },
    ending: {
      title: '结尾大字',
      lead: '正文一',
      quote: { text: '正文二' },
      numbers: ['边栏刊头', '边栏页脚'],
    },
  },
  soft: {
    cover: {
      title: '主标题',
      lead: '导语',
      toc: { list: '便签文字', extras: ['便签底板'] },
      numbers: ['页脚'],
      remove: [{ text: '竖排短句' }, { text: '页脚词' }],
    },
    section: {
      title: '页标题',
      lead: '注释',
      items: [
        { text: '记录一', extras: ['记录底板一'] },
        { text: '记录二', extras: ['记录底板二'] },
        { text: '记录三', extras: ['记录底板三'] },
      ],
      numbers: ['刊头', '页脚'],
    },
    ending: {
      title: '主标题',
      lead: '导语',
      quote: { text: '信纸文字', extras: ['晚安信纸', '信纸线一', '信纸线二'] },
      numbers: ['刊头'],
    },
  },
  blueprint: {
    cover: {
      title: '主标题',
      lead: '导语',
      numbers: ['图纸编号'],
    },
    section: {
      title: '模块标题一',
      lead: '模块说明一',
      items: [
        { text: '模块标题二', note: '模块说明二', extras: ['模块底板二'] },
        { text: '装配标题', note: '装配步骤', extras: ['装配底板'] },
      ],
      quote: { text: '注释', extras: ['装配虚线'] },
      numbers: ['图纸编号'],
    },
    ending: {
      title: '主标题',
      lead: '导语',
      quote: { text: '签收标题', note: '签收状态', extras: ['签收底板', '签名线', '签名标注'] },
      numbers: ['图纸编号'],
    },
  },
}

/** Every name a slot spec points at, for checking the spec against its template. */
export function slotNodeNames(slots: SlideSlots): string[] {
  const names: string[] = []
  const add = (value: string | undefined) => { if (value) names.push(value) }
  const addItem = (item: SlotItem | undefined) => {
    if (!item) return
    add(item.text)
    add(item.note)
    item.extras?.forEach(add)
  }
  if (typeof slots.title === 'string') add(slots.title)
  else slots.title.forEach(add)
  add(slots.lead)
  slots.leadExtras?.forEach(add)
  slots.items?.forEach(addItem)
  slots.itemsExtras?.forEach(add)
  add(slots.list)
  slots.listExtras?.forEach(add)
  addItem(slots.quote)
  slots.toc?.items?.forEach(addItem)
  add(slots.toc?.list)
  slots.toc?.extras?.forEach(add)
  slots.numbers?.forEach(add)
  slots.remove?.forEach(addItem)
  return names
}

/** The texts a slot spec fills or removes: sample copy that must never reach a finished deck. */
export function slotSampleNames(slots: SlideSlots): string[] {
  const names: string[] = []
  const add = (value: string | undefined) => { if (value) names.push(value) }
  if (typeof slots.title === 'string') add(slots.title)
  else slots.title.forEach(add)
  add(slots.lead)
  slots.items?.forEach((item) => { add(item.text); add(item.note) })
  add(slots.list)
  add(slots.quote?.text)
  add(slots.quote?.note)
  slots.toc?.items?.forEach((item) => { add(item.text); add(item.note) })
  add(slots.toc?.list)
  slots.remove?.forEach((item) => { add(item.text); add(item.note) })
  return names
}

// --- Posters ---

/** One information line of a poster ("时间：10 月 18 日"): the label is what comes before the colon. */
export interface PosterDetail {
  label?: string
  value: string
  /** Removed together with the line when there is nothing to put in it. */
  extras?: readonly string[]
}

/** A table the poster redraws at the content's size (tables.ts), and the sample it is drawn with. */
export interface PosterTable {
  layout: TableLayout
  sample: readonly (readonly string[])[]
}

/** Where a one-page template's content goes. Anything it doesn't name is decoration. */
export interface PosterSlots {
  title: string
  subtitle?: SlotItem
  body?: SlotItem
  /** Who it is for: the name on a certificate. */
  recipient?: SlotItem
  /** Information lines, in order; unused ones go with their extras. */
  details?: readonly PosterDetail[]
  /** Decoration for the lines as a whole (the card they sit on), removed when there are none. */
  detailsExtras?: readonly string[]
  /** Fewer lines than rows spread out over the rows' span (at most 1.6 times as far apart), so a list fills its card. */
  spreadDetails?: boolean
  /**
   * When the title takes fewer lines than its sample, everything whose top is
   * below the title moves up by the room it left, except `pinned` (a footer
   * that keeps its place).
   */
  titleFlow?: { pinned?: readonly string[] }
  /** A grid of cells: row 0 is the column headings, column 0 the row labels (a timetable). */
  table?: PosterTable
  /** The call to action, with the button drawn behind it. */
  cta?: SlotItem
  /** The chart: filled with `chart` content (labels and series); without it
   *  the template's own stays, like a kept illustration. */
  chart?: { node: string }
  /** A short label: a corner badge, a price, an episode number. */
  tag?: SlotItem
  /** Who it is from: the organiser, brand or sign-off. */
  brand?: SlotItem
  /**
   * The picture: an image, or a shape filled with one. Without a picture a
   * shape takes `fallback` (a colour block that keeps the layout), anything
   * else goes with its extras.
   */
  image?: {
    node: string
    fallback?: ColorPaint
    extras?: readonly string[]
    /** Without a picture the template's own stays: an illustration that is the design, not a sample photo. */
    keep?: boolean
  }
  /** Sample copy with no content of its own: always removed. */
  remove?: readonly SlotItem[]
  /**
   * Samples that real content often repeats word for word (a certificate's
   * 荣誉证书, a menu's prices): check_document doesn't take them for copy
   * left over from the template.
   */
  generic?: readonly string[]
}

const block = (color: string): ColorPaint => ({ type: 'solid', color })

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const

const rows = (count: number, label: (n: string) => string | undefined, value: (n: string) => string, extras?: (n: string) => readonly string[]): PosterDetail[] =>
  NUMERALS.slice(0, count).map((n) => ({
    ...(label(n) ? { label: label(n) } : {}),
    value: value(n),
    ...(extras ? { extras: extras(n) } : {}),
  }))

export const FREEFORM_POSTER_SLOTS: Record<FreeformPosterSeriesId, PosterSlots> = {
  'talk-poster': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`),
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '主办' },
    image: { node: '主图', fallback: block('#d8d0c2') },
  },
  'sale-poster': {
    title: '标题',
    subtitle: { text: '副标题', extras: ['副标题线'] },
    body: { text: '正文' },
    tag: { text: '角标', extras: ['角标底'] },
    details: rows(2, () => undefined, (n) => `信息${n}`),
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
    image: { node: '主图' },
  },
  'hiring-poster': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    tag: { text: '角标' },
    details: rows(3, (n) => `职位${n}`, (n) => `说明${n}`, (n) => [`职位卡${n}`, `箭头${n}`]),
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
  },
  'festival-poster': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '印章文字', extras: ['印章'] },
    details: rows(2, () => undefined, (n) => `信息${n}`),
    brand: { text: '品牌' },
  },
  invitation: {
    title: '标题',
    subtitle: { text: '副标题' },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`),
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
  },
  'quote-card': {
    title: '标题',
    subtitle: { text: '副标题' },
    details: rows(1, () => undefined, (n) => `信息${n}`),
    brand: { text: '品牌' },
  },
  'product-card': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标', extras: ['价格底', '价格标签'] },
    details: rows(3, () => undefined, (n) => `信息${n}`, (n) => [`勾底${n}`, `勾${n}`]),
    brand: { text: '品牌' },
    image: { node: '主图' },
  },
  'video-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    brand: { text: '品牌' },
  },
  'article-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    brand: { text: '品牌' },
    image: { node: '主图', fallback: block('#26385e') },
  },
  'note-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    details: rows(3, () => undefined, (n) => `要点${n}`, (n) => [`编号底${n}`, `编号${n}`]),
    detailsExtras: ['清单卡', '星星'],
    spreadDetails: true,
    titleFlow: { pinned: ['品牌'] },
    brand: { text: '品牌' },
  },
  'photo-cover': {
    title: '标题',
    subtitle: { text: '副标题', extras: ['波浪线'] },
    titleFlow: {},
    tag: { text: '角标', extras: ['角标底'] },
    brand: { text: '品牌' },
    image: { node: '主图', fallback: block('#d9cbb8') },
  },
  menu: {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    tag: { text: '刊头' },
    details: rows(8, (n) => `菜品${n}`, (n) => `价格${n}`, (n) => [`虚线${n}`]),
    spreadDetails: true,
    brand: { text: '品牌' },
    image: { node: '主图' },
    generic: ['标题', ...['一', '二', '三', '四', '五', '六', '七', '八'].map((n) => `价格${n}`)],
  },
  'price-list': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    tag: { text: '角标' },
    details: rows(8, (n) => `项目${n}`, (n) => `价格${n}`, (n) => (n === '一' ? [] : [`隔线${n}`])),
    spreadDetails: true,
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
    generic: ['标题', ...['一', '二', '三', '四', '五', '六', '七', '八'].map((n) => `价格${n}`)],
  },
  certificate: {
    title: '标题',
    recipient: { text: '获得者', extras: ['姓名线'] },
    body: { text: '正文' },
    details: rows(2, () => undefined, (n) => `信息${n}`),
    brand: { text: '颁发单位', extras: ['签名线'] },
    generic: ['标题'],
  },
  'moments-grid': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    brand: { text: '品牌' },
    image: { node: '主图', keep: true },
  },
  timetable: {
    title: '标题',
    subtitle: { text: '副标题' },
    brand: { text: '品牌' },
    table: { layout: TIMETABLE_TABLE, sample: TIMETABLE_SAMPLE },
    generic: ['标题'],
  },
  flyer: {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`),
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
    image: { node: '主图' },
    remove: [{ text: '页脚' }],
  },
  'contact-card': {
    title: '姓名',
    subtitle: { text: '职位' },
    tag: { text: '角标' },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`),
    body: { text: '正文' },
    brand: { text: '品牌' },
  },
  'data-roundup': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`),
    brand: { text: '品牌' },
    chart: { node: '图表' },
  },
  'follow-card': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
  },
}

function posterItems(slots: PosterSlots): SlotItem[] {
  return [slots.subtitle, slots.body, slots.recipient, slots.cta, slots.tag, slots.brand].filter((item): item is SlotItem => Boolean(item))
}

/** Every name a poster's slots point at, for checking them against the template. */
export function posterSlotNames(slots: PosterSlots): string[] {
  const names = [slots.title]
  for (const item of [...posterItems(slots), ...(slots.remove ?? [])]) names.push(item.text, ...(item.note ? [item.note] : []), ...(item.extras ?? []))
  for (const detail of slots.details ?? []) names.push(...(detail.label ? [detail.label] : []), detail.value, ...(detail.extras ?? []))
  names.push(...(slots.detailsExtras ?? []))
  if (slots.image) names.push(slots.image.node, ...(slots.image.extras ?? []))
  if (slots.chart) names.push(slots.chart.node)
  if (slots.table) {
    const cells = tableCellNames(slots.table.layout, slots.table.sample)
    names.push(...cells.blocks, ...cells.texts)
  }
  return names
}

/**
 * The texts a poster's slots fill or remove: sample copy that must never
 * reach a finished poster. Line labels ("时间", "地点"), table cells ("语文")
 * and the template's `generic` samples are words a poster may well keep, so
 * `labels: false` leaves them out.
 */
export function posterSampleNames(slots: PosterSlots, { labels = true }: { labels?: boolean } = {}): string[] {
  const names = [slots.title]
  for (const item of [...posterItems(slots), ...(slots.remove ?? [])]) names.push(item.text, ...(item.note ? [item.note] : []))
  for (const detail of slots.details ?? []) names.push(...(labels && detail.label ? [detail.label] : []), detail.value)
  if (labels && slots.table) names.push(...tableCellNames(slots.table.layout, slots.table.sample).texts)
  if (labels) return names
  const generic = new Set(slots.generic ?? [])
  return names.filter((name) => !generic.has(name))
}
