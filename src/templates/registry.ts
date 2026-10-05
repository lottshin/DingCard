import { randomId } from '../uid'
import { normalizeFreeformDocumentV22 } from '../freeform/sceneDocument'
import type {
  BlendMode,
  ColorPaint,
  FreeformDocument,
  FreeformSceneNode,
  FreeformSlide,
  FreeformShapeElement,
  FreeformTextElement,
  LineEndpointCap,
  PathFill,
  SceneFilter,
  ShadowPaint,
  ShapeFill,
} from '../freeform/types'
import { createDecorationNode, decorationById } from '../freeform/decorations'
import { createDefaultImageFraming } from '../freeform/imageFraming'
import { DEFAULT_PROFILE, type Profile } from '../theme'
import { TIMETABLE_SAMPLE, TIMETABLE_TABLE, tableNodes } from './tables'
import type {
  FreeformTemplateSeriesId,
  MarkdownTemplateSeriesId,
  MarkdownTemplateDocument,
  TemplateDefinition,
  TemplateWorkspace,
} from './types'

const solid = (color: string): ColorPaint => ({ type: 'solid', color })

const stopsPaint = (stops: Array<[number, string]>, angle: number): ColorPaint => ({
  type: 'linear-gradient',
  stops: stops.map(([offset, color]) => ({ offset, color })),
  angle,
})
const TEMPLATE_EDGE_BLEED = 16

function copyProfile(profile: Profile): Profile {
  return { ...profile }
}

function uuid(): string {
  return randomId()
}

function textNode(
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: Partial<Pick<FreeformTextElement,
    'fontSize' | 'fontFamily' | 'textFill' | 'align' | 'fontWeight' | 'rotation' | 'name'
    | 'lineHeight' | 'letterSpacing' | 'italic' | 'vertical' | 'opacity' | 'shadow' | 'filter' | 'blendMode'
    | 'stroke' | 'strokeWidth' | 'effect'
  >> = {},
): FreeformTextElement {
  return {
    id: uuid(),
    name: options.name ?? '文字',
    locked: false,
    hidden: false,
    type: 'text',
    x,
    y,
    width,
    height,
    rotation: options.rotation ?? 0,
    scale: 1,
    text,
    fontSize: options.fontSize ?? 42,
    fontFamily: options.fontFamily ?? 'PingFang SC',
    textFill: options.textFill ?? solid('#18181b'),
    align: options.align ?? 'left',
    fontWeight: options.fontWeight ?? 'normal',
    ...(options.lineHeight !== undefined ? { lineHeight: options.lineHeight } : {}),
    ...(options.letterSpacing !== undefined ? { letterSpacing: options.letterSpacing } : {}),
    ...(options.italic ? { italic: true } : {}),
    ...(options.vertical ? { vertical: true } : {}),
    ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
    ...(options.shadow ? { shadow: { ...options.shadow } } : {}),
    ...(options.filter ? { filter: { ...options.filter } } : {}),
    ...(options.blendMode ? { blendMode: options.blendMode } : {}),
    ...(options.stroke !== undefined ? { stroke: options.stroke } : {}),
    ...(options.strokeWidth !== undefined ? { strokeWidth: options.strokeWidth } : {}),
    ...(options.effect ? { effect: { ...options.effect } } : {}),
  }
}

function shapeNode(
  shape: FreeformShapeElement['shape'],
  x: number,
  y: number,
  width: number,
  height: number,
  fill: ShapeFill,
  options: {
    name?: string
    rotation?: number
    stroke?: string
    strokeWidth?: number
    cornerRadius?: number
    opacity?: number
    shadow?: ShadowPaint
    filter?: SceneFilter
    blendMode?: BlendMode
  } = {},
): FreeformSceneNode {
  return {
    id: uuid(),
    name: options.name ?? '色块',
    locked: false,
    hidden: false,
    type: 'shape',
    x,
    y,
    width,
    height,
    rotation: options.rotation ?? 0,
    scale: 1,
    shape,
    fill,
    stroke: options.stroke ?? 'transparent',
    strokeWidth: options.strokeWidth ?? 0,
    ...(options.cornerRadius !== undefined ? { cornerRadius: options.cornerRadius } : {}),
    ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
    ...(options.shadow ? { shadow: { ...options.shadow } } : {}),
    ...(options.filter ? { filter: { ...options.filter } } : {}),
    ...(options.blendMode ? { blendMode: options.blendMode } : {}),
  }
}

function lineNode(
  x: number,
  y: number,
  width: number,
  color: string,
  strokeWidth = 6,
  options: {
    name?: string
    rotation?: number
    lineKind?: 'line' | 'arrow'
    opacity?: number
    shadow?: ShadowPaint
    filter?: SceneFilter
    blendMode?: BlendMode
    dash?: number
    cap?: 'round' | 'butt' | 'square'
    startCap?: LineEndpointCap
    endCap?: LineEndpointCap
  } = {},
): FreeformSceneNode {
  return {
    id: uuid(),
    name: options.name ?? '分隔线',
    locked: false,
    hidden: false,
    type: 'line',
    lineKind: options.lineKind ?? 'line',
    x,
    y,
    width,
    height: 12,
    rotation: options.rotation ?? 0,
    scale: 1,
    stroke: color,
    strokeWidth,
    ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
    ...(options.shadow ? { shadow: { ...options.shadow } } : {}),
    ...(options.filter ? { filter: { ...options.filter } } : {}),
    ...(options.blendMode ? { blendMode: options.blendMode } : {}),
    ...(options.dash !== undefined ? { dash: options.dash } : {}),
    ...(options.cap ? { cap: options.cap } : {}),
    ...(options.startCap ? { startCap: options.startCap } : {}),
    ...(options.endCap ? { endCap: options.endCap } : {}),
  }
}

/** A line standing upright from `top` to `bottom` at `x` (a horizontal line turned 90°). */
function verticalLineNode(
  x: number,
  top: number,
  bottom: number,
  color: string,
  strokeWidth: number,
  options: Parameters<typeof lineNode>[5] = {},
): FreeformSceneNode {
  const length = bottom - top
  return lineNode(x - length / 2, (top + bottom) / 2 - 6, length, color, strokeWidth, { ...options, rotation: 90 })
}

/** An SVG path drawn 1:1 in its box (the viewBox is the box). */
function pathNode(
  d: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    name?: string
    fill?: PathFill
    stroke?: string
    strokeWidth?: number
    dash?: number
    cap?: 'round' | 'butt' | 'square'
    join?: 'round' | 'miter' | 'bevel'
    opacity?: number
    shadow?: ShadowPaint
  } = {},
): FreeformSceneNode {
  return {
    id: uuid(),
    name: options.name ?? '路径',
    locked: false,
    hidden: false,
    type: 'path',
    x,
    y,
    width,
    height,
    rotation: 0,
    scale: 1,
    d,
    viewBox: { x: 0, y: 0, width, height },
    fill: options.fill ?? { type: 'transparent' },
    stroke: options.stroke ?? '#000000',
    strokeWidth: options.strokeWidth ?? 4,
    ...(options.dash !== undefined ? { dash: options.dash } : {}),
    ...(options.cap ? { cap: options.cap } : {}),
    ...(options.join ? { join: options.join } : {}),
    ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
    ...(options.shadow ? { shadow: { ...options.shadow } } : {}),
  }
}

function slide(
  name: string,
  background: ColorPaint,
  nodes: FreeformSceneNode[],
  size: { width: number; height: number } = { width: 1080, height: 1440 },
): FreeformSlide {
  return {
    id: uuid(),
    name,
    width: size.width,
    height: size.height,
    background,
    nodes,
  }
}

function documentFromSlides(slides: FreeformSlide[]): FreeformDocument {
  const document: FreeformDocument = {
    documentVersion: 22,
    activeSlideId: slides[0].id,
    slides,
  }
  const normalized = normalizeFreeformDocumentV22(document)
  if (!normalized) throw new Error('内置模板生成了无效的自由画布文档')
  return normalized
}

const markdownDocuments: Record<MarkdownTemplateSeriesId, MarkdownTemplateDocument> = {
  'editorial-archive': {
    source: `# 这周事情很多，我先删掉一半

我把任务重新抄了一遍，只留下三件必须完成的事。

![玻璃与混凝土构成的城市建筑立面](/templates/editorial-building.webp)

---

## 任务列了二十多条，今天只做三条

以前我总觉得每件事都不能拖，结果一天结束，最重要的反而没动。

我把本周任务重新抄了一遍。方案要交，合同要确认，其他事项先挪到下午或下周。

改完以后，上午只剩一件事：把方案写完。

---

> 明天上午先不回消息，把方案写完。

下午再处理回复、整理和临时插进来的事。

---

## 明天上午写完方案第一版

中午十二点前不处理其他事项。`,
    platformId: 'rednote',
    themeId: 'template-editorial-archive',
    fontFamily: 'Songti SC, serif',
    radius: 4,
    profile: { ...DEFAULT_PROFILE, nickname: '叮卡编辑档案', handle: 'dingcard' },
  },
  'public-theatre': {
    source: `# 这一页只说一件事

别把标题、解释和注释同时推到读者眼前。

---

## 标题、正文和注释挤在一起，读者很难找到重点

我把三个层级都放大后，页面没有更清楚。标题缩短，正文只留解释，注释放到页底，阅读顺序才明显。

这一屏先给结论，下一屏再补说明。

---

> 这一页只留这句话。

前一页内容多，这一页留空。翻到下一页时，再继续正文。

---

## 发布前再删一遍

- 上一页已经说过的话
- 没有讲清楚的例子
- 只为了填满空白的句子`,
    platformId: 'rednote',
    themeId: 'template-public-theatre',
    fontFamily: "'Noto Sans SC', sans-serif",
    radius: 0,
    profile: { ...DEFAULT_PROFILE, nickname: '公共剧场', handle: 'publictheatre' },
  },
  'issue-cover': {
    source: `# 我又把这一周排满了

![玻璃与混凝土构成的城市建筑立面](/templates/editorial-building.webp)

---

## 日程排得很整齐，事情还是没做完

周一到周五都填满了。临时任务一来，原来的安排只能往后推。

删掉两项安排后，周三终于留出了完整的两个小时。

---

> 健身课和整理照片，这周先不排。

临时有事再用这段时间，没事就让它空着。

---

## 周三晚上不排事

这两个小时先留着。`,
    platformId: 'rednote',
    themeId: 'template-issue-cover',
    fontFamily: "'Noto Serif SC', serif",
    radius: 0,
    profile: { ...DEFAULT_PROFILE, nickname: 'DingCard Issue', handle: 'dingcardissue' },
  },
}

function cloneMarkdown(series: MarkdownTemplateSeriesId): MarkdownTemplateDocument {
  const document = markdownDocuments[series]
  return { ...document, profile: copyProfile(document.profile) }
}

// Faces the templates set their words in (all built-in fonts).
const SERIF = "'Noto Serif SC', serif"
const KAI = "'LXGW WenKai TC', cursive"
const UI = 'system-ui, sans-serif'

function createEditorialDocument(): FreeformDocument {
  const paper = '#f6f3ea'
  const ink = '#1b1a18'
  const red = '#c23a26'
  const redOnInk = '#e5503a'
  const muted = '#5f584e'
  const band = '#e7dfcf'
  const masthead = (text: string, color: string) => textNode(text, 88, 72, 640, 48, {
    name: '刊头', fontSize: 24, fontFamily: UI, textFill: solid(color), fontWeight: 'bold', letterSpacing: 6,
  })
  return documentFromSlides([
    slide('封面', solid(paper), [
      lineNode(88, 130, 904, ink, 3, { name: '刊头线' }),
      shapeNode('rect', 88, 712, 132, 12, solid(red), { name: '标题线', cornerRadius: 0 }),
      lineNode(88, 1294, 904, ink, 2, { name: '页脚线' }),
      masthead('THE DINGCARD REVIEW', ink),
      textNode('2026 · AUTUMN', 692, 72, 300, 48, { name: '期号', fontSize: 24, fontFamily: UI, textFill: solid(muted), align: 'right', letterSpacing: 3 }),
      textNode('FIELD NOTES', 88, 194, 420, 60, {
        name: '栏目', fontSize: 28, fontFamily: UI, textFill: solid('#ffffff'), fontWeight: 'bold', letterSpacing: 5,
        effect: { type: 'background', color: red, amount: 45, radius: 8 },
      }),
      textNode('开头先把\n判断写清楚', 80, 290, 920, 390, {
        name: '主标题', fontSize: 150, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.18, letterSpacing: -2,
      }),
      textNode('第一屏负责给出判断，\n后面的页面再交代过程。', 88, 756, 800, 140, {
        name: '导语', fontSize: 40, fontFamily: SERIF, textFill: solid(muted), lineHeight: 1.6,
      }),
      textNode('01', 520, 904, 480, 370, {
        name: '大期号', fontSize: 340, fontFamily: SERIF, textFill: solid(red), fontWeight: 'bold', align: 'right', lineHeight: 1,
        effect: { type: 'hollow', amount: 30 },
      }),
      textNode('叮卡编辑部', 88, 1318, 400, 44, { name: '署名', fontSize: 24, fontFamily: UI, textFill: solid(ink), letterSpacing: 2 }),
      textNode('先判断，再展开', 592, 1318, 400, 44, { name: '页脚主题', fontSize: 24, fontFamily: UI, textFill: solid(muted), align: 'right', letterSpacing: 2 }),
    ]),
    slide('内页', solid(paper), [
      lineNode(88, 130, 904, ink, 3, { name: '刊头线' }),
      lineNode(88, 724, 904, ink, 3, { name: '正文分隔线' }),
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, 1004, 1080 + TEMPLATE_EDGE_BLEED * 2, 250, solid(band), { name: '引文底板', cornerRadius: 0 }),
      shapeNode('rect', 88, 1052, 10, 154, solid(red), { name: '引文竖线', cornerRadius: 0 }),
      lineNode(88, 1294, 904, ink, 2, { name: '页脚线' }),
      masthead('THE DINGCARD REVIEW', ink),
      textNode('02', 792, 72, 200, 48, { name: '页码', fontSize: 28, fontFamily: UI, textFill: solid(red), fontWeight: 'bold', align: 'right', letterSpacing: 2 }),
      textNode('每一页\n都要往前走', 80, 192, 920, 300, {
        name: '标题', fontSize: 112, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.2, letterSpacing: -1,
      }),
      textNode('分页不是把一段话切开，而是安排读者先看到什么、接着理解什么。', 88, 518, 880, 170, {
        name: '导语', fontSize: 38, fontFamily: SERIF, textFill: solid(muted), lineHeight: 1.6,
      }),
      textNode('01\n提出问题', 88, 762, 280, 190, { name: '步骤一', fontSize: 44, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.4 }),
      textNode('02\n解释原因', 400, 762, 280, 190, { name: '步骤二', fontSize: 44, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.4 }),
      textNode('03\n给出下一步', 712, 762, 280, 190, { name: '步骤三', fontSize: 44, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.4 }),
      textNode('“抽掉这一页，\n文章有没有少一个关键动作？”', 136, 1046, 856, 130, {
        name: '引文', fontSize: 42, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.45,
      }),
      textNode('用这个问题检查跨页节奏', 136, 1180, 856, 48, { name: '引文注释', fontSize: 28, fontFamily: UI, textFill: solid(muted), letterSpacing: 1 }),
      textNode('阅读顺序 / 02', 88, 1318, 400, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(ink), letterSpacing: 2 }),
    ]),
    slide('结尾', solid(ink), [
      lineNode(88, 130, 904, paper, 3, { name: '刊头线' }),
      shapeNode('rect', 88, 772, 132, 10, solid(redOnInk), { name: '正文线', cornerRadius: 0 }),
      shapeNode('rect', 806, 1080, 176, 176, solid(red), { name: '印章', cornerRadius: 20, rotation: -8 }),
      lineNode(88, 1294, 904, '#3b3732', 2, { name: '页脚线' }),
      masthead('THE DINGCARD REVIEW · 03', paper),
      textNode('03', 792, 72, 200, 48, { name: '页码', fontSize: 28, fontFamily: UI, textFill: solid(redOnInk), fontWeight: 'bold', align: 'right', letterSpacing: 2 }),
      textNode('结尾要让文章\n真正落地', 80, 192, 920, 300, {
        name: '标题', fontSize: 112, fontFamily: SERIF, textFill: solid(paper), fontWeight: 'bold', lineHeight: 1.2, letterSpacing: -1,
      }),
      textNode('给出下一步，或者留下一句值得记住的话。不要把开头再说一遍。', 88, 530, 860, 190, {
        name: '正文', fontSize: 38, fontFamily: SERIF, textFill: solid('#c2baad'), lineHeight: 1.6,
      }),
      textNode('一句结论\n一个动作\n到此结束', 88, 818, 680, 300, { name: '结尾清单', fontSize: 50, fontFamily: UI, textFill: solid(paper), fontWeight: 'bold', lineHeight: 1.6 }),
      textNode('完', 806, 1088, 176, 160, {
        name: '印章文字', fontSize: 104, fontFamily: SERIF, textFill: solid(paper), fontWeight: 'bold', align: 'center', lineHeight: 1, rotation: -8,
      }),
      textNode('THE DINGCARD REVIEW', 88, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid('#948b7e'), letterSpacing: 6 }),
    ]),
  ])
}

