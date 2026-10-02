// Where content goes in each freeform template. Templates are drawn with
// sample copy; filling one from an outline (dingcard-mcp) replaces every
// sample with the reader's own words or removes it, so no sample sentence
// survives into a finished deck. Nodes are named in the template factories
// (registry.ts); anything not listed here is decoration and stays as drawn.

import type { FreeformTemplateSeriesId } from './types'

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

export const FREEFORM_TEMPLATE_SLOTS: Record<FreeformTemplateSeriesId, TemplateSlots> = {
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
