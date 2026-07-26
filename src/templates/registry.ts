import { normalizeFreeformDocumentV3 } from '../freeform/sceneDocument'
import type {
  ColorPaint,
  FreeformDocument,
  FreeformSceneNode,
  FreeformSlide,
  FreeformTextElement,
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
  options: Partial<Pick<FreeformTextElement, 'fontSize' | 'fontFamily' | 'textFill' | 'align' | 'fontWeight' | 'rotation' | 'name'>> = {},
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
  }
}

function shapeNode(
  shape: 'rect' | 'ellipse' | 'triangle',
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
    documentVersion: 3,
    activeSlideId: slides[0].id,
    slides,
  }
  const normalized = normalizeFreeformDocumentV3(document)
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
      shapeNode('rect', 72, 188, 252, 56, solid('#d94836'), { name: '栏目标签' }),
      lineNode(72, 624, 650, '#171717', 5, { name: '标题线' }),
      shapeNode('rect', 742, 894, 266, 350, solid('#171717'), { name: '期号底板' }),
      lineNode(72, 1320, 936, '#171717', 2, { name: '页脚线' }),
      textNode('DINGCARD EDITORIAL', 72, 62, 610, 48, { name: '刊头', fontSize: 24, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('ISSUE 01 / 2026', 730, 62, 278, 48, { name: '期号', fontSize: 20, fontFamily: 'system-ui, sans-serif', align: 'right' }),
      textNode('FIELD NOTES', 92, 196, 214, 40, { name: '栏目', fontSize: 20, fontFamily: 'system-ui, sans-serif', textFill: solid('#ffffff'), fontWeight: 'bold' }),
      textNode('开头先把\n判断写清楚', 64, 288, 880, 274, { name: '主标题', fontSize: 98, fontFamily: 'Songti SC, serif', textFill: solid('#171717'), fontWeight: 'bold' }),
      textNode('第一屏负责给出判断，后面的页面再交代过程。', 72, 680, 690, 110, { name: '导语', fontSize: 36, fontFamily: 'Songti SC, serif', textFill: solid('#4d4942') }),
      textNode('01', 780, 936, 190, 150, { name: '大期号', fontSize: 118, fontFamily: 'system-ui, sans-serif', textFill: solid('#f6f3ea'), fontWeight: 'bold', align: 'center' }),
      textNode('READING ORDER', 778, 1124, 194, 42, { name: '英文注释', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#d94836'), fontWeight: 'bold', align: 'center' }),
      textNode('叮卡编辑部', 72, 1344, 320, 38, { name: '署名', fontSize: 18, fontFamily: 'system-ui, sans-serif' }),
      textNode('先判断，再展开', 700, 1344, 308, 38, { name: '页脚主题', fontSize: 18, fontFamily: 'system-ui, sans-serif', align: 'right' }),
    ]),
    slide('内页', solid('#f6f3ea'), [
      lineNode(72, 128, 936, '#171717', 3, { name: '刊头线' }),
      shapeNode('rect', 72, 212, 18, 676, solid('#d94836'), { name: '章节标记' }),
      lineNode(532, 660, 350, '#171717', 3, { name: '正文分隔线' }),
      shapeNode('rect', 592, 878, 416, 300, solid('#ded8cb'), { name: '引文底板' }),
      lineNode(72, 1320, 936, '#171717', 2, { name: '页脚线' }),
      textNode('DINGCARD / NOTES', 72, 60, 550, 44, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('02', 866, 58, 142, 46, { name: '页码', fontSize: 24, fontFamily: 'system-ui, sans-serif', textFill: solid('#d94836'), fontWeight: 'bold', align: 'right' }),
      textNode('每一页\n都要往前走', 126, 204, 760, 220, { name: '标题', fontSize: 78, fontFamily: 'Songti SC, serif', fontWeight: 'bold' }),
      textNode('分页不是把一段话切开，而是安排读者先看到什么、接着理解什么。', 126, 474, 760, 130, { name: '导语', fontSize: 34, fontFamily: 'Songti SC, serif', textFill: solid('#4d4942') }),
      textNode('01\n提出问题', 72, 724, 350, 110, { name: '步骤一', fontSize: 34, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('02\n解释原因', 366, 724, 350, 110, { name: '步骤二', fontSize: 34, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('03\n给出下一步', 714, 724, 294, 110, { name: '步骤三', fontSize: 34, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('“抽掉这一页，文章有没有少一个关键动作？”', 628, 928, 344, 146, { name: '引文', fontSize: 33, fontFamily: 'Songti SC, serif', fontWeight: 'bold' }),
      textNode('用这个问题检查跨页节奏。', 628, 1100, 344, 42, { name: '引文注释', fontSize: 20, fontFamily: 'system-ui, sans-serif', textFill: solid('#6a6259') }),
      textNode('阅读顺序 / 02', 72, 1344, 360, 38, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif' }),
    ]),
    slide('结尾', solid('#171717'), [
      shapeNode('rect', 726, 0, 354 + TEMPLATE_EDGE_BLEED, 1440, solid('#d94836'), { name: '红色边栏' }),
      lineNode(72, 132, 574, '#f6f3ea', 3, { name: '刊头线' }),
      shapeNode('ellipse', 828, 96, 84, 84, solid('#f6f3ea'), { name: '页码圆点' }),
      lineNode(72, 910, 574, '#f6f3ea', 3, { name: '正文线' }),
      lineNode(72, 1320, 574, '#f6f3ea', 2, { name: '页脚线' }),
      textNode('EDITORIAL / 03', 72, 62, 480, 46, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid('#f6f3ea'), fontWeight: 'bold' }),
      textNode('03', 826, 112, 88, 48, { name: '页码', fontSize: 24, fontFamily: 'system-ui, sans-serif', textFill: solid('#171717'), fontWeight: 'bold', align: 'center' }),
      textNode('结尾要让文章\n真正落地', 64, 250, 612, 270, { name: '标题', fontSize: 82, fontFamily: 'Songti SC, serif', textFill: solid('#f6f3ea'), fontWeight: 'bold' }),
      textNode('给出下一步，或者留下一句值得记住的话。不要把开头再说一遍。', 72, 610, 548, 190, { name: '正文', fontSize: 34, fontFamily: 'Songti SC, serif', textFill: solid('#d8d2c7') }),
      textNode('NEXT', 770, 360, 268, 104, { name: '边栏标题', fontSize: 68, fontFamily: 'system-ui, sans-serif', textFill: solid('#171717'), fontWeight: 'bold', align: 'center', rotation: 90 }),
      textNode('一句结论\n一个动作\n到此结束', 72, 986, 530, 190, { name: '结尾清单', fontSize: 38, fontFamily: 'system-ui, sans-serif', textFill: solid('#f6f3ea'), fontWeight: 'bold' }),
      textNode('DINGCARD EDITORIAL', 72, 1344, 430, 38, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#f6f3ea') }),
    ]),
  ])
}

function createChecklistDocument(): FreeformDocument {
  return documentFromSlides([
    slide('封面', solid('#f3f5ed'), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, 0, 154 + TEMPLATE_EDGE_BLEED, 1440, solid('#174a38'), { name: '装订边栏' }),
      shapeNode('rect', 72, 174, 238, 58, solid('#f2c84b'), { name: '手册标签' }),
      lineNode(214, 126, 794, '#174a38', 3, { name: '刊头线' }),
      shapeNode('rect', 214, 878, 56, 56, solid('#f3f5ed'), { name: '复选框一', stroke: '#174a38', strokeWidth: 4 }),
      shapeNode('rect', 214, 1000, 56, 56, solid('#f3f5ed'), { name: '复选框二', stroke: '#174a38', strokeWidth: 4 }),
      shapeNode('rect', 214, 1122, 56, 56, solid('#f3f5ed'), { name: '复选框三', stroke: '#174a38', strokeWidth: 4 }),
      lineNode(302, 950, 706, '#b7c4b9', 2, { name: '清单线一' }),
      lineNode(302, 1072, 706, '#b7c4b9', 2, { name: '清单线二' }),
      lineNode(302, 1194, 706, '#b7c4b9', 2, { name: '清单线三' }),
      textNode('01', 38, 62, 80, 52, { name: '边栏页码', fontSize: 26, fontFamily: 'system-ui, sans-serif', textFill: solid('#f3f5ed'), fontWeight: 'bold', align: 'center' }),
      textNode('WORKBOOK', 36, 1136, 240, 42, { name: '边栏标题', fontSize: 20, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2c84b'), fontWeight: 'bold', rotation: -90 }),
      textNode('START HERE', 92, 184, 198, 40, { name: '标签文字', fontSize: 20, fontFamily: 'system-ui, sans-serif', textFill: solid('#174a38'), fontWeight: 'bold' }),
      textNode('把计划写到\n能立刻开工', 204, 310, 760, 250, { name: '主标题', fontSize: 84, fontFamily: 'PingFang SC', textFill: solid('#14271f'), fontWeight: 'bold' }),
      textNode('先确定今天交付什么，再把它拆成看得见的动作。', 214, 650, 718, 110, { name: '导语', fontSize: 34, textFill: solid('#466055') }),
      textNode('目标已经写清楚', 302, 882, 570, 52, { name: '检查项一', fontSize: 28, fontWeight: 'bold' }),
      textNode('完成标准可以验证', 302, 1004, 570, 52, { name: '检查项二', fontSize: 28, fontWeight: 'bold' }),
      textNode('素材集中在一个地方', 302, 1126, 570, 52, { name: '检查项三', fontSize: 28, fontWeight: 'bold' }),
      textNode('DINGCARD / CHECKLIST', 214, 1324, 540, 38, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#174a38'), fontWeight: 'bold' }),
    ]),
    slide('步骤', solid('#f3f5ed'), [
      shapeNode('rect', 72, 230, 104, 104, solid('#174a38'), { name: '编号底板一' }),
      shapeNode('rect', 72, 502, 104, 104, solid('#f2c84b'), { name: '编号底板二' }),
      shapeNode('rect', 72, 774, 104, 104, solid('#174a38'), { name: '编号底板三' }),
      lineNode(72, 138, 936, '#174a38', 3, { name: '刊头线' }),
      lineNode(210, 364, 798, '#b7c4b9', 3, { name: '步骤线一' }),
      lineNode(210, 636, 798, '#b7c4b9', 3, { name: '步骤线二' }),
      lineNode(210, 908, 798, '#b7c4b9', 3, { name: '步骤线三' }),
      shapeNode('rect', 72, 1048, 936, 220, solid('#dde6d9'), { name: '批注底板' }),
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
      shapeNode('rect', 72, 176, 936, 948, solid('#f3f5ed'), { name: '验收表' }),
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
      textNode('03 / 03', 112, 966, 500, 116, { name: '完成进度', fontSize: 78, fontFamily: 'system-ui, sans-serif', textFill: solid('#174a38'), fontWeight: 'bold' }),
      textNode('全部完成，可以导出。', 72, 1188, 760, 72, { name: '结论', fontSize: 38, textFill: solid('#f3f5ed'), fontWeight: 'bold' }),
      textNode('DINGCARD WORKBOOK', 72, 1322, 470, 42, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#f3f5ed'), fontWeight: 'bold' }),
    ]),
  ])
}

function createSignalDocument(): FreeformDocument {
  return documentFromSlides([
    slide('封面', solid('#f2f0e8'), [
      shapeNode('rect', 704, 0, 376 + TEMPLATE_EDGE_BLEED, 520, solid('#e4472f'), { name: '红色象限' }),
      shapeNode('ellipse', 764, 432, 176, 176, solid('#f2c84b'), { name: '信号圆点' }),
      shapeNode('rect', 72, 704, 18, 500, solid('#2457d6'), { name: '蓝色坐标轴' }),
      lineNode(72, 128, 560, '#111111', 3, { name: '顶部网格线' }),
      lineNode(72, 674, 936, '#111111', 3, { name: '中部网格线' }),
      lineNode(122, 962, 886, '#b8b5ad', 2, { name: '正文网格线一' }),
      lineNode(122, 1110, 886, '#b8b5ad', 2, { name: '正文网格线二' }),
      lineNode(72, 1320, 936, '#111111', 3, { name: '页脚线' }),
      textNode('SIGNAL / POSTER 01', 72, 62, 560, 46, { name: '刊头', fontSize: 22, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('观点', 64, 204, 610, 132, { name: '标题上', fontSize: 116, fontFamily: 'PingFang SC', fontWeight: 'bold' }),
      textNode('先行', 64, 348, 610, 132, { name: '标题下', fontSize: 116, fontFamily: 'PingFang SC', fontWeight: 'bold' }),
      textNode('01', 774, 464, 156, 82, { name: '圆点编号', fontSize: 58, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', align: 'center' }),
      textNode('别让读者读完三段，\n才发现你真正想说什么。', 122, 756, 780, 150, { name: '主张', fontSize: 44, fontWeight: 'bold' }),
      textNode('CLAIM FIRST', 122, 1002, 430, 56, { name: '英文主张', fontSize: 30, fontFamily: 'system-ui, sans-serif', textFill: solid('#2457d6'), fontWeight: 'bold' }),
      textNode('判断站在第一屏，证据跟在后面。', 122, 1150, 760, 58, { name: '说明', fontSize: 28, textFill: solid('#4d4b46') }),
      textNode('DINGCARD SIGNAL', 72, 1342, 420, 38, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('CN / 2026', 744, 1342, 264, 38, { name: '页脚编号', fontSize: 18, fontFamily: 'system-ui, sans-serif', align: 'right' }),
    ]),
    slide('论证', solid('#f2f0e8'), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, 0, 454 + TEMPLATE_EDGE_BLEED, 1440, solid('#2457d6'), { name: '蓝色分区' }),
      shapeNode('rect', 454, 934, 626, 188, solid('#e4472f'), { name: '红色结论栏' }),
      shapeNode('ellipse', 824, 90, 104, 104, solid('#f2c84b'), { name: '页码圆点' }),
      lineNode(510, 248, 498, '#111111', 3, { name: '右栏顶线' }),
      lineNode(510, 584, 498, '#b8b5ad', 2, { name: '证据线一' }),
      lineNode(510, 742, 498, '#b8b5ad', 2, { name: '证据线二' }),
      lineNode(510, 900, 498, '#b8b5ad', 2, { name: '证据线三' }),
      lineNode(510, 1320, 498, '#111111', 3, { name: '页脚线' }),
      textNode('WHY', 42, 74, 370, 146, { name: '英文标题', fontSize: 120, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2f0e8'), fontWeight: 'bold' }),
      textNode('证据跟在\n判断后面', 42, 326, 360, 250, { name: '主标题', fontSize: 72, textFill: solid('#ffffff'), fontWeight: 'bold' }),
      textNode('先说结论，不会削弱论证。它只是让读者知道，接下来的材料在回答什么。', 48, 694, 348, 250, { name: '左栏正文', fontSize: 32, textFill: solid('#dfe6ff') }),
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
      shapeNode('rect', 72, 880, 936, 300, solid('#e4472f'), { name: '行动底板' }),
      shapeNode('triangle', 818, 420, 150, 132, solid('#2457d6'), { name: '方向符号', rotation: 90 }),
      lineNode(72, 300, 936, '#f2f0e8', 3, { name: '标题线' }),
      lineNode(72, 790, 936, '#f2f0e8', 3, { name: '正文线' }),
      lineNode(72, 1320, 936, '#f2c84b', 3, { name: '页脚线' }),
      textNode('SIGNAL / 03 / ACTION', 72, 76, 650, 52, { name: '刊头', fontSize: 24, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
      textNode('03', 868, 74, 140, 56, { name: '页码', fontSize: 30, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', align: 'right' }),
      textNode('最后，\n给一个动作。', 64, 356, 720, 260, { name: '主标题', fontSize: 92, textFill: solid('#f2f0e8'), fontWeight: 'bold' }),
      textNode('→', 812, 418, 166, 110, { name: '箭头文字', fontSize: 90, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2f0e8'), fontWeight: 'bold', align: 'center' }),
      textNode('今天试一次', 112, 930, 620, 90, { name: '行动标题', fontSize: 62, textFill: solid('#ffffff'), fontWeight: 'bold' }),
      textNode('明天回来，看结果。', 112, 1042, 620, 62, { name: '行动说明', fontSize: 34, textFill: solid('#ffffff') }),
      textNode('能被执行的观点，才会真正留下来。', 72, 1226, 780, 62, { name: '收束句', fontSize: 30, textFill: solid('#d1d1cf') }),
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
      shapeNode('ellipse', 934, 884, 54, 54, solid('#e85d3f'), { name: '终点' }),
      lineNode(112, 990, 288, '#6fb7c8', 5, { name: '航线一', rotation: -17 }),
      lineNode(402, 920, 322, '#6fb7c8', 5, { name: '航线二', rotation: 20 }),
      lineNode(720, 1016, 248, '#6fb7c8', 5, { name: '航线三', rotation: -28 }),
      lineNode(72, 1240, 936, '#53616d', 2, { name: '页脚线' }),
      textNode('NF 2340', 72, 48, 360, 58, { name: '航班号', fontSize: 34, fontFamily: 'system-ui, sans-serif', textFill: solid('#111820'), fontWeight: 'bold' }),
      textNode('FRI  /  23:40', 612, 50, 396, 54, { name: '出发时间', fontSize: 28, fontFamily: 'system-ui, sans-serif', textFill: solid('#111820'), fontWeight: 'bold', align: 'right' }),
      textNode('夜里先记下，\n天亮再判断', 64, 260, 880, 250, { name: '主标题', fontSize: 88, fontFamily: 'Songti SC, serif', textFill: solid('#f2efe6'), fontWeight: 'bold' }),
      textNode('灵感通常不完整。保留原句，先别急着把它修成成品。', 72, 610, 820, 140, { name: '导语', fontSize: 36, textFill: solid('#aebac3') }),
      textNode('23:40', 72, 870, 230, 66, { name: '起点时间', fontSize: 36, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2bd4b'), fontWeight: 'bold' }),
      textNode('00:15', 372, 802, 230, 66, { name: '中途时间', fontSize: 36, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2bd4b'), fontWeight: 'bold' }),
      textNode('08:30', 792, 1082, 200, 66, { name: '抵达时间', fontSize: 36, fontFamily: 'system-ui, sans-serif', textFill: solid('#e85d3f'), fontWeight: 'bold', align: 'right' }),
      textNode('NIGHT FLIGHT / ROUTE 01', 72, 1288, 540, 40, { name: '页脚', fontSize: 19, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2efe6'), fontWeight: 'bold' }),
      textNode('31.23 N  /  121.47 E', 654, 1288, 354, 40, { name: '坐标', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#6fb7c8'), align: 'right' }),
    ]),
    slide('中途', solid('#111820'), [
      shapeNode('rect', 72, 180, 936, 104, solid('#24313b'), { name: '时间栏' }),
      shapeNode('ellipse', 108, 394, 30, 30, solid('#f2bd4b'), { name: '时间点一' }),
      shapeNode('ellipse', 108, 674, 30, 30, solid('#6fb7c8'), { name: '时间点二' }),
      shapeNode('ellipse', 108, 954, 30, 30, solid('#e85d3f'), { name: '时间点三' }),
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
      textNode('先保存线索，不在夜里替明天做完所有决定。', 170, 1080, 754, 90, { name: '注释', fontSize: 30, textFill: solid('#aebac3') }),
      textNode('31.23 N  /  ROUTE ACTIVE', 72, 1288, 520, 40, { name: '页脚', fontSize: 18, fontFamily: 'system-ui, sans-serif', textFill: solid('#6fb7c8'), fontWeight: 'bold' }),
    ]),
    slide('抵达', solid('#ece8dc'), [
      shapeNode('rect', 0, -TEMPLATE_EDGE_BLEED, 1080, 190 + TEMPLATE_EDGE_BLEED, solid('#111820'), { name: '抵达信息栏' }),
      shapeNode('rect', 72, 854, 936, 300, solid('#111820'), { name: '结论底板' }),
      shapeNode('ellipse', 88, 670, 44, 44, solid('#f2bd4b'), { name: '起点' }),
      shapeNode('ellipse', 508, 670, 44, 44, solid('#6fb7c8'), { name: '中点' }),
      shapeNode('ellipse', 930, 660, 64, 64, solid('#e85d3f'), { name: '终点' }),
      lineNode(120, 686, 408, '#111820', 4, { name: '抵达线一' }),
      lineNode(548, 686, 410, '#111820', 4, { name: '抵达线二' }),
      lineNode(72, 1260, 936, '#111820', 3, { name: '页脚线' }),
      textNode('ARRIVAL  /  08:30', 72, 58, 600, 58, { name: '抵达时间', fontSize: 34, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2efe6'), fontWeight: 'bold' }),
      textNode('ROUTE 03', 758, 60, 250, 52, { name: '路线编号', fontSize: 28, fontFamily: 'system-ui, sans-serif', textFill: solid('#f2bd4b'), fontWeight: 'bold', align: 'right' }),
      textNode('天亮以后，\n只判断一件事', 64, 286, 880, 220, { name: '主标题', fontSize: 84, fontFamily: 'Songti SC, serif', textFill: solid('#111820'), fontWeight: 'bold' }),
      textNode('它还让你想继续写吗？', 72, 548, 750, 76, { name: '提问', fontSize: 40, textFill: solid('#45515a'), fontWeight: 'bold' }),
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
}

const freeformFactories: Record<FreeformTemplateSeriesId, () => FreeformDocument> = {
  editorial: createEditorialDocument,
  checklist: createChecklistDocument,
  signal: createSignalDocument,
  'night-flight': createNightFlightDocument,
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