function createChecklistDocument(): FreeformDocument {
  const paper = '#f3f5ec'
  const green = '#1f4d3a'
  const deep = '#14261d'
  const mint = '#dfe9dc'
  const yellow = '#f2c94c'
  const muted = '#5c6f64'
  const rule = '#dce3d6'
  const white = '#ffffff'
  const footer = (color: string) => textNode('DINGCARD WORKBOOK', 88, 1318, 600, 44, {
    name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(color), fontWeight: 'bold', letterSpacing: 4,
  })
  const step = (index: number, number: string, title: string, note: string, plate: string, digits: string) => {
    const y = 396 + index * 230
    const names = ['一', '二', '三'][index]
    return [
      shapeNode('rect', 88, y + 4, 116, 116, solid(plate), { name: `编号底板${names}`, cornerRadius: 30 }),
      lineNode(240, y + 186, 752, rule, 2, { name: `步骤线${names}` }),
      textNode(number, 88, y + 26, 116, 72, { name: `编号${names}`, fontSize: 54, fontFamily: UI, textFill: solid(digits), fontWeight: 'bold', align: 'center' }),
      textNode(title, 240, y, 752, 76, { name: `步骤${names}`, fontSize: 50, textFill: solid(deep), fontWeight: 'bold' }),
      textNode(note, 240, y + 82, 752, 60, { name: `说明${names}`, fontSize: 34, textFill: solid(muted) }),
    ]
  }
  const check = (index: number, text: string) => {
    const y = 504 + index * 150
    const names = ['一', '二', '三'][index]
    return [
      shapeNode('ellipse', 88, y, 76, 76, solid(yellow), { name: `完成点${names}` }),
      lineNode(196, y + 110, 796, '#3c6a56', 2, { name: `验收线${names}` }),
      textNode('✓', 88, y + 8, 76, 60, { name: `勾${names}`, fontSize: 40, fontFamily: UI, textFill: solid(green), fontWeight: 'bold', align: 'center' }),
      textNode(text, 196, y + 2, 796, 72, { name: `验收项${names}`, fontSize: 46, textFill: solid(paper), fontWeight: 'bold' }),
    ]
  }
  return documentFromSlides([
    slide('封面', solid(paper), [
      pathNode('M 24 112 L 96 184 L 236 24', 760, 70, 260, 210, { name: '勾形', stroke: yellow, strokeWidth: 40, cap: 'round', join: 'round' }),
      lineNode(88, 806, 904, '#cfd8cb', 2, { name: '清单线一' }),
      shapeNode('rect', 88, 846, 60, 60, solid(green), { name: '复选框一', cornerRadius: 16 }),
      shapeNode('rect', 88, 976, 60, 60, solid(paper), { name: '复选框二', cornerRadius: 16, stroke: green, strokeWidth: 5 }),
      shapeNode('rect', 88, 1106, 60, 60, solid(paper), { name: '复选框三', cornerRadius: 16, stroke: green, strokeWidth: 5 }),
      lineNode(88, 934, 904, rule, 2, { name: '清单线二' }),
      lineNode(88, 1064, 904, rule, 2, { name: '清单线三' }),
      lineNode(88, 1294, 904, '#cfd8cb', 2, { name: '页脚线' }),
      textNode('CHECKLIST', 88, 110, 360, 60, {
        name: '标签文字', fontSize: 30, fontFamily: UI, textFill: solid(green), fontWeight: 'bold', letterSpacing: 5,
        effect: { type: 'background', color: yellow, amount: 55, radius: 100 },
      }),
      textNode('把计划写到\n能立刻开工', 80, 300, 920, 330, { name: '主标题', fontSize: 128, textFill: solid(deep), fontWeight: 'bold', lineHeight: 1.18, letterSpacing: -2 }),
      textNode('先确定今天交付什么，\n再把它拆成看得见的动作。', 88, 640, 840, 130, { name: '导语', fontSize: 38, textFill: solid(muted), lineHeight: 1.55 }),
      textNode('✓', 88, 852, 60, 48, { name: '勾一', fontSize: 34, fontFamily: UI, textFill: solid(white), fontWeight: 'bold', align: 'center' }),
      textNode('目标已经写清楚', 180, 840, 812, 72, { name: '检查项一', fontSize: 44, textFill: solid(deep), fontWeight: 'bold' }),
      textNode('完成标准可以验证', 180, 970, 812, 72, { name: '检查项二', fontSize: 44, textFill: solid(deep), fontWeight: 'bold' }),
      textNode('素材集中在一个地方', 180, 1100, 812, 72, { name: '检查项三', fontSize: 44, textFill: solid(deep), fontWeight: 'bold' }),
      footer(green),
      textNode('01 / 03', 692, 1318, 300, 44, { name: '边栏页码', fontSize: 26, fontFamily: UI, textFill: solid(green), fontWeight: 'bold', align: 'right', letterSpacing: 2 }),
    ]),
    slide('步骤', solid(paper), [
      lineNode(88, 164, 904, '#cfd8cb', 2, { name: '刊头线' }),
      shapeNode('rect', 88, 1094, 904, 176, solid(mint), { name: '批注底板', cornerRadius: 32 }),
      lineNode(88, 1294, 904, '#cfd8cb', 2, { name: '页脚线' }),
      textNode('CHECKLIST / 02', 88, 100, 600, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(green), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('开工前确认', 80, 200, 920, 150, { name: '页标题', fontSize: 104, textFill: solid(deep), fontWeight: 'bold', letterSpacing: -1 }),
      ...step(0, '01', '这次只解决一个问题', '范围越清楚，开始越容易。', green, white),
      ...step(1, '02', '一句话写出完成标准', '最后要交付什么，必须能被检查。', yellow, green),
      ...step(2, '03', '把素材收进同一处', '减少寻找和切换，给执行留出连续时间。', green, white),
      textNode('不满足的项目先补齐，不急着进入制作。', 136, 1134, 808, 96, { name: '批注', fontSize: 36, textFill: solid(green), fontWeight: 'bold', lineHeight: 1.45 }),
      footer(green),
    ]),
    slide('验收', solid(green), [
      lineNode(88, 164, 904, '#3c6a56', 2, { name: '刊头线' }),
      lineNode(88, 1294, 904, '#3c6a56', 2, { name: '页脚线' }),
      textNode('FINAL CHECK / 03', 88, 100, 600, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('发布前，\n逐项打勾', 80, 196, 920, 290, { name: '标题', fontSize: 112, textFill: solid(paper), fontWeight: 'bold', lineHeight: 1.18, letterSpacing: -1 }),
      ...check(0, '第一页能看懂主题'),
      ...check(1, '中间没有突然拥挤'),
      ...check(2, '最后一页给出下一步'),
      textNode('03 / 03', 80, 960, 920, 230, { name: '完成进度', fontSize: 200, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: -6, lineHeight: 1 }),
      textNode('全部完成，可以导出。', 88, 1196, 904, 72, { name: '结论', fontSize: 40, textFill: solid(paper), fontWeight: 'bold' }),
      footer('#a8c3b5'),
    ]),
  ])
}

function createSignalDocument(): FreeformDocument {
  const paper = '#f1efe9'
  const black = '#111111'
  const red = '#d63b24'
  const blue = '#2550d9'
  const yellow = '#f4c542'
  const evidence = (index: number, letter: string, color: string, text: string) => {
    const y = 214 + index * 200
    const names = ['一', '二', '三'][index]
    return [
      lineNode(512, y + 170, 504, '#cfcbc2', 2, { name: `证据线${names}` }),
      textNode(letter, 512, y, 96, 110, { name: `证据编号${names}`, fontSize: 96, fontFamily: UI, textFill: solid(color), fontWeight: 'bold', lineHeight: 1 }),
      textNode(text, 624, y + 10, 392, 130, { name: `证据${names}`, fontSize: 40, textFill: solid(black), fontWeight: 'bold', lineHeight: 1.35 }),
    ]
  }
  return documentFromSlides([
    slide('封面', solid(paper), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 436 + TEMPLATE_EDGE_BLEED, 376 + TEMPLATE_EDGE_BLEED, solid(red), { name: '红色象限', cornerRadius: 0 }),
      shapeNode('rect', 470, 330, 220, 20, solid(blue), { name: '蓝色坐标轴', cornerRadius: 0 }),
      lineNode(64, 902, 952, black, 10, { name: '中部网格线', cap: 'butt' }),
      lineNode(64, 1294, 952, black, 3, { name: '页脚线', cap: 'butt' }),
      textNode('01', 40, 96, 360, 240, { name: '圆点编号', fontSize: 230, fontFamily: UI, textFill: solid(paper), fontWeight: 'bold', letterSpacing: -10, lineHeight: 1 }),
      textNode('SIGNAL / POSTER 01', 470, 72, 546, 44, { name: '刊头', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', align: 'right', letterSpacing: 4 }),
      textNode('CLAIM FIRST →', 470, 252, 546, 64, { name: '英文主张', fontSize: 40, fontFamily: UI, textFill: solid(blue), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('观点', 64, 400, 952, 240, { name: '标题上', fontSize: 175, textFill: solid(black), fontWeight: 'bold', letterSpacing: -6, lineHeight: 1.1 }),
      textNode('先行', 64, 640, 952, 240, { name: '标题下', fontSize: 175, textFill: solid(black), fontWeight: 'bold', letterSpacing: -6, lineHeight: 1.1 }),
      textNode('别让读者读完三段，\n才发现你真正想说什么。', 64, 944, 952, 180, { name: '主张', fontSize: 56, textFill: solid(black), fontWeight: 'bold', lineHeight: 1.35 }),
      textNode('判断站在第一屏，证据跟在后面。', 64, 1146, 952, 60, { name: '说明', fontSize: 34, textFill: solid('#55524c') }),
      textNode('DINGCARD SIGNAL', 64, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('2026', 816, 1318, 200, 44, { name: '页脚编号', fontSize: 24, fontFamily: UI, textFill: solid(black), align: 'right', letterSpacing: 4 }),
    ]),
    slide('论证', solid(paper), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 456 + TEMPLATE_EDGE_BLEED, 1440 + TEMPLATE_EDGE_BLEED * 2, solid(blue), { name: '蓝色分区', cornerRadius: 0 }),
      lineNode(512, 164, 504, black, 4, { name: '右栏顶线', cap: 'butt' }),
      shapeNode('rect', 456, 900, 624 + TEMPLATE_EDGE_BLEED, 300, solid(red), { name: '红色结论栏', cornerRadius: 0 }),
      lineNode(512, 1294, 504, black, 3, { name: '页脚线', cap: 'butt' }),
      textNode('WHY', 52, 88, 390, 170, { name: '英文标题', fontSize: 150, fontFamily: UI, textFill: solid(paper), fontWeight: 'bold', letterSpacing: 2, lineHeight: 1 }),
      textNode('证据跟在\n判断后面', 56, 330, 370, 240, { name: '主标题', fontSize: 88, textFill: solid('#ffffff'), fontWeight: 'bold', lineHeight: 1.2 }),
      textNode('先说结论，不会削弱论证。它只是让读者知道，接下来的材料在回答什么。', 60, 640, 360, 360, { name: '左栏正文', fontSize: 34, textFill: solid('#d7e0ff'), lineHeight: 1.65 }),
      textNode('02', 816, 88, 200, 60, { name: '页码', fontSize: 40, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', align: 'right' }),
      ...evidence(0, 'A', red, '先给一个清楚的判断'),
      ...evidence(1, 'B', blue, '再摆最有力的事实'),
      ...evidence(2, 'C', black, '删掉不能支撑判断的材料'),
      textNode('顺序清楚，论证才有方向。', 512, 950, 504, 200, { name: '结论', fontSize: 50, textFill: solid('#ffffff'), fontWeight: 'bold', lineHeight: 1.35 }),
      textNode('SIGNAL / 02', 512, 1318, 400, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 4 }),
    ]),
    slide('行动', solid(black), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 1080 + TEMPLATE_EDGE_BLEED * 2, 196 + TEMPLATE_EDGE_BLEED, solid(yellow), { name: '黄色刊头', cornerRadius: 0 }),
      shapeNode('ellipse', 820, 342, 196, 196, solid(yellow), { name: '方向符号' }),
      lineNode(64, 646, 952, '#33312d', 3, { name: '标题线', cap: 'butt' }),
      shapeNode('rect', 64, 716, 952, 330, solid(red), { name: '行动底板', cornerRadius: 32 }),
      lineNode(64, 1294, 952, yellow, 3, { name: '页脚线', cap: 'butt' }),
      textNode('SIGNAL / 03 / ACTION', 64, 76, 700, 50, { name: '刊头', fontSize: 30, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('03', 816, 76, 200, 50, { name: '页码', fontSize: 30, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', align: 'right' }),
      textNode('最后，\n给一个动作。', 64, 280, 740, 320, { name: '主标题', fontSize: 116, textFill: solid(paper), fontWeight: 'bold', lineHeight: 1.18 }),
      textNode('→', 820, 368, 196, 140, { name: '箭头文字', fontSize: 120, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', align: 'center', lineHeight: 1 }),
      textNode('今天试一次', 120, 776, 840, 110, { name: '行动标题', fontSize: 80, textFill: solid('#ffffff'), fontWeight: 'bold' }),
      textNode('明天回来，看结果。', 120, 904, 840, 70, { name: '行动说明', fontSize: 40, textFill: solid('#ffffff') }),
      textNode('能被执行的观点，才会真正留下来。', 64, 1104, 952, 110, { name: '收束句', fontSize: 40, textFill: solid('#bdbab3'), lineHeight: 1.45 }),
      textNode('DINGCARD SIGNAL', 64, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(paper), fontWeight: 'bold', letterSpacing: 4 }),
    ]),
  ])
}

function createNightFlightDocument(): FreeformDocument {
  const night = '#0e1824'
  const cream = '#f4eee2'
  const amber = '#f2b84b'
  const teal = '#6fb7c8'
  const coral = '#e8664a'
  const muted = '#a6b3bf'
  const rule = '#26374a'
  const record = (index: number, time: string, color: string, text: string) => {
    const y = 470 + index * 220
    const names = ['一', '二', '三'][index]
    return [
      shapeNode('ellipse', 100, y + 16, 28, 28, solid(color), {
        name: `时间点${names}`,
        ...(index === 2 ? { shadow: { color, blur: 18, offsetX: 0, offsetY: 0 } } : {}),
      }),
      ...(index < 2 ? [
        verticalLineNode(114, y + 56, y + 224, '#3d5570', 4, { name: `时间轴${names}` }),
        lineNode(168, y + 168, 824, rule, 2, { name: `记录线${names}` }),
      ] : []),
      textNode(time, 168, y, 300, 56, { name: `时间${names}`, fontSize: 36, fontFamily: UI, textFill: solid(color), fontWeight: 'bold', letterSpacing: 2 }),
      textNode(text, 168, y + 64, 824, 76, { name: `记录${names}`, fontSize: 50, fontFamily: SERIF, textFill: solid(cream), fontWeight: 'bold' }),
    ]
  }
  return documentFromSlides([
    slide('出发', stopsPaint([[0, '#0a121d'], [1, '#18293d']], 180), [
      shapeNode('ellipse', 770, 120, 210, 210, solid('#f3e8d0'), { name: '月亮', shadow: { color: '#f3e8d0', blur: 80, offsetX: 0, offsetY: 0 } }),
      shapeNode('ellipse', 640, 300, 8, 8, solid(cream), { name: '星一', opacity: 0.7 }),
      shapeNode('ellipse', 980, 420, 6, 6, solid(cream), { name: '星二', opacity: 0.5 }),
      shapeNode('ellipse', 560, 150, 6, 6, solid(cream), { name: '星三', opacity: 0.6 }),
      pathNode('M 14 186 Q 452 -46 890 116', 88, 1010, 904, 210, { name: '航线', stroke: teal, strokeWidth: 4, dash: 14, cap: 'round', opacity: 0.85 }),
      shapeNode('ellipse', 90, 1184, 24, 24, solid(amber), { name: '起点' }),
      shapeNode('ellipse', 962, 1110, 32, 32, solid(coral), { name: '终点', shadow: { color: coral, blur: 24, offsetX: 0, offsetY: 0 } }),
      lineNode(88, 1294, 904, rule, 2, { name: '页脚线' }),
      textNode('NF 2340', 88, 92, 400, 56, { name: '航班号', fontSize: 36, fontFamily: UI, textFill: solid(amber), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('FRI · 23:40', 88, 152, 400, 44, { name: '出发时间', fontSize: 28, fontFamily: UI, textFill: solid(muted), letterSpacing: 3 }),
      textNode('夜里先记下，\n天亮再判断', 80, 420, 920, 380, {
        name: '主标题', fontSize: 136, fontFamily: SERIF, textFill: solid(cream), fontWeight: 'bold', lineHeight: 1.25,
      }),
      textNode('灵感通常不完整。\n保留原句，先别急着把它修成成品。', 88, 820, 840, 140, { name: '导语', fontSize: 40, textFill: solid(muted), lineHeight: 1.55 }),
      textNode('23:40', 88, 1222, 200, 48, { name: '起点时间', fontSize: 30, fontFamily: UI, textFill: solid(amber), fontWeight: 'bold', letterSpacing: 2 }),
      textNode('08:30', 792, 1150, 200, 48, { name: '抵达时间', fontSize: 30, fontFamily: UI, textFill: solid(coral), fontWeight: 'bold', align: 'right', letterSpacing: 2 }),
      textNode('NIGHT FLIGHT / ROUTE 01', 88, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(cream), fontWeight: 'bold', letterSpacing: 3 }),
      textNode('31.23°N  121.47°E', 642, 1318, 350, 44, { name: '坐标', fontSize: 24, fontFamily: UI, textFill: solid(teal), align: 'right', letterSpacing: 2 }),
    ]),
    slide('中途', solid(night), [
      lineNode(88, 156, 904, rule, 2, { name: '刊头线' }),
      lineNode(88, 1294, 904, rule, 2, { name: '页脚线' }),
      textNode('NIGHT FLIGHT / LOG 02', 88, 92, 600, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(muted), fontWeight: 'bold', letterSpacing: 3 }),
      textNode('航行记录', 80, 196, 920, 150, { name: '页标题', fontSize: 112, fontFamily: SERIF, textFill: solid(cream), fontWeight: 'bold' }),
      textNode('00:15 · MIDWAY', 88, 362, 600, 50, { name: '当前时间', fontSize: 30, fontFamily: UI, textFill: solid(amber), fontWeight: 'bold', letterSpacing: 3 }),
      ...record(0, '23:40', amber, '留下最初那句话'),
      ...record(1, '00:15', teal, '补上来源和去向'),
      ...record(2, '08:30', coral, '醒来后重新判断'),
      textNode('先保存线索，不在夜里替明天做完所有决定。', 88, 1150, 904, 110, { name: '注释', fontSize: 36, textFill: solid(muted), lineHeight: 1.55 }),
      textNode('31.23°N · ROUTE ACTIVE', 88, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(teal), fontWeight: 'bold', letterSpacing: 3 }),
    ]),
    slide('抵达', stopsPaint([[0, '#f7f1e6'], [1, '#f3dcbd']], 180), [
      shapeNode('ellipse', 600, 1050, 600, 600, { type: 'radial-gradient', stops: [{ offset: 0, color: '#f6b04d' }, { offset: 1, color: '#ef7a52' }] }, { name: '朝阳', opacity: 0.9 }),
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 1080 + TEMPLATE_EDGE_BLEED * 2, 172 + TEMPLATE_EDGE_BLEED, solid(night), { name: '抵达信息栏', cornerRadius: 0 }),
      shapeNode('ellipse', 88, 736, 40, 40, solid(amber), { name: '起点' }),
      shapeNode('ellipse', 520, 736, 40, 40, solid(teal), { name: '中点' }),
      shapeNode('ellipse', 948, 732, 48, 48, solid(coral), { name: '终点' }),
      lineNode(136, 750, 376, night, 3, { name: '抵达线一' }),
      lineNode(568, 750, 372, night, 3, { name: '抵达线二' }),
      shapeNode('rect', 88, 896, 904, 300, solid(night), { name: '结论底板', cornerRadius: 32 }),
      lineNode(88, 1294, 904, night, 2, { name: '页脚线' }),
      textNode('ARRIVAL · 08:30', 88, 64, 600, 56, { name: '抵达时间', fontSize: 32, fontFamily: UI, textFill: solid(cream), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('ROUTE 03', 692, 66, 300, 52, { name: '路线编号', fontSize: 28, fontFamily: UI, textFill: solid(amber), fontWeight: 'bold', align: 'right', letterSpacing: 3 }),
      textNode('天亮以后，\n只判断一件事', 80, 236, 920, 330, { name: '主标题', fontSize: 120, fontFamily: SERIF, textFill: solid(night), fontWeight: 'bold', lineHeight: 1.22 }),
      textNode('它还让你想继续写吗？', 88, 600, 904, 70, { name: '提问', fontSize: 46, textFill: solid('#5b4a3a'), fontWeight: 'bold' }),
      textNode('保留原句', 88, 800, 300, 50, { name: '节点一', fontSize: 32, textFill: solid(night), fontWeight: 'bold' }),
      textNode('补充线索', 390, 800, 300, 50, { name: '节点二', fontSize: 32, textFill: solid(night), fontWeight: 'bold', align: 'center' }),
      textNode('重新判断', 692, 800, 300, 50, { name: '节点三', fontSize: 32, textFill: solid(night), fontWeight: 'bold', align: 'right' }),
      textNode('答案是肯定的，\n就排进今天。', 136, 944, 808, 160, { name: '结论', fontSize: 56, textFill: solid(cream), fontWeight: 'bold', lineHeight: 1.3 }),
      textNode('否则留在草稿里，也没关系。', 136, 1114, 808, 50, { name: '补充结论', fontSize: 32, textFill: solid(muted) }),
      textNode('DINGCARD / NIGHT FLIGHT', 88, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(night), fontWeight: 'bold', letterSpacing: 3 }),
    ]),
  ])
}

function createNeonDocument(): FreeformDocument {
  const cyan = '#22d3ee'
  const pink = '#f472b6'
  const white = '#f8f7ff'
  const muted = '#aaa7c7'
  const rule = '#2a2547'
  const plate = '#0f0b1f'
  const night = stopsPaint([[0, '#06060c'], [1, '#140a26']], 180)
  const glow = (color: string, blur = 28) => ({ color, blur, offsetX: 0, offsetY: 0 })
  const ring = (name: string, x: number, y: number, size: number, color: string) => shapeNode('ellipse', x, y, size, size, { type: 'transparent' }, {
    name, stroke: color, strokeWidth: 8, shadow: glow(color, 30),
  })
  return documentFromSlides([
    slide('招牌', night, [
      ring('霓虹环一', 640, 930, 300, cyan),
      ring('霓虹环二', 790, 1060, 210, pink),
      lineNode(88, 150, 904, rule, 2, { name: '顶部亮线' }),
      lineNode(88, 1294, 904, rule, 2, { name: '底部亮线' }),
      textNode('NEON NOTES', 88, 86, 520, 48, {
        name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid('#e9fcff'), fontWeight: 'bold', letterSpacing: 8,
        effect: { type: 'neon', color: cyan, amount: 30 },
      }),
      textNode('城市观察 / 01', 692, 86, 300, 48, { name: '期号', fontSize: 24, textFill: solid(pink), align: 'right', letterSpacing: 3 }),
      textNode('夜里的城市\n亮着另一种白天', 80, 300, 920, 340, {
        name: '主标题', fontSize: 120, textFill: solid(white), fontWeight: 'bold', lineHeight: 1.25,
        effect: { type: 'neon', color: pink, amount: 45 },
      }),
      textNode('路灯、招牌和出租车，把夜晚调成了另一种对比度。', 88, 690, 840, 140, { name: '导语', fontSize: 40, textFill: solid(muted), lineHeight: 1.55 }),
      textNode('OPEN ALL NIGHT', 88, 900, 520, 64, {
        name: '英文标语', fontSize: 40, fontFamily: UI, textFill: solid('#e9fcff'), fontWeight: 'bold', letterSpacing: 6,
        effect: { type: 'neon', color: cyan, amount: 50 },
      }),
      textNode('城市观察档案', 88, 1318, 400, 44, { name: '页脚', fontSize: 24, textFill: solid(muted), letterSpacing: 3 }),
      textNode('CITY AFTER DARK', 592, 1318, 400, 44, { name: '页脚英文', fontSize: 24, fontFamily: UI, textFill: solid(muted), align: 'right', letterSpacing: 4 }),
    ]),
    slide('灯牌', night, [
      shapeNode('rect', 88, 220, 904, 420, solid(plate), { name: '灯牌底板一', cornerRadius: 40, stroke: cyan, strokeWidth: 4, shadow: glow(cyan) }),
      shapeNode('rect', 88, 700, 904, 330, solid(plate), { name: '灯牌底板二', cornerRadius: 40, stroke: pink, strokeWidth: 4, shadow: glow(pink) }),
      lineNode(88, 150, 904, rule, 2, { name: '顶部亮线' }),
      lineNode(148, 1112, 844, rule, 2, { name: '注释线' }),
      shapeNode('star', 88, 1098, 36, 36, solid(cyan), { name: '信号星', shadow: glow(cyan, 16) }),
      lineNode(88, 1294, 904, rule, 2, { name: '底部亮线' }),
      textNode('NEON / 02', 88, 86, 520, 48, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(cyan), fontWeight: 'bold', letterSpacing: 8 }),
      textNode('把亮的地方\n写成一页', 148, 280, 784, 240, {
        name: '灯牌标题一', fontSize: 92, textFill: solid(white), fontWeight: 'bold', lineHeight: 1.2,
        effect: { type: 'neon', color: cyan, amount: 40 },
      }),
      textNode('只记一个最亮的细节。', 148, 540, 784, 56, { name: '灯牌注释一', fontSize: 34, textFill: solid(muted) }),
      textNode('把暗的地方留到下一页', 148, 760, 784, 160, {
        name: '灯牌标题二', fontSize: 64, textFill: solid(white), fontWeight: 'bold', lineHeight: 1.25,
        effect: { type: 'neon', color: pink, amount: 40 },
      }),
      textNode('暗处放结论的反面。', 148, 940, 784, 56, { name: '灯牌注释二', fontSize: 34, textFill: solid(muted) }),
      textNode('亮与暗各占一栏，读者一眼就能分清主次。', 148, 1140, 844, 110, { name: '注释', fontSize: 34, textFill: solid(muted), lineHeight: 1.55 }),
      textNode('NEON NOTES / 02', 88, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(muted), letterSpacing: 4 }),
    ]),
    slide('熄灯', night, [
      ring('霓虹环一', 820, 120, 150, cyan),
      lineNode(88, 150, 904, rule, 2, { name: '顶部亮线' }),
      shapeNode('rect', 88, 960, 904, 220, solid(plate), { name: '结论灯牌', cornerRadius: 110, stroke: pink, strokeWidth: 4, shadow: glow(pink, 34) }),
      lineNode(88, 1294, 904, rule, 2, { name: '底部亮线' }),
      textNode('NEON / 03 / LAST CALL', 88, 86, 640, 48, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(cyan), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('灯光熄灭前，\n留下最亮的一句', 80, 300, 920, 310, {
        name: '主标题', fontSize: 112, textFill: solid(white), fontWeight: 'bold', lineHeight: 1.25,
        effect: { type: 'neon', color: cyan, amount: 40 },
      }),
      textNode('一句就够，明天再写第二句。', 88, 660, 840, 70, { name: '正文', fontSize: 40, textFill: solid(muted), lineHeight: 1.55 }),
      textNode('熄灯 / 明天见', 148, 1020, 784, 100, {
        name: '结论', fontSize: 64, textFill: solid(white), fontWeight: 'bold', align: 'center',
        effect: { type: 'neon', color: pink, amount: 45 },
      }),
      textNode('NEON NOTES', 88, 1318, 400, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(muted), letterSpacing: 4 }),
      textNode('CITY LIGHTS OFF', 592, 1318, 400, 44, { name: '页脚英文', fontSize: 24, fontFamily: UI, textFill: solid(muted), align: 'right', letterSpacing: 4 }),
    ]),
  ])
}

function createBrutalistDocument(): FreeformDocument {
  const concrete = '#ecebe6'
  const black = '#0d0d0d'
  const yellow = '#f5e900'
  const grey = '#3a3a36'
  const hard = { color: black, blur: 0, offsetX: 24, offsetY: 24 }
  const rule = (index: number, number: string, title: string, note: string) => {
    const y = 420 + index * 240
    const names = ['一', '二', '三'][index]
    return [
      shapeNode('rect', 88, y, 120, 120, solid(black), { name: `编号块${names}`, cornerRadius: 0 }),
      lineNode(88, y + 184, 904, black, 6, { name: `规则线${names}`, cap: 'butt' }),
      textNode(number, 88, y + 18, 120, 84, { name: `编号${names}`, fontSize: 72, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', align: 'center', lineHeight: 1 }),
      textNode(title, 244, y - 2, 748, 80, {
        name: `规则${names}`, fontSize: 52, textFill: solid(black), fontWeight: 'bold',
        effect: { type: 'marker', color: yellow, amount: 45 },
      }),
      textNode(note, 244, y + 86, 748, 56, { name: `注释${names}`, fontSize: 32, textFill: solid(grey) }),
    ]
  }
  return documentFromSlides([
    slide('宣言', solid(concrete), [
      lineNode(88, 144, 904, black, 8, { name: '刊头线', cap: 'butt' }),
      shapeNode('rect', 88, 220, 880, 420, solid(yellow), { name: '标题底块', cornerRadius: 0, stroke: black, strokeWidth: 8, shadow: hard }),
      shapeNode('ellipse', 740, 860, 240, 240, solid(black), { name: '印章' }),
      lineNode(88, 1288, 904, black, 6, { name: '页脚线', cap: 'butt' }),
      textNode('BRUTAL PAGE', 88, 84, 520, 48, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 8 }),
      textNode('NO.01 / 2026', 692, 84, 300, 48, { name: '期号', fontSize: 26, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', align: 'right', letterSpacing: 3 }),
      textNode('排版没有\n温柔可言', 136, 262, 800, 340, { name: '主标题', fontSize: 140, textFill: solid(black), fontWeight: 'bold', lineHeight: 1.15, letterSpacing: -4 }),
      textNode('信息要么站出来，要么让开。', 88, 724, 904, 80, { name: '导语', fontSize: 50, textFill: solid(black), fontWeight: 'bold' }),
      textNode('黑、黄、粗线、硬阴影。\n每一笔都摆在明面上。', 88, 820, 620, 130, { name: '说明', fontSize: 36, textFill: solid(grey), lineHeight: 1.5 }),
      textNode('宣言\n01', 740, 905, 240, 150, { name: '印章文字', fontSize: 52, textFill: solid(yellow), fontWeight: 'bold', align: 'center', lineHeight: 1.15, rotation: -12 }),
      textNode('→', 72, 1010, 420, 240, { name: '箭头', fontSize: 230, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', lineHeight: 1 }),
      textNode('BRUTAL PAGE PRESS', 88, 1312, 600, 44, { name: '刊尾', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('大声说', 692, 1312, 300, 44, { name: '页脚词', fontSize: 26, textFill: solid(black), fontWeight: 'bold', align: 'right' }),
    ]),
    slide('规则', solid(concrete), [
      lineNode(88, 144, 904, black, 8, { name: '刊头线', cap: 'butt' }),
      lineNode(88, 1288, 904, black, 6, { name: '页脚线', cap: 'butt' }),
      textNode('RULES / 02', 88, 84, 520, 48, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 8 }),
      textNode('三条硬规则', 80, 190, 920, 160, { name: '页标题', fontSize: 120, textFill: solid(black), fontWeight: 'bold', letterSpacing: -4 }),
      ...rule(0, '1', '标题字重拉满', '字号不够，就加字重；字重到头，再谈颜色。'),
      ...rule(1, '2', '阴影不许虚', '要投影就投硬影，偏移看得见。'),
      ...rule(2, '3', '留白也是表态', '没内容的地方，就让它空着。'),
      textNode('BRUTAL PAGE / RULES', 88, 1312, 600, 44, { name: '刊尾', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 6 }),
    ]),
    slide('结束', solid(yellow), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 196 + TEMPLATE_EDGE_BLEED, 1440 + TEMPLATE_EDGE_BLEED * 2, solid(black), { name: '边栏', cornerRadius: 0 }),
      lineNode(240, 818, 752, black, 12, { name: '结尾线', cap: 'butt' }),
      lineNode(240, 1288, 752, black, 6, { name: '页脚线', cap: 'butt' }),
      textNode('END / 03', 62, 88, 60, 420, { name: '边栏刊头', fontSize: 34, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: 8, vertical: true }),
      textNode('LOUD / 03', 62, 960, 60, 400, { name: '边栏页脚', fontSize: 34, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: 8, vertical: true }),
      textNode('说完了\n就停', 236, 250, 790, 520, { name: '结尾大字', fontSize: 220, textFill: solid(black), fontWeight: 'bold', lineHeight: 1.1, letterSpacing: -8 }),
      textNode('最后一句不用装饰，站直就行。', 240, 874, 752, 150, { name: '正文一', fontSize: 48, textFill: solid(black), fontWeight: 'bold', lineHeight: 1.4 }),
      textNode('多一个感叹号都是心虚。', 240, 1076, 752, 80, {
        name: '正文二', fontSize: 40, textFill: solid(yellow), fontWeight: 'bold',
        effect: { type: 'background', color: black, amount: 40, radius: 0 },
      }),
      textNode('BRUTAL PAGE PRESS', 240, 1312, 600, 44, { name: '刊尾', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 6 }),
    ]),
  ])
}

function createSoftDocument(): FreeformDocument {
  const ink = '#4a3f3a'
  const muted = '#7a6c64'
  const blush = '#f8cfc9'
  const lilac = '#e3dcf8'
  const rule = '#ead8d1'
  const white = '#ffffff'
  const glowPaper = stopsPaint([[0, '#fff8f3'], [1, '#fbe7e4']], 160)
  const card = { color: '#efd9d2', blur: 40, offsetX: 0, offsetY: 18 }
  const blur = { blur: 60 }
  const masthead = (text: string) => textNode(text, 88, 92, 600, 44, { name: '刊头', fontSize: 24, fontFamily: UI, textFill: solid(muted), letterSpacing: 8 })
  const memo = (index: number, text: string, fill: string) => {
    const y = 408 + index * 230
    const names = ['一', '二', '三'][index]
    return [
      shapeNode('rect', 88, y, 904, 200, solid(fill), { name: `记录底板${names}`, cornerRadius: 40 }),
      textNode(text, 148, y + 40, 784, 120, { name: `记录${names}`, fontSize: 40, fontFamily: KAI, textFill: solid(ink), lineHeight: 1.5 }),
    ]
  }
  return documentFromSlides([
    slide('信封', glowPaper, [
      shapeNode('ellipse', 600, -120, 600, 600, solid(blush), { name: '柔光一', opacity: 0.75, filter: blur }),
      shapeNode('ellipse', -200, 1000, 560, 560, solid(lilac), { name: '柔光二', opacity: 0.8, filter: blur }),
      lineNode(88, 150, 120, muted, 2, { name: '刊头线' }),
      shapeNode('rect', 88, 820, 640, 380, solid(white), { name: '便签底板', cornerRadius: 32, rotation: -2, shadow: card }),
      lineNode(88, 1294, 904, rule, 2, { name: '页脚线' }),
      masthead('SOFT LETTERS'),
      textNode('慢一点，\n也没关系', 80, 250, 920, 390, { name: '主标题', fontSize: 140, fontFamily: KAI, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.25 }),
      textNode('写给不着急的人和事。', 88, 680, 840, 80, { name: '导语', fontSize: 42, fontFamily: KAI, textFill: solid(muted) }),
      textNode('今天只做了一件小事，\n但它做完了。', 136, 868, 544, 280, { name: '便签文字', fontSize: 38, fontFamily: KAI, textFill: solid(ink), lineHeight: 1.6, rotation: -2 }),
      textNode('把日子过慢一点', 896, 820, 80, 380, { name: '竖排短句', fontSize: 34, fontFamily: KAI, textFill: solid(muted), letterSpacing: 6, vertical: true }),
      textNode('SOFT LETTERS / 01', 88, 1318, 600, 44, { name: '页脚', fontSize: 22, fontFamily: UI, textFill: solid('#6e6058'), letterSpacing: 6 }),
      textNode('慢慢来', 692, 1318, 300, 44, { name: '页脚词', fontSize: 26, fontFamily: KAI, textFill: solid(muted), align: 'right' }),
    ]),
    slide('小事', solid('#fffaf6'), [
      shapeNode('ellipse', 640, -160, 560, 560, solid('#fde2c8'), { name: '柔光一', opacity: 0.7, filter: blur }),
      lineNode(88, 150, 120, muted, 2, { name: '刊头线' }),
      shapeNode('star', 890, 226, 64, 64, solid('#f4b5a5'), { name: '小星', rotation: 12 }),
      lineNode(88, 1294, 904, rule, 2, { name: '页脚线' }),
      masthead('SOFT / 02'),
      textNode('三件小事', 80, 196, 800, 160, { name: '页标题', fontSize: 112, fontFamily: KAI, textFill: solid(ink), fontWeight: 'bold' }),
      ...memo(0, '把茶泡好、把窗打开、把话慢慢说完。', '#fde4df'),
      ...memo(1, '留了半小时，什么都没做。', '#fff0d9'),
      ...memo(2, '睡前把明天想好了一半。', '#e2efe2'),
      textNode('不催自己的日子，也可以有进度。', 88, 1124, 904, 110, { name: '注释', fontSize: 36, fontFamily: KAI, textFill: solid(muted), lineHeight: 1.55 }),
      textNode('SOFT LETTERS / 02', 88, 1318, 600, 44, { name: '页脚', fontSize: 22, fontFamily: UI, textFill: solid(muted), letterSpacing: 6 }),
    ]),
    slide('晚安', glowPaper, [
      shapeNode('ellipse', 660, -140, 560, 560, solid(lilac), { name: '柔光一', opacity: 0.8, filter: blur }),
      lineNode(88, 150, 120, muted, 2, { name: '刊头线' }),
      shapeNode('rect', 88, 800, 904, 400, solid(white), { name: '晚安信纸', cornerRadius: 28, shadow: card }),
      lineNode(148, 990, 784, rule, 2, { name: '信纸线一' }),
      lineNode(148, 1090, 784, rule, 2, { name: '信纸线二' }),
      lineNode(88, 1294, 904, rule, 2, { name: '页脚线' }),
      masthead('SOFT / 03 / GOODNIGHT'),
      textNode('今天到这里，\n刚刚好', 80, 250, 920, 350, { name: '主标题', fontSize: 128, fontFamily: KAI, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.25 }),
      textNode('没做完的事，交给明天的自己。', 88, 640, 840, 80, { name: '导语', fontSize: 40, fontFamily: KAI, textFill: solid(muted) }),
      textNode('晚安，也谢谢今天。', 148, 868, 784, 100, { name: '信纸文字', fontSize: 52, fontFamily: KAI, textFill: solid(ink), lineHeight: 1.9 }),
      textNode('SOFT LETTERS', 88, 1318, 600, 44, { name: '页脚', fontSize: 22, fontFamily: UI, textFill: solid(muted), letterSpacing: 6 }),
      textNode('SEE YOU TOMORROW', 592, 1318, 400, 44, { name: '页脚词', fontSize: 22, fontFamily: UI, textFill: solid(muted), align: 'right', letterSpacing: 6 }),
    ]),
  ])
}

function createBlueprintDocument(): FreeformDocument {
  const paper = '#174478'
  const chalk = '#f2f6fc'
  const line = '#b9cde6'
  const yellow = '#ffd166'
  /** A drafting grid: fine lines every `step`, drawn as one path over the page. */
  const grid = (name: string, step: number, opacity: number) => {
    const columns = Array.from({ length: Math.floor(1080 / step) }, (_, index) => `M ${(index + 1) * step} 0 V 1440`)
    const rows = Array.from({ length: Math.floor(1440 / step) }, (_, index) => `M 0 ${(index + 1) * step} H 1080`)
    return pathNode([...columns, ...rows].join(' '), 0, 0, 1080, 1440, { name, stroke: '#ffffff', strokeWidth: 1.5, opacity, cap: 'butt' })
  }
  const box = (name: string, x: number, y: number, width: number, height: number) => pathNode(
    `M 2 2 H ${width - 2} V ${height - 2} H 2 Z`, x, y, width, height, { name, stroke: chalk, strokeWidth: 3, dash: 12, cap: 'butt', join: 'miter' },
  )
  const sheet = (number: string) => textNode(number, 692, 86, 300, 44, { name: '图纸编号', fontSize: 26, fontFamily: UI, textFill: solid(chalk), fontWeight: 'bold', align: 'right', letterSpacing: 4 })
  const label = (text: string, x: number, y: number, name: string) => textNode(text, x, y, 280, 36, { name, fontSize: 22, fontFamily: UI, textFill: solid(line), letterSpacing: 4 })
  return documentFromSlides([
    slide('图纸', solid(paper), [
      grid('细网格', 60, 0.09),
      grid('粗网格', 240, 0.16),
      lineNode(88, 194, 904, chalk, 2, { name: '尺寸标注', startCap: 'arrow', endCap: 'arrow' }),
      shapeNode('ellipse', 700, 800, 240, 240, { type: 'transparent' }, { name: '图形圆', stroke: chalk, strokeWidth: 3 }),
      lineNode(670, 914, 300, line, 2, { name: '中心线横', dash: 10 }),
      verticalLineNode(820, 770, 1070, line, 2, { name: '中心线竖', dash: 10 }),
      pathNode('M 2 2 H 902 V 168 H 2 Z M 302 2 V 168 M 602 2 V 168', 88, 1110, 904, 170, { name: '图签框', stroke: chalk, strokeWidth: 3, cap: 'butt', join: 'miter' }),
      textNode('BLUEPRINT · PLAN A', 88, 86, 600, 44, { name: '刊头', fontSize: 24, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
      textNode('1080', 480, 182, 120, 36, {
        name: '尺寸数字', fontSize: 22, fontFamily: UI, textFill: solid(chalk), align: 'center', letterSpacing: 2,
        effect: { type: 'background', color: paper, amount: 30, radius: 0 },
      }),
      textNode('先把想法\n画成蓝图', 80, 296, 920, 330, { name: '主标题', fontSize: 128, textFill: solid(chalk), fontWeight: 'bold', lineHeight: 1.2 }),
      textNode('计划不用漂亮，先要画得清楚。', 88, 670, 600, 130, { name: '导语', fontSize: 40, textFill: solid(line), lineHeight: 1.55 }),
      textNode('Ø 240', 700, 1046, 240, 40, { name: '图形标注', fontSize: 22, fontFamily: UI, textFill: solid(line), align: 'center', letterSpacing: 3 }),
      label('SHEET', 116, 1126, '编号标签'),
      textNode('BP-01', 116, 1180, 260, 70, { name: '图纸编号', fontSize: 44, fontFamily: UI, textFill: solid(chalk), fontWeight: 'bold', letterSpacing: 2 }),
      label('SCALE', 418, 1126, '比例标签'),
      textNode('1 : 1', 418, 1180, 260, 70, { name: '比例', fontSize: 44, fontFamily: UI, textFill: solid(chalk), fontWeight: 'bold', letterSpacing: 2 }),
      label('DATE', 718, 1126, '日期标签'),
      textNode('2026.10', 718, 1180, 260, 70, { name: '日期', fontSize: 44, fontFamily: UI, textFill: solid(chalk), fontWeight: 'bold', letterSpacing: 2 }),
    ]),
    slide('结构', solid(paper), [
      grid('细网格', 60, 0.09),
      grid('粗网格', 240, 0.16),
      box('模块底板一', 88, 196, 904, 370),
      box('模块底板二', 88, 616, 440, 330),
      box('装配底板', 552, 616, 440, 330),
      lineNode(88, 1004, 904, yellow, 3, { name: '装配虚线', dash: 14, endCap: 'arrow' }),
      textNode('STRUCTURE', 88, 86, 600, 44, { name: '刊头', fontSize: 24, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
      sheet('BP-02'),
      textNode('先装骨架', 136, 236, 808, 200, { name: '模块标题一', fontSize: 88, textFill: solid(chalk), fontWeight: 'bold', lineHeight: 1.2 }),
      textNode('列出必须成立的三件事。', 136, 450, 808, 90, { name: '模块说明一', fontSize: 34, textFill: solid(line), lineHeight: 1.5 }),
      textNode('再填血肉', 128, 656, 360, 130, { name: '模块标题二', fontSize: 52, textFill: solid(chalk), fontWeight: 'bold', lineHeight: 1.25 }),
      textNode('每一块都有明确的负责人和时间。', 128, 800, 360, 120, { name: '模块说明二', fontSize: 30, textFill: solid(line), lineHeight: 1.5 }),
      textNode('装配顺序', 592, 656, 360, 130, { name: '装配标题', fontSize: 52, textFill: solid(chalk), fontWeight: 'bold', lineHeight: 1.25 }),
      textNode('素材 → 结构 → 校对 → 验收', 592, 800, 360, 120, { name: '装配步骤', fontSize: 30, textFill: solid(line), lineHeight: 1.5 }),
      textNode('顺序写清楚，比写得漂亮重要。', 88, 1050, 904, 110, { name: '注释', fontSize: 36, textFill: solid(yellow), lineHeight: 1.5 }),
      textNode('BLUEPRINT / ASSEMBLY', 88, 1318, 600, 44, { name: '页脚', fontSize: 22, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
    ]),
    slide('验收', solid(paper), [
      grid('细网格', 60, 0.09),
      grid('粗网格', 240, 0.16),
      shapeNode('rect', 88, 820, 640, 300, { type: 'transparent' }, { name: '签收底板', cornerRadius: 20, stroke: yellow, strokeWidth: 6, rotation: -6 }),
      lineNode(760, 1094, 232, chalk, 2, { name: '签名线' }),
      textNode('CHECK', 88, 86, 600, 44, { name: '刊头', fontSize: 24, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
      sheet('BP-03'),
      textNode('按图施工，\n按图验收', 80, 236, 920, 310, { name: '主标题', fontSize: 120, textFill: solid(chalk), fontWeight: 'bold', lineHeight: 1.2 }),
      textNode('对不上图的地方，先改图，再改计划。', 88, 590, 860, 130, { name: '导语', fontSize: 40, textFill: solid(line), lineHeight: 1.55 }),
      textNode('全部核对通过', 123, 870, 560, 100, { name: '签收标题', fontSize: 64, textFill: solid(yellow), fontWeight: 'bold', align: 'center', rotation: -6 }),
      textNode('APPROVED · 可交付', 133, 990, 560, 50, { name: '签收状态', fontSize: 30, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', align: 'center', letterSpacing: 4, rotation: -6 }),
      textNode('签名 / DATE', 760, 1112, 232, 40, { name: '签名标注', fontSize: 22, fontFamily: UI, textFill: solid(line), align: 'right', letterSpacing: 3 }),
      textNode('BLUEPRINT / FINAL', 88, 1318, 600, 44, { name: '页脚', fontSize: 22, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
      textNode('PLAN A APPROVED', 592, 1318, 400, 44, { name: '比例', fontSize: 22, fontFamily: UI, textFill: solid(line), align: 'right', letterSpacing: 6 }),
    ]),
  ])
}

// --- Posters: one page each, drawn at the size they are made for (formats.ts) ---

const STORY = { width: 1080, height: 1920 }
const SQUARE = { width: 1080, height: 1080 }
const LANDSCAPE = { width: 1920, height: 1080 }
const WECHAT_COVER = { width: 1800, height: 766 }
const A4 = { width: 1240, height: 1754 }

const MOMENTS_GRID = { width: 3240, height: 3240 }
const A4_LANDSCAPE = { width: 1754, height: 1240 }

/** A shape filled with a picture (a slot the poster's own picture replaces). */
function pictureShape(
  name: string,
  src: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { shape?: 'rect' | 'ellipse'; cornerRadius?: number; rotation?: number } = {},
): FreeformSceneNode {
  return shapeNode(options.shape ?? 'rect', x, y, width, height, {
    type: 'image', src, fit: 'cover', framing: createDefaultImageFraming(),
  }, { name, cornerRadius: options.cornerRadius ?? 0, rotation: options.rotation })
}

/** A piece of the decoration library (decorations.ts) at `x, y`, `width` across: one node, named as asked. */
function decorationNode(
  id: string,
  x: number,
  y: number,
  width: number,
  options: { name?: string; color?: string; rotation?: number; height?: number; text?: string } = {},
): FreeformSceneNode {
  const definition = decorationById(id)
  if (!definition) throw new Error(`no decoration ${id}`)
  const node = createDecorationNode(definition, { x, y, width, height: options.height, color: options.color, text: options.text }, uuid)
  return {
    ...node,
    ...(options.name ? { name: options.name } : {}),
    ...(options.rotation !== undefined ? { rotation: options.rotation } : {}),
  }
}

/**
 * A decoration's parts laid straight onto the page and named one by one, so a
 * poster slot can take one of them (a burst's words) or drop some (a medal's
 * star); `names` has a name per part, null for a part left out.
 */
function decorationParts(
  id: string,
  x: number,
  y: number,
  width: number,
  names: ReadonlyArray<string | null>,
  options: { color?: string } = {},
): FreeformSceneNode[] {
  const node = decorationNode(id, x, y, width, { color: options.color })
  if (node.type !== 'group' || node.rotation !== 0) throw new Error(`decoration ${id} has no parts to lay out`)
  return node.children.flatMap((child, index) => {
    const name = names[index]
    if (!name || child.type === 'group') return []
    return [{ ...child, name, x: node.x + child.x, y: node.y + child.y }]
  })
}

/** Where a box turned with another lands: its centre carried round the other's centre by `degrees`, as a top-left. */
function turnedWith(box: { x: number; y: number; width: number; height: number }, around: { x: number; y: number; width: number; height: number }, degrees: number) {
  const radians = (degrees * Math.PI) / 180
  const cx = around.x + around.width / 2
  const cy = around.y + around.height / 2
  const dx = box.x + box.width / 2 - cx
  const dy = box.y + box.height / 2 - cy
  return {
    x: Math.round((cx + dx * Math.cos(radians) - dy * Math.sin(radians) - box.width / 2) * 10) / 10,
    y: Math.round((cy + dx * Math.sin(radians) + dy * Math.cos(radians) - box.height / 2) * 10) / 10,
  }
}

/** A picture with a see-through background (an illustration), contained in its box. */
function illustrationNode(name: string, src: string, alt: string, x: number, y: number, width: number, height: number): FreeformSceneNode {
  return {
    id: uuid(),
    name,
    locked: false,
    hidden: false,
    type: 'image',
    x,
    y,
    width,
    height,
    rotation: 0,
    scale: 1,
    src,
    alt,
    fit: 'contain',
    framing: createDefaultImageFraming(),
  }
}

function createTalkPosterDocument(): FreeformDocument {
  const paper = '#f2efe8'
  const ink = '#141414'
  const orange = '#c7400e'
  const rust = '#b93a0c'
  const gray = '#5c5852'
  const row = (index: number, label: string, value: string) => {
    const y = 1528 + index * 70
    const n = ['一', '二', '三'][index]
    return [
      textNode(label, 72, y, 140, 56, { name: `标签${n}`, fontSize: 30, fontFamily: UI, textFill: solid(rust), fontWeight: 'bold', letterSpacing: 2 }),
      textNode(value, 212, y, 796, 56, { name: `信息${n}`, fontSize: 34, textFill: solid(ink), fontWeight: 'bold' }),
    ]
  }
  return documentFromSlides([
    slide('海报', solid(paper), [
      pictureShape('主图', '/templates/editorial-building.webp', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 1080 + TEMPLATE_EDGE_BLEED * 2, 980 + TEMPLATE_EDGE_BLEED),
      lineNode(72, 1488, 936, ink, 3, { name: '分隔线', cap: 'butt' }),
      shapeNode('rect', 72, 1764, 420, 96, solid(ink), { name: '按钮底板', cornerRadius: 48 }),
      textNode('公开讲座', 72, 880, 600, 64, {
        name: '角标', fontSize: 32, textFill: solid('#ffffff'), fontWeight: 'bold', letterSpacing: 4,
        effect: { type: 'background', color: orange, amount: 45, radius: 6 },
      }),
      textNode('城市里的\n第二条路', 64, 1012, 952, 370, { name: '标题', fontSize: 152, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.15, letterSpacing: -4 }),
      textNode('关于步行、街道和公共空间的一次分享', 72, 1394, 936, 64, { name: '副标题', fontSize: 40, textFill: solid(gray) }),
      ...row(0, '时间', '10 月 18 日 周六 14:00'),
      ...row(1, '地点', '城市规划展览馆 3 层报告厅'),
      ...row(2, '嘉宾', '林一 · 建筑师'),
      textNode('扫码报名 →', 72, 1784, 420, 56, { name: '按钮文字', fontSize: 36, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center' }),
      textNode('城市漫游计划', 592, 1788, 416, 48, { name: '主办', fontSize: 28, textFill: solid(gray), align: 'right', letterSpacing: 2 }),
    ], STORY),
  ])
}

function createSalePosterDocument(): FreeformDocument {
  const cream = '#fff3e3'
  const orange = '#ff6a2b'
  const brown = '#3b1f14'
  const coffee = '#7a4a2c'
  const yellow = '#ffd23f'
  return documentFromSlides([
    slide('海报', solid(cream), [
      shapeNode('ellipse', 90, 330, 900, 900, solid(orange), { name: '大圆' }),
      illustrationNode('主图', '/templates/poster-coffee.svg', '一杯放在碟子上的拿铁', 170, 390, 740, 740),
      shapeNode('ellipse', 770, 300, 230, 230, solid(yellow), { name: '角标底' }),
      lineNode(440, 240, 200, brown, 4, { name: '副标题线', cap: 'round' }),
      shapeNode('rect', 290, 1700, 500, 112, solid(brown), { name: '按钮底板', cornerRadius: 56 }),
      textNode('秋日咖啡季', 64, 120, 952, 100, { name: '副标题', fontSize: 64, textFill: solid(brown), fontWeight: 'bold', align: 'center', letterSpacing: 8 }),
      textNode('限时\n7 天', 770, 350, 230, 132, { name: '角标', fontSize: 46, textFill: solid(brown), fontWeight: 'bold', align: 'center', lineHeight: 1.15, rotation: 12 }),
      textNode('第二杯半价', 40, 1214, 1000, 236, {
        name: '标题', fontSize: 180, textFill: solid(brown), fontWeight: 'bold', align: 'center', letterSpacing: -4,
        effect: { type: 'offset', color: orange, amount: 40, angle: 45 },
      }),
      textNode('拿铁、美式、季节限定，任选两杯', 72, 1468, 936, 64, { name: '正文', fontSize: 40, textFill: solid(brown), align: 'center' }),
      textNode('活动时间  10.1 – 10.31', 72, 1560, 936, 52, { name: '信息一', fontSize: 34, textFill: solid(coffee), align: 'center' }),
      textNode('全国直营门店可用', 72, 1616, 936, 52, { name: '信息二', fontSize: 34, textFill: solid(coffee), align: 'center' }),
      textNode('立即领券', 290, 1724, 500, 64, { name: '按钮文字', fontSize: 44, textFill: solid(cream), fontWeight: 'bold', align: 'center', letterSpacing: 4 }),
      textNode('DINGCARD COFFEE', 72, 1846, 936, 40, { name: '品牌', fontSize: 24, fontFamily: UI, textFill: solid(brown), fontWeight: 'bold', align: 'center', letterSpacing: 8 }),
    ], STORY),
  ])
}

function createHiringPosterDocument(): FreeformDocument {
  const blue = '#2447e0'
  const ink = '#0f1222'
  const white = '#ffffff'
  const pale = '#dfe6ff'
  const lime = '#c6f432'
  const role = (index: number, title: string, note: string) => {
    const y = 900 + index * 194
    const n = ['一', '二', '三'][index]
    return [
      shapeNode('rect', 72, y, 936, 170, solid(white), { name: `职位卡${n}`, cornerRadius: 28 }),
      textNode(title, 116, y + 28, 760, 70, { name: `职位${n}`, fontSize: 48, textFill: solid(ink), fontWeight: 'bold' }),
      textNode(note, 116, y + 102, 760, 50, { name: `说明${n}`, fontSize: 30, textFill: solid('#4b5170') }),
      textNode('→', 880, y + 50, 90, 70, { name: `箭头${n}`, fontSize: 56, fontFamily: UI, textFill: solid(blue), fontWeight: 'bold', align: 'center' }),
    ]
  }
  return documentFromSlides([
    slide('海报', solid(blue), [
      lineNode(72, 1774, 936, '#4f6ff0', 2, { name: '页脚线', cap: 'butt' }),
      shapeNode('rect', 72, 1610, 936, 120, solid(lime), { name: '按钮底板', cornerRadius: 60 }),
      textNode('JOIN US', 40, 60, 1000, 290, {
        name: '英文标语', fontSize: 250, fontFamily: UI, textFill: solid(white), fontWeight: 'bold', letterSpacing: -4, lineHeight: 1,
        effect: { type: 'hollow', amount: 30 },
      }),
      textNode('急招', 72, 380, 300, 64, {
        name: '角标', fontSize: 32, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 6,
        effect: { type: 'background', color: lime, amount: 50, radius: 100 },
      }),
      textNode('我们在找\n下一位设计师', 64, 470, 952, 300, { name: '标题', fontSize: 120, textFill: solid(white), fontWeight: 'bold', lineHeight: 1.18, letterSpacing: -2 }),
      textNode('做一款给 AI 用的设计编辑器', 72, 790, 936, 64, { name: '副标题', fontSize: 40, textFill: solid(pale) }),
      ...role(0, '产品设计师', '全职 · 上海 · 3 年以上经验'),
      ...role(1, '前端工程师', '全职 · 可远程 · React / TypeScript'),
      ...role(2, '设计实习生', '每周 4 天 · 3 个月起'),
      textNode('弹性工作 · 不打卡 · 每年一次团队旅行', 72, 1496, 936, 70, { name: '正文', fontSize: 40, textFill: solid(lime), fontWeight: 'bold' }),
      textNode('简历发到 hr@dingcard.app', 72, 1640, 936, 60, { name: '按钮文字', fontSize: 40, textFill: solid(ink), fontWeight: 'bold', align: 'center' }),
      textNode('DINGCARD 叮卡', 72, 1806, 936, 44, { name: '品牌', fontSize: 26, fontFamily: UI, textFill: solid(white), fontWeight: 'bold', letterSpacing: 6 }),
    ], STORY),
  ])
}

function createFestivalPosterDocument(): FreeformDocument {
  const gold = '#f3d58a'
  const soft = '#d9c9a0'
  const cloud = 'M 20 140 C 20 100 60 80 100 92 C 110 52 170 40 200 72 C 230 30 300 30 320 80 C 350 60 410 70 420 110 C 460 104 500 120 500 140 Z'
  return documentFromSlides([
    slide('海报', stopsPaint([[0, '#0c1a2e'], [1, '#20365e']], 180), [
      shapeNode('ellipse', 230, 250, 620, 620, { type: 'radial-gradient', stops: [{ offset: 0, color: '#fff8e1' }, { offset: 1, color: '#f2cf86' }] }, {
        name: '月亮', shadow: { color: '#f6dfa0', blur: 90, offsetX: 0, offsetY: 0 },
      }),
      pathNode(cloud, 120, 720, 520, 160, { name: '祥云一', fill: solid('#ffffff'), strokeWidth: 0, opacity: 0.16 }),
      pathNode(cloud, 520, 790, 520, 160, { name: '祥云二', fill: solid('#ffffff'), strokeWidth: 0, opacity: 0.1 }),
      shapeNode('ellipse', 160, 200, 8, 8, solid('#ffffff'), { name: '星一', opacity: 0.7 }),
      shapeNode('ellipse', 900, 160, 6, 6, solid('#ffffff'), { name: '星二', opacity: 0.6 }),
      shapeNode('ellipse', 960, 520, 6, 6, solid('#ffffff'), { name: '星三', opacity: 0.5 }),
      shapeNode('rect', 96, 1480, 120, 120, solid('#c8382e'), { name: '印章', cornerRadius: 10, rotation: -4 }),
      lineNode(96, 1716, 300, gold, 2, { name: '落款线' }),
      textNode('月满中秋', 770, 980, 210, 720, { name: '标题', fontSize: 150, fontFamily: SERIF, textFill: solid(gold), fontWeight: 'bold', letterSpacing: 20, vertical: true }),
      textNode('但愿人长久　千里共婵娟', 660, 1000, 90, 640, { name: '副标题', fontSize: 40, fontFamily: SERIF, textFill: solid(soft), letterSpacing: 8, vertical: true }),
      textNode('中秋', 96, 1498, 120, 84, { name: '印章文字', fontSize: 44, fontFamily: SERIF, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center', rotation: -4, lineHeight: 1.4 }),
      textNode('丙午年 八月十五', 96, 1636, 500, 52, { name: '信息一', fontSize: 34, fontFamily: SERIF, textFill: solid(soft), letterSpacing: 4 }),
      textNode('2026.10.06', 96, 1742, 500, 44, { name: '信息二', fontSize: 28, fontFamily: UI, textFill: solid(soft), letterSpacing: 4 }),
      textNode('叮卡 敬贺', 96, 1800, 500, 52, { name: '品牌', fontSize: 32, fontFamily: SERIF, textFill: solid(gold), letterSpacing: 6 }),
    ], STORY),
  ])
}

function createInvitationDocument(): FreeformDocument {
  const green = '#12352b'
  const gold = '#c9a45c'
  const cream = '#f4ecdc'
  const soft = '#cbbf9f'
  const row = (index: number, label: string, value: string) => {
    const y = 960 + index * 170
    const n = ['一', '二', '三'][index]
    return [
      textNode(label, 140, y, 800, 44, { name: `标签${n}`, fontSize: 28, fontFamily: UI, textFill: solid(gold), align: 'center', letterSpacing: 8 }),
      textNode(value, 140, y + 50, 800, 70, { name: `信息${n}`, fontSize: 46, fontFamily: SERIF, textFill: solid(cream), align: 'center' }),
    ]
  }
  return documentFromSlides([
    slide('邀请函', solid(green), [
      shapeNode('rect', 48, 48, 984, 1824, { type: 'transparent' }, { name: '外框', cornerRadius: 0, stroke: gold, strokeWidth: 3 }),
      shapeNode('rect', 70, 70, 940, 1780, { type: 'transparent' }, { name: '内框', cornerRadius: 0, stroke: gold, strokeWidth: 1 }),
      lineNode(330, 278, 170, gold, 2, { name: '饰线左' }),
      lineNode(580, 278, 170, gold, 2, { name: '饰线右' }),
      shapeNode('rect', 525, 269, 30, 30, solid(gold), { name: '菱形', cornerRadius: 0, rotation: 45 }),
      lineNode(440, 868, 200, gold, 2, { name: '标题线' }),
      shapeNode('rect', 340, 1500, 400, 100, { type: 'transparent' }, { name: '按钮底板', cornerRadius: 50, stroke: gold, strokeWidth: 2 }),
      textNode('INVITATION', 140, 180, 800, 50, { name: '英文标语', fontSize: 28, fontFamily: UI, textFill: solid(gold), align: 'center', letterSpacing: 14 }),
      textNode('诚邀您参加', 140, 420, 800, 70, { name: '副标题', fontSize: 48, fontFamily: SERIF, textFill: solid(cream), align: 'center', letterSpacing: 8 }),
      textNode('叮卡五周年\n年度设计之夜', 96, 520, 888, 300, { name: '标题', fontSize: 108, fontFamily: SERIF, textFill: solid(cream), fontWeight: 'bold', align: 'center', lineHeight: 1.3 }),
      ...row(0, '时间', '2026 年 12 月 20 日 19:00'),
      ...row(1, '地点', '外滩源壹号 · 宴会厅'),
      ...row(2, '着装', '深色正装'),
      textNode('敬请回复', 340, 1522, 400, 56, { name: '按钮文字', fontSize: 36, fontFamily: SERIF, textFill: solid(gold), align: 'center', letterSpacing: 6 }),
      textNode('叮卡团队 敬邀', 140, 1680, 800, 52, { name: '品牌', fontSize: 32, fontFamily: SERIF, textFill: solid(soft), align: 'center', letterSpacing: 4 }),
    ], STORY),
  ])
}

function createQuoteCardDocument(): FreeformDocument {
  const paper = '#f5f1ea'
  const ink = '#1d1b18'
  const red = '#c23a26'
  const gray = '#6f675d'
  const mark = 'M 0 56 C 0 22 18 0 52 0 L 52 22 C 34 22 26 32 26 46 L 52 46 L 52 100 L 0 100 Z M 70 56 C 70 22 88 0 122 0 L 122 22 C 104 22 96 32 96 46 L 122 46 L 122 100 L 70 100 Z'
  return documentFromSlides([
    slide('金句', solid(paper), [
      pathNode(mark, 96, 140, 122, 100, { name: '引号', fill: solid(red), strokeWidth: 0 }),
      lineNode(96, 874, 888, '#d8d0c4', 2, { name: '分隔线', cap: 'butt' }),
      textNode('把复杂的事说简单，\n是一种能力。', 96, 300, 888, 380, { name: '标题', fontSize: 80, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.4 }),
      textNode('—— 林一《写给自己的设计笔记》', 96, 760, 888, 56, { name: '副标题', fontSize: 34, textFill: solid(gray) }),
      textNode('每日一句 · 第 120 天', 96, 916, 600, 50, { name: '信息一', fontSize: 28, fontFamily: UI, textFill: solid(gray), letterSpacing: 2 }),
      textNode('DINGCARD', 684, 916, 300, 50, { name: '品牌', fontSize: 28, fontFamily: UI, textFill: solid(ink), fontWeight: 'bold', align: 'right', letterSpacing: 6 }),
    ], SQUARE),
  ])
}

function createProductCardDocument(): FreeformDocument {
  const green = '#0f5132'
  const leaf = '#3f7a60'
  const coral = '#d63d22'
  const white = '#ffffff'
  const point = (index: number, text: string) => {
    const y = 366 + index * 74
    const n = ['一', '二', '三'][index]
    return [
      shapeNode('ellipse', 72, y + 6, 44, 44, solid(green), { name: `勾底${n}` }),
      textNode('✓', 72, y + 8, 44, 40, { name: `勾${n}`, fontSize: 26, fontFamily: UI, textFill: solid(white), fontWeight: 'bold', align: 'center' }),
      textNode(text, 132, y, 440, 56, { name: `信息${n}`, fontSize: 34, textFill: solid(green), fontWeight: 'bold' }),
    ]
  }
  return documentFromSlides([
    slide('主图', stopsPaint([[0, '#eef8f3'], [1, '#d7efe4']], 160), [
      shapeNode('ellipse', 470, 110, 580, 580, solid(white), { name: '背景圆', opacity: 0.75 }),
      illustrationNode('主图', '/templates/poster-bottle.svg', '一瓶植物精华水和两片叶子', 520, 110, 480, 600),
      lineNode(72, 620, 420, '#bfe0d1', 2, { name: '分隔线', cap: 'butt' }),
      shapeNode('ellipse', 64, 690, 300, 300, solid(coral), { name: '价格底' }),
      textNode('植物精华水', 64, 110, 560, 130, { name: '标题', fontSize: 96, textFill: solid(green), fontWeight: 'bold', letterSpacing: -2 }),
      textNode('补水 · 舒缓 · 不黏腻', 72, 250, 500, 56, { name: '副标题', fontSize: 36, textFill: solid(leaf) }),
      ...point(0, '72 小时持续补水'),
      ...point(1, '无酒精 · 无香精'),
      ...point(2, '敏感肌也能用'),
      textNode('到手价', 64, 746, 300, 56, { name: '价格标签', fontSize: 40, textFill: solid(white), fontWeight: 'bold', align: 'center', letterSpacing: 4 }),
      textNode('¥59', 64, 802, 300, 130, { name: '角标', fontSize: 110, fontFamily: UI, textFill: solid(white), fontWeight: 'bold', align: 'center', letterSpacing: -2 }),
      textNode('DINGCARD 植物所', 560, 980, 456, 44, { name: '品牌', fontSize: 26, fontFamily: UI, textFill: solid(green), fontWeight: 'bold', align: 'right', letterSpacing: 4 }),
    ], SQUARE),
  ])
}

function createVideoCoverDocument(): FreeformDocument {
  const yellow = '#ffd400'
  const ink = '#111111'
  const red = '#ff3b30'
  const gridLines = [0, 1, 2, 3, 4].map((index) => `M 0 ${index * 160} H 580`).join(' ')
  return documentFromSlides([
    slide('封面', solid(yellow), [
      shapeNode('rect', 1140, 120, 700, 820, solid('#ffffff'), { name: '图表卡', cornerRadius: 48, shadow: { color: ink, blur: 0, offsetX: 18, offsetY: 18 } }),
      pathNode(gridLines, 1200, 210, 580, 640, { name: '网格', stroke: '#e5e5e5', strokeWidth: 3, cap: 'butt' }),
      pathNode('M 10 630 C 210 620 380 570 470 420 C 520 330 552 190 572 40', 1200, 210, 580, 640, { name: '曲线', stroke: ink, strokeWidth: 14, cap: 'round' }),
      shapeNode('ellipse', 1196, 826, 28, 28, solid(ink), { name: '起点' }),
      shapeNode('ellipse', 1656, 616, 28, 28, solid(ink), { name: '中点' }),
      shapeNode('ellipse', 1754, 230, 40, 40, solid(red), { name: '终点', shadow: { color: red, blur: 20, offsetX: 0, offsetY: 0 } }),
      lineNode(96, 920, 160, ink, 8, { name: '标题线', cap: 'butt' }),
      textNode('EP.12', 96, 88, 320, 80, {
        name: '角标', fontSize: 44, fontFamily: UI, textFill: solid('#ffffff'), fontWeight: 'bold', letterSpacing: 2,
        effect: { type: 'background', color: ink, amount: 40, radius: 10 },
      }),
      textNode('3 分钟\n看懂复利', 88, 210, 1000, 560, { name: '标题', fontSize: 230, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.08, letterSpacing: -8 }),
      textNode('为什么越早开始越好', 96, 790, 980, 90, { name: '副标题', fontSize: 64, textFill: solid('#3a3a3a'), fontWeight: 'bold' }),
      textNode('叮卡财经', 96, 952, 600, 60, { name: '品牌', fontSize: 38, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 2 }),
      textNode('第 1 年', 1200, 870, 200, 44, { name: '起点标注', fontSize: 28, textFill: solid('#6b6b6b') }),
      textNode('第 30 年', 1580, 870, 200, 44, { name: '终点标注', fontSize: 28, textFill: solid('#6b6b6b'), align: 'right' }),
    ], LANDSCAPE),
  ])
}

function createArticleCoverDocument(): FreeformDocument {
  const navy = '#13213c'
  const cream = '#f6f1e7'
  const orange = '#f28b30'
  const muted = '#aab6cc'
  return documentFromSlides([
    slide('首图', solid(navy), [
      pictureShape('主图', '/templates/editorial-building.webp', 1060, -TEMPLATE_EDGE_BLEED, 740 + TEMPLATE_EDGE_BLEED, 766 + TEMPLATE_EDGE_BLEED * 2),
      shapeNode('rect', 1040, -TEMPLATE_EDGE_BLEED, 20, 766 + TEMPLATE_EDGE_BLEED * 2, solid(orange), { name: '色条', cornerRadius: 0 }),
      lineNode(96, 636, 120, orange, 6, { name: '标题线', cap: 'butt' }),
      textNode('深度 · 城市', 96, 112, 500, 60, {
        name: '角标', fontSize: 30, textFill: solid(navy), fontWeight: 'bold', letterSpacing: 4,
        effect: { type: 'background', color: orange, amount: 45, radius: 6 },
      }),
      textNode('一座城市的\n步行友好度', 88, 196, 920, 320, { name: '标题', fontSize: 120, textFill: solid(cream), fontWeight: 'bold', lineHeight: 1.18, letterSpacing: -2 }),
      textNode('我们走了 30 条街，记下这些细节', 96, 536, 920, 64, { name: '副标题', fontSize: 40, textFill: solid(muted) }),
      textNode('叮卡周刊', 96, 670, 600, 48, { name: '品牌', fontSize: 28, fontFamily: UI, textFill: solid(muted), fontWeight: 'bold', letterSpacing: 4 }),
    ], WECHAT_COVER),
  ])
}

function createFlyerDocument(): FreeformDocument {
  const sand = '#f3e9dc'
  const clay = '#c8553d'
  const rust = '#a8432c'
  const ink = '#2b2118'
  const muted = '#6e5f52'
  const row = (index: number, label: string, value: string) => {
    const y = 940 + index * 130
    const n = ['一', '二', '三'][index]
    return [
      textNode(label, 96, y, 480, 44, { name: `标签${n}`, fontSize: 28, textFill: solid(rust), fontWeight: 'bold', letterSpacing: 4 }),
      textNode(value, 96, y + 46, 500, 60, { name: `信息${n}`, fontSize: 34, textFill: solid(ink), fontWeight: 'bold' }),
    ]
  }
  return documentFromSlides([
    slide('宣传单', solid(sand), [
      lineNode(96, 146, 1048, ink, 2, { name: '刊头线', cap: 'butt' }),
      pathNode('M 0 620 V 250 A 250 250 0 0 1 500 250 V 620 Z', 650, 700, 500, 620, { name: '拱门', fill: solid('#e9c3ae'), strokeWidth: 0 }),
      illustrationNode('主图', '/templates/poster-pottery.svg', '三件手作陶器：插着枝叶的高瓶、条纹罐和小杯', 610, 840, 580, 490),
      shapeNode('rect', 96, 1400, 480, 110, solid(clay), { name: '按钮底板', cornerRadius: 55 }),
      lineNode(96, 1616, 1048, ink, 1.5, { name: '页脚线', cap: 'butt' }),
      textNode('泥土与火 CLAY STUDIO', 96, 76, 800, 48, { name: '品牌', fontSize: 28, fontFamily: UI, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('周末限定', 96, 196, 400, 60, {
        name: '角标', fontSize: 30, textFill: solid('#ffffff'), fontWeight: 'bold', letterSpacing: 4,
        effect: { type: 'background', color: '#b84a32', amount: 45, radius: 8 },
      }),
      textNode('周末\n陶艺工作坊', 88, 276, 1060, 400, { name: '标题', fontSize: 170, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.12, letterSpacing: -6 }),
      textNode('从揉泥到上釉，\n两天做出自己的第一只杯子', 96, 716, 520, 170, { name: '副标题', fontSize: 40, textFill: solid(muted), lineHeight: 1.5 }),
      ...row(0, '时间', '每周六、日 10:00–16:00'),
      ...row(1, '地点', '城南创意园 B 座 2 层'),
      ...row(2, '费用', '680 元 / 人，含材料与烧制'),
      textNode('扫码预约', 96, 1426, 480, 60, { name: '按钮文字', fontSize: 42, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center', letterSpacing: 6 }),
      textNode('预约电话 021-6000 0000　·　城南创意园 B 座', 96, 1646, 1048, 44, { name: '页脚', fontSize: 26, textFill: solid(muted), letterSpacing: 1 }),
    ], A4),
  ])
}

const NUMBERED = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const

function createNoteCoverDocument(): FreeformDocument {
  const paper = '#fbf7ef'
  const ink = '#1d1b16'
  const muted = '#6b645a'
  // Notebook squares, one every 60px.
  const squares = [
    ...Array.from({ length: 17 }, (_, index) => `M${(index + 1) * 60} 0V1440`),
    ...Array.from({ length: 23 }, (_, index) => `M0 ${(index + 1) * 60}H1080`),
  ].join('')
  const point = (index: number, text: string) => {
    const y = 948 + index * 108
    const n = NUMBERED[index]
    return [
      shapeNode('ellipse', 132, y + 8, 56, 56, solid(ink), { name: `编号底${n}` }),
      textNode(String(index + 1), 124, y + 4, 72, 64, { name: `编号${n}`, fontSize: 30, fontFamily: UI, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center', lineHeight: 1.6 }),
      textNode(text, 212, y, 760, 72, { name: `要点${n}`, fontSize: 42, textFill: solid(ink), fontWeight: 'bold' }),
    ]
  }
  return documentFromSlides([
    slide('封面', solid(paper), [
      pathNode(squares, 0, 0, 1080, 1440, { name: '格线', stroke: '#ece4d4', strokeWidth: 2, cap: 'butt' }),
      shapeNode('rect', 88, 912, 904, 360, solid('#ffffff'), { name: '清单卡', cornerRadius: 32, stroke: ink, strokeWidth: 4, shadow: { color: ink, blur: 0, offsetX: 10, offsetY: 10 } }),
      decorationNode('sparkles', 858, 96, 132, { color: '#ffb000' }),
      textNode('干货分享', 88, 120, 400, 64, {
        name: '角标', fontSize: 34, textFill: solid('#ffffff'), fontWeight: 'bold', letterSpacing: 4,
        effect: { type: 'background', color: ink, amount: 50, radius: 100 },
      }),
      textNode('新手做图\n最该先学的\n5 个排版习惯', 80, 224, 920, 540, {
        name: '标题', fontSize: 132, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.3, letterSpacing: -2,
        effect: { type: 'marker', color: '#ffd84d', amount: 55 },
      }),
      textNode('收藏起来，做图前对照一遍', 88, 790, 904, 70, { name: '副标题', fontSize: 44, textFill: solid(muted) }),
      ...point(0, '留白比你想的更重要'),
      ...point(1, '一页只说一件事'),
      ...point(2, '字号至少拉开两档'),
      decorationNode('star', 912, 1218, 112, { name: '星星', rotation: 14 }),
      textNode('@叮卡设计笔记', 88, 1334, 700, 56, { name: '品牌', fontSize: 32, textFill: solid(muted), fontWeight: 'bold' }),
    ]),
  ])
}

function createPhotoCoverDocument(): FreeformDocument {
  const sand = '#efe6da'
  const ink = '#2a211b'
  const muted = '#6f6156'
  const tilt = -2
  const frame = { x: 112, y: 100, width: 856, height: 740 }
  const photo = { x: 140, y: 128, width: 800, height: 612 }
  const turned = turnedWith(photo, frame, tilt)
  return documentFromSlides([
    slide('封面', solid(sand), [
      shapeNode('rect', frame.x, frame.y, frame.width, frame.height, solid('#ffffff'), {
        name: '相框', cornerRadius: 6, rotation: tilt, shadow: { color: '#cbbca8', blur: 36, offsetX: 0, offsetY: 14 },
      }),
      pictureShape('主图', '/templates/editorial-building.webp', turned.x, turned.y, photo.width, photo.height, { rotation: tilt }),
      decorationNode('tape', 54, 74, 240, { rotation: -34 }),
      decorationNode('tape', 784, 74, 240, { rotation: 34, color: '#b9d3ea' }),
      ...decorationParts('burst-badge', 806, 676, 200, ['角标底', null]),
      textNode('必去', 806, 738, 200, 76, { name: '角标', fontSize: 50, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center', rotation: -10, lineHeight: 1.2 }),
      textNode('周末去哪儿\n城市漫步路线', 80, 920, 920, 300, { name: '标题', fontSize: 112, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.24, letterSpacing: -2 }),
      textNode('6 个小众打卡点，附路线图', 88, 1236, 904, 64, { name: '副标题', fontSize: 42, textFill: solid(muted) }),
      decorationNode('underline-wave', 88, 1316, 240, { name: '波浪线', color: '#d9503f' }),
      textNode('@叮卡周末', 88, 1352, 600, 52, { name: '品牌', fontSize: 30, textFill: solid(muted), fontWeight: 'bold' }),
    ]),
  ])
}

function createMenuDocument(): FreeformDocument {
  const paper = '#f4ede1'
  const ink = '#2b1d14'
  const clay = '#a8462c'
  const muted = '#76665a'
  const item = (index: number, name: string, price: string) => {
    const y = 520 + index * 112
    const n = NUMBERED[index]
    return [
      lineNode(110, y + 78, 1020, '#cdbda6', 2, { name: `虚线${n}`, dash: 3, cap: 'round' }),
      textNode(name, 110, y, 800, 72, { name: `菜品${n}`, fontSize: 44, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold' }),
      textNode(price, 900, y, 230, 72, { name: `价格${n}`, fontSize: 44, fontFamily: SERIF, textFill: solid(clay), fontWeight: 'bold', align: 'right' }),
    ]
  }
  return documentFromSlides([
    slide('菜单', solid(paper), [
      shapeNode('rect', 56, 56, 1128, 1642, { type: 'transparent' }, { name: '边框', cornerRadius: 0, stroke: '#d8c9b2', strokeWidth: 2 }),
      illustrationNode('主图', '/templates/poster-coffee.svg', '一杯放在碟子上的拿铁', 838, 80, 320, 320),
      textNode('COFFEE & TEA', 110, 110, 640, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(clay), fontWeight: 'bold', letterSpacing: 8 }),
      textNode('今日菜单', 100, 170, 760, 180, { name: '标题', fontSize: 140, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('秋冬限定 · 每日 8:00–20:00', 110, 360, 800, 56, { name: '副标题', fontSize: 34, textFill: solid(muted), letterSpacing: 2, lineHeight: 1.4 }),
      lineNode(110, 452, 1020, ink, 3, { name: '分隔线', cap: 'butt' }),
      ...item(0, '美式咖啡', '22'),
      ...item(1, '拿铁', '28'),
      ...item(2, '燕麦拿铁', '30'),
      ...item(3, '澳白', '30'),
      ...item(4, '卡布奇诺', '28'),
      ...item(5, '桂花拿铁', '32'),
      ...item(6, '手冲 · 埃塞俄比亚', '38'),
      ...item(7, '柚子美式', '30'),
      lineNode(110, 1440, 1020, ink, 3, { name: '底线', cap: 'butt' }),
      textNode('所有咖啡可换燕麦奶 +3 元，可做冰、可少糖', 110, 1476, 1020, 56, { name: '正文', fontSize: 30, textFill: solid(muted) }),
      textNode('DINGCARD COFFEE · 城南创意园 B 座 1 层', 110, 1630, 1020, 50, { name: '品牌', fontSize: 28, fontFamily: UI, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 2 }),
    ], A4),
  ])
}

function createPriceListDocument(): FreeformDocument {
  const blush = '#f6e8e3'
  const ink = '#4a2c2a'
  const rose = '#b04a5f'
  const muted = '#755a57'
  const row = (index: number, service: string, price: string) => {
    const y = 604 + index * 112
    const n = NUMBERED[index]
    return [
      ...(index > 0 ? [lineNode(140, y - 20, 800, '#f0e1dd', 2, { name: `隔线${n}`, cap: 'butt' })] : []),
      textNode(service, 140, y, 560, 70, { name: `项目${n}`, fontSize: 40, textFill: solid(ink), fontWeight: 'bold' }),
      textNode(price, 700, y, 240, 70, { name: `价格${n}`, fontSize: 40, textFill: solid(rose), fontWeight: 'bold', align: 'right' }),
    ]
  }
  return documentFromSlides([
    slide('价目表', solid(blush), [
      decorationNode('sparkles', 96, 108, 130, { color: '#e8a0ad' }),
      decorationNode('sparkle', 900, 150, 84, { color: '#e8a0ad' }),
      shapeNode('rect', 80, 548, 920, 952, solid('#ffffff'), { name: '价目卡', cornerRadius: 44, shadow: { color: '#e9d3cd', blur: 40, offsetX: 0, offsetY: 16 } }),
      shapeNode('rect', 290, 1668, 500, 108, solid(ink), { name: '按钮底板', cornerRadius: 54 }),
      textNode('美甲 · 美睫', 290, 140, 500, 64, {
        name: '角标', fontSize: 32, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center', letterSpacing: 4,
        effect: { type: 'background', color: rose, amount: 50, radius: 100 },
      }),
      textNode('价目表', 80, 236, 920, 200, { name: '标题', fontSize: 160, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', align: 'center', letterSpacing: 16 }),
      textNode('PRICE LIST · 2026', 80, 444, 920, 50, { name: '副标题', fontSize: 30, fontFamily: UI, textFill: solid(muted), align: 'center', letterSpacing: 10 }),
      ...row(0, '纯色美甲', '¥98'),
      ...row(1, '猫眼美甲', '¥158'),
      ...row(2, '法式美甲', '¥138'),
      ...row(3, '手绘款（单指）', '¥30'),
      ...row(4, '延长甲', '¥188'),
      ...row(5, '自然款美睫', '¥168'),
      ...row(6, '卸甲护理', '¥38'),
      ...row(7, '手部护理', '¥88'),
      textNode('以上价格含基础修型 · 节假日正常营业', 80, 1548, 920, 56, { name: '正文', fontSize: 30, textFill: solid(muted), align: 'center' }),
      textNode('私信预约', 290, 1690, 500, 64, { name: '按钮文字', fontSize: 40, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center', letterSpacing: 6 }),
      textNode('@叮卡美甲工作室', 80, 1820, 920, 48, { name: '品牌', fontSize: 28, textFill: solid(muted), align: 'center', letterSpacing: 2 }),
    ], STORY),
  ])
}

function createCertificateDocument(): FreeformDocument {
  const ivory = '#fbf8f1'
  const gold = '#b8955a'
  // Gold words a shade deeper than the frames, so they read on ivory.
  const goldInk = '#8a6a35'
  const ink = '#2b2118'
  const muted = '#5d5146'
  const corner = (x: number, y: number) => shapeNode('rect', x - 11, y - 11, 22, 22, solid(gold), { name: '角饰', cornerRadius: 0, rotation: 45 })
  return documentFromSlides([
    slide('证书', solid(ivory), [
      shapeNode('rect', 44, 44, 1666, 1152, { type: 'transparent' }, { name: '外框', cornerRadius: 0, stroke: gold, strokeWidth: 6 }),
      shapeNode('rect', 68, 68, 1618, 1104, { type: 'transparent' }, { name: '内框', cornerRadius: 0, stroke: gold, strokeWidth: 2 }),
      corner(68, 68),
      corner(1686, 68),
      corner(68, 1172),
      corner(1686, 1172),
      decorationNode('medal', 1360, 808, 210, { color: '#d9a62e' }),
      lineNode(577, 610, 600, gold, 2, { name: '姓名线', cap: 'butt' }),
      lineNode(300, 980, 440, ink, 1.5, { name: '签名线', cap: 'butt' }),
      textNode('CERTIFICATE OF HONOR', 0, 150, 1754, 50, { name: '英文标题', fontSize: 28, fontFamily: UI, textFill: solid(goldInk), fontWeight: 'bold', align: 'center', letterSpacing: 14 }),
      textNode('荣誉证书', 0, 208, 1754, 176, { name: '标题', fontSize: 128, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', align: 'center', letterSpacing: 36 }),
      textNode('林一', 427, 452, 900, 150, { name: '获得者', fontSize: 104, fontFamily: KAI, textFill: solid(ink), align: 'center', letterSpacing: 12 }),
      textNode('在 2026 年度「叮卡设计挑战赛」中表现突出，荣获一等奖。\n特发此证，以资鼓励。', 227, 652, 1300, 170, {
        name: '正文', fontSize: 40, fontFamily: SERIF, textFill: solid(muted), align: 'center', lineHeight: 1.75,
      }),
      textNode('叮卡设计委员会', 220, 996, 600, 60, { name: '颁发单位', fontSize: 36, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', align: 'center', letterSpacing: 4 }),
      textNode('二〇二六年十月', 220, 1060, 600, 52, { name: '信息一', fontSize: 30, fontFamily: SERIF, textFill: solid(muted), align: 'center', letterSpacing: 4 }),
      textNode('No. 2026-018', 1300, 100, 360, 40, { name: '信息二', fontSize: 22, fontFamily: UI, textFill: solid(goldInk), align: 'right', letterSpacing: 2 }),
    ], A4_LANDSCAPE),
  ])
}

function createMomentsGridDocument(): FreeformDocument {
  const cream = '#fff4e3'
  const shade = { color: '#3b2342', blur: 40, offsetX: 0, offsetY: 12 }
  const page = slide('九宫格', solid('#3d2b52'), [
    pictureShape('主图', '/templates/grid-sunset.svg', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 3240 + TEMPLATE_EDGE_BLEED * 2, 3240 + TEMPLATE_EDGE_BLEED * 2),
    lineNode(1440, 2468, 360, cream, 6, { name: '短线', cap: 'round', opacity: 0.8 }),
    textNode('2026 · 10', 150, 170, 900, 140, { name: '角标', fontSize: 96, fontFamily: UI, textFill: solid('#5b2a4e'), fontWeight: 'bold', letterSpacing: 8 }),
    textNode('你好，十月', 0, 1290, 3240, 660, { name: '标题', fontSize: 500, fontFamily: SERIF, textFill: solid(cream), fontWeight: 'bold', align: 'center', letterSpacing: 24, lineHeight: 1.2, shadow: shade }),
    textNode('愿你被温柔以待', 1080, 2520, 1080, 150, { name: '副标题', fontSize: 92, fontFamily: SERIF, textFill: solid(cream), align: 'center', letterSpacing: 8, shadow: shade }),
    textNode('@叮卡', 2280, 3010, 810, 100, { name: '品牌', fontSize: 64, fontFamily: UI, textFill: solid(cream), fontWeight: 'bold', align: 'right', letterSpacing: 4, shadow: shade }),
  ], MOMENTS_GRID)
  // Guides on the cuts, so the nine squares show while laying it out.
  page.guides = [1080, 2160].flatMap((position) => (['x', 'y'] as const).map((axis) => ({ id: uuid(), axis, position })))
  return documentFromSlides([page])
}

function createTimetableDocument(): FreeformDocument {
  const paper = '#fdf8ee'
  const ink = '#2f2a24'
  const muted = '#7a6e60'
  return documentFromSlides([
    slide('课程表', solid(paper), [
      decorationNode('rainbow', 1450, 56, 214),
      decorationNode('sparkle', 1394, 64, 44, { color: '#ffc53d' }),
      textNode('课程表', 86, 66, 900, 140, { name: '标题', fontSize: 100, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('三年级二班 · 2026 秋季学期', 92, 206, 1000, 60, { name: '副标题', fontSize: 36, textFill: solid(muted) }),
      textNode('叮卡实验小学', 1100, 208, 564, 56, { name: '品牌', fontSize: 32, textFill: solid(muted), fontWeight: 'bold', align: 'right', letterSpacing: 2 }),
      ...tableNodes(TIMETABLE_TABLE, TIMETABLE_SAMPLE, uuid),
    ], A4_LANDSCAPE),
  ])
}

type TemplateMeta = Pick<TemplateDefinition, 'title' | 'description' | 'pageCount' | 'tags' | 'format'>

const markdownSeriesMeta: Record<MarkdownTemplateSeriesId, TemplateMeta> = {
  'editorial-archive': {
    title: '编辑档案',
    description: '标题沿八栏网格展开，正文保留充足的阅读空间。',
    pageCount: 4,
    tags: ['复盘', '长文'],
    format: 'xhs',
  },
  'public-theatre': {
    title: '公共剧场',
    description: '左侧栏和红线贯穿四页，翻页时仍能看出同一条叙事线。',
    pageCount: 4,
    tags: ['观点', '倡议'],
    format: 'xhs',
  },
  'issue-cover': {
    title: '议题封面',
    description: '图片和期号先建立主题，后面三页再展开正文。',
    pageCount: 4,
    tags: ['生活', '人物'],
    format: 'xhs',
  },
}

const deck = (title: string, description: string, tags: string[]): TemplateMeta => ({ title, description, pageCount: 3, tags, format: 'xhs' })
const poster = (title: string, description: string, tags: string[], format: TemplateMeta['format']): TemplateMeta => ({ title, description, pageCount: 1, tags, format })

const freeformSeriesMeta: Record<FreeformTemplateSeriesId, TemplateMeta> = {
  editorial: deck('编辑部', '用刊头和正文网格组织长文，适合观点与方法文章。', ['观点', '方法']),
  checklist: deck('清单', '把步骤排成可以逐项勾选的工作页，适合教程和计划。', ['教程', '清单']),
  signal: deck('信号', '用海报式大标题亮出判断，适合短观点。', ['观点', '短文']),
  'night-flight': deck('夜航', '沿时间和路线展开一段记录，适合随笔与灵感。', ['随笔', '灵感']),
  neon: deck('霓虹', '深色夜景配霓虹灯牌和发光标题，适合夜间观察与城市话题。', ['夜景', '观察']),
  brutalist: deck('粗野', '黄黑撞色、硬阴影和粗线，适合宣言与规则清单。', ['宣言', '海报']),
  soft: deck('柔光', '柔光粉彩、便签和信纸，配手写字体，适合随笔与生活记录。', ['随笔', '生活']),
  blueprint: deck('蓝图', '工程网格、尺寸标注和图签，适合计划与结构拆解。', ['计划', '结构']),
  'talk-poster': poster('讲座', '大图配大标题，时间、地点、嘉宾一目了然，适合讲座、分享会和活动报名。', ['活动', '讲座'], 'story'),
  'sale-poster': poster('促销', '大字优惠配产品插画，适合新品、折扣和门店活动。', ['促销', '门店'], 'story'),
  'hiring-poster': poster('招聘', '大字标语和职位卡片，适合招聘和团队介绍。', ['招聘', '团队'], 'story'),
  'festival-poster': poster('节日', '月亮、祥云和竖排标题，适合中秋等节日问候。', ['节日', '问候'], 'story'),
  invitation: poster('邀请函', '金色边框、居中排版，适合晚宴、发布会和典礼邀请。', ['邀请', '活动'], 'story'),
  'quote-card': poster('金句', '一句话配出处，适合金句、日签和读书摘抄。', ['金句', '日签'], 'square'),
  'product-card': poster('商品主图', '产品图配卖点和价格角标，适合电商主图和新品介绍。', ['电商', '产品'], 'square'),
  'video-cover': poster('视频封面', '超大标题配一张图表卡片，适合视频和直播封面。', ['封面', '视频'], 'landscape'),
  'article-cover': poster('公众号首图', '标题在左、图片在右，适合公众号文章首图。', ['封面', '公众号'], 'wechat-cover'),
  flyer: poster('宣传单', 'A4 单页：大标题、插画、时间地点和预约按钮，适合课程和活动传单。', ['印刷', '课程'], 'a4'),
  'note-cover': poster('干货笔记', '格子纸、荧光笔大标题和三条要点，适合小红书知识类笔记封面。', ['小红书', '封面'], 'xhs'),
  'photo-cover': poster('图片拼贴', '照片配胶带和角标贴纸，下面是大标题，适合小红书探店、旅行和生活封面。', ['小红书', '封面'], 'xhs'),
  menu: poster('菜单', 'A4 单页：店名大标题、八道菜品和价格，适合咖啡店、餐厅和饮品菜单。', ['菜单', '餐饮'], 'a4'),
  'price-list': poster('价目表', '白色价目卡排八项服务和价格，下面是预约按钮，适合美甲、美发和工作室。', ['价目表', '门店'], 'story'),
  certificate: poster('证书', '金色双框、居中大字和奖章，适合荣誉证书、获奖证书和结业证书。', ['证书', '印刷'], 'a4-landscape'),
  'moments-grid': poster('朋友圈九宫格', '一整张插画配横跨中间一排的大标题，导出时切成九张，发朋友圈拼成一张大图。', ['朋友圈', '节日'], 'moments-grid'),
  timetable: poster('课程表', '表格按科目自动配色，适合学校课程表、培训排课和每周计划。', ['课程表', '学校'], 'a4-landscape'),
}

const freeformFactories: Record<FreeformTemplateSeriesId, () => FreeformDocument> = {
  editorial: createEditorialDocument,
  checklist: createChecklistDocument,
  signal: createSignalDocument,
  'night-flight': createNightFlightDocument,
  neon: createNeonDocument,
  brutalist: createBrutalistDocument,
  soft: createSoftDocument,
  blueprint: createBlueprintDocument,
  'talk-poster': createTalkPosterDocument,
  'sale-poster': createSalePosterDocument,
  'hiring-poster': createHiringPosterDocument,
  'festival-poster': createFestivalPosterDocument,
  invitation: createInvitationDocument,
  'quote-card': createQuoteCardDocument,
  'product-card': createProductCardDocument,
  'video-cover': createVideoCoverDocument,
  'article-cover': createArticleCoverDocument,
  flyer: createFlyerDocument,
  'note-cover': createNoteCoverDocument,
  'photo-cover': createPhotoCoverDocument,
  menu: createMenuDocument,
  'price-list': createPriceListDocument,
  certificate: createCertificateDocument,
  'moments-grid': createMomentsGridDocument,
  timetable: createTimetableDocument,
}

const markdownSeriesIds: MarkdownTemplateSeriesId[] = [
  'editorial-archive',
  'public-theatre',
  'issue-cover',
]
const freeformSeriesIds: FreeformTemplateSeriesId[] = [
  'editorial',
  'checklist',
  'signal',
  'night-flight',
  'neon',
  'brutalist',
  'soft',
  'blueprint',
  // Posters, the scenes asked for most first.
  'note-cover',
  'photo-cover',
  'menu',
  'price-list',
  'certificate',
  'moments-grid',
  'timetable',
  'talk-poster',
  'sale-poster',
  'hiring-poster',
  'festival-poster',
  'invitation',
  'quote-card',
  'product-card',
  'video-cover',
  'article-cover',
  'flyer',
]

function createMarkdownTemplate(series: MarkdownTemplateSeriesId): TemplateDefinition {
  return {
    ...markdownSeriesMeta[series],
    id: `${series}-markdown`,
    series,
    workspace: 'markdown',
    kind: 'deck',
    createMarkdown: () => cloneMarkdown(series),
  }
}

function createFreeformTemplate(series: FreeformTemplateSeriesId): TemplateDefinition {
  const meta = freeformSeriesMeta[series]
  return {
    ...meta,
    id: `${series}-freeform`,
    series,
    workspace: 'freeform',
    kind: meta.pageCount === 1 ? 'poster' : 'deck',
    createFreeform: () => freeformFactories[series](),
  }
}

export const TEMPLATE_REGISTRY: readonly TemplateDefinition[] = [
  ...markdownSeriesIds.map(createMarkdownTemplate),
  ...freeformSeriesIds.map(createFreeformTemplate),
]

export function templatesForWorkspace(workspace: TemplateWorkspace): readonly TemplateDefinition[] {
  return TEMPLATE_REGISTRY.filter((template) => template.workspace === workspace)
}

export function findTemplate(id: string): TemplateDefinition | undefined {
  return TEMPLATE_REGISTRY.find((template) => template.id === id)
}
