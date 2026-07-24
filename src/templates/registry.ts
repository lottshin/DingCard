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
  MarkdownTemplateDocument,
  TemplateDefinition,
  TemplateSeriesId,
  TemplateWorkspace,
} from './types'

const solid = (color: string): ColorPaint => ({ type: 'solid', color })

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
  options: Partial<Pick<FreeformTextElement, 'fontSize' | 'fontFamily' | 'textFill' | 'align' | 'fontWeight'>> = {},
): FreeformTextElement {
  return {
    id: uuid(),
    name: '文字',
    locked: false,
    hidden: false,
    type: 'text',
    x,
    y,
    width,
    height,
    rotation: 0,
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
): FreeformSceneNode {
  return {
    id: uuid(),
    name: '色块',
    locked: false,
    hidden: false,
    type: 'shape',
    x,
    y,
    width,
    height,
    rotation: 0,
    scale: 1,
    shape,
    fill,
    stroke: 'transparent',
    strokeWidth: 0,
  }
}

function lineNode(
  x: number,
  y: number,
  width: number,
  color: string,
  strokeWidth = 6,
): FreeformSceneNode {
  return {
    id: uuid(),
    name: '分隔线',
    locked: false,
    hidden: false,
    type: 'line',
    lineKind: 'line',
    x,
    y,
    width,
    height: 12,
    rotation: 0,
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

const markdownDocuments: Record<TemplateSeriesId, MarkdownTemplateDocument> = {
  editorial: {
    source: `# 把一件事讲清楚

先写结论，再补充过程。长文不必从头铺陈，读者滑到这一页时，应该立刻知道你想说什么。

---

## 先给结论

好的长图文不是把文章拆成几段，而是让每一页都有明确的任务：提出问题、解释原因，最后给出可以带走的做法。

> 一页只解决一个阅读动作，节奏自然就会出来。

---

## 留一点空白

删掉不影响理解的句子，把重点留给标题和关键数字。排版不是装饰，它负责让读者更快找到重点。`,
    platformId: 'rednote',
    themeId: 'template-editorial',
    fontFamily: 'Songti SC, serif',
    radius: 8,
    profile: { ...DEFAULT_PROFILE, nickname: '叮卡编辑部', handle: 'dingcard' },
  },
  checklist: {
    source: `# 一份可执行的清单

把模糊的目标改写成今天就能完成的小步骤。每完成一项，就少一点犹豫。

---

## 动手前

- 先写清楚这次要解决的问题
- 找到一个可以验证的结果
- 把需要的素材放在同一个地方

---

## 发布前

- 每页只保留一个重点
- 标题和正文的层级要一眼分开
- 从头到尾滑一遍，确认没有突然变拥挤的页面`,
    platformId: 'rednote',
    themeId: 'template-checklist',
    fontFamily: 'PingFang SC',
    radius: 16,
    profile: { ...DEFAULT_PROFILE, nickname: '清单研究所', handle: 'checklist' },
  },
  signal: {
    source: `# 观点先行

不要让读者猜你的重点。把最有判断力的一句话放在第一页，后面再用事实支撑它。

---

## 为什么现在说

信息越来越多，注意力却没有变长。一个清楚的观点，能帮读者决定要不要继续看，也能帮作者删掉无关内容。

---

## 说完之后

给出一个小而具体的动作：今天试一次，明天看结果。观点只有落到行动上，才不会停在漂亮的口号里。`,
    platformId: 'twitter',
    themeId: 'template-signal',
    fontFamily: 'PingFang SC',
    radius: 22,
    profile: { ...DEFAULT_PROFILE, nickname: 'Signal Notes', handle: 'signalnotes' },
  },
  'night-flight': {
    source: `# 夜里记下的灵感

灵感通常不完整。先把它留下来，第二天再决定它值不值得继续。

---

## 一个念头

如果工具能替你处理重复劳动，你就能把时间留给判断、取舍和真正想表达的部分。

---

## 明天再看

不要急着把草稿修成成品。先确认它有没有让你产生下一步动作，这比一开始就追求完整更重要。`,
    platformId: 'rednote',
    themeId: 'template-night-flight',
    fontFamily: 'system-ui, sans-serif',
    radius: 18,
    profile: { ...DEFAULT_PROFILE, nickname: '夜航手记', handle: 'nightflight' },
  },
}

function cloneMarkdown(series: TemplateSeriesId): MarkdownTemplateDocument {
  const document = markdownDocuments[series]
  return { ...document, profile: copyProfile(document.profile) }
}

function createEditorialDocument(): FreeformDocument {
  return documentFromSlides([
    slide('封面', solid('#f4eee7'), [
      shapeNode('rect', 72, 78, 936, 460, solid('#b83b2f')),
      textNode('把一件事\n讲清楚', 132, 138, 730, 250, {
        fontSize: 92,
        fontFamily: 'Songti SC, serif',
        textFill: solid('#fffaf4'),
        fontWeight: 'bold',
      }),
      textNode('叮卡编辑部  /  01', 136, 440, 650, 48, {
        fontSize: 24,
        fontFamily: 'system-ui, sans-serif',
        textFill: solid('#f6d7c7'),
      }),
      lineNode(72, 640, 936, '#b83b2f', 4),
      textNode('先写结论，再补充过程。', 72, 710, 850, 90, {
        fontSize: 40,
        fontFamily: 'Songti SC, serif',
        textFill: solid('#2d2925'),
      }),
    ]),
    slide('正文', solid('#f4eee7'), [
      textNode('01', 82, 86, 160, 90, { fontSize: 50, fontFamily: 'system-ui, sans-serif', textFill: solid('#b83b2f'), fontWeight: 'bold' }),
      textNode('一页只解决\n一个阅读动作', 82, 230, 840, 230, { fontSize: 76, fontFamily: 'Songti SC, serif', textFill: solid('#2d2925'), fontWeight: 'bold' }),
      lineNode(84, 548, 680, '#b83b2f', 5),
      textNode('提出问题、解释原因，最后给出可以带走的做法。读者不需要在一张卡片里处理所有信息。', 84, 640, 820, 220, { fontSize: 34, fontFamily: 'Songti SC, serif', textFill: solid('#57504a') }),
      shapeNode('rect', 84, 1030, 300, 210, solid('#d8b39f')),
      textNode('留白\n也是内容', 124, 1070, 260, 120, { fontSize: 38, fontFamily: 'Songti SC, serif', textFill: solid('#fffaf4'), fontWeight: 'bold' }),
    ]),
    slide('结尾', solid('#2d2925'), [
      textNode('把重点\n留给读者', 92, 154, 840, 240, { fontSize: 84, fontFamily: 'Songti SC, serif', textFill: solid('#fffaf4'), fontWeight: 'bold' }),
      lineNode(96, 500, 440, '#d8b39f', 5),
      textNode('删掉不影响理解的句子，留下真正需要被记住的那一句。', 96, 590, 820, 160, { fontSize: 36, fontFamily: 'Songti SC, serif', textFill: solid('#e7d9ce') }),
      textNode('DINGCARD / 叮卡', 96, 1250, 600, 50, { fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid('#d8b39f'), fontWeight: 'bold' }),
    ]),
  ])
}

function createChecklistDocument(): FreeformDocument {
  return documentFromSlides([
    slide('封面', solid('#edf3e4'), [
      shapeNode('ellipse', 760, 86, 210, 210, solid('#b6d69a')),
      shapeNode('rect', 80, 96, 120, 16, solid('#2f6f4e')),
      textNode('一份\n可执行的清单', 80, 246, 900, 270, { fontSize: 88, fontFamily: 'PingFang SC', textFill: solid('#203a2d'), fontWeight: 'bold' }),
      textNode('从模糊的目标，到今天就能完成的小步骤。', 84, 610, 820, 80, { fontSize: 30, textFill: solid('#4a6758') }),
      lineNode(84, 850, 900, '#9bc181', 4),
      textNode('CHECKLIST  /  01', 84, 940, 600, 50, { fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid('#2f6f4e'), fontWeight: 'bold' }),
    ]),
    slide('步骤', solid('#edf3e4'), [
      textNode('动手前', 82, 92, 800, 100, { fontSize: 72, textFill: solid('#203a2d'), fontWeight: 'bold' }),
      textNode('01', 82, 280, 100, 80, { fontSize: 42, fontFamily: 'system-ui, sans-serif', textFill: solid('#2f6f4e'), fontWeight: 'bold' }),
      textNode('写清楚这次要解决的问题', 180, 286, 760, 70, { fontSize: 34, textFill: solid('#203a2d') }),
      textNode('02', 82, 450, 100, 80, { fontSize: 42, fontFamily: 'system-ui, sans-serif', textFill: solid('#2f6f4e'), fontWeight: 'bold' }),
      textNode('找到一个可以验证的结果', 180, 456, 760, 70, { fontSize: 34, textFill: solid('#203a2d') }),
      textNode('03', 82, 620, 100, 80, { fontSize: 42, fontFamily: 'system-ui, sans-serif', textFill: solid('#2f6f4e'), fontWeight: 'bold' }),
      textNode('把素材放在同一个地方', 180, 626, 760, 70, { fontSize: 34, textFill: solid('#203a2d') }),
      shapeNode('rect', 82, 880, 860, 250, solid('#d7e7c7')),
      textNode('先完成，再优化。\n行动会告诉你下一步。', 132, 940, 760, 140, { fontSize: 42, textFill: solid('#2f6f4e'), fontWeight: 'bold' }),
    ]),
    slide('结尾', solid('#2f6f4e'), [
      textNode('发布前\n再检查一遍', 84, 150, 860, 240, { fontSize: 82, textFill: solid('#f4f8ec'), fontWeight: 'bold' }),
      lineNode(86, 520, 600, '#b6d69a', 5),
      textNode('每页只保留一个重点。\n从头滑到尾，确认阅读节奏没有突然变拥挤。', 86, 620, 820, 190, { fontSize: 36, textFill: solid('#dbeacb') }),
      textNode('完成一项，就打一个勾。', 86, 1160, 760, 70, { fontSize: 30, fontFamily: 'system-ui, sans-serif', textFill: solid('#b6d69a'), fontWeight: 'bold' }),
    ]),
  ])
}

function createSignalDocument(): FreeformDocument {
  return documentFromSlides([
    slide('封面', solid('#f4f4f0'), [
      shapeNode('rect', 70, 70, 940, 310, solid('#2456d6')),
      shapeNode('ellipse', 810, 238, 190, 190, solid('#f1c44f')),
      textNode('观点\n先行', 122, 116, 680, 220, { fontSize: 96, fontFamily: 'PingFang SC', textFill: solid('#ffffff'), fontWeight: 'bold' }),
      textNode('SIGNAL / 01', 84, 580, 620, 50, { fontSize: 24, fontFamily: 'system-ui, sans-serif', textFill: solid('#2456d6'), fontWeight: 'bold' }),
      textNode('不要让读者猜你的重点。', 84, 690, 860, 90, { fontSize: 44, textFill: solid('#17191f'), fontWeight: 'bold' }),
      lineNode(84, 860, 900, '#17191f', 4),
      textNode('把最有判断力的一句话，放在第一页。', 84, 960, 820, 100, { fontSize: 32, textFill: solid('#50545d') }),
    ]),
    slide('论证', solid('#f4f4f0'), [
      textNode('为什么现在说', 82, 92, 900, 120, { fontSize: 70, textFill: solid('#17191f'), fontWeight: 'bold' }),
      shapeNode('rect', 82, 300, 30, 530, solid('#2456d6')),
      textNode('信息越来越多，注意力却没有变长。一个清楚的观点，能帮读者决定要不要继续看，也能帮作者删掉无关内容。', 164, 316, 760, 300, { fontSize: 38, textFill: solid('#30343c') }),
      shapeNode('ellipse', 700, 940, 240, 240, solid('#f1c44f')),
      textNode('清楚\n比热闹\n更重要', 720, 990, 220, 160, { fontSize: 34, align: 'center', textFill: solid('#17191f'), fontWeight: 'bold' }),
    ]),
    slide('结尾', solid('#17191f'), [
      shapeNode('rect', 80, 88, 920, 18, solid('#f1c44f')),
      textNode('说完之后，\n给一个动作。', 84, 210, 860, 230, { fontSize: 82, textFill: solid('#ffffff'), fontWeight: 'bold' }),
      textNode('今天试一次，明天看结果。观点只有落到行动上，才不会停在漂亮的口号里。', 86, 620, 820, 190, { fontSize: 38, textFill: solid('#c8ccd5') }),
      textNode('SIGNAL NOTES  /  END', 86, 1240, 740, 50, { fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid('#f1c44f'), fontWeight: 'bold' }),
    ]),
  ])
}

function createNightFlightDocument(): FreeformDocument {
  return documentFromSlides([
    slide('封面', solid('#101725'), [
      shapeNode('ellipse', 760, 112, 180, 180, solid('#c8f35a')),
      shapeNode('rect', 76, 470, 928, 10, solid('#3259d5')),
      textNode('夜里记下的\n灵感', 84, 220, 880, 250, { fontSize: 88, fontFamily: 'Songti SC, serif', textFill: solid('#f5f7f0'), fontWeight: 'bold' }),
      textNode('NIGHT FLIGHT  /  01', 86, 650, 700, 50, { fontSize: 23, fontFamily: 'system-ui, sans-serif', textFill: solid('#c8f35a'), fontWeight: 'bold' }),
      textNode('灵感通常不完整。先把它留下来。', 86, 820, 850, 90, { fontSize: 38, textFill: solid('#b6c0d6') }),
    ]),
    slide('念头', solid('#101725'), [
      textNode('一个念头', 84, 100, 850, 110, { fontSize: 72, textFill: solid('#c8f35a'), fontWeight: 'bold' }),
      lineNode(86, 300, 720, '#3259d5', 5),
      textNode('如果工具能替你处理重复劳动，你就能把时间留给判断、取舍和真正想表达的部分。', 86, 420, 820, 250, { fontSize: 40, textFill: solid('#f5f7f0') }),
      shapeNode('rect', 86, 920, 500, 220, solid('#1c2a46')),
      textNode('留下问题，\n明天再回答。', 132, 972, 410, 120, { fontSize: 42, textFill: solid('#c8f35a'), fontWeight: 'bold' }),
    ]),
    slide('结尾', solid('#101725'), [
      shapeNode('ellipse', 750, 120, 170, 170, solid('#3259d5')),
      textNode('先留下来。\n再决定要不要继续。', 86, 300, 850, 240, { fontSize: 78, fontFamily: 'Songti SC, serif', textFill: solid('#f5f7f0'), fontWeight: 'bold' }),
      textNode('不要急着把草稿修成成品。先确认它有没有让你产生下一步动作。', 86, 720, 820, 180, { fontSize: 38, textFill: solid('#b6c0d6') }),
      textNode('DINGCARD / NIGHT FLIGHT', 86, 1250, 760, 50, { fontSize: 22, fontFamily: 'system-ui, sans-serif', textFill: solid('#c8f35a'), fontWeight: 'bold' }),
    ]),
  ])
}

const seriesMeta: Record<TemplateSeriesId, Omit<TemplateDefinition, 'id' | 'workspace' | 'createMarkdown' | 'createFreeform'>> = {
  editorial: { series: 'editorial', title: '编辑部', description: '像一本轻薄的刊物，适合写观点和方法。', pageCount: 3, tags: ['观点', '方法'] },
  checklist: { series: 'checklist', title: '清单', description: '把复杂事情拆成几步，适合教程、复盘和计划。', pageCount: 3, tags: ['教程', '清单'] },
  signal: { series: 'signal', title: '信号', description: '大标题配高对比色块，第一眼就能看到观点。', pageCount: 3, tags: ['观点', '短文'] },
  'night-flight': { series: 'night-flight', title: '夜航', description: '深色页面用酸绿和蓝色提亮，适合随笔和灵感。', pageCount: 3, tags: ['随笔', '灵感'] },
}

const freeformFactories: Record<TemplateSeriesId, () => FreeformDocument> = {
  editorial: createEditorialDocument,
  checklist: createChecklistDocument,
  signal: createSignalDocument,
  'night-flight': createNightFlightDocument,
}

const seriesIds: TemplateSeriesId[] = ['editorial', 'checklist', 'signal', 'night-flight']

function createTemplate(series: TemplateSeriesId, workspace: TemplateWorkspace): TemplateDefinition {
  const meta = seriesMeta[series]
  return {
    ...meta,
    id: `${series}-${workspace}`,
    workspace,
    ...(workspace === 'markdown'
      ? { createMarkdown: () => cloneMarkdown(series) }
      : { createFreeform: () => freeformFactories[series]() }),
  }
}

export const TEMPLATE_REGISTRY: readonly TemplateDefinition[] = seriesIds.flatMap((series) => [
  createTemplate(series, 'markdown'),
  createTemplate(series, 'freeform'),
])

export function templatesForWorkspace(workspace: TemplateWorkspace): readonly TemplateDefinition[] {
  return TEMPLATE_REGISTRY.filter((template) => template.workspace === workspace)
}

export function findTemplate(id: string): TemplateDefinition | undefined {
  return TEMPLATE_REGISTRY.find((template) => template.id === id)
}
