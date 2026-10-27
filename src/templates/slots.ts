// Where content goes in each freeform template. Templates are drawn with
// sample copy; filling one from an outline (dingcard-mcp) replaces every
// sample with the reader's own words or removes it, so no sample sentence
// survives into a finished deck. Nodes are named in the template factories
// (registry.ts); anything not listed here is decoration and stays as drawn.

import type { ColorPaint } from '../freeform/types'
import { TIMETABLE_SAMPLE, TIMETABLE_TABLE, tableCellNames, type TableLayout } from './tables'
import type { DeckLayoutId, FreeformDeckSeriesId, FreeformPosterSeriesId } from './types'

/** One fillable text, with the shapes, lines and labels that only make sense beside it. */
export interface SlotItem {
  text: string
  /** A secondary line under the item (filled from "要点：说明"). */
  note?: string
  /** Removed together with the item when there is nothing to put in it. */
  extras?: readonly string[]
  /** Extras that stay, blank, when there is nothing to put in the item: a line to write it on by hand. */
  blank?: readonly string[]
}

export interface SlideSlots {
  /** The page's heading; two names split one title over two lines (signal's cover). */
  title: string | readonly [string, string]
  /** The paragraph: cover subtitle, page body, closing sentence. */
  lead?: string
  leadExtras?: readonly string[]
  /** Without a paragraph, what sits under its place moves up into it (the pinned names stay). */
  leadFlow?: { pinned?: readonly string[] }
  /** One point per item, in order; unused items go with their extras. */
  items?: readonly SlotItem[]
  /** Decoration for the item block as a whole, removed when no item is shown. */
  itemsExtras?: readonly string[]
  /** Items show their two-digit number on the first line ("01\n要点"). */
  numberedItems?: boolean
  /** Fewer points than items spread down the items' span, up to 1.6 times their pitch (a list page). */
  spreadItems?: boolean
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
  /**
   * Samples that real content often repeats word for word (a defense's
   * 恳请各位老师批评指正): check_document doesn't take them for copy left
   * over from the template.
   */
  generic?: readonly string[]
}

export interface TemplateSlots {
  cover: SlideSlots
  section: SlideSlots
  ending: SlideSlots
  /** The deck's other inner pages (FREEFORM_DECK_LAYOUTS in registry.ts). */
  layouts?: Partial<Record<DeckLayoutId, SlideSlots>>
}

