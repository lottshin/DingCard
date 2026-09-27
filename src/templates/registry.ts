import { normalizeFreeformDocumentV9 } from '../freeform/sceneDocument'
import type {
  BlendMode,
  ColorPaint,
  FreeformDocument,
  FreeformSceneNode,
  FreeformSlide,
  FreeformShapeElement,
  FreeformTextElement,
  SceneFilter,
  ShadowPaint,
} from '../freeform/types'
import { DEFAULT_PROFILE, type Profile } from '../theme'
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
  return crypto.randomUUID()
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
    | 'stroke' | 'strokeWidth'
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
  }
}

function shapeNode(
  shape: FreeformShapeElement['shape'],
  x: number,
  y: number,
  width: number,
  height: number,
  fill: ColorPaint,
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
  }
}

function slide(name: string, background: ColorPaint, nodes: FreeformSceneNode[]): FreeformSlide {
  return {
    id: uuid(),
    name,
    width: 1080,
    height: 1440,
    background,
    nodes,
  }
}

function documentFromSlides(slides: FreeformSlide[]): FreeformDocument {
  const document: FreeformDocument = {
    documentVersion: 9,
    activeSlideId: slides[0].id,
    slides,
  }
  const normalized = normalizeFreeformDocumentV9(document)
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

function createEditorialDocument(): FreeformDocument {
  return documentFromSlides([
    slide('封面', solid('#f6f3ea'), [
      lineNode(72, 132, 936, '#171717', 3, { name: '刊头线' }),
      shapeNode('rect', 72, 188, 252, 56, solid('#d94836'), { name: '栏目标签', cornerRadius: 6 }),
      lineNode(72, 624, 650, '#171717', 5, { name: '标题线' }),
      shapeNode('rect', 742, 894, 266, 350, solid('#171717'), { name: '期号底板', cornerRadius: 24, shadow: { color: '#171717', blur: 36, offsetX: 0, offsetY: 14 } }),
      lineNode(72, 1320, 936, '#171717', 2, { name: '页脚线' }),
      textNode('DINGCARD EDITORIAL', 72, 62, 610, 48, { name: '刊头', fontSize: 24, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', letterSpacing: 6 }),
      textNode('ISSUE 01 / 2026', 730, 62, 278, 48, { name: '期号', fontSize: 20, fontFamily: 'system-ui, sans-serif', align: 'right', letterSpacing: 2 }),
      textNode('FIELD NOTES', 92, 196, 214, 40, { name: '栏目', fontSize: 20, fontFamily: 'system-ui, sans-serif', textFill: solid('#ffffff'), fontWeight: 'bold' }),
      textNode('开头先把\n判断写清楚', 64, 288, 880, 274, { name: '主标题', fontSize: 98, fontFamily: 'Songti SC, serif', textFill: solid('#171717'), fontWeight: 'bold' }),
      textNode('第一屏负责给出判断，后面的页面再交代过程。', 72, 680, 690, 110, { name: '导语', fontSize: 36, fontFamily: 'Songti SC, serif', textFill: solid('#4d4942'), lineHeight: 1.5 }),
      textNode('01', 780, 936, 190, 150, { name: '大期号', fontSize: 118, fontFamily: 'system-ui, sans-serif', textFill: solid('#f6f3ea'), fontWeight: 'bold', align: 'center' }),
      textNode('READING ORDER', 778, 1124, 194, 42, { name: '英文注释', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#d94836'), fontWeight: 'bold', align: 'center', letterSpacing: 3, italic: true }),
      textNode('叮卡编辑部', 72, 1344, 320, 38, { name: '署名', fontSize: 18, fontFamily: 'system-ui, sans-serif' }),
      textNode('先判断，再展开', 700, 1344, 308, 38, { name: '页脚主题', fontSize: 18, fontFamily: 'system-ui, sans-serif', align: 'right' }),
    ]),
    slide('内页', solid('#f6f3ea'), [
      lineNode(72, 128, 936, '#171717', 3, { name: '刊头线' }),
      shapeNode('rect', 72, 212, 18, 676, solid('#d94836'), { name: '章节标记' }),
      lineNode(532, 660, 350, '#171717', 3, { name: '正文分隔线' }),
      shapeNode('rect', 592, 878, 416, 300, solid('#ded8cb'), { name: '引文底板', cornerRadius: 20 }),
      lineNode(72, 1320, 936, '#171717', 2, { name: '页脚线' }),
      textNode('DINGCARD / NOTES', 72, 60, 550, 44, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('02', 866, 58, 142, 46, { name: '页码', fontSize: 24, fontFamily: 'system-ui, sans-serif', textFill: solid('#d94836'), fontWeight: 'bold', align: 'right' }),
      textNode('每一页\n都要往前走', 126, 204, 760, 220, { name: '标题', fontSize: 78, fontFamily: 'Songti SC, serif', fontWeight: 'bold' }),
      textNode('分页不是把一段话切开，而是安排读者先看到什么、接着理解什么。', 126, 474, 760, 130, { name: '导语', fontSize: 34, fontFamily: 'Songti SC, serif', textFill: solid('#4d4942'), lineHeight: 1.55 }),
      textNode('01\n提出问题', 72, 724, 350, 110, { name: '步骤一', fontSize: 34, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('02\n解释原因', 366, 724, 350, 110, { name: '步骤二', fontSize: 34, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('03\n给出下一步', 714, 724, 294, 110, { name: '步骤三', fontSize: 34, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('“抽掉这一页，文章有没有少一个关键动作？”', 628, 928, 344, 146, { name: '引文', fontSize: 33, fontFamily: 'Songti SC, serif', fontWeight: 'bold', italic: true, lineHeight: 1.4 }),
      textNode('用这个问题检查跨页节奏。', 628, 1100, 344, 42, { name: '引文注释', fontSize: 20, fontFamily: 'system-ui, sans-serif', textFill: solid('#6a6259') }),
      textNode('阅读顺序 / 02', 72, 1344, 360, 38, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif' }),
    ]),
    slide('结尾', solid('#171717'), [
      shapeNode('rect', 726, 0, 354 + TEMPLATE_EDGE_BLEED, 1440, solid('#d94836'), { name: '红色边栏' }),
      lineNode(72, 132, 574, '#f6f3ea', 3, { name: '刊头线' }),
      shapeNode('ellipse', 828, 96, 84, 84, solid('#f6f3ea'), { name: '页码圆点', shadow: { color: '#000000', blur: 28, offsetX: 0, offsetY: 10 } }),
      lineNode(72, 910, 574, '#f6f3ea', 3, { name: '正文线' }),
      lineNode(72, 1320, 574, '#f6f3ea', 2, { name: '页脚线' }),
      textNode('EDITORIAL / 03', 72, 62, 480, 46, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid('#f6f3ea'), fontWeight: 'bold' }),
      textNode('03', 826, 112, 88, 48, { name: '页码', fontSize: 24, fontFamily: 'system-ui, sans-serif', textFill: solid('#171717'), fontWeight: 'bold', align: 'center' }),
      textNode('结尾要让文章\n真正落地', 64, 250, 612, 270, { name: '标题', fontSize: 82, fontFamily: 'Songti SC, serif', textFill: solid('#f6f3ea'), fontWeight: 'bold' }),
      textNode('给出下一步，或者留下一句值得记住的话。不要把开头再说一遍。', 72, 610, 548, 190, { name: '正文', fontSize: 34, fontFamily: 'Songti SC, serif', textFill: solid('#d8d2c7'), lineHeight: 1.6 }),
      textNode('NEXT', 770, 360, 268, 104, { name: '边栏标题', fontSize: 68, fontFamily: 'system-ui, sans-serif', textFill: solid('#171717'), fontWeight: 'bold', align: 'center', rotation: 90, letterSpacing: 12 }),
      textNode('一句结论\n一个动作\n到此结束', 72, 986, 530, 190, { name: '结尾清单', fontSize: 38, fontFamily: 'system-ui, sans-serif', textFill: solid('#f6f3ea'), fontWeight: 'bold' }),
      textNode('DINGCARD EDITORIAL', 72, 1344, 430, 38, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#f6f3ea') }),
    ]),
  ])
}

function createChecklistDocument(): FreeformDocument {
  return documentFromSlides([
    slide('封面', solid('#f3f5ed'), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, 0, 154 + TEMPLATE_EDGE_BLEED, 1440, solid('#174a38'), { name: '装订边栏' }),
      shapeNode('rect', 72, 174, 238, 58, solid('#f2c84b'), { name: '手册标签', cornerRadius: 6 }),
      lineNode(214, 126, 794, '#174a38', 3, { name: '刊头线' }),
      shapeNode('rect', 214, 878, 56, 56, solid('#f3f5ed'), { name: '复选框一', stroke: '#174a38', strokeWidth: 4, cornerRadius: 14 }),
      shapeNode('rect', 214, 1000, 56, 56, solid('#f3f5ed'), { name: '复选框二', stroke: '#174a38', strokeWidth: 4, cornerRadius: 14 }),
      shapeNode('rect', 214, 1122, 56, 56, solid('#f3f5ed'), { name: '复选框三', stroke: '#174a38', strokeWidth: 4, cornerRadius: 14 }),
      lineNode(302, 950, 706, '#b7c4b9', 2, { name: '清单线一' }),
      lineNode(302, 1072, 706, '#b7c4b9', 2, { name: '清单线二' }),
      lineNode(302, 1194, 706, '#b7c4b9', 2, { name: '清单线三' }),
      textNode('01', 38, 62, 80, 52, { name: '边栏页码', fontSize: 26, fontFamily: 'system-ui, sans-serif', textFill: solid('#f3f5ed'), fontWeight: 'bold', align: 'center' }),
      textNode('WORKBOOK', 36, 1136, 240, 42, { name: '边栏标题', fontSize: 20, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2c84b'), fontWeight: 'bold', rotation: -90 }),
      textNode('START HERE', 92, 184, 198, 40, { name: '标签文字', fontSize: 20, fontFamily: 'system-ui, sans-serif', textFill: solid('#174a38'), fontWeight: 'bold', letterSpacing: 3 }),
      textNode('把计划写到\n能立刻开工', 204, 310, 760, 250, { name: '主标题', fontSize: 84, fontFamily: 'PingFang SC', textFill: solid('#14271f'), fontWeight: 'bold' }),
      textNode('先确定今天交付什么，再把它拆成看得见的动作。', 214, 650, 718, 110, { name: '导语', fontSize: 34, textFill: solid('#466055'), lineHeight: 1.5 }),
      textNode('目标已经写清楚', 302, 882, 570, 52, { name: '检查项一', fontSize: 28, fontWeight: 'bold' }),
      textNode('完成标准可以验证', 302, 1004, 570, 52, { name: '检查项二', fontSize: 28, fontWeight: 'bold' }),
      textNode('素材集中在一个地方', 302, 1126, 570, 52, { name: '检查项三', fontSize: 28, fontWeight: 'bold' }),
      textNode('DINGCARD / CHECKLIST', 214, 1324, 540, 38, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#174a38'), fontWeight: 'bold' }),
    ]),
    slide('步骤', solid('#f3f5ed'), [
      shapeNode('rect', 72, 230, 104, 104, solid('#174a38'), { name: '编号底板一', cornerRadius: 22, shadow: { color: '#14271f', blur: 18, offsetX: 0, offsetY: 8 } }),
      shapeNode('rect', 72, 502, 104, 104, solid('#f2c84b'), { name: '编号底板二', cornerRadius: 22, shadow: { color: '#14271f', blur: 18, offsetX: 0, offsetY: 8 } }),
      shapeNode('rect', 72, 774, 104, 104, solid('#174a38'), { name: '编号底板三', cornerRadius: 22, shadow: { color: '#14271f', blur: 18, offsetX: 0, offsetY: 8 } }),
      lineNode(72, 138, 936, '#174a38', 3, { name: '刊头线' }),
      lineNode(210, 364, 798, '#b7c4b9', 3, { name: '步骤线一' }),
      lineNode(210, 636, 798, '#b7c4b9', 3, { name: '步骤线二' }),
      lineNode(210, 908, 798, '#b7c4b9', 3, { name: '步骤线三' }),
      shapeNode('rect', 72, 1048, 936, 220, solid('#dde6d9'), { name: '批注底板', cornerRadius: 24 }),
      textNode('CHECKLIST / 02', 72, 62, 560, 46, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid('#174a38'), fontWeight: 'bold' }),
      textNode('开工前确认', 620, 54, 388, 60, { name: '页标题', fontSize: 34, fontWeight: 'bold', align: 'right' }),
      textNode('01', 84, 246, 80, 68, { name: '编号一', fontSize: 40, fontFamily: 'system-ui, sans-serif', textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center' }),
      textNode('这次只解决一个问题', 216, 226, 690, 70, { name: '步骤一', fontSize: 40, fontWeight: 'bold' }),
      textNode('范围越清楚，开始越容易。', 216, 302, 690, 50, { name: '说明一', fontSize: 25, textFill: solid('#567064') }),
      textNode('02', 84, 518, 80, 68, { name: '编号二', fontSize: 40, fontFamily: 'system-ui, sans-serif', textFill: solid('#174a38'), fontWeight: 'bold', align: 'center' }),
      textNode('一句话写出完成标准', 216, 498, 690, 70, { name: '步骤二', fontSize: 40, fontWeight: 'bold' }),
      textNode('最后要交付什么，必须能被检查。', 216, 574, 690, 50, { name: '说明二', fontSize: 25, textFill: solid('#567064') }),
      textNode('03', 84, 790, 80, 68, { name: '编号三', fontSize: 40, fontFamily: 'system-ui, sans-serif', textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center' }),
      textNode('把素材收进同一处', 216, 770, 690, 70, { name: '步骤三', fontSize: 40, fontWeight: 'bold' }),
      textNode('减少寻找和切换，给执行留出连续时间。', 216, 846, 690, 50, { name: '说明三', fontSize: 25, textFill: solid('#567064') }),
      textNode('批注：不满足的项目先补齐，不急着进入制作。', 112, 1110, 840, 86, { name: '批注', fontSize: 32, textFill: solid('#174a38'), fontWeight: 'bold' }),
      textNode('READY TO START', 72, 1322, 390, 40, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#174a38'), fontWeight: 'bold' }),
    ]),
    slide('验收', solid('#174a38'), [
      shapeNode('rect', 72, 176, 936, 948, solid('#f3f5ed'), { name: '验收表', cornerRadius: 28, shadow: { color: '#0c221a', blur: 44, offsetX: 0, offsetY: 18 } }),
      shapeNode('ellipse', 116, 334, 54, 54, solid('#f2c84b'), { name: '完成点一' }),
      shapeNode('ellipse', 116, 556, 54, 54, solid('#f2c84b'), { name: '完成点二' }),
      shapeNode('ellipse', 116, 778, 54, 54, solid('#f2c84b'), { name: '完成点三' }),
      lineNode(116, 478, 848, '#b7c4b9', 3, { name: '验收线一' }),
      lineNode(116, 700, 848, '#b7c4b9', 3, { name: '验收线二' }),
      lineNode(116, 922, 848, '#b7c4b9', 3, { name: '验收线三' }),
      lineNode(72, 1288, 936, '#f2c84b', 3, { name: '页脚线' }),
      textNode('FINAL CHECK / 03', 72, 64, 560, 48, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2c84b'), fontWeight: 'bold' }),
      textNode('发布前，逐项打勾', 110, 210, 820, 80, { name: '标题', fontSize: 52, textFill: solid('#14271f'), fontWeight: 'bold' }),
      textNode('✓', 116, 330, 54, 54, { name: '勾一', fontSize: 32, fontFamily: 'system-ui, sans-serif', textFill: solid('#174a38'), align: 'center', fontWeight: 'bold' }),
      textNode('第一页能看懂主题', 204, 326, 660, 66, { name: '验收项一', fontSize: 36, fontWeight: 'bold' }),
      textNode('✓', 116, 552, 54, 54, { name: '勾二', fontSize: 32, fontFamily: 'system-ui, sans-serif', textFill: solid('#174a38'), align: 'center', fontWeight: 'bold' }),
      textNode('中间没有突然拥挤', 204, 548, 660, 66, { name: '验收项二', fontSize: 36, fontWeight: 'bold' }),
      textNode('✓', 116, 774, 54, 54, { name: '勾三', fontSize: 32, fontFamily: 'system-ui, sans-serif', textFill: solid('#174a38'), align: 'center', fontWeight: 'bold' }),
      textNode('最后一页给出下一步', 204, 770, 660, 66, { name: '验收项三', fontSize: 36, fontWeight: 'bold' }),
      textNode('03 / 03', 112, 966, 500, 116, { name: '完成进度', fontSize: 78, fontFamily: 'system-ui, sans-serif', textFill: solid('#174a38'), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('全部完成，可以导出。', 72, 1188, 760, 72, { name: '结论', fontSize: 38, textFill: solid('#f3f5ed'), fontWeight: 'bold' }),
      textNode('DINGCARD WORKBOOK', 72, 1322, 470, 42, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#f3f5ed'), fontWeight: 'bold' }),
    ]),
  ])
}

function createSignalDocument(): FreeformDocument {
  return documentFromSlides([
    slide('封面', solid('#f2f0e8'), [
      shapeNode('rect', 704, 0, 376 + TEMPLATE_EDGE_BLEED, 520, solid('#e4472f'), { name: '红色象限' }),
      shapeNode('ellipse', 764, 432, 176, 176, solid('#f2c84b'), { name: '信号圆点', shadow: { color: '#111111', blur: 0, offsetX: 10, offsetY: 10 } }),
      shapeNode('rect', 72, 704, 18, 500, solid('#2457d6'), { name: '蓝色坐标轴' }),
      lineNode(72, 128, 560, '#111111', 3, { name: '顶部网格线' }),
      lineNode(72, 674, 936, '#111111', 3, { name: '中部网格线' }),
      lineNode(122, 962, 886, '#b8b5ad', 2, { name: '正文网格线一' }),
      lineNode(122, 1110, 886, '#b8b5ad', 2, { name: '正文网格线二' }),
      lineNode(72, 1320, 936, '#111111', 3, { name: '页脚线' }),
      textNode('SIGNAL / POSTER 01', 72, 62, 560, 46, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', letterSpacing: 4 }),
      textNode('观点', 64, 204, 610, 132, { name: '标题上', fontSize: 116, fontFamily: 'PingFang SC', fontWeight: 'bold', letterSpacing: 6 }),
      textNode('先行', 64, 348, 610, 132, { name: '标题下', fontSize: 116, fontFamily: 'PingFang SC', fontWeight: 'bold', letterSpacing: 6, opacity: 0.92 }),
      textNode('01', 774, 464, 156, 82, { name: '圆点编号', fontSize: 58, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', align: 'center' }),
      textNode('别让读者读完三段，\n才发现你真正想说什么。', 122, 756, 780, 150, { name: '主张', fontSize: 44, fontWeight: 'bold', lineHeight: 1.35 }),
      textNode('CLAIM FIRST', 122, 1002, 430, 56, { name: '英文主张', fontSize: 30, fontFamily: 'system-ui, sans-serif', textFill: solid('#2457d6'), fontWeight: 'bold', letterSpacing: 6, italic: true }),
      textNode('判断站在第一屏，证据跟在后面。', 122, 1150, 760, 58, { name: '说明', fontSize: 28, textFill: solid('#4d4b46') }),
      textNode('DINGCARD SIGNAL', 72, 1342, 420, 38, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('CN / 2026', 744, 1342, 264, 38, { name: '页脚编号', fontSize: 18, fontFamily: 'system-ui, sans-serif', align: 'right' }),
    ]),
    slide('论证', solid('#f2f0e8'), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, 0, 454 + TEMPLATE_EDGE_BLEED, 1440, solid('#2457d6'), { name: '蓝色分区' }),
      shapeNode('rect', 454, 934, 626, 188, solid('#e4472f'), { name: '红色结论栏', cornerRadius: 20, shadow: { color: '#111111', blur: 32, offsetX: 0, offsetY: 12 } }),
      shapeNode('ellipse', 824, 90, 104, 104, solid('#f2c84b'), { name: '页码圆点' }),
      lineNode(510, 248, 498, '#111111', 3, { name: '右栏顶线' }),
      lineNode(510, 584, 498, '#b8b5ad', 2, { name: '证据线一' }),
      lineNode(510, 742, 498, '#b8b5ad', 2, { name: '证据线二' }),
      lineNode(510, 900, 498, '#b8b5ad', 2, { name: '证据线三' }),
      lineNode(510, 1320, 498, '#111111', 3, { name: '页脚线' }),
      textNode('WHY', 42, 74, 370, 146, { name: '英文标题', fontSize: 120, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2f0e8'), fontWeight: 'bold', letterSpacing: 10 }),
      textNode('证据跟在\n判断后面', 42, 326, 360, 250, { name: '主标题', fontSize: 72, textFill: solid('#ffffff'), fontWeight: 'bold' }),
      textNode('先说结论，不会削弱论证。它只是让读者知道，接下来的材料在回答什么。', 48, 694, 348, 250, { name: '左栏正文', fontSize: 32, textFill: solid('#dfe6ff'), lineHeight: 1.6 }),
      textNode('02', 826, 116, 100, 56, { name: '页码', fontSize: 34, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', align: 'center' }),
      textNode('A', 510, 312, 74, 70, { name: '证据编号一', fontSize: 48, fontFamily: 'system-ui, sans-serif', textFill: solid('#e4472f'), fontWeight: 'bold' }),
      textNode('先给一个清楚的判断', 610, 318, 360, 66, { name: '证据一', fontSize: 32, fontWeight: 'bold' }),
      textNode('B', 510, 628, 74, 70, { name: '证据编号二', fontSize: 48, fontFamily: 'system-ui, sans-serif', textFill: solid('#2457d6'), fontWeight: 'bold' }),
      textNode('再摆最有力的事实', 610, 634, 360, 66, { name: '证据二', fontSize: 32, fontWeight: 'bold' }),
      textNode('C', 510, 786, 74, 70, { name: '证据编号三', fontSize: 48, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2c84b'), fontWeight: 'bold' }),
      textNode('删掉不能支撑判断的材料', 610, 792, 380, 76, { name: '证据三', fontSize: 32, fontWeight: 'bold' }),
      textNode('顺序清楚，论证才有方向。', 510, 980, 500, 88, { name: '结论', fontSize: 38, textFill: solid('#ffffff'), fontWeight: 'bold' }),
      textNode('SIGNAL / 02', 510, 1342, 280, 38, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
    ]),
    slide('行动', solid('#111111'), [
      shapeNode('rect', 0, -TEMPLATE_EDGE_BLEED, 1080, 218 + TEMPLATE_EDGE_BLEED, solid('#f2c84b'), { name: '黄色刊头' }),
      shapeNode('rect', 72, 880, 936, 300, solid('#e4472f'), { name: '行动底板', cornerRadius: 28, shadow: { color: '#000000', blur: 48, offsetX: 0, offsetY: 20 } }),
      shapeNode('triangle', 818, 420, 150, 132, solid('#2457d6'), { name: '方向符号', rotation: 90, shadow: { color: '#f2c84b', blur: 0, offsetX: 10, offsetY: 10 } }),
      lineNode(72, 300, 936, '#f2f0e8', 3, { name: '标题线' }),
      lineNode(72, 790, 936, '#f2f0e8', 3, { name: '正文线' }),
      lineNode(72, 1320, 936, '#f2c84b', 3, { name: '页脚线' }),
      textNode('SIGNAL / 03 / ACTION', 72, 76, 650, 52, { name: '刊头', fontSize: 24, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', letterSpacing: 4 }),
      textNode('03', 868, 74, 140, 56, { name: '页码', fontSize: 30, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', align: 'right' }),
      textNode('最后，\n给一个动作。', 64, 356, 720, 260, { name: '主标题', fontSize: 92, textFill: solid('#f2f0e8'), fontWeight: 'bold' }),
      textNode('→', 812, 418, 166, 110, { name: '箭头文字', fontSize: 90, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2f0e8'), fontWeight: 'bold', align: 'center' }),
      textNode('今天试一次', 112, 930, 620, 90, { name: '行动标题', fontSize: 62, textFill: solid('#ffffff'), fontWeight: 'bold' }),
      textNode('明天回来，看结果。', 112, 1042, 620, 62, { name: '行动说明', fontSize: 34, textFill: solid('#ffffff') }),
      textNode('能被执行的观点，才会真正留下来。', 72, 1226, 780, 62, { name: '收束句', fontSize: 30, textFill: solid('#d1d1cf'), italic: true, opacity: 0.9 }),
      textNode('DINGCARD SIGNAL', 72, 1342, 430, 38, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2f0e8'), fontWeight: 'bold' }),
    ]),
  ])
}

function createNightFlightDocument(): FreeformDocument {
  return documentFromSlides([
    slide('出发', solid('#111820'), [
      shapeNode('rect', 0, -TEMPLATE_EDGE_BLEED, 1080, 166 + TEMPLATE_EDGE_BLEED, solid('#ece8dc'), { name: '航班信息栏' }),
      shapeNode('ellipse', 94, 996, 34, 34, solid('#f2bd4b'), { name: '站点一' }),
      shapeNode('ellipse', 384, 906, 34, 34, solid('#f2bd4b'), { name: '站点二' }),
      shapeNode('ellipse', 704, 1018, 34, 34, solid('#f2bd4b'), { name: '站点三' }),
      shapeNode('ellipse', 934, 884, 54, 54, solid('#e85d3f'), { name: '终点', shadow: { color: '#e85d3f', blur: 28, offsetX: 0, offsetY: 0 } }),
      lineNode(112, 990, 288, '#6fb7c8', 5, { name: '航线一', rotation: -17, opacity: 0.75 }),
      lineNode(402, 920, 322, '#6fb7c8', 5, { name: '航线二', rotation: 20, opacity: 0.75 }),
      lineNode(720, 1016, 248, '#6fb7c8', 5, { name: '航线三', rotation: -28, opacity: 0.75 }),
      lineNode(72, 1240, 936, '#53616d', 2, { name: '页脚线' }),
      textNode('NF 2340', 72, 48, 360, 58, { name: '航班号', fontSize: 34, fontFamily: 'system-ui, sans-serif', textFill: solid('#111820'), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('FRI  /  23:40', 612, 50, 396, 54, { name: '出发时间', fontSize: 28, fontFamily: 'system-ui, sans-serif', textFill: solid('#111820'), fontWeight: 'bold', align: 'right' }),
      textNode('夜里先记下，\n天亮再判断', 64, 260, 880, 250, { name: '主标题', fontSize: 88, fontFamily: 'Songti SC, serif', textFill: solid('#f2efe6'), fontWeight: 'bold', lineHeight: 1.25, shadow: { color: '#000000', blur: 32, offsetX: 0, offsetY: 12 } }),
      textNode('灵感通常不完整。保留原句，先别急着把它修成成品。', 72, 610, 820, 140, { name: '导语', fontSize: 36, textFill: solid('#aebac3') }),
      textNode('23:40', 72, 870, 230, 66, { name: '起点时间', fontSize: 36, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2bd4b'), fontWeight: 'bold' }),
      textNode('00:15', 372, 802, 230, 66, { name: '中途时间', fontSize: 36, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2bd4b'), fontWeight: 'bold' }),
      textNode('08:30', 792, 1082, 200, 66, { name: '抵达时间', fontSize: 36, fontFamily: 'system-ui, sans-serif', textFill: solid('#e85d3f'), fontWeight: 'bold', align: 'right' }),
      textNode('NIGHT FLIGHT / ROUTE 01', 72, 1288, 540, 40, { name: '页脚', fontSize: 19, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2efe6'), fontWeight: 'bold' }),
      textNode('31.23 N  /  121.47 E', 654, 1288, 354, 40, { name: '坐标', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#6fb7c8'), align: 'right' }),
    ]),
    slide('中途', solid('#111820'), [
      shapeNode('rect', 72, 180, 936, 104, solid('#24313b'), { name: '时间栏', cornerRadius: 20, opacity: 0.85 }),
      shapeNode('ellipse', 108, 394, 30, 30, solid('#f2bd4b'), { name: '时间点一' }),
      shapeNode('ellipse', 108, 674, 30, 30, solid('#6fb7c8'), { name: '时间点二' }),
      shapeNode('ellipse', 108, 954, 30, 30, solid('#e85d3f'), { name: '时间点三', shadow: { color: '#e85d3f', blur: 18, offsetX: 0, offsetY: 0 } }),
      lineNode(72, 128, 936, '#53616d', 2, { name: '刊头线' }),
      lineNode(122, 416, 12, '#53616d', 5, { name: '时间轴一', rotation: 90 }),
      lineNode(122, 696, 12, '#53616d', 5, { name: '时间轴二', rotation: 90 }),
      lineNode(170, 538, 838, '#53616d', 2, { name: '记录线一' }),
      lineNode(170, 818, 838, '#53616d', 2, { name: '记录线二' }),
      lineNode(72, 1240, 936, '#53616d', 2, { name: '页脚线' }),
      textNode('NIGHT FLIGHT / LOG 02', 72, 60, 560, 44, { name: '刊头', fontSize: 21, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2efe6'), fontWeight: 'bold' }),
      textNode('航行记录', 694, 56, 314, 50, { name: '页标题', fontSize: 30, textFill: solid('#f2bd4b'), fontWeight: 'bold', align: 'right' }),
      textNode('00:15  /  MIDWAY', 106, 208, 720, 52, { name: '当前时间', fontSize: 28, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2bd4b'), fontWeight: 'bold' }),
      textNode('23:40', 170, 366, 220, 58, { name: '时间一', fontSize: 34, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2bd4b'), fontWeight: 'bold' }),
      textNode('留下最初那句话', 426, 360, 500, 66, { name: '记录一', fontSize: 38, textFill: solid('#f2efe6'), fontWeight: 'bold' }),
      textNode('00:15', 170, 646, 220, 58, { name: '时间二', fontSize: 34, fontFamily: 'system-ui, sans-serif', textFill: solid('#6fb7c8'), fontWeight: 'bold' }),
      textNode('补上来源和去向', 426, 640, 500, 66, { name: '记录二', fontSize: 38, textFill: solid('#f2efe6'), fontWeight: 'bold' }),
      textNode('08:30', 170, 926, 220, 58, { name: '时间三', fontSize: 34, fontFamily: 'system-ui, sans-serif', textFill: solid('#e85d3f'), fontWeight: 'bold' }),
      textNode('醒来后重新判断', 426, 920, 500, 66, { name: '记录三', fontSize: 38, textFill: solid('#f2efe6'), fontWeight: 'bold' }),
      textNode('先保存线索，不在夜里替明天做完所有决定。', 170, 1080, 754, 90, { name: '注释', fontSize: 30, textFill: solid('#aebac3'), italic: true, lineHeight: 1.5 }),
      textNode('31.23 N  /  ROUTE ACTIVE', 72, 1288, 520, 40, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#6fb7c8'), fontWeight: 'bold' }),
    ]),
    slide('抵达', solid('#ece8dc'), [
      shapeNode('rect', 0, -TEMPLATE_EDGE_BLEED, 1080, 190 + TEMPLATE_EDGE_BLEED, solid('#111820'), { name: '抵达信息栏' }),
      shapeNode('rect', 72, 854, 936, 300, solid('#111820'), { name: '结论底板', cornerRadius: 24, shadow: { color: '#111820', blur: 44, offsetX: 0, offsetY: 18 } }),
      shapeNode('ellipse', 88, 670, 44, 44, solid('#f2bd4b'), { name: '起点' }),
      shapeNode('ellipse', 508, 670, 44, 44, solid('#6fb7c8'), { name: '中点' }),
      shapeNode('ellipse', 930, 660, 64, 64, solid('#e85d3f'), { name: '终点' }),
      lineNode(120, 686, 408, '#111820', 4, { name: '抵达线一' }),
      lineNode(548, 686, 410, '#111820', 4, { name: '抵达线二' }),
      lineNode(72, 1260, 936, '#111820', 3, { name: '页脚线' }),
      textNode('ARRIVAL  /  08:30', 72, 58, 600, 58, { name: '抵达时间', fontSize: 34, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2efe6'), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('ROUTE 03', 758, 60, 250, 52, { name: '路线编号', fontSize: 28, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2bd4b'), fontWeight: 'bold', align: 'right' }),
      textNode('天亮以后，\n只判断一件事', 64, 286, 880, 220, { name: '主标题', fontSize: 84, fontFamily: 'Songti SC, serif', textFill: solid('#111820'), fontWeight: 'bold' }),
      textNode('它还让你想继续写吗？', 72, 548, 750, 76, { name: '提问', fontSize: 40, textFill: solid('#45515a'), fontWeight: 'bold', italic: true }),
      textNode('保留原句', 72, 736, 260, 52, { name: '节点一', fontSize: 25, fontWeight: 'bold' }),
      textNode('补充线索', 414, 736, 260, 52, { name: '节点二', fontSize: 25, fontWeight: 'bold', align: 'center' }),
      textNode('重新判断', 748, 736, 260, 52, { name: '节点三', fontSize: 25, fontWeight: 'bold', align: 'right' }),
      textNode('答案是肯定的，\n就排进今天。', 112, 912, 720, 154, { name: '结论', fontSize: 54, textFill: solid('#f2efe6'), fontWeight: 'bold' }),
      textNode('否则留在草稿里，也没关系。', 112, 1080, 650, 52, { name: '补充结论', fontSize: 28, textFill: solid('#aebac3') }),
      textNode('DINGCARD / NIGHT FLIGHT', 72, 1298, 520, 40, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#111820'), fontWeight: 'bold' }),
      textNode('ARRIVED', 760, 1298, 248, 40, { name: '状态', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#e85d3f'), fontWeight: 'bold', align: 'right' }),
    ]),
  ])
}

function createNeonDocument(): FreeformDocument {
  const cyan = '#22d3ee'
  const fuchsia = '#e879f9'
  return documentFromSlides([
    slide('招牌', solid('#0b0f1a'), [
      shapeNode('ellipse', 700, 160, 300, 300, solid(cyan), {
        name: '霓虹环一', opacity: 0.55, blendMode: 'screen',
        shadow: { color: cyan, blur: 56, offsetX: 0, offsetY: 0 },
      }),
      shapeNode('ellipse', 760, 420, 190, 190, solid(fuchsia), {
        name: '霓虹环二', opacity: 0.6, blendMode: 'screen',
        shadow: { color: fuchsia, blur: 48, offsetX: 0, offsetY: 0 },
      }),
      lineNode(72, 132, 936, cyan, 3, { name: '顶部亮线', dash: 14 }),
      lineNode(72, 1316, 936, fuchsia, 3, { name: '底部亮线', dash: 14 }),
      textNode('NEON NOTES', 72, 62, 520, 46, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid(cyan), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('城市观察 / 01', 700, 62, 308, 46, { name: '期号', fontSize: 20, fontFamily: 'system-ui, sans-serif', textFill: solid(fuchsia), align: 'right', letterSpacing: 2 }),
      textNode('夜里的城市\n亮着另一种白天', 64, 250, 780, 280, {
        name: '主标题', fontSize: 86, fontFamily: 'Songti SC, serif',
        textFill: stopsPaint([[0, cyan], [0.55, fuchsia], [1, '#f5f7ff']], 100),
        fontWeight: 'bold', lineHeight: 1.25, letterSpacing: 2,
        shadow: { color: cyan, blur: 36, offsetX: 0, offsetY: 0 },
      }),
      textNode('路灯、招牌和出租车，把夜晚调成了另一种对比度。', 72, 610, 700, 120, {
        name: '导语', fontSize: 34, textFill: solid('#9fb3d1'), lineHeight: 1.55,
      }),
      textNode('CONTRAST UP', 72, 800, 420, 56, {
        name: '英文注释', fontSize: 26, fontFamily: 'system-ui, sans-serif', textFill: solid(cyan),
        fontWeight: 'bold', letterSpacing: 8, italic: true, filter: { brightness: 1.2, saturation: 1.6 },
      }),
      textNode('霓虹观察站', 72, 1340, 400, 40, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#7c8db0'), letterSpacing: 3 }),
      textNode('CITY AFTER DARK', 600, 1340, 408, 40, { name: '页脚英文', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#7c8db0'), align: 'right', letterSpacing: 4 }),
    ]),
    slide('灯牌', solid('#0b0f1a'), [
      shapeNode('rect', 72, 220, 460, 300, solid('#111a2e'), {
        name: '灯牌底板一', cornerRadius: 20, blendMode: 'screen',
        shadow: { color: cyan, blur: 44, offsetX: 0, offsetY: 14 },
      }),
      shapeNode('rect', 560, 220, 448, 300, solid('#1a1030'), {
        name: '灯牌底板二', cornerRadius: 20, blendMode: 'screen',
        shadow: { color: fuchsia, blur: 44, offsetX: 0, offsetY: 14 },
      }),
      shapeNode('star', 96, 1050, 60, 60, solid(cyan), {
        name: '信号星', shadow: { color: cyan, blur: 24, offsetX: 0, offsetY: 0 },
      }),
      lineNode(72, 132, 936, '#1f2a44', 3, { name: '刊头线' }),
      lineNode(180, 1130, 700, '#1f2a44', 3, { name: '注释线', dash: 12 }),
      lineNode(72, 1316, 936, '#1f2a44', 3, { name: '页脚线' }),
      textNode('NEON / 02', 72, 62, 420, 46, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid(cyan), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('把亮的地方\n写成一页', 110, 274, 400, 200, {
        name: '灯牌标题一', fontSize: 56, textFill: solid('#eaf6ff'), fontWeight: 'bold', lineHeight: 1.3,
      }),
      textNode('只记一个最亮的细节。', 110, 420, 380, 50, { name: '灯牌注释一', fontSize: 24, textFill: solid('#9fd8e8') }),
      textNode('把暗的地方\n留到下一页', 598, 274, 390, 200, {
        name: '灯牌标题二', fontSize: 56, textFill: solid('#fbeaff'), fontWeight: 'bold', lineHeight: 1.3,
      }),
      textNode('暗处放结论的反面。', 598, 420, 380, 50, { name: '灯牌注释二', fontSize: 24, textFill: solid('#e5b8f2') }),
      textNode('亮与暗各占一栏，读者一眼就能分清主次。', 180, 1080, 700, 60, {
        name: '注释', fontSize: 28, textFill: solid('#9fb3d1'), italic: true, lineHeight: 1.5,
      }),
      textNode('NEON NOTES / 02', 72, 1340, 480, 40, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#7c8db0'), letterSpacing: 3 }),
    ]),
    slide('打烊', solid('#0b0f1a'), [
      shapeNode('rect', 72, 880, 936, 300, solid('#111a2e'), {
        name: '结论灯牌', cornerRadius: 24, blendMode: 'screen',
        shadow: { color: fuchsia, blur: 56, offsetX: 0, offsetY: 18 },
      }),
      shapeNode('ellipse', 934, 180, 40, 40, solid(cyan), {
        name: '打烊灯点', opacity: 0.8, blendMode: 'screen',
        shadow: { color: cyan, blur: 24, offsetX: 0, offsetY: 0 },
      }),
      lineNode(72, 132, 936, '#1f2a44', 3, { name: '刊头线' }),
      lineNode(72, 790, 936, '#1f2a44', 3, { name: '正文线' }),
      lineNode(72, 1316, 936, cyan, 3, { name: '页脚亮线', dash: 14 }),
      textNode('NEON / 03 / LAST CALL', 72, 62, 640, 46, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid(cyan), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('灯光熄灭之前，\n留下今天最亮的一句。', 64, 260, 880, 260, {
        name: '主标题', fontSize: 72, fontFamily: 'Songti SC, serif', textFill: solid('#f5f7ff'),
        fontWeight: 'bold', lineHeight: 1.3,
      }),
      textNode('一句就够，明天再写第二句。', 72, 610, 700, 110, {
        name: '正文', fontSize: 34, textFill: solid('#9fb3d1'), lineHeight: 1.55,
      }),
      textNode('熄灯 / 明天见', 112, 970, 700, 110, {
        name: '结论', fontSize: 62, textFill: solid('#fbeaff'), fontWeight: 'bold', letterSpacing: 4,
      }),
      textNode('NEON NOTES', 72, 1340, 400, 40, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#7c8db0'), letterSpacing: 3 }),
      textNode('CITY LIGHTS OFF', 600, 1340, 408, 40, { name: '页脚英文', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#7c8db0'), align: 'right', letterSpacing: 4 }),
    ]),
  ])
}

function createBrutalistDocument(): FreeformDocument {
  const ink = '#111111'
  const yellow = '#f5f200'
  return documentFromSlides([
    slide('封面', solid('#f4f1ea'), [
      shapeNode('rect', 96, 210, 840, 300, solid(yellow), {
        name: '标题压板', shadow: { color: ink, blur: 0, offsetX: 12, offsetY: 12 },
      }),
      shapeNode('hexagon', 820, 640, 140, 140, solid(ink), {
        name: '印章六边形', shadow: { color: yellow, blur: 0, offsetX: 10, offsetY: 10 },
      }),
      lineNode(72, 132, 936, ink, 6, { name: '刊头粗线' }),
      lineNode(72, 1296, 936, ink, 6, { name: '页脚粗线' }),
      lineNode(72, 1160, 400, ink, 4, { name: '署名虚线', dash: 16, cap: 'butt' }),
      textNode('BRUTAL PAGE', 72, 60, 560, 50, { name: '刊头', fontSize: 24, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', letterSpacing: 8 }),
      textNode('NO.01 / 2026', 700, 60, 308, 50, { name: '期号', fontSize: 22, fontFamily: 'system-ui, sans-serif', align: 'right', fontWeight: 'bold' }),
      textNode('排版没有\n温柔可言', 136, 258, 760, 240, {
        name: '主标题', fontSize: 96, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.05, letterSpacing: 4,
        stroke: yellow, strokeWidth: 4,
      }),
      textNode('信息要么站出来，要么让开。', 96, 570, 660, 60, { name: '导语', fontSize: 34, textFill: solid(ink), fontWeight: 'bold' }),
      textNode('黑、黄、粗线、硬阴影。\n每一笔都摆在明面上。', 96, 720, 700, 140, {
        name: '说明', fontSize: 30, textFill: solid('#3d3a33'), lineHeight: 1.6,
      }),
      textNode('宣言 / 01', 828, 668, 130, 90, { name: '印章文字', fontSize: 30, textFill: solid(yellow), fontWeight: 'bold', align: 'center' }),
      textNode('BRUTAL PAGE PRESS', 72, 1330, 520, 44, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', letterSpacing: 4 }),
      textNode('大声说', 700, 1330, 308, 44, { name: '页脚词', fontSize: 18, fontFamily: 'system-ui, sans-serif', align: 'right', fontWeight: 'bold', letterSpacing: 6 }),
    ]),
    slide('规则', solid('#f4f1ea'), [
      shapeNode('rect', 72, 210, 90, 90, solid(ink), { name: '编号块一', shadow: { color: yellow, blur: 0, offsetX: 8, offsetY: 8 } }),
      shapeNode('rect', 72, 480, 90, 90, solid(ink), { name: '编号块二', shadow: { color: yellow, blur: 0, offsetX: 8, offsetY: 8 } }),
      shapeNode('rect', 72, 750, 90, 90, solid(ink), { name: '编号块三', shadow: { color: yellow, blur: 0, offsetX: 8, offsetY: 8 } }),
      lineNode(200, 300, 808, ink, 3, { name: '规则线一', dash: 14, cap: 'butt' }),
      lineNode(200, 570, 808, ink, 3, { name: '规则线二', dash: 14, cap: 'butt' }),
      lineNode(200, 840, 808, ink, 3, { name: '规则线三', dash: 14, cap: 'butt' }),
      lineNode(72, 1296, 936, ink, 6, { name: '页脚粗线' }),
      textNode('RULES / 02', 72, 60, 480, 50, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', letterSpacing: 6 }),
      textNode('三条硬规则', 620, 54, 388, 62, { name: '页标题', fontSize: 36, fontWeight: 'bold', align: 'right' }),
      textNode('1', 72, 214, 90, 82, { name: '编号一', fontSize: 44, fontFamily: 'system-ui, sans-serif', textFill: solid(yellow), fontWeight: 'bold', align: 'center' }),
      textNode('标题字重拉满', 200, 214, 700, 70, { name: '规则一', fontSize: 40, fontWeight: 'bold' }),
      textNode('字号不够，先加字重，再谈风格。', 200, 292, 700, 50, { name: '注释一', fontSize: 24, textFill: solid('#3d3a33') }),
      textNode('2', 72, 484, 90, 82, { name: '编号二', fontSize: 44, fontFamily: 'system-ui, sans-serif', textFill: solid(yellow), fontWeight: 'bold', align: 'center' }),
      textNode('阴影不许虚', 200, 484, 700, 70, { name: '规则二', fontSize: 40, fontWeight: 'bold' }),
      textNode('模糊为零，偏移给足，敢用色块就敢压影。', 200, 562, 700, 50, { name: '注释二', fontSize: 24, textFill: solid('#3d3a33') }),
      textNode('3', 72, 754, 90, 82, { name: '编号三', fontSize: 44, fontFamily: 'system-ui, sans-serif', textFill: solid(yellow), fontWeight: 'bold', align: 'center' }),
      textNode('留白也是表态', 200, 754, 700, 70, { name: '规则三', fontSize: 40, fontWeight: 'bold' }),
      textNode('没内容的地方，就让它空着。', 200, 832, 700, 50, { name: '注释三', fontSize: 24, textFill: solid('#3d3a33') }),
      textNode('BRUTAL PAGE / RULES', 72, 1330, 520, 44, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', letterSpacing: 4 }),
    ]),
    slide('收尾', solid(ink), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, 0, 360 + TEMPLATE_EDGE_BLEED, 1440, solid(yellow), { name: '黄色立边' }),
      shapeNode('rect', 440, 520, 560, 380, solid('#1c1c1c'), { name: '压字底板', stroke: yellow, strokeWidth: 4, shadow: { color: yellow, blur: 0, offsetX: 10, offsetY: 10 } }),
      lineNode(420, 200, 560, yellow, 4, { name: '顶部亮线', dash: 16, cap: 'butt' }),
      lineNode(420, 1220, 560, '#f4f1ea', 4, { name: '底部白线' }),
      textNode('END / 03', 60, 60, 300, 50, { name: '边栏刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', letterSpacing: 6 }),
      textNode('说完了\n就停', 490, 570, 460, 280, {
        name: '结尾大字', fontSize: 92, textFill: solid('#f4f1ea'), fontWeight: 'bold', lineHeight: 1.1, letterSpacing: 6,
      }),
      textNode('最后一句不用装饰，站直就行。', 420, 300, 580, 60, { name: '正文一', fontSize: 30, textFill: solid('#d8d4ca') }),
      textNode('多一个感叹号都是心虚。', 420, 1050, 580, 60, {
        name: '正文二', fontSize: 30, textFill: solid('#d8d4ca'), italic: true,
      }),
      textNode('BRUTAL PAGE PRESS', 420, 1300, 560, 44, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#f4f1ea'), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('LOUD / 03', 60, 1330, 300, 44, { name: '边栏页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', letterSpacing: 4 }),
    ]),
  ])
}

function createSoftDocument(): FreeformDocument {
  const rose = '#f2c9c4'
  const sky = '#c9ddf2'
  return documentFromSlides([
    slide('封面', stopsPaint([[0, '#fdf6f2'], [0.55, '#f7ece7'], [1, '#e9f0f8']], 160), [
      shapeNode('ellipse', 700, 180, 320, 320, solid(rose), { name: '柔光圆一', opacity: 0.45, filter: { blur: 2 } }),
      shapeNode('ellipse', 100, 420, 260, 260, solid(sky), { name: '柔光圆二', opacity: 0.4, filter: { blur: 2 } }),
      shapeNode('rect', 92, 800, 420, 300, solid('#fdf1ec'), { name: '便签底板', cornerRadius: 48, opacity: 0.9 }),
      shapeNode('star', 830, 980, 72, 72, solid('#f5d76e'), { name: '小星星', opacity: 0.85 }),
      lineNode(92, 170, 500, '#e7d8cf', 3, { name: '手写线', dash: 10, cap: 'round' }),
      textNode('SOFT LETTERS', 92, 90, 480, 46, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid('#b08e84'), letterSpacing: 6 }),
      textNode('慢一点，\n也没关系', 92, 300, 700, 280, {
        name: '主标题', fontSize: 84, fontFamily: 'Songti SC, serif', textFill: solid('#4a3f3a'),
        fontWeight: 'bold', lineHeight: 1.3, letterSpacing: 2,
      }),
      textNode('把日子竖着读', 912, 500, 56, 420, {
        name: '竖排短句', fontSize: 26, fontFamily: 'Songti SC, serif', textFill: solid('#b08e84'),
        vertical: true, letterSpacing: 4,
      }),
      textNode('写给不着急的人和事。', 92, 650, 560, 60, { name: '导语', fontSize: 32, textFill: solid('#8a746c'), lineHeight: 1.6 }),
      textNode('“今天只做了一件小事，\n但它做完了。”', 132, 850, 360, 190, {
        name: '便签文字', fontSize: 30, fontFamily: 'Songti SC, serif', textFill: solid('#7a5c54'),
        italic: true, lineHeight: 1.7,
      }),
      textNode('SOFT LETTERS / 01', 92, 1330, 480, 40, { name: '页脚', fontSize: 17, fontFamily: 'system-ui, sans-serif', textFill: solid('#b08e84'), letterSpacing: 4 }),
      textNode('轻轻收尾', 700, 1330, 288, 40, { name: '页脚词', fontSize: 17, fontFamily: 'system-ui, sans-serif', textFill: solid('#b08e84'), align: 'right', letterSpacing: 4 }),
    ]),
    slide('小事', solid('#fbf8f4'), [
      shapeNode('rect', 92, 230, 896, 260, solid('#eef4fb'), { name: '记录底板一', cornerRadius: 40, opacity: 0.85 }),
      shapeNode('rect', 92, 540, 430, 240, solid('#fdf1ec'), { name: '记录底板二', cornerRadius: 40, opacity: 0.85 }),
      shapeNode('rect', 558, 540, 430, 240, solid('#f3f7ea'), { name: '记录底板三', cornerRadius: 40, opacity: 0.85 }),
      shapeNode('ellipse', 850, 1060, 200, 200, solid(rose), { name: '页尾柔光', opacity: 0.35, filter: { blur: 3 } }),
      lineNode(92, 170, 896, '#e7d8cf', 3, { name: '刊头线' }),
      lineNode(92, 1290, 896, '#e7d8cf', 3, { name: '页脚线' }),
      textNode('SOFT / 02', 92, 90, 420, 46, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid('#b08e84'), letterSpacing: 5 }),
      textNode('三件小事', 600, 84, 388, 58, { name: '页标题', fontSize: 34, textFill: solid('#4a3f3a'), fontWeight: 'bold', align: 'right' }),
      textNode('把茶泡好，把窗打开，把话慢慢说完。', 132, 300, 820, 130, {
        name: '记录一', fontSize: 38, fontFamily: 'Songti SC, serif', textFill: solid('#42576e'), lineHeight: 1.7,
      }),
      textNode('留了半小时，什么都没做。', 132, 610, 350, 120, { name: '记录二', fontSize: 30, textFill: solid('#7a5c54'), lineHeight: 1.6 }),
      textNode('睡前把明天想好了一半。', 598, 610, 350, 120, { name: '记录三', fontSize: 30, textFill: solid('#5d6e46'), lineHeight: 1.6 }),
      textNode('不催自己的日子，也可以有进度。', 92, 1060, 620, 70, {
        name: '注释', fontSize: 28, textFill: solid('#8a746c'), italic: true, lineHeight: 1.5,
      }),
      textNode('SOFT LETTERS / 02', 92, 1330, 480, 40, { name: '页脚', fontSize: 17, fontFamily: 'system-ui, sans-serif', textFill: solid('#b08e84'), letterSpacing: 4 }),
    ]),
    slide('晚安', solid('#f6f1ec'), [
      shapeNode('ellipse', -80, 900, 400, 400, solid(sky), { name: '晚安柔光', opacity: 0.35, filter: { blur: 4 } }),
      shapeNode('ellipse', 880, 200, 300, 300, solid(rose), { name: '灯下柔光', opacity: 0.4, filter: { blur: 3 } }),
      shapeNode('rect', 92, 820, 896, 300, solid('#ffffff'), { name: '晚安信纸', cornerRadius: 56, opacity: 0.85, shadow: { color: '#d9c4bb', blur: 40, offsetX: 0, offsetY: 16 } }),
      lineNode(92, 170, 896, '#e7d8cf', 3, { name: '刊头线', dash: 10, cap: 'round' }),
      textNode('SOFT / 03 / GOODNIGHT', 92, 90, 560, 46, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid('#b08e84'), letterSpacing: 5 }),
      textNode('今天到这里，\n刚刚好', 92, 300, 780, 280, {
        name: '主标题', fontSize: 80, fontFamily: 'Songti SC, serif', textFill: solid('#4a3f3a'),
        fontWeight: 'bold', lineHeight: 1.3,
      }),
      textNode('没做完的事，交给明天的自己。', 92, 640, 640, 70, { name: '导语', fontSize: 30, textFill: solid('#8a746c'), lineHeight: 1.6 }),
      textNode('“晚安，也谢谢今天。”', 152, 900, 780, 120, {
        name: '信纸文字', fontSize: 40, fontFamily: 'Songti SC, serif', textFill: solid('#6e554e'), italic: true, letterSpacing: 2,
      }),
      textNode('SOFT LETTERS', 92, 1330, 480, 40, { name: '页脚', fontSize: 17, fontFamily: 'system-ui, sans-serif', textFill: solid('#b08e84'), letterSpacing: 4 }),
      textNode('SEE YOU TOMORROW', 600, 1330, 388, 40, { name: '页脚英文', fontSize: 17, fontFamily: 'system-ui, sans-serif', textFill: solid('#b08e84'), align: 'right', letterSpacing: 4 }),
    ]),
  ])
}

function createBlueprintDocument(): FreeformDocument {
  const paper = '#16324f'
  const line = '#9fc3e8'
  const chalk = '#eef5fc'
  return documentFromSlides([
    slide('图纸', solid(paper), [
      shapeNode('hexagon', 830, 190, 120, 120, solid('#1d4066'), { name: '螺母一', stroke: line, strokeWidth: 3 }),
      shapeNode('hexagon', 830, 350, 120, 120, solid('#1d4066'), { name: '螺母二', stroke: line, strokeWidth: 3 }),
      lineNode(72, 180, 936, line, 2, { name: '网格线一', dash: 12, cap: 'butt', opacity: 0.7 }),
      lineNode(72, 340, 936, line, 2, { name: '网格线二', dash: 12, cap: 'butt', opacity: 0.7 }),
      lineNode(72, 1180, 936, line, 2, { name: '网格线三', dash: 12, cap: 'butt', opacity: 0.7 }),
      lineNode(200, 900, 700, line, 2, { name: '尺寸线', dash: 8, cap: 'butt' }),
      textNode('BLUEPRINT 01', 72, 80, 480, 46, { name: '图纸编号', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid(line), fontWeight: 'bold', letterSpacing: 5 }),
      textNode('结构蓝图 · 图号 A-01', 942, 480, 60, 660, {
        name: '竖排图号', fontSize: 24, fontFamily: 'system-ui, sans-serif', textFill: solid(line),
        vertical: true, letterSpacing: 3,
      }),
      textNode('先把想法\n画成蓝图', 72, 430, 800, 280, {
        name: '主标题', fontSize: 82, fontFamily: 'Songti SC, serif', textFill: solid(chalk),
        fontWeight: 'bold', lineHeight: 1.25,
      }),
      textNode('计划不用漂亮，先要画得清楚。', 72, 790, 640, 70, { name: '导语', fontSize: 32, textFill: solid(line), lineHeight: 1.55 }),
      textNode('760 px —— 结构跨度 ——', 200, 870, 700, 50, { name: '尺寸标注', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid(line), letterSpacing: 3 }),
      textNode('BLUEPRINT / PLAN A', 72, 1330, 520, 40, { name: '页脚', fontSize: 17, fontFamily: 'system-ui, sans-serif', textFill: solid(line), letterSpacing: 4 }),
      textNode('SCALE 1:1', 700, 1330, 308, 40, { name: '比例', fontSize: 17, fontFamily: 'system-ui, sans-serif', textFill: solid(line), align: 'right', letterSpacing: 4 }),
    ]),
    slide('结构', solid(paper), [
      shapeNode('rect', 92, 230, 430, 330, solid('#1d4066'), { name: '模块底板一', stroke: line, strokeWidth: 3 }),
      shapeNode('rect', 558, 230, 430, 330, solid('#1d4066'), { name: '模块底板二', stroke: line, strokeWidth: 3 }),
      shapeNode('rect', 92, 620, 896, 330, solid('#122a43'), { name: '装配底板', stroke: chalk, strokeWidth: 2 }),
      lineNode(72, 180, 936, line, 2, { name: '网格线一', dash: 12, cap: 'butt', opacity: 0.7 }),
      lineNode(300, 1030, 480, line, 2, { name: '装配虚线', dash: 16, cap: 'butt' }),
      lineNode(72, 1290, 936, line, 2, { name: '页脚线', dash: 12, cap: 'butt' }),
      textNode('STRUCTURE / 02', 72, 80, 480, 46, { name: '图纸编号', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid(line), fontWeight: 'bold', letterSpacing: 5 }),
      textNode('先装骨架', 132, 280, 350, 80, { name: '模块标题一', fontSize: 44, textFill: solid(chalk), fontWeight: 'bold' }),
      textNode('列出必须成立的 3 件事。', 132, 380, 350, 120, { name: '模块说明一', fontSize: 26, textFill: solid(line), lineHeight: 1.6 }),
      textNode('再填血肉', 598, 280, 350, 80, { name: '模块标题二', fontSize: 44, textFill: solid(chalk), fontWeight: 'bold' }),
      textNode('每一块都有明确的负责人和时间。', 598, 380, 350, 120, { name: '模块说明二', fontSize: 26, textFill: solid(line), lineHeight: 1.6 }),
      textNode('装配顺序', 132, 680, 400, 70, { name: '装配标题', fontSize: 36, textFill: solid(chalk), fontWeight: 'bold' }),
      textNode('A 准备素材 → B 搭结构 → C 校尺寸 → D 验收', 132, 780, 820, 120, {
        name: '装配步骤', fontSize: 28, fontFamily: 'system-ui, sans-serif', textFill: solid(line), lineHeight: 1.6, letterSpacing: 1,
      }),
      textNode('顺序写清楚，比写得快更重要。', 300, 1010, 480, 60, { name: '注释', fontSize: 26, textFill: solid(line), italic: true }),
      textNode('BLUEPRINT / ASSEMBLY', 72, 1330, 520, 40, { name: '页脚', fontSize: 17, fontFamily: 'system-ui, sans-serif', textFill: solid(line), letterSpacing: 4 }),
    ]),
    slide('验收', solid(paper), [
      shapeNode('star', 830, 200, 110, 110, solid('#f5d76e'), { name: '验收星', shadow: { color: '#f5d76e', blur: 20, offsetX: 0, offsetY: 0 } }),
      shapeNode('rect', 92, 820, 896, 320, solid('#1d4066'), { name: '签收底板', stroke: chalk, strokeWidth: 3 }),
      lineNode(72, 180, 936, line, 2, { name: '网格线一', dash: 12, cap: 'butt', opacity: 0.7 }),
      lineNode(72, 740, 936, line, 2, { name: '网格线二', dash: 12, cap: 'butt', opacity: 0.7 }),
      lineNode(500, 1050, 400, chalk, 2, { name: '签名线', dash: 8, cap: 'butt' }),
      textNode('CHECK / 03', 72, 80, 480, 46, { name: '图纸编号', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid(line), fontWeight: 'bold', letterSpacing: 5 }),
      textNode('按图施工，\n按图验收', 72, 300, 780, 260, {
        name: '主标题', fontSize: 76, fontFamily: 'Songti SC, serif', textFill: solid(chalk),
        fontWeight: 'bold', lineHeight: 1.3,
      }),
      textNode('对不上图的地方，先改图，再改计划。', 72, 620, 700, 70, { name: '导语', fontSize: 30, textFill: solid(line), lineHeight: 1.55 }),
      textNode('全部核对通过', 132, 880, 500, 90, { name: '签收标题', fontSize: 46, textFill: solid(chalk), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('可交付 / READY', 132, 990, 500, 60, { name: '签收状态', fontSize: 26, fontFamily: 'system-ui, sans-serif', textFill: solid(line), letterSpacing: 3 }),
      textNode('签名 / DATE', 500, 1080, 400, 46, { name: '签名标注', fontSize: 20, fontFamily: 'system-ui, sans-serif', textFill: solid(line), align: 'right', letterSpacing: 3 }),
      textNode('BLUEPRINT / FINAL', 72, 1330, 520, 40, { name: '页脚', fontSize: 17, fontFamily: 'system-ui, sans-serif', textFill: solid(line), letterSpacing: 4 }),
      textNode('PLAN A APPROVED', 700, 1330, 308, 40, { name: '比例', fontSize: 17, fontFamily: 'system-ui, sans-serif', textFill: solid(line), align: 'right', letterSpacing: 4 }),
    ]),
  ])
}

type TemplateMeta = Pick<TemplateDefinition, 'title' | 'description' | 'pageCount' | 'tags'>

const markdownSeriesMeta: Record<MarkdownTemplateSeriesId, TemplateMeta> = {
  'editorial-archive': {
    title: '编辑档案',
    description: '标题沿八栏网格展开，正文保留充足的阅读空间。',
    pageCount: 4,
    tags: ['复盘', '长文'],
  },
  'public-theatre': {
    title: '公共剧场',
    description: '左侧栏和红线贯穿四页，翻页时仍能看出同一条叙事线。',
    pageCount: 4,
    tags: ['观点', '倡议'],
  },
  'issue-cover': {
    title: '议题封面',
    description: '图片和期号先建立主题，后面三页再展开正文。',
    pageCount: 4,
    tags: ['生活', '人物'],
  },
}

const freeformSeriesMeta: Record<FreeformTemplateSeriesId, TemplateMeta> = {
  editorial: { title: '编辑部', description: '用刊头和正文网格组织长文，适合观点与方法文章。', pageCount: 3, tags: ['观点', '方法'] },
  checklist: { title: '清单', description: '把步骤排成可以逐项勾选的工作页，适合教程和计划。', pageCount: 3, tags: ['教程', '清单'] },
  signal: { title: '信号', description: '用海报式大标题亮出判断，适合短观点。', pageCount: 3, tags: ['观点', '短文'] },
  'night-flight': { title: '夜航', description: '沿时间和路线展开一段记录，适合随笔与灵感。', pageCount: 3, tags: ['随笔', '灵感'] },
  neon: { title: '霓虹', description: '深色夜景配发光与滤色叠加，适合夜间观察与城市话题。', pageCount: 3, tags: ['夜景', '观察'] },
  brutalist: { title: '粗野', description: '硬阴影、粗线和六边形印章，适合宣言与规则清单。', pageCount: 3, tags: ['宣言', '海报'] },
  soft: { title: '柔光', description: '低透明粉彩、大圆角与松行高，适合随笔与生活记录。', pageCount: 3, tags: ['随笔', '生活'] },
  blueprint: { title: '蓝图', description: '虚线网格、六边形螺母与尺寸标注，适合计划与结构拆解。', pageCount: 3, tags: ['计划', '结构'] },
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
]

function createMarkdownTemplate(series: MarkdownTemplateSeriesId): TemplateDefinition {
  return {
    ...markdownSeriesMeta[series],
    id: `${series}-markdown`,
    series,
    workspace: 'markdown',
    createMarkdown: () => cloneMarkdown(series),
  }
}

function createFreeformTemplate(series: FreeformTemplateSeriesId): TemplateDefinition {
  return {
    ...freeformSeriesMeta[series],
    id: `${series}-freeform`,
    series,
    workspace: 'freeform',
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