const steps = (names: readonly [string, string, string]): SlotItem[] => names.map((text) => ({ text }))
/** The five rows a list page draws, named 一 to 五. */
const FIVE = ['一', '二', '三', '四', '五'] as const

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
      leadFlow: { pinned: ['页脚线', '页脚'] },
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
    layouts: {
      statement: {
        title: '标题',
        lead: '导语',
        leadExtras: ['标题线'],
        numbers: ['页码', '大页码', '页脚'],
      },
      list: {
        title: '标题',
        lead: '导语',
        leadFlow: { pinned: ['页脚线', '页脚'] },
        items: FIVE.map((n) => ({ text: `要点${n}`, note: `说明${n}`, extras: [`编号${n}`, `要点线${n}`] })),
        itemsExtras: ['要点顶线'],
        spreadItems: true,
        numbers: ['页码', '页脚'],
      },
      data: {
        title: '标题',
        lead: '导语',
        leadFlow: { pinned: ['页脚线', '页脚'] },
        numbers: ['页码', '页脚'],
        remove: [{ text: '示例图表' }],
      },
      closing: {
        title: '标题',
        lead: '正文',
        numbers: ['刊头', '页码'],
      },
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
    layouts: {
      statement: {
        title: '标题',
        lead: '导语',
        leadExtras: ['批注底板'],
        numbers: ['刊头', '大页码'],
      },
      list: {
        title: '标题',
        lead: '导语',
        items: FIVE.map((n) => ({ text: `要点${n}`, note: `说明${n}`, extras: [`复选框${n}`, `要点线${n}`] })),
        spreadItems: true,
        numbers: ['刊头'],
      },
      data: {
        title: '标题',
        lead: '导语',
        numbers: ['刊头'],
        remove: [{ text: '示例图表' }],
      },
      closing: {
        title: '标题',
        lead: '结论',
        numbers: ['刊头', '完成进度'],
      },
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
    layouts: {
      statement: {
        title: '主标题',
        lead: '主张',
        numbers: ['大页码', '刊头'],
      },
      list: {
        title: '主标题',
        lead: '左栏正文',
        items: FIVE.map((n) => ({ text: `证据${n}`, extras: [`证据编号${n}`, `证据线${n}`] })),
        spreadItems: true,
        numbers: ['页码', '页脚'],
      },
      data: {
        title: '主标题',
        lead: '导语',
        // Without a lead the drawing's rule comes up under the band, and the drawing takes the room.
        leadFlow: { pinned: ['页脚线', '页脚'] },
        numbers: ['页码', '页脚'],
        remove: [{ text: '示例图表' }],
      },
      closing: {
        title: '主标题',
        lead: '收束句',
        numbers: ['刊头', '页码'],
      },
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
    layouts: {
      statement: {
        title: '标题',
        lead: '导语',
        numbers: ['刊头', '大页码'],
      },
      list: {
        title: '标题',
        lead: '导语',
        items: FIVE.map((n) => ({ text: `记录${n}`, note: `说明${n}`, extras: [`时间点${n}`, `记录线${n}`] })),
        spreadItems: true,
        numbers: ['刊头'],
      },
      data: {
        title: '标题',
        lead: '导语',
        numbers: ['刊头'],
        remove: [{ text: '示例图表' }],
      },
      closing: {
        title: '主标题',
        lead: '收束句',
        numbers: ['路线编号'],
      },
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
    layouts: {
      statement: {
        title: '标题',
        lead: '导语',
        numbers: ['刊头', '大页码'],
      },
      list: {
        title: '页标题',
        lead: '导语',
        items: FIVE.map((n) => ({ text: `规则${n}`, note: `注释${n}`, extras: [`编号${n}`, `编号块${n}`, `规则线${n}`] })),
        spreadItems: true,
        numbers: ['刊头'],
      },
      data: {
        title: '标题',
        lead: '导语',
        numbers: ['刊头'],
        remove: [{ text: '示例图表' }],
      },
      closing: {
        title: '结尾大字',
        lead: '正文',
        numbers: ['边栏刊头', '边栏页脚'],
      },
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
    layouts: {
      statement: {
        title: '标题',
        lead: '导语',
        numbers: ['图纸编号', '大页码'],
      },
      list: {
        title: '标题',
        lead: '导语',
        items: FIVE.map((n) => ({ text: `部件${n}`, note: `规格${n}`, extras: [`编号${n}`, `编号框${n}`, `部件线${n}`] })),
        spreadItems: true,
        numbers: ['图纸编号'],
      },
      data: {
        title: '标题',
        lead: '导语',
        numbers: ['图纸编号'],
        remove: [{ text: '示例图表' }],
      },
      closing: {
        title: '主标题',
        lead: '导语',
        numbers: ['图纸编号'],
      },
    },
  },
  // 16:9: words on the left, points or the drawing on the right; the foot carries page / total.
  spotlight: {
    // The presenter and the date are the template's own, content has no place for them; their rule goes with them.
    cover: { title: '主标题', lead: '导语', remove: [{ text: '署名', extras: ['封面线'] }, { text: '日期' }] },
    section: {
      title: '标题',
      lead: '导语',
      items: (['一', '二', '三'] as const).map((n) => ({ text: `要点${n}`, note: `说明${n}`, extras: [`标记${n}`, `要点线${n}`] })),
      quote: { text: '引文', extras: ['引文竖线'] },
      numbers: ['大页码', '页码'],
    },
    ending: {
      title: '主标题',
      lead: '收束句',
      items: (['一', '二', '三'] as const).map((n) => ({ text: `行动${n}`, extras: [`编号底${n}`, `编号${n}`] })),
      numbers: ['页码'],
    },
    layouts: {
      statement: { title: '主标题', lead: '导语', numbers: ['大页码', '页码'] },
      list: {
        title: '标题',
        lead: '导语',
        items: FIVE.map((n) => ({ text: `要点${n}`, note: `说明${n}`, extras: [`编号底${n}`, `编号${n}`, `要点线${n}`] })),
        spreadItems: true,
        numbers: ['大页码', '页码'],
      },
      data: { title: '标题', lead: '导语', numbers: ['大页码', '页码'], remove: [{ text: '示例图表' }] },
      closing: { title: '主标题', lead: '收束句', numbers: ['页码'] },
    },
  },
  // 16:9 for a defense: the chapter number large in gold, numerals for the points; the foot carries page / total.
  thesis: {
    // The occasion over the title is the template's own (a defense, not a proposal); its rule goes with it.
    cover: { title: '主标题', lead: '导语', remove: [{ text: '刊头', extras: ['刊头线'] }] },
    section: {
      title: '标题',
      lead: '导语',
      items: (['一', '二', '三'] as const).map((n) => ({ text: `要点${n}`, note: `说明${n}`, extras: [`序号${n}`, `要点线${n}`] })),
      quote: { text: '引文', extras: ['引文竖线'] },
      numbers: ['章节号', '页码'],
    },
    ending: {
      title: '主标题',
      lead: '收束句',
      items: (['一', '二', '三'] as const).map((n) => ({ text: `展望${n}`, extras: [`序号${n}`] })),
      numbers: ['页码'],
      // 恳请各位老师批评指正 is how most defenses end.
      generic: ['主标题'],
    },
    layouts: {
      statement: { title: '主标题', lead: '导语', numbers: ['章节号', '页码'] },
      list: {
        title: '标题',
        lead: '导语',
        items: FIVE.map((n) => ({ text: `要点${n}`, note: `说明${n}`, extras: [`序号${n}`, `要点线${n}`] })),
        spreadItems: true,
        numbers: ['章节号', '页码'],
      },
      data: { title: '标题', lead: '导语', numbers: ['章节号', '页码'], remove: [{ text: '示例图表' }] },
      closing: { title: '主标题', lead: '收束句', numbers: ['页码'], generic: ['主标题', '收束句'] },
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
export function slotSampleNames(slots: SlideSlots, { generic = true }: { generic?: boolean } = {}): string[] {
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
  if (generic) return names
  const kept = new Set(slots.generic ?? [])
  return names.filter((name) => !kept.has(name))
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

/** Where a poster's column sits (PosterSlots.centre). */
export interface PosterCentre {
  top: number
  bottom: number
  pinned?: readonly string[]
  /**
   * Before it moves, the block closes up: the room of each part of the
   * template the content leaves without words (rows without a line, a
   * missing subtitle) goes, and `cards`, the panel the block sits on,
   * shorten with it — a receipt for three items is a short receipt. `grow`
   * (a chart, the title) takes back up to its own height of that room;
   * `aside` (a price circle beside the list, its words on it; an
   * invitation's masthead above its column) moves with the block as one
   * piece, its own room never closing or opening.
   */
  close?: { cards?: readonly string[]; grow?: string; aside?: readonly string[] }
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
  /**
   * A line joining the rows' marks (a timeline's axis, each row's first extra
   * its mark): it runs from the first filled row's mark to the last's, and
   * goes when fewer than two rows are filled.
   */
  link?: string
  /**
   * Fewer lines than rows spread out over the rows' span (at most 1.6 times
   * as far apart) and sit in the middle of it, so a list fills its card.
   */
  spreadDetails?: boolean
  /**
   * A list with no card round it, in a column that closes up (centre.close):
   * a lone line isn't spread to the middle of the rows, where it would leave
   * a hole on each side, but stays where the first row is, the rest closing.
   */
  closeLoneLine?: boolean
  /**
   * When the title takes fewer lines than its sample, everything whose top is
   * below the title moves up by the room it left, except `pinned` (a footer
   * that keeps its place).
   */
  titleFlow?: { pinned?: readonly string[] }
  /**
   * A display title that fills its box: up to `maxScale` times its size,
   * broken at word boundaries into at most `maxLines` lines, set `align`
   * in the box (the box's own alignment when not given).
   */
  titleFit?: { maxScale: number; maxLines?: number; align?: 'middle' | 'bottom' }
  /**
   * Content between `top` and `bottom` (page px) moves as one block to the
   * middle of that span, so a short invitation doesn't leave its foot empty;
   * `pinned` keeps its place (a seal in a corner).
   */
  centre?: PosterCentre
  /** A grid of cells: row 0 is the column headings, column 0 the row labels (a timetable). */
  table?: PosterTable
  /** A v34 table element: filled with `table` content (row 0 is the header);
   *  without it the template's own stays, like a kept illustration. */
  tableElement?: { node: string }
  /** A v36 timeline element: filled with `details` lines (the part before the
   *  colon the time label); without them the template's own stays, like a
   *  kept illustration. */
  timeline?: { node: string }
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
  /**
   * The slots of the poster's text-only drawing (FREEFORM_POSTER_TEXT_ONLY),
   * where they differ: content without a picture is set there.
   */
  textOnly?: Partial<Omit<PosterSlots, 'textOnly' | 'image'>>
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
    // 公开讲座 is what many talks are.
    generic: ['角标'],
    // The panel's words sit in its middle when there are few of them.
    textOnly: { titleFit: { maxScale: 1.8, maxLines: 3 }, centre: { top: 1120, bottom: 1880 } },
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
    // 立即领券 is what many sales ask.
    generic: ['按钮文字'],
    // Without its lines and button the circle comes down to the middle of the page.
    textOnly: { titleFit: { maxScale: 1.5, maxLines: 3 }, centre: { top: 0, bottom: 1920, close: {} } },
  },
  'hiring-poster': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    tag: { text: '角标' },
    details: rows(3, (n) => `条件${n}`, (n) => `职位${n}`, (n) => [`编号${n}`, `职位线${n}`]),
    spreadDetails: true,
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
    // 诚邀您参加 is how most invitations begin, 敬请回复 what most of them ask.
    generic: ['副标题', '按钮文字'],
    titleFit: { maxScale: 1.5, maxLines: 2, align: 'middle' },
    // Inside the frame, closed up, its masthead moving with the column as one piece.
    centre: { top: 74, bottom: 1840, close: { aside: ['英文标语', '饰线左', '饰线右', '菱形'] } },
  },
  'quote-card': {
    title: '标题',
    subtitle: { text: '副标题' },
    details: rows(1, () => undefined, (n) => `信息${n}`),
    brand: { text: '品牌' },
    titleFit: { maxScale: 1.6, maxLines: 3, align: 'middle' },
    // Above the rule and its footer.
    centre: { top: 120, bottom: 860 },
  },
  'product-card': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标', extras: ['价格底', '价格标签'] },
    details: rows(3, () => undefined, (n) => `信息${n}`, (n) => [`勾底${n}`, `勾${n}`]),
    brand: { text: '品牌' },
    image: { node: '主图' },
    textOnly: {
      titleFit: { maxScale: 1.2, maxLines: 1 },
      tag: { text: '角标', extras: ['价格底', '价格标签', '价格圈'] },
      // A short column closes up in the middle of the card, its title taking the room.
      centre: { top: 0, bottom: 1080, close: { grow: '标题', aside: ['价格圈', '价格底', '价格标签', '角标'] } },
    },
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
    // Without a tag the column still sits in the middle of the cover.
    // The rule leads into the sign-off and goes with it.
    textOnly: { titleFit: { maxScale: 1.5, maxLines: 2 }, centre: { top: 40, bottom: 726, close: { grow: '标题' } }, brand: { text: '品牌', extras: ['标题线'] } },
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
    // The title sits on the card: nothing below it moves.
    textOnly: { titleFit: { maxScale: 1.6, maxLines: 3 }, titleFlow: undefined, centre: { top: 0, bottom: 1440, close: {} } },
  },
  menu: {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    tag: { text: '刊头' },
    details: rows(8, (n) => `菜品${n}`, (n) => `价格${n}`, (n) => [`虚线${n}`]),
    spreadDetails: true,
    closeLoneLine: true,
    brand: { text: '品牌' },
    image: { node: '主图' },
    generic: ['标题', ...['一', '二', '三', '四', '五', '六', '七', '八'].map((n) => `价格${n}`)],
    // Inside the frame, closed up.
    centre: { top: 80, bottom: 1680, close: {} },
  },
  'price-list': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    tag: { text: '角标' },
    details: rows(8, (n) => `项目${n}`, (n) => `价格${n}`, (n) => (n === '一' ? [] : [`隔线${n}`])),
    // Fewer items make a shorter receipt, in the middle of the page.
    centre: { top: 0, bottom: 1920, close: { cards: ['小票'] } },
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
    generic: ['标题', ...['一', '二', '三', '四', '五', '六', '七', '八'].map((n) => `价格${n}`)],
  },
  certificate: {
    title: '标题',
    // Without a name, its line stays to write one on.
    recipient: { text: '获得者', extras: ['姓名线'], blank: ['姓名线'] },
    body: { text: '正文' },
    details: rows(2, () => undefined, (n) => `信息${n}`),
    brand: { text: '颁发单位', extras: ['签名线'] },
    generic: ['标题'],
    // Inside the frame; the medal and the number in the corner keep their places.
    centre: { top: 68, bottom: 1172, pinned: ['奖章', '信息二'], close: {} },
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
    // The details move into the arch, in its middle; the text-only page draws
    // no footer to take away, and its column sits between the two rules.
    textOnly: { remove: [], spreadDetails: true, centre: { top: 160, bottom: 1610, close: {} } },
  },
  'data-roundup': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`, (n) => [`数字标记${n}`]),
    detailsExtras: ['数字顶线', '数字底线'],
    brand: { text: '品牌' },
    chart: { node: '图表' },
    // A year is what the badge usually says.
    generic: ['角标'],
    // A one-line title pulls up what follows; between the masthead rule and the
    // footer rule the chart takes the room.
    titleFlow: { pinned: ['页脚线', '品牌'] },
    centre: { top: 140, bottom: 1790, close: { grow: '图表' } },
  },
  'birthday-card': {
    title: '标题',
    recipient: { text: '名字' },
    body: { text: '正文' },
    brand: { text: '署名' },
    // 生日快乐 is what most birthday cards say.
    generic: ['标题'],
    // The confetti stays at the corners.
    centre: { top: 40, bottom: 1040, pinned: Array.from({ length: 18 }, (_, index) => `彩纸${index + 1}`), close: {} },
  },
  'compare-table': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    body: { text: '结论', extras: ['结论竖线'] },
    brand: { text: '品牌' },
    tableElement: { node: '对比表' },
  },
  'growth-timeline': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    body: { text: '结论' },
    details: rows(5, (n) => `标签${n}`, (n) => `信息${n}`, (n) => [`节点${n}`]),
    spreadDetails: true,
    closeLoneLine: true,
    link: '时间轴',
    brand: { text: '品牌' },
    generic: ['角标'],
    // The whole column, closed up: its footer comes up with it.
    centre: { top: 96, bottom: 1874, close: { grow: '标题' } },
  },
  'exhibition-poster': {
    title: '标题',
    body: { text: '正文' },
    tag: { text: '角标' },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`),
    brand: { text: '主办' },
    image: { node: '主图', keep: true },
  },
  'launch-poster': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    tag: { text: '角标' },
    details: rows(1, () => undefined, (n) => `信息${n}`),
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
    // 立即预约 is what most launch buttons say.
    generic: ['按钮文字'],
  },
  'solar-term': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '印章文字', extras: ['印章'] },
    details: rows(2, () => undefined, (n) => `信息${n}`),
    brand: { text: '品牌' },
    image: { node: '主图', keep: true },
    remove: [{ text: '英文' }],
    generic: ['印章文字'],
  },
  'podcast-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    brand: { text: '品牌' },
  },
  'pitch-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    details: rows(2, () => undefined, (n) => `信息${n}`),
    brand: { text: '品牌' },
  },
  'portfolio-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    brand: { text: '品牌' },
    image: { node: '主图', fallback: block('#3b3b3b') },
    generic: ['角标'],
    textOnly: { titleFit: { maxScale: 1.8, maxLines: 3 } },
  },
  'dessert-menu': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    details: rows(8, (n) => `菜品${n}`, (n) => `价格${n}`, (n) => [`隔线${n}`]),
    spreadDetails: true,
    brand: { text: '品牌' },
    image: { node: '主图', keep: true },
    generic: ['标题', ...['一', '二', '三', '四', '五', '六', '七', '八'].map((n) => `价格${n}`)],
  },
  'wedding-invitation': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    details: rows(3, () => undefined, (n) => `信息${n}`),
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
    image: { node: '主图', keep: true },
    // 敬请回复, as on the invitation.
    generic: ['按钮文字'],
  },
  'autumn-market': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文', extras: ['饰线左', '饰线右', '菱形左', '菱形右'] },
    details: rows(2, () => undefined, (n) => `信息${n}`),
    brand: { text: '品牌' },
    image: { node: '主图', keep: true },
  },
  'magazine-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    tag: { text: '角标' },
    details: rows(1, () => undefined, (n) => `信息${n}`),
    brand: { text: '品牌' },
    image: { node: '主图', fallback: block('#3b3b3b') },
    textOnly: { titleFit: { maxScale: 1.45, maxLines: 3 } },
  },
  // A book's title stands in its spine, its line of praise under the shelf.
  'book-list': {
    title: '标题',
    subtitle: { text: '副标题' },
    details: rows(5, (n) => `书名${n}`, (n) => `推荐${n}`, (n) => [`书脊${n}`, `书标${n}`, `书标${n}下`, `序号${n}`]),
    brand: { text: '品牌' },
    // The shelf and its list, between the heading and the brand, closed up.
    centre: { top: 296, bottom: 1328, close: {} },
  },
  'word-of-year': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    tag: { text: '印章文字', extras: ['印章'] },
    details: rows(1, () => undefined, (n) => `信息${n}`),
    brand: { text: '品牌' },
    // The sample's pinyin reads only for its own character.
    remove: [{ text: '拼音' }],
    generic: ['副标题', '印章文字'],
  },
  'music-festival': {
    title: '标题',
    tag: { text: '角标' },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`),
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
    generic: ['按钮文字'],
  },
  'travel-postcard': {
    title: '标题',
    body: { text: '正文' },
    recipient: { text: '收件人' },
    tag: { text: '邮戳文字', extras: ['邮戳', '邮戳波纹'] },
    details: rows(1, () => undefined, (n) => `信息${n}`),
    brand: { text: '署名' },
    image: { node: '主图', keep: true },
  },
  'design-week': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    tag: { text: '角标' },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`, (n) => [`栏线${n}`]),
    brand: { text: '品牌' },
    generic: ['角标'],
  },
  // The coupon and its 11.11 stay; the column under it closes up and sits in the room left.
  'double-eleven': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '券额' },
    details: rows(2, (n) => `标签${n}`, (n) => `信息${n}`),
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
    // 立即抢购 is what most sales ask.
    generic: ['按钮文字'],
    centre: { top: 860, bottom: 1920, close: {} },
  },
  // Between the yoke and the hem.
  'christmas-card': {
    title: '标题',
    recipient: { text: '名字' },
    // The rule parts the title from the wish: without one it goes.
    body: { text: '正文', extras: ['分隔线'] },
    details: rows(1, () => undefined, (n) => `信息${n}`),
    brand: { text: '署名' },
    // 圣诞快乐 is what most Christmas cards say.
    generic: ['标题'],
    centre: { top: 378, bottom: 1308, close: {} },
  },
  // A line's label is its stamp (宜, 忌); the page shortens with what it holds.
  'new-year-calendar': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '年份' },
    details: rows(2, (n) => `标签${n}`, (n) => `信息${n}`, (n) => [`标签底${n}`]),
    brand: { text: '品牌' },
    // The year and the day's name (元旦 · 星期五) are what the page says that day.
    generic: ['年份', '副标题'],
    centre: { top: 0, bottom: 1440, close: { cards: ['日历页', '页厚一', '页厚二'] } },
  },
  'spring-festival': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    details: rows(2, (n) => `标签${n}`, (n) => `信息${n}`),
    brand: { text: '品牌' },
    // 新春快乐 is what most New Year greetings say.
    generic: ['标题'],
    centre: { top: 790, bottom: 1860, close: {} },
  },
  // The red block stays without a number; its Nº goes with it.
  'listicle-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标', extras: ['编号'] },
    brand: { text: '品牌' },
    // A list of seven says 07.
    generic: ['角标'],
  },
  'ridge-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    brand: { text: '品牌' },
  },
  'summit-visual': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    details: rows(2, (n) => `标签${n}`, (n) => `信息${n}`),
    brand: { text: '品牌' },
    // A year is what the corner usually says.
    generic: ['角标'],
  },
  'gala-backdrop': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    details: rows(2, (n) => `标签${n}`, (n) => `信息${n}`),
    brand: { text: '品牌' },
    // The year, and 年会盛典, are what most galas say.
    generic: ['角标', '标题'],
    // Inside the frame the column closes up and sits in the middle; the lower corners keep their places.
    centre: { top: 100, bottom: 1000, pinned: ['角饰三', '角饰四'], close: {} },
  },
  // A session to a row; fewer sessions spread over the rows.
  'agenda-sheet': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    details: rows(6, (n) => `标签${n}`, (n) => `信息${n}`, (n) => [`行线${n}`]),
    spreadDetails: true,
    brand: { text: '品牌' },
  },
  'annual-report': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    details: rows(1, () => undefined, (n) => `信息${n}`),
    brand: { text: '品牌' },
    // The year, and 年度报告 itself, are what most reports say.
    generic: ['角标', '标题'],
  },
  'stat-card': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标', extras: ['色条'] },
    brand: { text: '品牌' },
    generic: ['角标'],
    // Without a number its room closes, the line under it grows into some of it, and the column sits in the middle.
    titleFit: { maxScale: 1.6, maxLines: 3 },
    centre: { top: 88, bottom: 1000, close: { grow: '标题' } },
  },
  // Without a number the dial stays, empty in the middle like a clock face; DAYS goes with the number.
  countdown: {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标', extras: ['单位'] },
    details: rows(1, () => undefined, (n) => `信息${n}`),
    brand: { text: '品牌' },
    generic: ['角标'],
  },
  // The two contenders, a name and a line each, either side of the VS.
  'versus-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    details: rows(2, (n) => `标签${n}`, (n) => `信息${n}`),
    brand: { text: '品牌' },
  },
  // The grid is the tracker's own drawing; the day count is the badge.
  'habit-tracker': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    body: { text: '正文' },
    brand: { text: '品牌', extras: ['短线'] },
  },
  'fun-fact': {
    title: '标题',
    tag: { text: '角标', extras: ['短线'] },
    body: { text: '正文' },
    brand: { text: '品牌' },
  },
  // A stop to a row: its pin, its number and the leg of the route that leads to it go with it.
  'trip-route': {
    title: '标题',
    subtitle: { text: '副标题' },
    details: rows(4, (n) => `标签${n}`, (n) => `信息${n}`, (n) => (n === '一' ? ['标记一', '编号一'] : [`标记${n}`, `编号${n}`, `路线${n}`])),
    brand: { text: '品牌' },
  },
  // An entry to a bar, its rank beside it. Fewer entries close up and the column sits in the middle, the title growing into the room.
  'ranking-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    details: rows(5, () => undefined, (n) => `信息${n}`, (n) => [`条${n}`, `名次${n}`]),
    brand: { text: '品牌' },
    generic: ['角标'],
    titleFit: { maxScale: 1.5, maxLines: 3, align: 'bottom' },
    // Above the foot's rule, a little high of the page's middle, as a title-led column reads.
    centre: { top: 40, bottom: 1300, close: { grow: '标题' } },
  },
  // The offers are the lines, the opening day and the address the paragraph.
  'grand-opening': {
    title: '标题',
    subtitle: { text: '副标题', extras: ['饰线'] },
    details: rows(3, () => undefined, (n) => `信息${n}`, (n) => [`菱形${n}`]),
    body: { text: '正文' },
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
    // 开业大吉 is what most openings say.
    generic: ['标题'],
    // The double frame shortens with its column and sits in the middle of its room.
    centre: { top: 580, bottom: 1730, close: { cards: ['外框', '内框'] } },
  },
  // The number on the bib is the badge; a year, or a runner's number.
  'race-bib': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标', extras: ['号码说明'] },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`, (n) => [`行线${n}`]),
    brand: { text: '品牌' },
    generic: ['角标'],
    // Fewer lines, no sign-off: the title, the bib and its lines close up in the middle, the stripes stay.
    centre: { top: 60, bottom: 1935, close: {} },
  },
  'live-show': {
    title: '标题',
    subtitle: { text: '副标题' },
    details: rows(2, (n) => `标签${n}`, (n) => `信息${n}`),
    cta: { text: '按钮文字', extras: ['按钮底板'] },
    brand: { text: '品牌' },
    // 预约直播 is what most live shows ask.
    generic: ['按钮文字'],
    // Between the sign and the sound levels, the column closes up in the middle.
    centre: { top: 560, bottom: 1582, close: {} },
  },
  'qixi-stars': {
    title: '标题',
    subtitle: { text: '副标题' },
    details: rows(1, () => undefined, (n) => `信息${n}`),
    brand: { text: '品牌' },
    // 七夕 is what the day is called.
    generic: ['标题'],
  },
  // The seal's words are the badge; the date lines the details.
  'dragon-boat': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '印章文字', extras: ['印章'] },
    details: rows(3, () => undefined, (n) => `信息${n}`),
    brand: { text: '品牌' },
    generic: ['标题', '印章文字'],
  },
  // Each track is a line; the record and its sleeve move with the column as it closes up.
  'vinyl-cover': {
    title: '标题',
    subtitle: { text: '副标题', extras: ['封套线'] },
    tag: { text: '角标' },
    details: rows(3, () => undefined, (n) => `信息${n}`, (n) => [`编号${n}`]),
    detailsExtras: ['分隔线'],
    brand: { text: '品牌' },
    centre: { top: 60, bottom: 1020, close: {} },
  },
  // The name on the sticker is the title, the three fields under it the lines.
  'intro-card': {
    title: '标题',
    tag: { text: '角标' },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`),
    brand: { text: '品牌' },
    centre: { top: 40, bottom: 1022, close: {} },
  },
  // The date is the badge, the weekday and lunar date the subtitle, the day's line the title.
  'daily-quote': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    brand: { text: '品牌' },
    centre: { top: 300, bottom: 950, close: {} },
  },
  // The masthead is the brand, the dateline the badge; without a masthead the page closes up in the middle.
  'masthead-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文' },
    tag: { text: '角标' },
    brand: { text: '品牌' },
    centre: { top: 0, bottom: 766, close: {} },
  },
  // The quote is the title, who said it the subtitle; the marks keep their place on the block.
  'interview-cover': {
    title: '标题',
    subtitle: { text: '副标题', extras: ['短线'] },
    body: { text: '正文' },
    tag: { text: '角标' },
    brand: { text: '品牌' },
    centre: { top: 60, bottom: 726, pinned: ['引号尾一', '引号球一', '引号尾二', '引号球二'], close: {} },
  },
  // Each line is a time and what was done; the header stays, the column under it closes up.
  resume: {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    body: { text: '正文', extras: ['关于我', '关于我标记'] },
    details: rows(5, (n) => `标签${n}`, (n) => `信息${n}`),
    detailsExtras: ['经历', '经历标记', '经历线'],
    brand: { text: '品牌', extras: ['页脚线'] },
    centre: { top: 380, bottom: 1386, close: {} },
  },
  // The red head is the brand, the file number the badge; the seal goes with the sign-off.
  notice: {
    title: '标题',
    tag: { text: '角标' },
    recipient: { text: '称呼' },
    body: { text: '正文' },
    details: rows(5, () => undefined, (n) => `信息${n}`),
    subtitle: { text: '落款', extras: ['印章环', '印章星'] },
    brand: { text: '品牌' },
    // A short notice closes up and sits in the middle of the page.
    centre: { top: 100, bottom: 1654, close: {} },
  },
  // The score is the badge, its stamp going with it.
  'food-review': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标', extras: ['评分章', '评分字', '星级'] },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`, (n) => [`行线${n}`]),
    brand: { text: '品牌' },
  },
  // The lesson number is the badge in the yellow circle.
  'course-cover': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标', extras: ['课号'] },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`, (n) => [`标记${n}`]),
    brand: { text: '品牌' },
  },
  // The excerpt is the body, its quote mark goes with it; the page number is the badge.
  'book-note': {
    title: '标题',
    subtitle: { text: '副标题' },
    body: { text: '正文', extras: ['引号'] },
    tag: { text: '角标' },
    brand: { text: '品牌' },
  },
  // The edition is the badge; the ticket number and barcode stay on the stub.
  'event-banner': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    details: rows(3, (n) => `标签${n}`, (n) => `信息${n}`),
    brand: { text: '品牌' },
  },
  // The charge left is the badge in the battery.
  'mood-square': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标' },
    brand: { text: '品牌' },
  },
  // The title is written into the grid; the issue is the badge, the author the brand.
  'article-hero': {
    title: '标题',
    subtitle: { text: '副标题' },
    tag: { text: '角标', extras: ['短线'] },
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
  if (slots.link) names.push(slots.link)
  if (slots.image) names.push(slots.image.node, ...(slots.image.extras ?? []))
  if (slots.chart) names.push(slots.chart.node)
  if (slots.tableElement) names.push(slots.tableElement.node)
  if (slots.timeline) names.push(slots.timeline.node)
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

/** The slots of a poster's text-only drawing: its own where they differ, no picture. */
export function posterTextOnlySlots(series: FreeformPosterSeriesId): PosterSlots {
  const { textOnly, image: _image, ...slots } = FREEFORM_POSTER_SLOTS[series]
  return { ...slots, ...textOnly }
}
