import { randomId } from '../uid'
import { normalizeFreeformDocumentV44 } from '../freeform/sceneDocument'
import type {
  BlendMode,
  ColorPaint,
  FreeformChartElement,
  FreeformTableElement,
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
  SlideBackground,
} from '../freeform/types'
import { createDecorationNode, decorationById } from '../freeform/decorations'
import { createDefaultImageFraming } from '../freeform/imageFraming'
import { DEFAULT_PROFILE, type Profile } from '../theme'
import { TIMETABLE_SAMPLE, TIMETABLE_TABLE, tableNodes } from './tables'
import type {
  DeckLayoutId,
  FreeformDeckSeriesId,
  FreeformPosterSeriesId,
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
    | 'stroke' | 'strokeWidth' | 'effect' | 'verticalAlign'
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
    ...(options.verticalAlign ? { verticalAlign: options.verticalAlign } : {}),
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
  background: SlideBackground,
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
    documentVersion: 44,
    activeSlideId: slides[0].id,
    slides,
  }
  const normalized = normalizeFreeformDocumentV44(document)
  if (!normalized) throw new Error('内置模板生成了无效的自由画布文档')
  return normalized
}

// Each sample is a whole article in its look, one `---` section per page.
const markdownDocuments: Record<MarkdownTemplateSeriesId, MarkdownTemplateDocument> = {
  column: {
    source: `# 在城市里慢慢走

这半年，我把周末的打车换成了走路。本来只想省点钱，没想到，走路让我重新认识了住了五年的城市。

![旧城区街角的一栋老楼](/templates/editorial-building.webp)

---

## 地铁看不见的东西

地铁把城市切成一个个站点。出站之前，你不知道两站之间有什么。

走路不一样。你会看见早餐店几点开门，哪条街的梧桐最先变黄，哪家修鞋铺的师傅总在午后打盹。路过一所小学时，正好赶上放学，门口挤满了等孩子的家长。

**走路的速度，刚好是看清一座城市的速度。**

于是我给自己定了一个规矩：周六上午不坐车，去哪儿都走着去。

---

## 三条走熟了的路

1. 老城环线：从钟楼出发，绕护城河一圈，大约六公里。
2. 江边线：沿江堤一直往东，傍晚五点的光最好看。
3. 菜市场线：走到最远的那个菜市场，买一把青菜再走回来。

每条路我都走过不下十遍。熟了以后，反而更容易看出变化：新开的小店，拆掉的报亭，换了颜色的围墙，还有某天突然出现在路口的一棵桂花树。

---

> 你不需要去很远的地方，才能看见新的东西。

这是走到第三个月时，我在笔记本上写下的一句话。

以前总觉得，旅行要去远方，要坐飞机、订酒店、做攻略。现在才发现，只要把速度放慢，家门口的街道也会变得陌生而有趣。

那些平时一闪而过的风景，其实一直都在等你停下来。

---

## 写在最后

半年下来，地图上走过的路已经连成了一张网。我认识了卖花的阿姨，记住了哪家面馆的汤最浓，也终于知道了小区后面那条河通向哪里。

城市还是那座城市，只是我看它的方式变了。

下次出门，不妨提前一站下车，走一段路。你会遇见一些只有走路才看得见的东西。`,
    platformId: 'rednote',
    themeId: 'template-column',
    fontFamily: "'Noto Serif SC', serif",
    radius: 0,
    profile: { ...DEFAULT_PROFILE, nickname: '叮卡', handle: 'dingcard' },
  },
  memo: {
    source: `# 搬家前一周要做的事

十月底要搬去新家。趁周末把要做的事全部列出来，做完一项勾一项，心里踏实多了。

- [x] 联系三家搬家公司，比价
- [x] 新家量好尺寸：沙发 2.1 米，冰箱 0.7 米
- [ ] 旧房退租，约房东周五验房
- [ ] 水、电、燃气过户
- [ ] 网络预约移机

**提醒**：搬家公司最好提前一周约，月底的周末很难约到。

---

## 打包的顺序

**先打包用不上的，最后打包每天要用的。**

1. 书和换季的衣服
2. 厨房里不常用的锅和碗
3. 装饰品、相框和绿植
4. 最后一天：洗漱用品、充电器、一套换洗衣服

每个箱子贴上标签，写清楚房间和里面装了什么，到了新家直接搬进对应的房间。贵重物品和证件单独装一个小包，随身带。

---

## 别忘了

- [ ] 改快递地址：常用的购物软件都要改
- [ ] 银行卡、社保的联系地址
- [ ] 给楼下的猫留一袋猫粮
- [ ] 拍一张旧房子的照片留作纪念

> 搬家最累的不是搬，是收拾。东西少一点，日子就会轻一点。

这次搬家，我打算先扔掉三分之一的东西。用不上的衣服捐掉，看完的书送给朋友，剩下的，才是真正需要的。`,
    platformId: 'rednote',
    themeId: 'template-memo',
    fontFamily: "'Noto Sans SC', sans-serif",
    radius: 0,
    profile: { ...DEFAULT_PROFILE, nickname: '叮卡', handle: 'dingcard' },
  },
  letter: {
    source: `# 给一年后的自己

亲爱的自己：

写这封信的时候，是二〇二六年十月的一个晚上。窗外在下雨，桌上的茶已经凉了，我想趁这个安静的时候，和一年后的你说说话。

这一年，你换了工作，搬了一次家，学会了一个人去医院、一个人修好漏水的水管。很多事情第一次做的时候都很慌，后来也都过去了。

回头看，那些让你睡不着的事，现在大多已经想不起来了。

---

## 想对你说的几件事

希望你还保持着早睡的习惯，周末会出门走走，不再因为别人的一句话难过一整天。

希望你还记得，**慢一点没关系**，走得远比走得快更重要。

如果这一年并不顺利，也请不要责怪自己。你已经很努力了，只是有些事情需要时间。

那些暂时没有答案的问题，就先放一放吧。时间会帮你找到答案，或者让你发现，它们其实并不重要。

---

## 写给明年的约定

- 每个月读完一本书
- 学会做三道拿手菜
- 去一个没去过的城市
- 给爸妈多打几个电话

等你读到这封信的时候，看看完成了几件。没完成的，就放进下一年的信里。

不管那时的你在哪里、在做什么，都请记得好好吃饭，好好睡觉，常常回家看看。

愿你一切都好。`,
    platformId: 'rednote',
    themeId: 'template-letter',
    fontFamily: "'LXGW WenKai TC', cursive",
    radius: 0,
    profile: { ...DEFAULT_PROFILE, nickname: '叮卡', handle: 'dingcard' },
  },
  night: {
    source: `# 失眠的夜里，我读完了一本书

凌晨一点，又一次睡不着。这一次我没有再刷手机，而是打开台灯，把那本放了半年的书读完了。

这是一本关于一个人独自生活的书。书很薄，读完的时候，窗外的天刚刚泛白，楼下传来第一辆早班车的声音。

---

## 关于孤独

书里说，孤独不是身边没有人，而是心里没有一个可以安放自己的地方。

**一个人吃饭、一个人散步、一个人看完一场电影**，这些事并不可怕。可怕的是，我们总是急着用别的东西把时间填满，从来没有好好地和自己待一会儿。

我想起这些年，每次一个人的时候，第一件事都是打开手机。好像只要屏幕亮着，就不算是一个人。

---

> 夜晚是留给自己的。白天属于世界，只有在夜里，你才完完全全属于你自己。

读到这一句的时候，我在书页上折了一个角。

那些睡不着的夜晚，也许并不是在浪费时间。它们只是在提醒我：该停下来，听一听自己的声音了。

白天太吵，有些话，只有夜里才听得见。我把这句话抄在了床头的便签上，提醒自己，安静下来的时间同样珍贵。

---

## 睡前，给自己的三件小事

1. 把手机放到够不着的地方
2. 写下今天值得记住的一件事
3. 读十页纸质书，不管读进去多少

这三件事我坚持了一个月。失眠没有完全消失，但睡不着的时候，我不再那么焦虑了。有时候读着读着，就不知不觉睡着了。

今晚，我想早一点关灯。晚安。`,
    platformId: 'rednote',
    themeId: 'template-night',
    fontFamily: "'Noto Serif SC', serif",
    radius: 0,
    profile: { ...DEFAULT_PROFILE, nickname: '叮卡', handle: 'dingcard' },
  },
  aurora: {
    source: `# 让生活变好的 5 个小习惯

不用等到新年才开始改变。下面这五个习惯，每一个都只需要几分钟，坚持一个月，你会感觉到不一样：

1. 起床先喝一杯温水
2. 每天走路六千步
3. 睡前半小时不看手机
4. 每周整理一次房间
5. 写下三件小确幸

**从今天开始，挑一个就好。**

---

## 01 · 起床先喝一杯温水

睡了一整晚，身体其实很缺水。起床后先喝一杯温水，比咖啡更能让人清醒。

把杯子放在床头，醒来伸手就能拿到，这个习惯就很容易坚持下来。水温不要太烫，四十度左右刚好。

## 02 · 每天走路六千步

不必专门去健身房。上下班提前一站下车，午饭后绕楼下走一圈，六千步很快就够了。走路的时候不看手机，顺便看看路边的风景。

---

## 03 · 睡前半小时不看手机

屏幕的光会让大脑以为还是白天。睡前把手机放远一点，换成一本书或一段轻音乐，入睡会快很多。

## 04 · 每周整理一次房间

> 房间乱的时候，心也会跟着乱。

周日晚上花二十分钟，把桌面、衣柜和包整理一遍，扔掉不需要的东西，新的一周会从容很多。

---

## 05 · 写下三件小确幸

每天睡前，写下今天让你开心的三件小事：

- 一杯温度刚好的咖啡
- 同事顺手带来的早餐
- 下班路上的一片晚霞

写着写着你会发现，好事情其实一直都在，只是以前没有留意。

**愿你每一天，都比昨天多爱自己一点。**`,
    platformId: 'rednote',
    themeId: 'template-aurora',
    fontFamily: "'Noto Sans SC', sans-serif",
    radius: 0,
    profile: { ...DEFAULT_PROFILE, nickname: '叮卡', handle: 'dingcard' },
  },
  doc: {
    source: `# Markdown 写作速查

用一套简单的符号排版，写完直接变成一组好看的卡片。这份速查表建议收藏，写的时候随时翻。

> 记住一个原则：符号只是标记，读者看到的是排好的版面。

## 为什么用 Markdown

- 只用键盘，不用去找格式按钮
- 写的时候专心内容，排版交给模板
- 换一套模板，整篇文章一起换样子

---

## 标题与强调

| 写法 | 效果 |
|---|---|
| \`# 标题\` | 一级标题 |
| \`## 小标题\` | 二级标题 |
| \`**文字**\` | **加粗** |
| \`> 引用\` | 引用块 |

一级标题建议只用一次，放在最前面；正文里的段落用二级标题来分。

加粗用来标出一页里最重要的那句话，不要整段加粗。

---

## 列表与待办

- 无序列表用 \`-\` 开头
- 有序列表用 \`1.\` 开头
- [x] 待办事项用 \`- [ ]\` 开头
- [ ] 做完的事改成 \`- [x]\`

## 分页

单独一行写三个短横线，就能在这里换到下一张卡片：

\`\`\`
---
\`\`\`

---

## 小技巧

1. 一张卡片只讲一件事，太长就分页
2. 段落尽量短，三到五行读起来最舒服
3. 重点句子加粗，但一页不要超过两处
4. 图片直接粘贴进来，拖动右下角可以改大小

写完以后，在右边换一套模板看看效果，满意了再导出。

> 小提示：导出前翻一遍每一页，看看有没有一页只剩下一两行字。`,
    platformId: 'rednote',
    themeId: 'template-doc',
    fontFamily: "'Noto Sans SC', sans-serif",
    radius: 0,
    profile: { ...DEFAULT_PROFILE, nickname: '叮卡', handle: 'dingcard' },
  },
  xuan: {
    source: `# 霜降 · 草木黄落

霜降是秋天的最后一个节气。天气渐冷，草木枯黄，清晨的田野上结起一层薄霜。

![远山与晨雾](/templates/art-ink-mountains.svg)

---

## 一候豺乃祭兽

古人把霜降分为三候：一候豺乃祭兽，二候草木黄落，三候蛰虫咸俯。豺狼开始捕猎囤积，树叶纷纷飘落，虫子藏进洞里不再出来。

万物都在为过冬做准备。

这个时节，最宜登高望远。唐人杜牧写道：**停车坐爱枫林晚，霜叶红于二月花。**

---

## 霜降的习俗

- 吃柿子：民间有霜降吃柿子，冬天不感冒的说法
- 赏菊：秋菊正盛，适合约三五好友赏花
- 进补：天气转凉，宜喝一碗暖暖的羊肉汤

> 一年好景君须记，最是橙黄橘绿时。

苏轼的这两句诗，写的正是这个时候：橙子黄了，橘子还绿着，是一年里最好的光景。

---

## 写在节气里

日子一天天变短，夜晚一天天变长。不妨早些回家，煮一壶茶，读几页书。

秋天教会我们的，是放下。树把叶子还给泥土，才能在来年重新发芽。

在这个草木凋零的季节里，也留一点时间，给自己慢慢过冬。等到来年春天，再和万物一起醒来。`,
    platformId: 'rednote',
    themeId: 'template-xuan',
    fontFamily: "'Noto Serif SC', serif",
    radius: 0,
    profile: { ...DEFAULT_PROFILE, nickname: '叮卡', handle: 'dingcard' },
  },
  swiss: {
    source: `# 好的设计，先做减法

每多一个元素，读者就要多花一秒去理解它。动手之前，先问自己：哪些东西可以不要？

以下是我做版面时最常用的四条原则。

![一栋楼的立面，只有一处红色](/templates/editorial-building.webp)

---

## 01 一页只说一件事

一张图里塞进三个观点，读者一个也记不住。把最重要的那句话放大，其余的放到下一页。

判断的方法很简单：遮住标题，问自己这一页在说什么。如果答不上来，就是放得太多了。

## 02 字体不超过两种

一种用于标题，一种用于正文。字体越多，画面越乱；粗细和大小的对比，比换字体更有力量。

---

## 03 用网格对齐

> 对齐是最便宜的高级感。

所有元素都落在同一套网格上：左边对齐，上下间距一致。不用任何装饰，版面也会显得干净、有秩序。

## 04 留白不是浪费

留白让重点被看见。别急着把空的地方填满，空出来的地方，正是读者呼吸的地方。

页边距宁可大一点：四周留出足够的空间，版面会显得从容、自信。

---

## 写在最后

1. 删掉一半的文字
2. 删掉所有没有用处的装饰
3. 只保留一个强调色

做完这三步，再看一遍你的版面。你会发现，删掉的那些东西，没有人会想念它们。

**减到不能再减的时候，设计就完成了。**`,
    platformId: 'rednote',
    themeId: 'template-swiss',
    fontFamily: "'Noto Sans SC', sans-serif",
    radius: 0,
    profile: { ...DEFAULT_PROFILE, nickname: '叮卡', handle: 'dingcard' },
  },
  journal: {
    source: `# 秋天的周末，慢慢过

这周终于没有加班。给自己放一个假，把一直想做的小事，一件一件慢慢做完。

![早上的一杯拿铁](/templates/poster-coffee.svg)

---

## 周六 · 早上

九点自然醒，下楼买了豆浆和刚出锅的油条。回家煮了一杯拿铁，坐在窗边晒太阳，看楼下的银杏一点点变黄。

**今天的目标：什么都不赶。**

- [x] 给绿植浇水
- [x] 把夏天的衣服收起来
- [ ] 读完那本书的最后两章

---

## 周六 · 下午

和朋友去了城西的市集。买了一束干花、一罐桂花蜜，还有一张手绘的明信片，准备寄给远方的老同学。

市集角落有一个旧书摊，淘到一本九十年代的诗集，五块钱。

> 秋天最好的事情，是可以光明正大地慢下来。

傍晚回家的路上，风有点凉，银杏叶已经黄了一半。

---

## 周日 · 小结

1. 走了一万两千步
2. 拍了三十多张照片
3. 吃到了今年第一个烤红薯

晚上把照片整理好，挑了九张发朋友圈，又把这周的花销记进账本。

**本周花销：** 市集 86 元，咖啡豆 58 元，旧书 5 元。

下周也要记得，给自己留一个慢慢过的周末。`,
    platformId: 'rednote',
    themeId: 'template-journal',
    fontFamily: "'LXGW WenKai TC', cursive",
    radius: 0,
    profile: { ...DEFAULT_PROFILE, nickname: '叮卡', handle: 'dingcard' },
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
const SANS = "'Noto Sans SC', sans-serif"
// Display faces (DISPLAY_FONTS in theme.ts), set in their one weight. The
// Latin ones carry decoration and short Latin labels, never a slot that
// Chinese words fill.
const PLAYFAIR = "'Playfair Display', serif"
const ARCHIVO = "'Archivo Black', sans-serif"
const VIBES = "'Great Vibes', cursive"
const BRUSH = "'Ma Shan Zheng', cursive"
const HUANGYOU = "'ZCOOL QingKe HuangYou', sans-serif"

const EDITORIAL = { paper: '#f6f3ea', ink: '#1b1a18', red: '#c23a26', redOnInk: '#e5503a', muted: '#5f584e', band: '#e7dfcf', rule: '#d9d1c2' }

const editorialMasthead = (text: string, color: string) => textNode(text, 88, 72, 640, 48, {
  name: '刊头', fontSize: 24, fontFamily: UI, textFill: solid(color), fontWeight: 'bold', letterSpacing: 6,
})

function createEditorialDocument(): FreeformDocument {
  const { paper, ink, red, redOnInk, muted, band } = EDITORIAL
  const masthead = editorialMasthead
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

const CHECKLIST = {
  paper: '#f3f5ec', green: '#1f4d3a', deep: '#14261d', mint: '#dfe9dc', yellow: '#f2c94c', muted: '#5c6f64', rule: '#dce3d6',
  frame: '#cfd8cb', ruleOnGreen: '#3c6a56', mutedOnGreen: '#a8c3b5',
}

const checklistFooter = (color: string) => textNode('DINGCARD WORKBOOK', 88, 1318, 600, 44, {
  name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(color), fontWeight: 'bold', letterSpacing: 4,
})

function createChecklistDocument(): FreeformDocument {
  const { paper, green, deep, mint, yellow, muted, rule, frame, ruleOnGreen, mutedOnGreen } = CHECKLIST
  const white = '#ffffff'
  const footer = checklistFooter
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
      lineNode(196, y + 110, 796, ruleOnGreen, 2, { name: `验收线${names}` }),
      textNode('✓', 88, y + 8, 76, 60, { name: `勾${names}`, fontSize: 40, fontFamily: UI, textFill: solid(green), fontWeight: 'bold', align: 'center' }),
      textNode(text, 196, y + 2, 796, 72, { name: `验收项${names}`, fontSize: 46, textFill: solid(paper), fontWeight: 'bold' }),
    ]
  }
  return documentFromSlides([
    slide('封面', solid(paper), [
      pathNode('M 24 112 L 96 184 L 236 24', 760, 70, 260, 210, { name: '勾形', stroke: yellow, strokeWidth: 40, cap: 'round', join: 'round' }),
      lineNode(88, 806, 904, frame, 2, { name: '清单线一' }),
      shapeNode('rect', 88, 846, 60, 60, solid(green), { name: '复选框一', cornerRadius: 16 }),
      shapeNode('rect', 88, 976, 60, 60, solid(paper), { name: '复选框二', cornerRadius: 16, stroke: green, strokeWidth: 5 }),
      shapeNode('rect', 88, 1106, 60, 60, solid(paper), { name: '复选框三', cornerRadius: 16, stroke: green, strokeWidth: 5 }),
      lineNode(88, 934, 904, rule, 2, { name: '清单线二' }),
      lineNode(88, 1064, 904, rule, 2, { name: '清单线三' }),
      lineNode(88, 1294, 904, frame, 2, { name: '页脚线' }),
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
      lineNode(88, 164, 904, frame, 2, { name: '刊头线' }),
      shapeNode('rect', 88, 1094, 904, 176, solid(mint), { name: '批注底板', cornerRadius: 32 }),
      lineNode(88, 1294, 904, frame, 2, { name: '页脚线' }),
      textNode('CHECKLIST / 02', 88, 100, 600, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(green), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('开工前确认', 80, 200, 920, 150, { name: '页标题', fontSize: 104, textFill: solid(deep), fontWeight: 'bold', letterSpacing: -1 }),
      ...step(0, '01', '这次只解决一个问题', '范围越清楚，开始越容易。', green, white),
      ...step(1, '02', '一句话写出完成标准', '最后要交付什么，必须能被检查。', yellow, green),
      ...step(2, '03', '把素材收进同一处', '减少寻找和切换，给执行留出连续时间。', green, white),
      textNode('不满足的项目先补齐，不急着进入制作。', 136, 1134, 808, 96, { name: '批注', fontSize: 36, textFill: solid(green), fontWeight: 'bold', lineHeight: 1.45 }),
      footer(green),
    ]),
    slide('验收', solid(green), [
      lineNode(88, 164, 904, ruleOnGreen, 2, { name: '刊头线' }),
      lineNode(88, 1294, 904, ruleOnGreen, 2, { name: '页脚线' }),
      textNode('FINAL CHECK / 03', 88, 100, 600, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('发布前，\n逐项打勾', 80, 196, 920, 290, { name: '标题', fontSize: 112, textFill: solid(paper), fontWeight: 'bold', lineHeight: 1.18, letterSpacing: -1 }),
      ...check(0, '第一页能看懂主题'),
      ...check(1, '中间没有突然拥挤'),
      ...check(2, '最后一页给出下一步'),
      textNode('03 / 03', 80, 960, 920, 230, { name: '完成进度', fontSize: 200, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: -6, lineHeight: 1 }),
      textNode('全部完成，可以导出。', 88, 1196, 904, 72, { name: '结论', fontSize: 40, textFill: solid(paper), fontWeight: 'bold' }),
      footer(mutedOnGreen),
    ]),
  ])
}

/** The workbook's other inner pages (DeckLayoutId): its number plates, tick boxes and note card. */
const CHECKLIST_LAYOUTS: Record<DeckLayoutId, () => FreeformSlide> = {
  // One thing to remember: the page's number on a plate, the heading over the note card.
  statement: () => {
    const { paper, green, deep, mint, yellow, frame } = CHECKLIST
    return slide('重点页', solid(paper), [
      lineNode(88, 164, 904, frame, 2, { name: '刊头线' }),
      shapeNode('rect', 88, 228, 200, 200, solid(green), { name: '编号底板', cornerRadius: 52 }),
      pathNode('M 24 112 L 96 184 L 236 24', 732, 222, 260, 210, { name: '勾形', stroke: yellow, strokeWidth: 40, cap: 'round', join: 'round' }),
      shapeNode('rect', 88, 820, 904, 400, solid(mint), { name: '批注底板', cornerRadius: 32 }),
      lineNode(88, 1294, 904, frame, 2, { name: '页脚线' }),
      textNode('CHECKLIST / 02', 88, 100, 600, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(green), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('02', 88, 228, 200, 200, {
        name: '大页码', fontSize: 104, fontFamily: UI, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center', lineHeight: 1, verticalAlign: 'middle',
      }),
      textNode('这一页\n只记一件事', 80, 470, 920, 300, {
        name: '标题', fontSize: 112, textFill: solid(deep), fontWeight: 'bold', lineHeight: 1.18, letterSpacing: -1, verticalAlign: 'bottom',
      }),
      textNode('把最要紧的那一句写进这张卡片，其余的留到下一页。', 136, 856, 808, 328, {
        name: '导语', fontSize: 44, textFill: solid(green), fontWeight: 'bold', lineHeight: 1.5, verticalAlign: 'middle',
      }),
      checklistFooter(green),
    ])
  },
  // A list to tick off: a rule over each row, a box before each point, its note under it.
  list: () => {
    const { paper, green, deep, muted, rule, frame } = CHECKLIST
    const row = (index: number, text: string, note: string) => {
      const y = 500 + index * 156
      const n = NUMBERED[index]
      return [
        lineNode(88, y - 24, 904, rule, 2, { name: `要点线${n}` }),
        shapeNode('rect', 88, y + 2, 60, 60, solid(paper), { name: `复选框${n}`, cornerRadius: 16, stroke: green, strokeWidth: 5 }),
        textNode(text, 180, y - 4, 812, 68, { name: `要点${n}`, fontSize: 46, textFill: solid(deep), fontWeight: 'bold' }),
        textNode(note, 180, y + 68, 812, 46, { name: `说明${n}`, fontSize: 30, textFill: solid(muted) }),
      ]
    }
    return slide('清单页', solid(paper), [
      lineNode(88, 164, 904, frame, 2, { name: '刊头线' }),
      lineNode(88, 1294, 904, frame, 2, { name: '页脚线' }),
      ...row(0, '先列出要做的事', '一行只写一件'),
      ...row(1, '每一项都能打勾', '做完就能确认'),
      ...row(2, '难的放在前面', '趁精力最好的时候'),
      ...row(3, '留出检查的时间', '最后一项是复查'),
      ...row(4, '做完一项划一项', '看得见的进度最有用'),
      textNode('CHECKLIST / 02', 88, 100, 600, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(green), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('照着清单做', 80, 200, 920, 150, { name: '标题', fontSize: 104, textFill: solid(deep), fontWeight: 'bold', letterSpacing: -1 }),
      textNode('一行只写一件事；做完一项，就在前面的方框里打一个勾。', 88, 362, 904, 100, { name: '导语', fontSize: 34, textFill: solid(muted), lineHeight: 1.45 }),
      checklistFooter(green),
    ])
  },
  // The progress page: green like the final check, the drawing in its yellow.
  data: () => {
    const { paper, green, mint, yellow, ruleOnGreen, mutedOnGreen } = CHECKLIST
    return slide('进度页', solid(green), [
      lineNode(88, 164, 904, ruleOnGreen, 2, { name: '刊头线' }),
      lineNode(88, 1294, 904, ruleOnGreen, 2, { name: '页脚线' }),
      chartNode('bar', ['第一周', '第二周', '第三周', '第四周'], [{ name: '完成', values: [3, 5, 8, 12], color: yellow }], 88, 520, 904, 720, {
        name: '示例图表', showValues: true, ink: mutedOnGreen,
      }),
      textNode('PROGRESS / 02', 88, 100, 600, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('做到哪一步了', 80, 200, 920, 150, { name: '标题', fontSize: 104, textFill: solid(paper), fontWeight: 'bold', letterSpacing: -1 }),
      textNode('一张图看清进度：每周完成的项目，一周比一周多。', 88, 362, 904, 100, { name: '导语', fontSize: 34, textFill: solid(mint), lineHeight: 1.45 }),
      checklistFooter(mutedOnGreen),
    ])
  },
  // The last page for a sentence or two: every box ticked, then the heading and the words.
  closing: () => {
    const { paper, green, yellow, ruleOnGreen, mutedOnGreen } = CHECKLIST
    return slide('完成页', solid(green), [
      lineNode(88, 164, 904, ruleOnGreen, 2, { name: '刊头线' }),
      shapeNode('ellipse', 832, 206, 160, 160, solid(yellow), { name: '完成点' }),
      lineNode(88, 1294, 904, ruleOnGreen, 2, { name: '页脚线' }),
      textNode('FINAL CHECK / 03', 88, 100, 600, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('03 / 03', 80, 196, 720, 180, { name: '完成进度', fontSize: 180, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: -6, lineHeight: 1 }),
      textNode('✓', 832, 206, 160, 160, {
        name: '勾', fontSize: 96, fontFamily: UI, textFill: solid(green), fontWeight: 'bold', align: 'center', lineHeight: 1, verticalAlign: 'middle',
      }),
      textNode('最后，\n只做这一件', 80, 420, 920, 330, {
        name: '标题', fontSize: 112, textFill: solid(paper), fontWeight: 'bold', lineHeight: 1.18, letterSpacing: -1, verticalAlign: 'bottom',
      }),
      textNode('全部打完勾，就合上本子，去做下一件事。', 88, 800, 904, 440, {
        name: '结论', fontSize: 60, textFill: solid(paper), fontWeight: 'bold', lineHeight: 1.4, verticalAlign: 'middle',
      }),
      checklistFooter(mutedOnGreen),
    ])
  },
}

const SIGNAL = { paper: '#f1efe9', black: '#111111', red: '#d63b24', blue: '#2550d9', yellow: '#f4c542', rule: '#cfcbc2', grey: '#55524c' }

function createSignalDocument(): FreeformDocument {
  const { paper, black, red, blue, yellow } = SIGNAL
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

/** The editorial deck's other inner pages (DeckLayoutId), drawn like its section page. */
const EDITORIAL_LAYOUTS: Record<DeckLayoutId, () => FreeformSlide> = {
  // A chapter opener: the page number set large, the heading, one paragraph.
  statement: () => {
    const { paper, ink, red, muted } = EDITORIAL
    return slide('观点页', solid(paper), [
      lineNode(88, 130, 904, ink, 3, { name: '刊头线' }),
      shapeNode('rect', 88, 892, 132, 12, solid(red), { name: '标题线', cornerRadius: 0 }),
      lineNode(88, 1294, 904, ink, 2, { name: '页脚线' }),
      editorialMasthead('THE DINGCARD REVIEW', ink),
      textNode('02', 792, 72, 200, 48, { name: '页码', fontSize: 28, fontFamily: UI, textFill: solid(red), fontWeight: 'bold', align: 'right', letterSpacing: 2 }),
      textNode('02', 64, 160, 640, 360, {
        name: '大页码', fontSize: 340, fontFamily: SERIF, textFill: solid(red), fontWeight: 'bold', lineHeight: 1,
        effect: { type: 'hollow', amount: 30 },
      }),
      textNode('一页只说\n一件事', 80, 556, 920, 300, {
        name: '标题', fontSize: 112, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.2, letterSpacing: -1,
      }),
      textNode('读者翻到这一页，只需要带走一句话。把它写大，其余的留给下一页。', 88, 936, 880, 330, {
        name: '导语', fontSize: 44, fontFamily: SERIF, textFill: solid(muted), lineHeight: 1.6,
      }),
      textNode('阅读顺序 / 02', 88, 1318, 400, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(ink), letterSpacing: 2 }),
    ])
  },
  // Three to five points down the page, each with a line under it.
  list: () => {
    const { paper, ink, red, muted, rule } = EDITORIAL
    const row = (index: number, text: string, note: string) => {
      const y = 652 + index * 124
      const n = NUMBERED[index]
      return [
        lineNode(88, y + 116, 904, rule, 2, { name: `要点线${n}` }),
        textNode(String(index + 1).padStart(2, '0'), 88, y + 6, 100, 56, { name: `编号${n}`, fontSize: 36, fontFamily: UI, textFill: solid(red), fontWeight: 'bold', letterSpacing: 2 }),
        textNode(text, 200, y, 792, 64, { name: `要点${n}`, fontSize: 44, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.3 }),
        textNode(note, 200, y + 64, 792, 44, { name: `说明${n}`, fontSize: 28, fontFamily: UI, textFill: solid(muted), letterSpacing: 1 }),
      ]
    }
    return slide('要点页', solid(paper), [
      lineNode(88, 130, 904, ink, 3, { name: '刊头线' }),
      lineNode(88, 620, 904, ink, 3, { name: '要点顶线' }),
      lineNode(88, 1294, 904, ink, 2, { name: '页脚线' }),
      ...row(0, '先写结论', '第一句就说清楚要什么'),
      ...row(1, '再给依据', '一条依据只说一件事'),
      ...row(2, '最后给动作', '读完知道下一步做什么'),
      ...row(3, '删掉重复', '同一句话不说两遍'),
      ...row(4, '留一句话', '让读者记住的那一句'),
      editorialMasthead('THE DINGCARD REVIEW', ink),
      textNode('02', 792, 72, 200, 48, { name: '页码', fontSize: 28, fontFamily: UI, textFill: solid(red), fontWeight: 'bold', align: 'right', letterSpacing: 2 }),
      textNode('照着这几步\n一项项做', 80, 192, 920, 270, {
        name: '标题', fontSize: 112, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.2, letterSpacing: -1,
      }),
      textNode('一页放三到五条，每条一句话；要补充的写在下面那一行。', 88, 480, 880, 124, {
        name: '导语', fontSize: 36, fontFamily: SERIF, textFill: solid(muted), lineHeight: 1.6,
      }),
      textNode('阅读顺序 / 02', 88, 1318, 400, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(ink), letterSpacing: 2 }),
    ])
  },
  // One drawing across the column, under its heading.
  data: () => {
    const { paper, ink, red, muted } = EDITORIAL
    return slide('数据页', solid(paper), [
      lineNode(88, 130, 904, ink, 3, { name: '刊头线' }),
      lineNode(88, 590, 904, ink, 3, { name: '图表顶线' }),
      lineNode(88, 1294, 904, ink, 2, { name: '页脚线' }),
      chartNode('bar', ['一月', '二月', '三月', '四月', '五月', '六月'], [{ name: '阅读', values: [32, 51, 46, 84, 97, 128], color: red }], 88, 660, 904, 560, { name: '示例图表', showValues: true }),
      editorialMasthead('THE DINGCARD REVIEW', ink),
      textNode('02', 792, 72, 200, 48, { name: '页码', fontSize: 28, fontFamily: UI, textFill: solid(red), fontWeight: 'bold', align: 'right', letterSpacing: 2 }),
      textNode('数字\n先说话', 80, 192, 920, 260, {
        name: '标题', fontSize: 96, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.2, letterSpacing: -1,
      }),
      textNode('一页只放一张图：读者先看到走势，再读这一句解释。', 88, 456, 880, 110, {
        name: '导语', fontSize: 34, fontFamily: SERIF, textFill: solid(muted), lineHeight: 1.6,
      }),
      textNode('阅读顺序 / 02', 88, 1318, 400, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(ink), letterSpacing: 2 }),
    ])
  },
  closing: () => editorialClosing(),
}

/** The editorial closing page for an ending that is only a sentence or two: the words in the middle, the stamp under them. */
function editorialClosing(): FreeformSlide {
  const { paper, ink, red, redOnInk } = EDITORIAL
  return slide('结尾', solid(ink), [
    lineNode(88, 130, 904, paper, 3, { name: '刊头线' }),
    shapeNode('rect', 806, 1080, 176, 176, solid(red), { name: '印章', cornerRadius: 20, rotation: -8 }),
    lineNode(88, 1294, 904, '#3b3732', 2, { name: '页脚线' }),
    editorialMasthead('THE DINGCARD REVIEW · 03', paper),
    textNode('03', 792, 72, 200, 48, { name: '页码', fontSize: 28, fontFamily: UI, textFill: solid(redOnInk), fontWeight: 'bold', align: 'right', letterSpacing: 2 }),
    textNode('最后\n留一句话', 80, 192, 920, 300, {
      name: '标题', fontSize: 112, fontFamily: SERIF, textFill: solid(paper), fontWeight: 'bold', lineHeight: 1.2, letterSpacing: -1,
    }),
    textNode('写到这里就够了，\n把想让读者记住的那一句留在这里。', 88, 500, 860, 560, {
      name: '正文', fontSize: 72, fontFamily: SERIF, textFill: solid('#e4ddd0'), fontWeight: 'bold', lineHeight: 1.5, verticalAlign: 'middle',
    }),
    textNode('完', 806, 1088, 176, 160, {
      name: '印章文字', fontSize: 104, fontFamily: SERIF, textFill: solid(paper), fontWeight: 'bold', align: 'center', lineHeight: 1, rotation: -8,
    }),
    textNode('THE DINGCARD REVIEW', 88, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid('#948b7e'), letterSpacing: 6 }),
  ])
}

/** The signal closing page for an ending that is only a sentence or two: the yellow band, the heading, the sentence large. */
function signalClosing(): FreeformSlide {
  const { paper, black, yellow } = SIGNAL
  return slide('行动', solid(black), [
    shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 1080 + TEMPLATE_EDGE_BLEED * 2, 196 + TEMPLATE_EDGE_BLEED, solid(yellow), { name: '黄色刊头', cornerRadius: 0 }),
    shapeNode('ellipse', 820, 342, 196, 196, solid(yellow), { name: '方向符号' }),
    lineNode(64, 646, 952, '#33312d', 3, { name: '标题线', cap: 'butt' }),
    lineNode(64, 1294, 952, yellow, 3, { name: '页脚线', cap: 'butt' }),
    textNode('SIGNAL / 03 / ACTION', 64, 76, 700, 50, { name: '刊头', fontSize: 30, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 4 }),
    textNode('03', 816, 76, 200, 50, { name: '页码', fontSize: 30, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', align: 'right' }),
    textNode('最后，\n记住这一句。', 64, 280, 740, 320, { name: '主标题', fontSize: 116, textFill: solid(paper), fontWeight: 'bold', lineHeight: 1.18 }),
    textNode('→', 820, 368, 196, 140, { name: '箭头文字', fontSize: 120, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', align: 'center', lineHeight: 1 }),
    textNode('能被执行的观点，才会真正留下来。今天就试一次，明天回来看结果。', 64, 700, 952, 560, {
      name: '收束句', fontSize: 64, textFill: solid(yellow), fontWeight: 'bold', lineHeight: 1.35, verticalAlign: 'middle',
    }),
    textNode('DINGCARD SIGNAL', 64, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(paper), fontWeight: 'bold', letterSpacing: 4 }),
  ])
}

/** The signal deck's other inner pages (DeckLayoutId), in its blocks of colour. */
const SIGNAL_LAYOUTS: Record<DeckLayoutId, () => FreeformSlide> = {
  // The cover's claim, made a page: the page number in the red block, the heading, the claim.
  statement: () => {
    const { paper, black, red, blue } = SIGNAL
    return slide('主张页', solid(paper), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 436 + TEMPLATE_EDGE_BLEED, 376 + TEMPLATE_EDGE_BLEED, solid(red), { name: '红色象限', cornerRadius: 0 }),
      shapeNode('rect', 470, 330, 220, 20, solid(blue), { name: '蓝色坐标轴', cornerRadius: 0 }),
      lineNode(64, 760, 952, black, 10, { name: '中部网格线', cap: 'butt' }),
      lineNode(64, 1294, 952, black, 3, { name: '页脚线', cap: 'butt' }),
      textNode('02', 40, 96, 360, 240, { name: '大页码', fontSize: 230, fontFamily: UI, textFill: solid(paper), fontWeight: 'bold', letterSpacing: -10, lineHeight: 1 }),
      textNode('SIGNAL / 02', 470, 72, 546, 44, { name: '刊头', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', align: 'right', letterSpacing: 4 }),
      textNode('ONE POINT →', 470, 252, 546, 64, { name: '英文主张', fontSize: 40, fontFamily: UI, textFill: solid(blue), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('一页\n一个判断', 64, 410, 952, 320, { name: '主标题', fontSize: 120, textFill: solid(black), fontWeight: 'bold', letterSpacing: -4, lineHeight: 1.15 }),
      textNode('先把判断说出来，理由放到后面几页；这一页只负责让人记住它。', 64, 800, 952, 460, {
        name: '主张', fontSize: 60, textFill: solid(black), fontWeight: 'bold', lineHeight: 1.35, verticalAlign: 'middle',
      }),
      textNode('DINGCARD SIGNAL', 64, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 4 }),
    ])
  },
  // The section's lettered column, five deep, without the conclusion bar.
  list: () => {
    const { paper, black, red, blue, rule } = SIGNAL
    const point = (index: number, letter: string, color: string, text: string) => {
      const y = 196 + index * 212
      const n = NUMBERED[index]
      return [
        lineNode(512, y + 182, 504, rule, 2, { name: `证据线${n}` }),
        textNode(letter, 512, y, 96, 110, { name: `证据编号${n}`, fontSize: 96, fontFamily: UI, textFill: solid(color), fontWeight: 'bold', lineHeight: 1 }),
        textNode(text, 624, y + 10, 392, 130, { name: `证据${n}`, fontSize: 40, textFill: solid(black), fontWeight: 'bold', lineHeight: 1.35 }),
      ]
    }
    return slide('清单页', solid(paper), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 456 + TEMPLATE_EDGE_BLEED, 1440 + TEMPLATE_EDGE_BLEED * 2, solid(blue), { name: '蓝色分区', cornerRadius: 0 }),
      lineNode(512, 164, 504, black, 4, { name: '右栏顶线', cap: 'butt' }),
      lineNode(512, 1294, 504, black, 3, { name: '页脚线', cap: 'butt' }),
      textNode('HOW', 52, 88, 390, 170, { name: '英文标题', fontSize: 150, fontFamily: UI, textFill: solid(paper), fontWeight: 'bold', letterSpacing: 2, lineHeight: 1 }),
      textNode('照着顺序\n一条条来', 56, 330, 370, 240, { name: '主标题', fontSize: 88, textFill: solid('#ffffff'), fontWeight: 'bold', lineHeight: 1.2 }),
      textNode('每一条只说一件事，读者照着做就不会漏掉。', 60, 640, 360, 560, { name: '左栏正文', fontSize: 34, textFill: solid('#d7e0ff'), lineHeight: 1.65 }),
      textNode('02', 816, 88, 200, 60, { name: '页码', fontSize: 40, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', align: 'right' }),
      ...point(0, 'A', red, '先把判断写在最前面'),
      ...point(1, 'B', blue, '每条依据单独一行'),
      ...point(2, 'C', black, '数字比形容词有力'),
      ...point(3, 'D', red, '反面的例子也写上'),
      ...point(4, 'E', blue, '最后一条给出动作'),
      textNode('SIGNAL / 02', 512, 1318, 400, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 4 }),
    ])
  },
  // A blue head band over one drawing across the page.
  data: () => {
    const { paper, black, blue, grey } = SIGNAL
    return slide('数据页', solid(paper), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 1080 + TEMPLATE_EDGE_BLEED * 2, 520 + TEMPLATE_EDGE_BLEED, solid(blue), { name: '蓝色刊头', cornerRadius: 0 }),
      lineNode(64, 660, 952, black, 4, { name: '图表顶线', cap: 'butt' }),
      lineNode(64, 1294, 952, black, 3, { name: '页脚线', cap: 'butt' }),
      chartNode('bar', ['三月', '四月', '五月', '六月'], [{ name: '阅读', values: [32, 51, 84, 128], color: blue }], 64, 700, 952, 560, { name: '示例图表', showValues: true }),
      textNode('DATA', 52, 72, 600, 150, { name: '英文标题', fontSize: 130, fontFamily: UI, textFill: solid(paper), fontWeight: 'bold', letterSpacing: 2, lineHeight: 1 }),
      textNode('02', 816, 88, 200, 60, { name: '页码', fontSize: 40, fontFamily: UI, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'right' }),
      textNode('数字比\n形容词有力', 56, 250, 968, 240, { name: '主标题', fontSize: 88, textFill: solid('#ffffff'), fontWeight: 'bold', lineHeight: 1.2 }),
      textNode('把最关键的那个数放大：读者先看图，再读这一句解释。', 64, 548, 952, 96, { name: '导语', fontSize: 34, textFill: solid(grey), lineHeight: 1.5 }),
      textNode('SIGNAL / 02', 64, 1318, 400, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 4 }),
    ])
  },
  closing: () => signalClosing(),
}

const NIGHT_FLIGHT = { night: '#0e1824', cream: '#f4eee2', amber: '#f2b84b', teal: '#6fb7c8', coral: '#e8664a', muted: '#a6b3bf', rule: '#26374a', axis: '#3d5570' }

function createNightFlightDocument(): FreeformDocument {
  const { night, cream, amber, teal, coral, muted, rule, axis } = NIGHT_FLIGHT
  const record = (index: number, time: string, color: string, text: string) => {
    const y = 470 + index * 220
    const names = ['一', '二', '三'][index]
    return [
      shapeNode('ellipse', 100, y + 16, 28, 28, solid(color), {
        name: `时间点${names}`,
        ...(index === 2 ? { shadow: { color, blur: 18, offsetX: 0, offsetY: 0 } } : {}),
      }),
      ...(index < 2 ? [
        verticalLineNode(114, y + 56, y + 224, axis, 4, { name: `时间轴${names}` }),
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

/** The night flight's other inner pages (DeckLayoutId): the log's serif headings, its lit dots and the route home. */
const NIGHT_FLIGHT_LAYOUTS: Record<DeckLayoutId, () => FreeformSlide> = {
  // A waypoint: the page's number drawn in outline, the time, the heading over its paragraph.
  statement: () => {
    const { night, cream, amber, teal, muted, rule } = NIGHT_FLIGHT
    return slide('航点页', solid(night), [
      lineNode(88, 156, 904, rule, 2, { name: '刊头线' }),
      shapeNode('ellipse', 92, 520, 24, 24, solid(amber), { name: '航点', shadow: { color: amber, blur: 18, offsetX: 0, offsetY: 0 } }),
      lineNode(88, 1294, 904, rule, 2, { name: '页脚线' }),
      textNode('NIGHT FLIGHT / LOG 02', 88, 92, 600, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(muted), fontWeight: 'bold', letterSpacing: 3 }),
      textNode('02', 64, 190, 640, 300, {
        name: '大页码', fontSize: 300, fontFamily: SERIF, textFill: solid(teal), fontWeight: 'bold', lineHeight: 1,
        effect: { type: 'hollow', amount: 24 },
      }),
      textNode('00:15 · MIDWAY', 136, 508, 600, 50, { name: '当前时间', fontSize: 30, fontFamily: UI, textFill: solid(amber), fontWeight: 'bold', letterSpacing: 3 }),
      textNode('这一段\n只记一件事', 80, 580, 920, 300, {
        name: '标题', fontSize: 112, fontFamily: SERIF, textFill: solid(cream), fontWeight: 'bold', lineHeight: 1.25, verticalAlign: 'bottom',
      }),
      textNode('夜里想到的那句话，先原样留下；理由和细节，等天亮再补。', 88, 920, 904, 340, {
        name: '导语', fontSize: 44, textFill: solid(muted), lineHeight: 1.6, verticalAlign: 'middle',
      }),
      textNode('31.23°N · ROUTE ACTIVE', 88, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(teal), fontWeight: 'bold', letterSpacing: 3 }),
    ])
  },
  // The flight log, five entries deep: a rule over each, a lit dot before it.
  list: () => {
    const { night, cream, amber, teal, coral, muted, rule } = NIGHT_FLIGHT
    const colors = [amber, teal, coral, amber, teal]
    const entry = (index: number, text: string, note: string) => {
      const y = 500 + index * 156
      const n = NUMBERED[index]
      return [
        lineNode(88, y - 24, 904, rule, 2, { name: `记录线${n}` }),
        shapeNode('ellipse', 100, y + 18, 28, 28, solid(colors[index]), { name: `时间点${n}`, shadow: { color: colors[index], blur: 14, offsetX: 0, offsetY: 0 } }),
        textNode(text, 168, y - 4, 824, 68, { name: `记录${n}`, fontSize: 46, fontFamily: SERIF, textFill: solid(cream), fontWeight: 'bold' }),
        textNode(note, 168, y + 68, 824, 46, { name: `说明${n}`, fontSize: 30, textFill: solid(muted) }),
      ]
    }
    return slide('记录页', solid(night), [
      lineNode(88, 156, 904, rule, 2, { name: '刊头线' }),
      lineNode(88, 1294, 904, rule, 2, { name: '页脚线' }),
      ...entry(0, '留下最初那句话', '不改字，不加修饰'),
      ...entry(1, '写下它从哪里来', '一本书、一段路、一场对话'),
      ...entry(2, '标出还缺什么', '缺的部分用问号代替'),
      ...entry(3, '给它起个名字', '方便明天找回来'),
      ...entry(4, '然后去睡觉', '剩下的交给早上'),
      textNode('NIGHT FLIGHT / LOG 02', 88, 92, 600, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(muted), fontWeight: 'bold', letterSpacing: 3 }),
      textNode('今夜的记录', 80, 196, 920, 150, { name: '标题', fontSize: 104, fontFamily: SERIF, textFill: solid(cream), fontWeight: 'bold' }),
      textNode('一条记录只写一件事，补充的话放在下面那一行。', 88, 362, 904, 100, { name: '导语', fontSize: 34, textFill: solid(muted), lineHeight: 1.5 }),
      textNode('31.23°N · ROUTE ACTIVE', 88, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(teal), fontWeight: 'bold', letterSpacing: 3 }),
    ])
  },
  // The instrument page: one drawing under the heading, in the cabin's amber.
  data: () => {
    const { night, cream, amber, muted, rule } = NIGHT_FLIGHT
    return slide('仪表页', solid(night), [
      lineNode(88, 156, 904, rule, 2, { name: '刊头线' }),
      lineNode(88, 1294, 904, rule, 2, { name: '页脚线' }),
      chartNode('line', ['22:00', '23:00', '00:00', '01:00', '02:00', '03:00'], [{ name: '高度', values: [12, 31, 38, 39, 36, 24], color: amber }], 88, 520, 904, 720, {
        name: '示例图表', showValues: true, ink: muted,
      }),
      textNode('NIGHT FLIGHT / LOG 02', 88, 92, 600, 44, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(muted), fontWeight: 'bold', letterSpacing: 3 }),
      textNode('00:15 · ALTITUDE', 692, 92, 300, 44, { name: '当前时间', fontSize: 26, fontFamily: UI, textFill: solid(amber), fontWeight: 'bold', align: 'right', letterSpacing: 3 }),
      textNode('一路的高度', 80, 196, 920, 150, { name: '标题', fontSize: 104, fontFamily: SERIF, textFill: solid(cream), fontWeight: 'bold' }),
      textNode('起飞后一路爬升，过了午夜趋于平稳，天亮前开始下降。', 88, 362, 904, 100, { name: '导语', fontSize: 34, textFill: solid(muted), lineHeight: 1.5 }),
      textNode('DINGCARD / NIGHT FLIGHT', 88, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(muted), fontWeight: 'bold', letterSpacing: 3 }),
    ])
  },
  // Landing for a sentence or two: the arrival bar, the heading, the route flown, the words above the sunrise.
  closing: () => {
    const { night, cream, amber, teal, coral } = NIGHT_FLIGHT
    return slide('抵达', stopsPaint([[0, '#f7f1e6'], [1, '#f3dcbd']], 180), [
      shapeNode('ellipse', 600, 1050, 600, 600, { type: 'radial-gradient', stops: [{ offset: 0, color: '#f6b04d' }, { offset: 1, color: '#ef7a52' }] }, { name: '朝阳', opacity: 0.9 }),
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 1080 + TEMPLATE_EDGE_BLEED * 2, 172 + TEMPLATE_EDGE_BLEED, solid(night), { name: '抵达信息栏', cornerRadius: 0 }),
      shapeNode('ellipse', 88, 600, 40, 40, solid(amber), { name: '起点' }),
      shapeNode('ellipse', 520, 600, 40, 40, solid(teal), { name: '中点' }),
      shapeNode('ellipse', 948, 596, 48, 48, solid(coral), { name: '终点' }),
      lineNode(136, 614, 376, night, 3, { name: '抵达线一' }),
      lineNode(568, 614, 372, night, 3, { name: '抵达线二' }),
      lineNode(88, 1294, 904, night, 2, { name: '页脚线' }),
      textNode('ARRIVAL · 08:30', 88, 64, 600, 56, { name: '抵达时间', fontSize: 32, fontFamily: UI, textFill: solid(cream), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('ROUTE 03', 692, 66, 300, 52, { name: '路线编号', fontSize: 28, fontFamily: UI, textFill: solid(amber), fontWeight: 'bold', align: 'right', letterSpacing: 3 }),
      textNode('天亮了，\n就到这里', 80, 236, 920, 300, { name: '主标题', fontSize: 112, fontFamily: SERIF, textFill: solid(night), fontWeight: 'bold', lineHeight: 1.22 }),
      textNode('夜里记下的，天亮后再读一遍；\n还想继续写的，就是今天的事。', 88, 700, 904, 420, {
        name: '收束句', fontSize: 60, textFill: solid(night), fontWeight: 'bold', lineHeight: 1.4, verticalAlign: 'middle',
      }),
      textNode('DINGCARD / NIGHT FLIGHT', 88, 1318, 600, 44, { name: '页脚', fontSize: 24, fontFamily: UI, textFill: solid(night), fontWeight: 'bold', letterSpacing: 3 }),
    ])
  },
}

const BRUTALIST = { concrete: '#ecebe6', black: '#0d0d0d', yellow: '#f5e900', grey: '#3a3a36' }

function createBrutalistDocument(): FreeformDocument {
  const { concrete, black, yellow, grey } = BRUTALIST
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

/** The brutalist deck's other inner pages (DeckLayoutId): black blocks, heavy rules, the yellow marker. */
const BRUTALIST_LAYOUTS: Record<DeckLayoutId, () => FreeformSlide> = {
  // A manifesto of one line: the number in a black block, the heading marked in yellow, the words under it.
  statement: () => {
    const { concrete, black, yellow } = BRUTALIST
    return slide('宣言页', solid(concrete), [
      lineNode(88, 144, 904, black, 8, { name: '刊头线', cap: 'butt' }),
      shapeNode('rect', 88, 200, 220, 220, solid(black), { name: '编号块', cornerRadius: 0, shadow: { color: yellow, blur: 0, offsetX: 16, offsetY: 16 } }),
      lineNode(88, 1288, 904, black, 6, { name: '页脚线', cap: 'butt' }),
      textNode('MANIFESTO / 02', 88, 84, 520, 48, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 8 }),
      textNode('02', 88, 200, 220, 220, {
        name: '大页码', fontSize: 150, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', align: 'center', lineHeight: 1, letterSpacing: -6, verticalAlign: 'middle',
      }),
      textNode('→', 360, 200, 400, 220, { name: '箭头', fontSize: 200, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', lineHeight: 1, verticalAlign: 'middle' }),
      textNode('只说\n一件事', 80, 470, 920, 340, {
        name: '标题', fontSize: 140, textFill: solid(black), fontWeight: 'bold', lineHeight: 1.15, letterSpacing: -4, verticalAlign: 'bottom',
        effect: { type: 'marker', color: yellow, amount: 45 },
      }),
      textNode('一页只放一个判断。写不下的，就是下一页的事。', 88, 860, 904, 390, {
        name: '导语', fontSize: 52, textFill: solid(black), fontWeight: 'bold', lineHeight: 1.4, verticalAlign: 'middle',
      }),
      textNode('BRUTAL PAGE PRESS', 88, 1312, 600, 44, { name: '刊尾', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 6 }),
    ])
  },
  // The rules, five deep: a black block with each number, the point marked in yellow, a heavy rule under it.
  list: () => {
    const { concrete, black, yellow, grey } = BRUTALIST
    const rule = (index: number, text: string, note: string) => {
      const y = 480 + index * 156
      const n = NUMBERED[index]
      return [
        shapeNode('rect', 88, y, 96, 96, solid(black), { name: `编号块${n}`, cornerRadius: 0 }),
        lineNode(88, y + 126, 904, black, 5, { name: `规则线${n}`, cap: 'butt' }),
        textNode(String(index + 1), 88, y + 14, 96, 68, { name: `编号${n}`, fontSize: 60, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', align: 'center', lineHeight: 1 }),
        textNode(text, 216, y - 4, 776, 70, {
          name: `规则${n}`, fontSize: 46, textFill: solid(black), fontWeight: 'bold',
          effect: { type: 'marker', color: yellow, amount: 45 },
        }),
        textNode(note, 216, y + 66, 776, 46, { name: `注释${n}`, fontSize: 30, textFill: solid(grey) }),
      ]
    }
    return slide('规则页', solid(concrete), [
      lineNode(88, 144, 904, black, 8, { name: '刊头线', cap: 'butt' }),
      lineNode(88, 1288, 904, black, 6, { name: '页脚线', cap: 'butt' }),
      ...rule(0, '先说结论', '别让人猜你想说什么'),
      ...rule(1, '一条只说一件事', '两件事就拆成两条'),
      ...rule(2, '能删就删', '删到不能再删为止'),
      ...rule(3, '用数字说话', '数字比形容词有力'),
      ...rule(4, '最后给出动作', '读完就知道做什么'),
      textNode('RULES / 02', 88, 84, 520, 48, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 8 }),
      textNode('照规矩来', 80, 190, 920, 160, { name: '页标题', fontSize: 112, textFill: solid(black), fontWeight: 'bold', letterSpacing: -4 }),
      textNode('每条规则一行，说明写在它下面。没有例外。', 88, 360, 904, 96, { name: '导语', fontSize: 34, textFill: solid(grey), lineHeight: 1.45 }),
      textNode('BRUTAL PAGE / RULES', 88, 1312, 600, 44, { name: '刊尾', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 6 }),
    ])
  },
  // The numbers page: a black head over one drawing in black.
  data: () => {
    const { concrete, black, yellow } = BRUTALIST
    return slide('数据页', solid(concrete), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 1080 + TEMPLATE_EDGE_BLEED * 2, 520 + TEMPLATE_EDGE_BLEED, solid(black), { name: '黑色刊头', cornerRadius: 0 }),
      lineNode(88, 1288, 904, black, 6, { name: '页脚线', cap: 'butt' }),
      chartNode('bar', ['一月', '二月', '三月', '四月', '五月'], [{ name: '数量', values: [12, 19, 27, 41, 66], color: black }], 88, 680, 904, 560, {
        name: '示例图表', showValues: true, ink: black,
      }),
      textNode('DATA / 02', 88, 84, 520, 48, { name: '刊头', fontSize: 26, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: 8 }),
      textNode('数字\n不说谎', 80, 150, 920, 330, {
        name: '标题', fontSize: 120, textFill: solid(concrete), fontWeight: 'bold', lineHeight: 1.15, letterSpacing: -4, verticalAlign: 'bottom',
      }),
      textNode('先看图，再读这一句：涨了多少，一眼就看得出来。', 88, 556, 904, 100, { name: '导语', fontSize: 34, textFill: solid(black), lineHeight: 1.45 }),
      textNode('BRUTAL PAGE PRESS', 88, 1312, 600, 44, { name: '刊尾', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 6 }),
    ])
  },
  // The last word for a sentence or two: yellow page, black side bar, the heading huge on the heavy rule, the words under it.
  closing: () => {
    const { black, yellow } = BRUTALIST
    return slide('结束', solid(yellow), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 196 + TEMPLATE_EDGE_BLEED, 1440 + TEMPLATE_EDGE_BLEED * 2, solid(black), { name: '边栏', cornerRadius: 0 }),
      lineNode(240, 740, 752, black, 12, { name: '结尾线', cap: 'butt' }),
      lineNode(240, 1288, 752, black, 6, { name: '页脚线', cap: 'butt' }),
      textNode('END / 03', 62, 88, 60, 420, { name: '边栏刊头', fontSize: 34, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: 8, vertical: true }),
      textNode('LOUD / 03', 62, 960, 60, 400, { name: '边栏页脚', fontSize: 34, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: 8, vertical: true }),
      textNode('就说\n到这', 236, 160, 790, 540, {
        name: '结尾大字', fontSize: 200, textFill: solid(black), fontWeight: 'bold', lineHeight: 1.1, letterSpacing: -8, verticalAlign: 'bottom',
      }),
      textNode('最后一句话，站直了说完，不加感叹号。', 240, 790, 752, 460, {
        name: '正文', fontSize: 60, textFill: solid(black), fontWeight: 'bold', lineHeight: 1.35, verticalAlign: 'middle',
      }),
      textNode('BRUTAL PAGE PRESS', 240, 1312, 600, 44, { name: '刊尾', fontSize: 24, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 6 }),
    ])
  },
}

const BLUEPRINT = { paper: '#174478', chalk: '#f2f6fc', line: '#b9cde6', yellow: '#ffd166' }

/** A drafting grid: fine lines every `step`, drawn as one path over the page. */
function blueprintGrid(name: string, step: number, opacity: number): FreeformSceneNode {
  const columns = Array.from({ length: Math.floor(1080 / step) }, (_, index) => `M ${(index + 1) * step} 0 V 1440`)
  const rows = Array.from({ length: Math.floor(1440 / step) }, (_, index) => `M 0 ${(index + 1) * step} H 1080`)
  return pathNode([...columns, ...rows].join(' '), 0, 0, 1080, 1440, { name, stroke: '#ffffff', strokeWidth: 1.5, opacity, cap: 'butt' })
}

/** The blueprint's page: both grids over the blue. */
const blueprintGrids = () => [blueprintGrid('细网格', 60, 0.09), blueprintGrid('粗网格', 240, 0.16)]

/** A dashed frame drawn inside its box. */
const blueprintBox = (name: string, x: number, y: number, width: number, height: number) => pathNode(
  `M 2 2 H ${width - 2} V ${height - 2} H 2 Z`, x, y, width, height, { name, stroke: BLUEPRINT.chalk, strokeWidth: 3, dash: 12, cap: 'butt', join: 'miter' },
)

const blueprintSheet = (number: string) => textNode(number, 692, 86, 300, 44, {
  name: '图纸编号', fontSize: 26, fontFamily: UI, textFill: solid(BLUEPRINT.chalk), fontWeight: 'bold', align: 'right', letterSpacing: 4,
})

const blueprintLabel = (text: string, x: number, y: number, name: string) => textNode(text, x, y, 280, 36, {
  name, fontSize: 22, fontFamily: UI, textFill: solid(BLUEPRINT.line), letterSpacing: 4,
})

function createBlueprintDocument(): FreeformDocument {
  const { paper, chalk, line, yellow } = BLUEPRINT
  const grid = blueprintGrid
  const box = blueprintBox
  const sheet = blueprintSheet
  const label = blueprintLabel
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
      // Turned, a line's words take up more height the wider they set: the
      // status keeps clear of the title in a wider system font (Linux).
      textNode('APPROVED · 可交付', 133, 1000, 560, 50, { name: '签收状态', fontSize: 30, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', align: 'center', letterSpacing: 4, rotation: -6 }),
      textNode('签名 / DATE', 760, 1112, 232, 40, { name: '签名标注', fontSize: 22, fontFamily: UI, textFill: solid(line), align: 'right', letterSpacing: 3 }),
      textNode('BLUEPRINT / FINAL', 88, 1318, 600, 44, { name: '页脚', fontSize: 22, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
      textNode('PLAN A APPROVED', 592, 1318, 400, 44, { name: '比例', fontSize: 22, fontFamily: UI, textFill: solid(line), align: 'right', letterSpacing: 6 }),
    ]),
  ])
}

/** The blueprint's other inner pages (DeckLayoutId): drawn on its grid with callouts, dimension lines and a sign-off. */
const BLUEPRINT_LAYOUTS: Record<DeckLayoutId, () => FreeformSlide> = {
  // A detail drawing: the page's number in a callout circle, the heading, a dimension line over its paragraph.
  statement: () => {
    const { paper, chalk, line } = BLUEPRINT
    return slide('详图', solid(paper), [
      ...blueprintGrids(),
      shapeNode('ellipse', 88, 196, 240, 240, { type: 'transparent' }, { name: '索引圆', stroke: chalk, strokeWidth: 4 }),
      lineNode(352, 310, 640, line, 2, { name: '索引线', dash: 10 }),
      lineNode(88, 872, 904, chalk, 2, { name: '尺寸标注', startCap: 'arrow', endCap: 'arrow' }),
      textNode('DETAIL', 88, 86, 600, 44, { name: '刊头', fontSize: 24, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
      blueprintSheet('BP-02'),
      textNode('02', 88, 196, 240, 240, {
        name: '大页码', fontSize: 120, fontFamily: UI, textFill: solid(chalk), fontWeight: 'bold', align: 'center', lineHeight: 1, verticalAlign: 'middle',
      }),
      textNode('DETAIL A · 1 : 5', 352, 252, 640, 40, { name: '索引标注', fontSize: 22, fontFamily: UI, textFill: solid(line), letterSpacing: 4 }),
      textNode('先把这一块\n画清楚', 80, 480, 920, 330, {
        name: '标题', fontSize: 112, textFill: solid(chalk), fontWeight: 'bold', lineHeight: 1.2, verticalAlign: 'bottom',
      }),
      textNode('一张详图只放大一个部分：尺寸、材料、做法，都在这一页说清。', 88, 912, 904, 360, {
        name: '导语', fontSize: 44, textFill: solid(line), lineHeight: 1.55, verticalAlign: 'middle',
      }),
      textNode('BLUEPRINT / DETAIL', 88, 1318, 600, 44, { name: '页脚', fontSize: 22, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
    ])
  },
  // The parts list: a dashed rule over each row, each point numbered in a drawn box.
  list: () => {
    const { paper, chalk, line } = BLUEPRINT
    const part = (index: number, text: string, note: string) => {
      const y = 500 + index * 156
      const n = NUMBERED[index]
      return [
        lineNode(88, y - 24, 904, line, 2, { name: `部件线${n}`, dash: 10 }),
        pathNode('M 2 2 H 82 V 82 H 2 Z', 88, y, 84, 84, { name: `编号框${n}`, stroke: chalk, strokeWidth: 3, cap: 'butt', join: 'miter' }),
        textNode(String(index + 1).padStart(2, '0'), 88, y + 18, 84, 48, { name: `编号${n}`, fontSize: 36, fontFamily: UI, textFill: solid(chalk), fontWeight: 'bold', align: 'center', lineHeight: 1.2 }),
        textNode(text, 204, y - 4, 788, 66, { name: `部件${n}`, fontSize: 46, textFill: solid(chalk), fontWeight: 'bold' }),
        textNode(note, 204, y + 66, 788, 46, { name: `规格${n}`, fontSize: 30, textFill: solid(line) }),
      ]
    }
    return slide('部件表', solid(paper), [
      ...blueprintGrids(),
      ...part(0, '先定总尺寸', '量两遍，再下笔'),
      ...part(1, '列出每个部件', '一行一个，不合并'),
      ...part(2, '写清楚材料', '规格和数量都要有'),
      ...part(3, '标出装配顺序', '先骨架，后细节'),
      ...part(4, '留出检查的位置', '每一步都能核对'),
      textNode('PARTS LIST', 88, 86, 600, 44, { name: '刊头', fontSize: 24, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
      blueprintSheet('BP-02'),
      textNode('部件清单', 80, 196, 920, 150, { name: '标题', fontSize: 104, textFill: solid(chalk), fontWeight: 'bold' }),
      textNode('一行一个部件，规格写在下面那一行。', 88, 362, 904, 100, { name: '导语', fontSize: 34, textFill: solid(line), lineHeight: 1.5 }),
      textNode('BLUEPRINT / PARTS', 88, 1318, 600, 44, { name: '页脚', fontSize: 22, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
    ])
  },
  // A measured drawing: one chart under a yellow dimension line.
  data: () => {
    const { paper, chalk, line, yellow } = BLUEPRINT
    return slide('数据图', solid(paper), [
      ...blueprintGrids(),
      lineNode(88, 476, 904, yellow, 2, { name: '尺寸标注', startCap: 'arrow', endCap: 'arrow' }),
      chartNode('bar', ['基础', '结构', '水电', '装修', '验收'], [{ name: '工期', values: [12, 30, 18, 26, 6], color: yellow }], 88, 540, 904, 700, {
        name: '示例图表', showValues: true, ink: line,
      }),
      textNode('SECTION', 88, 86, 600, 44, { name: '刊头', fontSize: 24, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
      blueprintSheet('BP-02'),
      textNode('工期怎么分', 80, 196, 920, 150, { name: '标题', fontSize: 104, textFill: solid(chalk), fontWeight: 'bold' }),
      textNode('结构最费时间，验收最快。每一段的天数都标在柱子上。', 88, 362, 904, 100, { name: '导语', fontSize: 34, textFill: solid(line), lineHeight: 1.5 }),
      textNode('BLUEPRINT / DATA', 88, 1318, 600, 44, { name: '页脚', fontSize: 22, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
    ])
  },
  // Signed off for a sentence or two: the heading, the approval stamp, the words, the signature line.
  closing: () => {
    const { paper, chalk, line, yellow } = BLUEPRINT
    return slide('验收', solid(paper), [
      ...blueprintGrids(),
      shapeNode('rect', 88, 586, 560, 150, { type: 'transparent' }, { name: '签收底板', cornerRadius: 20, stroke: yellow, strokeWidth: 6, rotation: -6 }),
      lineNode(700, 1222, 292, chalk, 2, { name: '签名线' }),
      textNode('CHECK', 88, 86, 600, 44, { name: '刊头', fontSize: 24, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
      blueprintSheet('BP-03'),
      textNode('按图\n交付', 80, 236, 920, 300, { name: '主标题', fontSize: 112, textFill: solid(chalk), fontWeight: 'bold', lineHeight: 1.2 }),
      textNode('APPROVED', 88, 616, 560, 90, { name: '签收标题', fontSize: 64, fontFamily: UI, textFill: solid(yellow), fontWeight: 'bold', align: 'center', letterSpacing: 10, rotation: -6 }),
      textNode('图纸和实物一一对上，这一版就可以交付。', 88, 800, 904, 400, {
        name: '导语', fontSize: 60, textFill: solid(chalk), fontWeight: 'bold', lineHeight: 1.4, verticalAlign: 'middle',
      }),
      textNode('签名 / DATE', 700, 1240, 292, 40, { name: '签名标注', fontSize: 22, fontFamily: UI, textFill: solid(line), align: 'right', letterSpacing: 3 }),
      textNode('BLUEPRINT / FINAL', 88, 1318, 600, 44, { name: '页脚', fontSize: 22, fontFamily: UI, textFill: solid(line), letterSpacing: 6 }),
    ])
  },
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
  options: { shape?: 'rect' | 'ellipse'; cornerRadius?: number; rotation?: number; filter?: SceneFilter } = {},
): FreeformSceneNode {
  return shapeNode(options.shape ?? 'rect', x, y, width, height, {
    type: 'image', src, fit: 'cover', framing: createDefaultImageFraming(),
  }, { name, cornerRadius: options.cornerRadius ?? 0, rotation: options.rotation, filter: options.filter })
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
function illustrationNode(
  name: string,
  src: string,
  alt: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { rotation?: number } = {},
): FreeformSceneNode {
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
    rotation: options.rotation ?? 0,
    scale: 1,
    src,
    alt,
    fit: 'contain',
    framing: createDefaultImageFraming(),
  }
}

function chartNode(
  chartKind: FreeformChartElement['chartKind'],
  labels: readonly string[],
  series: ReadonlyArray<{ name?: string; values: readonly number[]; color: string }>,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    name?: string
    showValues?: boolean
    barMode?: FreeformChartElement['barMode']
    showTicks?: boolean
    showLegend?: boolean
    ink?: string
    rotation?: number
    opacity?: number
  } = {},
): FreeformChartElement {
  return {
    id: uuid(),
    name: options.name ?? '图表',
    locked: false,
    hidden: false,
    type: 'chart',
    x,
    y,
    width,
    height,
    rotation: options.rotation ?? 0,
    scale: 1,
    chartKind,
    labels: [...labels],
    series: series.map((entry) => ({
      values: [...entry.values],
      color: entry.color,
      ...(entry.name !== undefined ? { name: entry.name } : {}),
    })),
    ...(options.showValues ? { showValues: true } : {}),
    ...(options.barMode ? { barMode: options.barMode } : {}),
    ...(options.showTicks === false ? { showTicks: false } : {}),
    ...(options.showLegend !== undefined ? { showLegend: options.showLegend } : {}),
    ...(options.ink !== undefined ? { ink: options.ink } : {}),
    ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
  }
}

function tableNode(
  cells: readonly (readonly string[])[],
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    name?: string
    striped?: boolean
    headerRow?: boolean
    ink?: string
    headerFill?: string
    stripeFill?: string
    colWidths?: number[]
    grid?: FreeformTableElement['grid']
    lineColor?: string
    lineWidth?: number
    fontSize?: number
    rotation?: number
    opacity?: number
  } = {},
): FreeformTableElement {
  const rows = cells.length
  const cols = Math.max(...cells.map((row) => row.length))
  const flat: string[] = []
  for (const row of cells) {
    for (let col = 0; col < cols; col += 1) flat.push(row[col] ?? '')
  }
  return {
    id: uuid(),
    name: options.name ?? '表格',
    locked: false,
    hidden: false,
    type: 'table',
    x,
    y,
    width,
    height,
    rotation: options.rotation ?? 0,
    scale: 1,
    rows,
    cols,
    cells: flat,
    ...(options.headerRow === false ? { headerRow: false } : {}),
    ...(options.striped ? { striped: true } : {}),
    ...(options.ink !== undefined ? { ink: options.ink } : {}),
    ...(options.headerFill !== undefined ? { headerFill: options.headerFill } : {}),
    ...(options.stripeFill !== undefined ? { stripeFill: options.stripeFill } : {}),
    ...(options.colWidths !== undefined ? { colWidths: [...options.colWidths] } : {}),
    ...(options.grid !== undefined ? { grid: options.grid } : {}),
    ...(options.lineColor !== undefined ? { lineColor: options.lineColor } : {}),
    ...(options.lineWidth !== undefined ? { lineWidth: options.lineWidth } : {}),
    ...(options.fontSize !== undefined ? { fontSize: options.fontSize } : {}),
    ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
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

/** The talk without a photo: the title set large in paper on an ink field, the details on a paper panel below. */
function talkPosterTextOnly(): FreeformSlide {
  const paper = '#f2efe8'
  const ink = '#141414'
  const orange = '#c7400e'
  const rust = '#b93a0c'
  const gray = '#5c5852'
  const row = (index: number, label: string, value: string) => {
    const y = 1296 + index * 70
    const n = ['一', '二', '三'][index]
    return [
      textNode(label, 72, y, 140, 56, { name: `标签${n}`, fontSize: 30, fontFamily: UI, textFill: solid(rust), fontWeight: 'bold', letterSpacing: 2 }),
      textNode(value, 212, y, 796, 56, { name: `信息${n}`, fontSize: 34, textFill: solid(ink), fontWeight: 'bold' }),
    ]
  }
  return slide('海报', solid(ink), [
    shapeNode('rect', -TEMPLATE_EDGE_BLEED, 1100, 1080 + TEMPLATE_EDGE_BLEED * 2, 820 + TEMPLATE_EDGE_BLEED, solid(paper), { name: '纸底', cornerRadius: 0 }),
    shapeNode('rect', -TEMPLATE_EDGE_BLEED, 1088, 1080 + TEMPLATE_EDGE_BLEED * 2, 12, solid(orange), { name: '色条', cornerRadius: 0 }),
    lineNode(72, 1256, 936, ink, 3, { name: '分隔线', cap: 'butt' }),
    shapeNode('rect', 72, 1764, 420, 96, solid(ink), { name: '按钮底板', cornerRadius: 48 }),
    textNode('公开讲座', 72, 120, 600, 64, {
      name: '角标', fontSize: 32, textFill: solid('#ffffff'), fontWeight: 'bold', letterSpacing: 4,
      effect: { type: 'background', color: orange, amount: 45, radius: 6 },
    }),
    textNode('城市里的\n第二条路', 64, 220, 952, 800, { name: '标题', fontSize: 152, textFill: solid(paper), fontWeight: 'bold', lineHeight: 1.12, letterSpacing: -4, verticalAlign: 'middle' }),
    textNode('关于步行、街道和公共空间的一次分享', 72, 1156, 936, 64, { name: '副标题', fontSize: 40, textFill: solid(gray) }),
    ...row(0, '时间', '10 月 18 日 周六 14:00'),
    ...row(1, '地点', '城市规划展览馆 3 层报告厅'),
    ...row(2, '嘉宾', '林一 · 建筑师'),
    textNode('扫码报名 →', 72, 1784, 420, 56, { name: '按钮文字', fontSize: 36, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center' }),
    textNode('城市漫游计划', 592, 1788, 416, 48, { name: '主办', fontSize: 28, textFill: solid(gray), align: 'right', letterSpacing: 2 }),
  ], STORY)
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

/** The sale without its illustration: the offer itself set large inside the orange circle. */
function salePosterTextOnly(): FreeformSlide {
  const cream = '#fff3e3'
  const orange = '#ff6a2b'
  const brown = '#3b1f14'
  const coffee = '#7a4a2c'
  const yellow = '#ffd23f'
  return slide('海报', solid(cream), [
    shapeNode('ellipse', 90, 330, 900, 900, solid(orange), { name: '大圆' }),
    shapeNode('ellipse', 770, 300, 230, 230, solid(yellow), { name: '角标底' }),
    lineNode(440, 240, 200, brown, 4, { name: '副标题线', cap: 'round' }),
    shapeNode('rect', 290, 1600, 500, 112, solid(brown), { name: '按钮底板', cornerRadius: 56 }),
    textNode('秋日咖啡季', 64, 120, 952, 100, { name: '副标题', fontSize: 64, textFill: solid(brown), fontWeight: 'bold', align: 'center', letterSpacing: 8 }),
    // Inside the circle: the box's corners stay within its rim.
    textNode('第二杯\n半价', 190, 540, 700, 480, {
      name: '标题', fontSize: 150, textFill: solid(brown), fontWeight: 'bold', align: 'center', lineHeight: 1.1, letterSpacing: -4, verticalAlign: 'middle',
      effect: { type: 'offset', color: cream, amount: 30, angle: 45 },
    }),
    textNode('限时\n7 天', 770, 350, 230, 132, { name: '角标', fontSize: 46, textFill: solid(brown), fontWeight: 'bold', align: 'center', lineHeight: 1.15, rotation: 12 }),
    textNode('拿铁、美式、季节限定，任选两杯', 72, 1290, 936, 64, { name: '正文', fontSize: 40, textFill: solid(brown), align: 'center' }),
    textNode('活动时间  10.1 – 10.31', 72, 1384, 936, 52, { name: '信息一', fontSize: 34, textFill: solid(coffee), align: 'center' }),
    textNode('全国直营门店可用', 72, 1440, 936, 52, { name: '信息二', fontSize: 34, textFill: solid(coffee), align: 'center' }),
    textNode('立即领券', 290, 1624, 500, 64, { name: '按钮文字', fontSize: 44, textFill: solid(cream), fontWeight: 'bold', align: 'center', letterSpacing: 4 }),
    textNode('DINGCARD COFFEE', 72, 1846, 936, 40, { name: '品牌', fontSize: 24, fontFamily: UI, textFill: solid(brown), fontWeight: 'bold', align: 'center', letterSpacing: 8 }),
  ], STORY)
}

/** A team member's portrait in a square: a head and shoulders cut from one path, a shade off the square's colour. */
function avatarPath(name: string, x: number, y: number, size: number, color: string): FreeformSceneNode {
  const c = size / 2
  const head = size * 0.17
  const top = size * 0.6
  const shoulders = `M ${size * 0.2} ${size} C ${size * 0.2} ${top + size * 0.04} ${size * 0.33} ${top - size * 0.04} ${c} ${top - size * 0.04} C ${size * 0.67} ${top - size * 0.04} ${size * 0.8} ${top + size * 0.04} ${size * 0.8} ${size} Z`
  const face = `M ${c - head} ${size * 0.36} A ${head} ${head} 0 1 0 ${c + head} ${size * 0.36} A ${head} ${head} 0 1 0 ${c - head} ${size * 0.36} Z`
  return pathNode(`${face} ${shoulders}`, x, y, size, size, { name, fill: solid(color), stroke: color, strokeWidth: 0 })
}

function createHiringPosterDocument(): FreeformDocument {
  const paper = '#f3efe6'
  const ink = '#16181d'
  const muted = '#5b5f6a'
  const blue = '#2448d8'
  const orange = '#f0643a'
  const vermilion = '#d84c22'
  const rule = '#d9d3c6'
  // The team as it is: ten seats, one of them still open.
  const team: Array<readonly [string, string] | null> = [
    ['#2448d8', '#4a6ae6'], ['#f0643a', '#f58a68'], ['#f2b632', '#f6c95f'], ['#2f8f6a', '#4fa985'], ['#e3dccd', '#cfc6b3'],
    ['#16181d', '#3a3e48'], ['#f2b632', '#f6c95f'], ['#2448d8', '#4a6ae6'], null, ['#f0643a', '#f58a68'],
  ]
  const size = 168
  const seat = (index: number) => ({ x: 72 + (index % 5) * (size + 24), y: 120 + Math.floor(index / 5) * (size + 24) })
  const members = team.flatMap((colors, index) => {
    if (!colors) return []
    const { x, y } = seat(index)
    const n = index + 1
    return [
      shapeNode('rect', x, y, size, size, solid(colors[0]), { name: `成员${n}`, cornerRadius: 28 }),
      avatarPath(`头像${n}`, x, y, size, colors[1]),
    ]
  })
  const open = seat(8)
  const position = (index: number, terms: string, role: string) => {
    const y = 1040 + index * 150
    const n = ['一', '二', '三'][index]
    return [
      lineNode(72, y + 132, 936, rule, 2, { name: `职位线${n}`, cap: 'butt' }),
      textNode(String(index + 1).padStart(2, '0'), 72, y + 50, 90, 64, { name: `编号${n}`, fontSize: 44, fontFamily: UI, textFill: solid(vermilion), fontWeight: 'bold' }),
      textNode(terms, 176, y, 832, 44, { name: `条件${n}`, fontSize: 28, fontFamily: UI, textFill: solid(blue), fontWeight: 'bold', letterSpacing: 2 }),
      textNode(role, 176, y + 44, 832, 76, { name: `职位${n}`, fontSize: 52, textFill: solid(ink), fontWeight: 'bold' }),
    ]
  }
  return documentFromSlides([
    slide('海报', solid(paper), [
      ...members,
      pathNode(`M 3 3 H ${size - 3} V ${size - 3} H 3 Z`, open.x, open.y, size, size, { name: '空位', stroke: ink, strokeWidth: 5, dash: 14, cap: 'butt', join: 'miter' }),
      pathNode('M 84 44 V 124 M 44 84 H 124', open.x, open.y, size, size, { name: '加号', stroke: ink, strokeWidth: 10, cap: 'round' }),
      lineNode(72, 1774, 936, ink, 3, { name: '页脚线', cap: 'butt' }),
      shapeNode('rect', 72, 1600, 936, 124, solid(ink), { name: '按钮底板', cornerRadius: 62 }),
      textNode('WE ARE HIRING', 72, 538, 700, 44, { name: '英文标语', fontSize: 28, fontFamily: UI, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 8 }),
      textNode('急招', 852, 524, 156, 72, {
        name: '角标', fontSize: 34, textFill: solid(ink), fontWeight: 'bold', align: 'center', letterSpacing: 6,
        effect: { type: 'background', color: orange, amount: 40, radius: 100 },
      }),
      textNode('这个位置\n留给你', 64, 610, 952, 300, { name: '标题', fontSize: 124, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.16, letterSpacing: -2 }),
      textNode('做一款给 AI 用的设计编辑器，现在就差一个你。', 72, 930, 936, 60, { name: '副标题', fontSize: 38, textFill: solid(muted) }),
      ...position(0, '全职 · 上海', '产品设计师'),
      ...position(1, '全职 · 可远程', '前端工程师'),
      ...position(2, '每周 4 天 · 3 个月起', '设计实习生'),
      textNode('弹性工作 · 不打卡 · 每年一次团队旅行', 72, 1500, 936, 60, { name: '正文', fontSize: 36, textFill: solid(blue), fontWeight: 'bold' }),
      textNode('简历发到 hr@dingcard.app', 72, 1632, 936, 60, { name: '按钮文字', fontSize: 40, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center' }),
      textNode('DINGCARD 叮卡', 72, 1806, 936, 44, { name: '品牌', fontSize: 26, fontFamily: UI, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 6 }),
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
      textNode('2026.09.25', 96, 1742, 500, 44, { name: '信息二', fontSize: 28, fontFamily: UI, textFill: solid(soft), letterSpacing: 4 }),
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

/** The product card without a picture: the price set large in a coral circle where the product stood. */
function productCardTextOnly(): FreeformSlide {
  const green = '#0f5132'
  const leaf = '#3f7a60'
  const coral = '#d63d22'
  const white = '#ffffff'
  const point = (index: number, text: string) => {
    const y = 396 + index * 80
    const n = ['一', '二', '三'][index]
    return [
      shapeNode('ellipse', 72, y + 6, 44, 44, solid(green), { name: `勾底${n}` }),
      textNode('✓', 72, y + 8, 44, 40, { name: `勾${n}`, fontSize: 26, fontFamily: UI, textFill: solid(white), fontWeight: 'bold', align: 'center' }),
      textNode(text, 132, y, 420, 56, { name: `信息${n}`, fontSize: 34, textFill: solid(green), fontWeight: 'bold' }),
    ]
  }
  return slide('主图', stopsPaint([[0, '#eef8f3'], [1, '#d7efe4']], 160), [
    shapeNode('ellipse', 556, 436, 476, 476, { type: 'transparent' }, { name: '价格圈', stroke: coral, strokeWidth: 3 }),
    shapeNode('ellipse', 576, 456, 436, 436, solid(coral), { name: '价格底' }),
    lineNode(72, 664, 420, '#bfe0d1', 2, { name: '分隔线', cap: 'butt' }),
    textNode('植物精华水', 64, 104, 952, 140, { name: '标题', fontSize: 96, textFill: solid(green), fontWeight: 'bold', letterSpacing: -2 }),
    textNode('补水 · 舒缓 · 不黏腻', 72, 250, 900, 56, { name: '副标题', fontSize: 36, textFill: solid(leaf) }),
    ...point(0, '72 小时持续补水'),
    ...point(1, '无酒精 · 无香精'),
    ...point(2, '敏感肌也能用'),
    textNode('到手价', 576, 548, 436, 64, { name: '价格标签', fontSize: 44, textFill: solid(white), fontWeight: 'bold', align: 'center', letterSpacing: 6 }),
    textNode('¥59', 576, 612, 436, 180, { name: '角标', fontSize: 150, fontFamily: UI, textFill: solid(white), fontWeight: 'bold', align: 'center', letterSpacing: -2 }),
    textNode('DINGCARD 植物所', 560, 980, 456, 44, { name: '品牌', fontSize: 26, fontFamily: UI, textFill: solid(green), fontWeight: 'bold', align: 'right', letterSpacing: 4 }),
  ], SQUARE)
}

/** Four corner brackets around a box, `arm` long: a viewfinder's frame or a focus mark. */
function cornerBrackets(width: number, height: number, arm: number, inset: number): string {
  const [l, t, r, b] = [inset, inset, width - inset, height - inset]
  return [
    `M ${l} ${t + arm} V ${t} H ${l + arm}`,
    `M ${r - arm} ${t} H ${r} V ${t + arm}`,
    `M ${r} ${b - arm} V ${b} H ${r - arm}`,
    `M ${l + arm} ${b} H ${l} V ${b - arm}`,
  ].join(' ')
}

function createVideoCoverDocument(): FreeformDocument {
  const black = '#111315'
  const white = '#ffffff'
  const yellow = '#ffd84d'
  const red = '#ff3b30'
  const grey = '#8d939b'
  // The exposure scale under the focus mark: a long tick at each stop, short ones between.
  const ticks = Array.from({ length: 13 }, (_, index) => {
    const x = 4 + index * 32
    const long = index % 6 === 0
    return `M ${x} ${long ? 2 : 14} V 34`
  }).join(' ')
  return documentFromSlides([
    slide('封面', solid(black), [
      pathNode(cornerBrackets(1792, 952, 104, 4), 64, 64, 1792, 952, { name: '取景框', stroke: white, strokeWidth: 8, cap: 'square', join: 'miter' }),
      pathNode(cornerBrackets(300, 300, 48, 3), 1420, 330, 300, 300, { name: '对焦框', stroke: yellow, strokeWidth: 6, cap: 'square', join: 'miter' }),
      pathNode('M 150 132 V 168 M 132 150 H 168', 1420, 330, 300, 300, { name: '对焦点', stroke: yellow, strokeWidth: 4, cap: 'butt' }),
      pathNode(ticks, 1376, 900, 392, 36, { name: '曝光刻度', stroke: white, strokeWidth: 3, cap: 'butt' }),
      shapeNode('ellipse', 1567, 878, 14, 14, solid(yellow), { name: '曝光指针' }),
      shapeNode('ellipse', 140, 136, 30, 30, solid(red), { name: '录制点', shadow: { color: red, blur: 16, offsetX: 0, offsetY: 0 } }),
      textNode('REC', 186, 126, 200, 50, { name: '录制', fontSize: 34, fontFamily: UI, textFill: solid(white), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('00:08:24', 1480, 126, 300, 50, { name: '时间码', fontSize: 34, fontFamily: UI, textFill: solid(white), fontWeight: 'bold', align: 'right', letterSpacing: 4 }),
      textNode('EP.12', 140, 246, 320, 80, {
        name: '角标', fontSize: 44, fontFamily: UI, textFill: solid(black), fontWeight: 'bold', letterSpacing: 2,
        effect: { type: 'background', color: yellow, amount: 40, radius: 10 },
      }),
      textNode('3 分钟\n看懂复利', 132, 346, 1220, 440, { name: '标题', fontSize: 180, textFill: solid(white), fontWeight: 'bold', lineHeight: 1.1, letterSpacing: -6 }),
      textNode('为什么越早开始越好', 140, 806, 1200, 84, {
        name: '副标题', fontSize: 52, textFill: solid(black), fontWeight: 'bold',
        effect: { type: 'background', color: yellow, amount: 30, radius: 0 },
      }),
      textNode('叮卡财经', 140, 934, 700, 52, { name: '品牌', fontSize: 34, textFill: solid(white), fontWeight: 'bold', letterSpacing: 2 }),
      textNode('4K · 60FPS', 1376, 848, 392, 36, { name: '规格', fontSize: 22, fontFamily: UI, textFill: solid(grey), fontWeight: 'bold', letterSpacing: 4 }),
      ...(['-2', '0', '+2'] as const).map((stop, index) => textNode(stop, 1340 + index * 192, 942, 80, 36, {
        name: `曝光值${index + 1}`, fontSize: 22, fontFamily: UI, textFill: solid(grey), align: 'center',
      })),
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

/** The article cover without a photo: the title centred large on navy, between the tag and the sign-off. */
function articleCoverTextOnly(): FreeformSlide {
  const navy = '#13213c'
  const cream = '#f6f1e7'
  const orange = '#f28b30'
  const muted = '#aab6cc'
  return slide('首图', solid(navy), [
    lineNode(840, 636, 120, orange, 6, { name: '标题线', cap: 'butt' }),
    textNode('深度 · 城市', 400, 84, 1000, 60, {
      name: '角标', fontSize: 30, textFill: solid(navy), fontWeight: 'bold', align: 'center', letterSpacing: 4,
      effect: { type: 'background', color: orange, amount: 45, radius: 6 },
    }),
    textNode('一座城市的\n步行友好度', 96, 164, 1608, 352, { name: '标题', fontSize: 120, textFill: solid(cream), fontWeight: 'bold', align: 'center', lineHeight: 1.18, letterSpacing: -2, verticalAlign: 'middle' }),
    textNode('我们走了 30 条街，记下这些细节', 196, 536, 1408, 64, { name: '副标题', fontSize: 40, textFill: solid(muted), align: 'center' }),
    textNode('叮卡周刊', 600, 670, 600, 48, { name: '品牌', fontSize: 28, fontFamily: UI, textFill: solid(muted), fontWeight: 'bold', align: 'center', letterSpacing: 4 }),
  ], WECHAT_COVER)
}

/** The flyer without its illustration: the arch holds the details instead of the pottery. */
function flyerTextOnly(): FreeformSlide {
  const sand = '#f3e9dc'
  const clay = '#c8553d'
  const rust = '#a8432c'
  const ink = '#2b2118'
  const muted = '#6e5f52'
  // Down the arch, below its curve: a label over a value that may take two lines.
  const row = (index: number, label: string, value: string) => {
    const y = 870 + index * 150
    const n = ['一', '二', '三'][index]
    return [
      textNode(label, 660, y, 460, 44, { name: `标签${n}`, fontSize: 28, textFill: solid(rust), fontWeight: 'bold', align: 'center', letterSpacing: 4 }),
      textNode(value, 660, y + 46, 460, 96, { name: `信息${n}`, fontSize: 32, textFill: solid(ink), fontWeight: 'bold', align: 'center', lineHeight: 1.3 }),
    ]
  }
  return slide('宣传单', solid(sand), [
    lineNode(96, 146, 1048, ink, 2, { name: '刊头线', cap: 'butt' }),
    pathNode('M 0 620 V 270 A 270 270 0 0 1 540 270 V 620 Z', 620, 700, 540, 620, { name: '拱门', fill: solid('#e9c3ae'), strokeWidth: 0 }),
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
  ], A4)
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

/** The photo cover without a photo: the taped card holds the title instead of the picture. */
function photoCoverTextOnly(): FreeformSlide {
  const sand = '#efe6da'
  const ink = '#2a211b'
  const muted = '#6f6156'
  const tilt = -2
  const frame = { x: 112, y: 100, width: 856, height: 900 }
  // Above the badge on the card's corner, turned with the card.
  const words = { x: 176, y: 200, width: 728, height: 640 }
  const turned = turnedWith(words, frame, tilt)
  return slide('封面', solid(sand), [
    shapeNode('rect', frame.x, frame.y, frame.width, frame.height, solid('#ffffff'), {
      name: '相框', cornerRadius: 6, rotation: tilt, shadow: { color: '#cbbca8', blur: 36, offsetX: 0, offsetY: 14 },
    }),
    decorationNode('tape', 54, 74, 240, { rotation: -34 }),
    decorationNode('tape', 784, 74, 240, { rotation: 34, color: '#b9d3ea' }),
    ...decorationParts('burst-badge', 806, 836, 200, ['角标底', null]),
    textNode('周末去哪儿\n城市漫步路线', turned.x, turned.y, words.width, words.height, {
      name: '标题', fontSize: 112, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.24, letterSpacing: -2, rotation: tilt, verticalAlign: 'middle',
    }),
    textNode('必去', 806, 898, 200, 76, { name: '角标', fontSize: 50, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center', rotation: -10, lineHeight: 1.2 }),
    textNode('6 个小众打卡点，附路线图', 88, 1092, 904, 64, { name: '副标题', fontSize: 42, textFill: solid(muted) }),
    decorationNode('underline-wave', 88, 1172, 240, { name: '波浪线', color: '#d9503f' }),
    textNode('@叮卡周末', 88, 1208, 600, 52, { name: '品牌', fontSize: 30, textFill: solid(muted), fontWeight: 'bold' }),
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

/** A strip of receipt paper torn at both ends: teeth `tooth` wide along the top and bottom. */
function receiptPath(width: number, height: number, tooth: number): string {
  const depth = tooth * 0.7
  const teeth = Math.round(width / tooth)
  const step = width / teeth
  const top = Array.from({ length: teeth }, (_, index) => `L ${((index + 0.5) * step).toFixed(1)} 0 L ${((index + 1) * step).toFixed(1)} ${depth.toFixed(1)}`).join(' ')
  const bottom = Array.from({ length: teeth }, (_, index) => `L ${(width - (index + 0.5) * step).toFixed(1)} ${height} L ${(width - (index + 1) * step).toFixed(1)} ${(height - depth).toFixed(1)}`).join(' ')
  return `M 0 ${depth.toFixed(1)} ${top} L ${width} ${(height - depth).toFixed(1)} ${bottom} Z`
}

/** A barcode: bars of the given widths (in units of `unit`), dark and light in turn, as one filled path. */
function barcodePath(widths: readonly number[], unit: number, height: number): { d: string; width: number } {
  let x = 0
  const bars: string[] = []
  widths.forEach((width, index) => {
    if (index % 2 === 0) bars.push(`M ${x} 0 H ${x + width * unit} V ${height} H ${x} Z`)
    x += width * unit
  })
  return { d: bars.join(' '), width: x }
}

function createPriceListDocument(): FreeformDocument {
  const wine = '#5a1f2b'
  const paper = '#fbf8f2'
  const ink = '#2a2225'
  const muted = '#7a6a6c'
  const rule = '#ddd3cc'
  const receipt = { x: 130, y: 110, width: 820, height: 1720 }
  const barcode = barcodePath([3, 1, 1, 2, 2, 1, 1, 3, 1, 1, 4, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 1, 4, 1, 2, 3, 1, 1, 2, 2, 1, 1, 3, 1, 1, 2, 2, 3, 1, 1], 5, 80)
  const row = (index: number, service: string, price: string) => {
    const y = 676 + index * 96
    const n = NUMBERED[index]
    return [
      ...(index > 0 ? [lineNode(196, y - 22, 688, rule, 2, { name: `隔线${n}`, dash: 6, cap: 'butt' })] : []),
      textNode(service, 196, y, 488, 64, { name: `项目${n}`, fontSize: 38, textFill: solid(ink), fontWeight: 'bold' }),
      textNode(price, 684, y, 200, 64, { name: `价格${n}`, fontSize: 38, fontFamily: UI, textFill: solid(wine), fontWeight: 'bold', align: 'right' }),
    ]
  }
  return documentFromSlides([
    slide('价目表', solid(wine), [
      pathNode(receiptPath(receipt.width, receipt.height, 28), receipt.x, receipt.y, receipt.width, receipt.height, {
        name: '小票', fill: solid(paper), stroke: paper, strokeWidth: 0, shadow: { color: '#2e0d15', blur: 48, offsetX: 0, offsetY: 20 },
      }),
      lineNode(196, 560, 688, ink, 3, { name: '票头线', dash: 12, cap: 'butt' }),
      lineNode(196, 1460, 688, ink, 3, { name: '票尾线', dash: 12, cap: 'butt' }),
      shapeNode('rect', 290, 1552, 500, 104, { type: 'transparent' }, { name: '按钮底板', cornerRadius: 16, stroke: wine, strokeWidth: 4 }),
      pathNode(barcode.d, Math.round(540 - barcode.width / 2), 1686, barcode.width, 80, { name: '条码', fill: solid(ink), stroke: ink, strokeWidth: 0 }),
      textNode('美甲 · 美睫', 290, 186, 500, 64, {
        name: '角标', fontSize: 30, textFill: solid('#ffffff'), fontWeight: 'bold', align: 'center', letterSpacing: 4,
        effect: { type: 'background', color: wine, amount: 50, radius: 100 },
      }),
      textNode('价目表', 160, 286, 760, 180, { name: '标题', fontSize: 140, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', align: 'center', letterSpacing: 16 }),
      textNode('PRICE LIST · 2026', 160, 478, 760, 44, { name: '副标题', fontSize: 26, fontFamily: UI, textFill: solid(muted), align: 'center', letterSpacing: 10 }),
      textNode('ITEM', 196, 596, 300, 36, { name: '项目栏', fontSize: 22, fontFamily: UI, textFill: solid(muted), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('PRICE', 584, 596, 300, 36, { name: '价格栏', fontSize: 22, fontFamily: UI, textFill: solid(muted), fontWeight: 'bold', align: 'right', letterSpacing: 6 }),
      ...row(0, '纯色美甲', '¥98'),
      ...row(1, '猫眼美甲', '¥158'),
      ...row(2, '法式美甲', '¥138'),
      ...row(3, '手绘款（单指）', '¥30'),
      ...row(4, '延长甲', '¥188'),
      ...row(5, '自然款美睫', '¥168'),
      ...row(6, '卸甲护理', '¥38'),
      ...row(7, '手部护理', '¥88'),
      textNode('以上价格含基础修型 · 节假日正常营业', 160, 1486, 760, 48, { name: '正文', fontSize: 28, textFill: solid(muted), align: 'center' }),
      textNode('私信预约', 290, 1574, 500, 60, { name: '按钮文字', fontSize: 38, textFill: solid(wine), fontWeight: 'bold', align: 'center', letterSpacing: 8 }),
      textNode('0 2026 1013 0001 8', 290, 1770, 500, 34, { name: '条码数字', fontSize: 22, fontFamily: UI, textFill: solid(ink), align: 'center', letterSpacing: 8 }),
      textNode('@叮卡美甲工作室', 80, 1858, 920, 44, { name: '品牌', fontSize: 28, textFill: solid('#ead9d4'), align: 'center', letterSpacing: 2 }),
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

function createCompareTableDocument(): FreeformDocument {
  const paper = '#f2f0ea'
  const ink = '#171717'
  const blue = '#2448c8'
  const pale = '#dbe2fb'
  return documentFromSlides([
    slide('对比表', solid(paper), [
      shapeNode('rect', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 1080 + TEMPLATE_EDGE_BLEED * 2, 620 + TEMPLATE_EDGE_BLEED, solid(blue), { name: '刊头色块', cornerRadius: 0 }),
      textNode('VS', 476, 190, 540, 330, { name: '对比字', fontSize: 300, fontFamily: ARCHIVO, textFill: solid('#4065e0'), align: 'right', lineHeight: 1, letterSpacing: -10 }),
      shapeNode('rect', 64, 1488, 12, 128, solid(blue), { name: '结论竖线', cornerRadius: 0 }),
      lineNode(64, 1800, 952, ink, 2, { name: '页脚线', cap: 'butt' }),
      textNode('REVIEW', 64, 72, 500, 48, { name: '角标', fontSize: 28, fontFamily: SANS, textFill: solid('#ffffff'), fontWeight: 'bold', letterSpacing: 12 }),
      textNode('怎么选，\n看这张表', 64, 168, 952, 290, { name: '标题', fontSize: 120, fontFamily: SANS, textFill: solid('#ffffff'), fontWeight: 'bold', lineHeight: 1.15 }),
      textNode('两款笔记 App 的功能对比', 64, 480, 952, 56, { name: '副标题', fontSize: 38, fontFamily: SANS, textFill: solid(pale) }),
      tableNode([
        ['对比项', '甲 App', '乙 App'],
        ['价格', '免费', '12 元/月'],
        ['离线', '支持', '不支持'],
        ['导出', 'Markdown', 'PDF'],
        ['同步', '手动', '自动'],
      ], 64, 700, 952, 680, {
        name: '对比表', ink, headerFill: pale, grid: 'rows', lineColor: '#c9c4b8', lineWidth: 2, fontSize: 38, colWidths: [1.3, 1, 1],
      }),
      textNode('最后选了乙 App：\n自动同步省心', 108, 1482, 908, 140, { name: '结论', fontSize: 46, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.4 }),
      textNode('@叮卡工作室', 64, 1826, 640, 48, { name: '品牌', fontSize: 28, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 2 }),
    ], STORY),
  ])
}

function createExhibitionPosterDocument(): FreeformDocument {
  const paper = '#ecebe6'
  const ink = '#111111'
  const muted = '#55534d'
  const row = (index: number, label: string, value: string) => {
    const y = 1618 + index * 58
    const n = NUMBERED[index]
    return [
      textNode(label, 64, y + 6, 120, 40, { name: `标签${n}`, fontSize: 24, fontFamily: SANS, textFill: solid(muted), fontWeight: 'bold', letterSpacing: 6 }),
      textNode(value, 184, y, 832, 50, { name: `信息${n}`, fontSize: 32, fontFamily: SANS, textFill: solid(ink) }),
    ]
  }
  return documentFromSlides([
    slide('海报', solid(paper), [
      pictureShape('主图', '/templates/art-ink-stripes.svg', -TEMPLATE_EDGE_BLEED, -TEMPLATE_EDGE_BLEED, 1080 + TEMPLATE_EDGE_BLEED * 2, 1196 + TEMPLATE_EDGE_BLEED),
      lineNode(64, 1800, 952, ink, 3, { name: '页脚线', cap: 'butt' }),
      textNode('exhibition.', 54, 1124, 980, 210, { name: '英文标语', fontSize: 170, fontFamily: ARCHIVO, textFill: solid(ink), letterSpacing: -5, lineHeight: 1.1 }),
      textNode('光与影的漫游', 64, 1352, 952, 100, { name: '标题', fontSize: 72, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('四十位摄影师、一百二十幅作品，\n看城市里的光，怎样落在每个人身上。', 64, 1462, 952, 110, { name: '正文', fontSize: 32, fontFamily: SANS, textFill: solid(muted), lineHeight: 1.6 }),
      ...row(0, '展期', '2026.11.01 — 2027.01.15'),
      ...row(1, '地点', '城市美术馆 · 二号展厅'),
      ...row(2, '票价', '80 元 · 学生半价'),
      textNode('城市美术馆', 64, 1826, 640, 48, { name: '主办', fontSize: 28, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 4 }),
      textNode('No.12', 716, 1826, 300, 48, { name: '角标', fontSize: 30, fontFamily: ARCHIVO, textFill: solid(ink), align: 'right', letterSpacing: 1 }),
    ], STORY),
  ])
}

function createLaunchPosterDocument(): FreeformDocument {
  const night = '#0b0d17'
  const white = '#ffffff'
  const mist = '#d9dbec'
  const glow = (name: string, color: string, x: number, y: number, width: number, height: number, opacity?: number) =>
    shapeNode('ellipse', x, y, width, height, solid(color), { name, filter: { blur: 100 }, opacity })
  return documentFromSlides([
    slide('海报', solid(night), [
      glow('光斑一', '#3a52f0', -280, 60, 1000, 1000, 0.65),
      glow('光斑二', '#9455f5', 440, -240, 900, 860, 0.65),
      glow('光斑三', '#ff6a3d', 320, 800, 960, 820, 0.65),
      glow('光斑四', '#ffbe4d', -220, 1260, 720, 640, 0.6),
      shapeNode('rect', 64, 1128, 952, 604, solid(night), { name: '玻璃板', cornerRadius: 40, opacity: 0.38 }),
      shapeNode('rect', 64, 1128, 952, 604, { type: 'transparent' }, { name: '玻璃边', cornerRadius: 40, stroke: white, strokeWidth: 2, opacity: 0.4 }),
      shapeNode('rect', 112, 1572, 336, 100, solid(white), { name: '按钮底板', cornerRadius: 50 }),
      pathNode('M 12 12 L 128 128 M 128 40 L 128 128 L 40 128', 760, 540, 140, 140, { name: '箭头', stroke: white, strokeWidth: 16, cap: 'square', join: 'miter' }),
      textNode('STUDIO DING', 64, 72, 560, 48, { name: '品牌', fontSize: 28, fontFamily: SANS, textFill: solid(white), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('11.11', 716, 66, 300, 56, { name: '角标', fontSize: 40, fontFamily: ARCHIVO, textFill: solid(white), align: 'right' }),
      textNode('COMING\nSOON', 52, 300, 976, 420, { name: '英文标语', fontSize: 200, fontFamily: ARCHIVO, textFill: solid(white), lineHeight: 1, letterSpacing: -6 }),
      textNode('秋冬系列 · 第 4 季', 112, 1180, 856, 48, { name: '副标题', fontSize: 32, fontFamily: SANS, textFill: solid(mist), letterSpacing: 6 }),
      textNode('新品即将上线', 112, 1246, 856, 136, { name: '标题', fontSize: 108, fontFamily: SANS, textFill: solid(white), fontWeight: 'bold', letterSpacing: 2 }),
      textNode('预约即送限定礼盒，\n首发当天前 100 名享 8 折。', 112, 1398, 856, 120, { name: '正文', fontSize: 34, fontFamily: SANS, textFill: solid(white), lineHeight: 1.6 }),
      textNode('立即预约', 112, 1594, 336, 56, { name: '按钮文字', fontSize: 36, fontFamily: SANS, textFill: solid(night), fontWeight: 'bold', align: 'center', letterSpacing: 6 }),
      textNode('11 月 11 日 20:00 · 官网与门店同步首发', 64, 1800, 952, 48, { name: '信息一', fontSize: 30, fontFamily: SANS, textFill: solid(white), letterSpacing: 2 }),
    ], STORY),
  ])
}

function createSolarTermDocument(): FreeformDocument {
  const paper = '#f1ede4'
  const ink = '#2b2926'
  const red = '#b8322a'
  const muted = '#6a655d'
  return documentFromSlides([
    slide('海报', solid(paper), [
      shapeNode('ellipse', 652, 984, 210, 210, solid('#c4473a'), { name: '落日' }),
      illustrationNode('主图', '/templates/art-ink-mountains.svg', '雾里层层叠叠的远山', 0, 960, 1080, 960),
      shapeNode('rect', 96, 150, 100, 100, solid(red), { name: '印章', cornerRadius: 6, rotation: -3 }),
      textNode('霜降', 730, 120, 330, 720, { name: '标题', fontSize: 280, fontFamily: BRUSH, textFill: solid(ink), vertical: true, lineHeight: 1.1 }),
      textNode('霜降水返壑　风落木归山', 636, 172, 72, 660, { name: '副标题', fontSize: 36, fontFamily: SERIF, textFill: solid(ink), vertical: true, letterSpacing: 10, lineHeight: 1.2 }),
      textNode('节气', 92, 166, 108, 68, { name: '印章文字', fontSize: 40, fontFamily: BRUSH, textFill: solid('#ffffff'), align: 'center', rotation: -3, lineHeight: 1.2 }),
      lineNode(96, 278, 56, ink, 2, { name: '短线', cap: 'butt' }),
      textNode("FROST'S DESCENT", 96, 300, 480, 40, { name: '英文', fontSize: 24, fontFamily: SERIF, textFill: solid(muted), letterSpacing: 8 }),
      textNode('10 月 23 日', 96, 352, 500, 84, { name: '信息一', fontSize: 64, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold' }),
      textNode('二十四节气的第十八个，\n秋天就到这里了。', 96, 452, 500, 120, { name: '信息二', fontSize: 32, fontFamily: SERIF, textFill: solid(muted), lineHeight: 1.75 }),
      textNode('叮卡 · 节气日历', 96, 1800, 600, 48, { name: '品牌', fontSize: 28, fontFamily: SERIF, textFill: solid(ink), letterSpacing: 6 }),
    ], STORY),
  ])
}

function createDataRoundupDocument(): FreeformDocument {
  const paper = '#f3efe6'
  const ink = '#151515'
  const muted = '#5f594f'
  const vermilion = '#d9442a'
  const stat = (index: number, label: string, value: string) => {
    const x = 64 + index * 328
    const n = NUMBERED[index]
    return [
      shapeNode('rect', x, 1004, 48, 8, solid(vermilion), { name: `数字标记${n}`, cornerRadius: 0 }),
      textNode(value, x, 1018, 300, 116, { name: `信息${n}`, fontSize: 96, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', letterSpacing: -2 }),
      textNode(label, x, 1136, 300, 44, { name: `标签${n}`, fontSize: 28, fontFamily: SANS, textFill: solid(muted), letterSpacing: 2 }),
    ]
  }
  return documentFromSlides([
    slide('海报', solid(paper), [
      lineNode(64, 136, 952, ink, 3, { name: '刊头线', cap: 'butt' }),
      lineNode(64, 980, 952, ink, 2, { name: '数字顶线', cap: 'butt' }),
      lineNode(64, 1220, 952, ink, 2, { name: '数字底线', cap: 'butt' }),
      lineNode(64, 1800, 952, ink, 3, { name: '页脚线', cap: 'butt' }),
      textNode('ANNUAL REVIEW', 64, 72, 560, 48, {
        name: '刊头', fontSize: 26, fontFamily: SANS, textFill: solid('#ffffff'), fontWeight: 'bold', letterSpacing: 8,
        effect: { type: 'background', color: ink, amount: 40, radius: 0 },
      }),
      textNode('2026', 44, 150, 992, 330, { name: '角标', fontSize: 330, fontFamily: ARCHIVO, textFill: solid(vermilion), letterSpacing: -14, lineHeight: 1 }),
      textNode('这一年，\n做了多少事', 64, 500, 952, 260, { name: '标题', fontSize: 104, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.18 }),
      textNode('一份写给自己的年度盘点', 64, 800, 952, 56, { name: '副标题', fontSize: 36, fontFamily: SANS, textFill: solid(muted) }),
      ...stat(0, '发布作品', '128'),
      ...stat(1, '累计读者', '5.2万'),
      ...stat(2, '去过的城市', '12'),
      chartNode('bar', ['一月', '二月', '三月', '四月', '五月', '六月'], [{ name: '作品', values: [8, 12, 15, 24, 20, 28], color: vermilion }], 64, 1270, 952, 480, {
        name: '图表', showValues: true, ink,
      }),
      textNode('@叮卡工作室', 64, 1826, 640, 48, { name: '品牌', fontSize: 28, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 2 }),
    ], STORY),
  ])
}

function createGrowthTimelineDocument(): FreeformDocument {
  const green = '#173a30'
  const cream = '#f3ead8'
  const mustard = '#e7b649'
  const soft = '#b9c6b6'
  const step = (index: number, label: string, value: string) => {
    const y = 716 + index * 186
    const n = NUMBERED[index]
    return [
      shapeNode('ellipse', 88, y + 14, 26, 26, solid(mustard), { name: `节点${n}` }),
      textNode(label, 152, y, 864, 54, { name: `标签${n}`, fontSize: 38, fontFamily: SERIF, textFill: solid(mustard), fontWeight: 'bold', letterSpacing: 2 }),
      textNode(value, 152, y + 60, 864, 64, { name: `信息${n}`, fontSize: 44, fontFamily: SERIF, textFill: solid(cream) }),
    ]
  }
  return documentFromSlides([
    slide('海报', solid(green), [
      lineNode(64, 640, 952, mustard, 2, { name: '标题线', cap: 'butt' }),
      verticalLineNode(101, 740, 1484, soft, 2, { name: '时间轴', cap: 'butt', opacity: 0.5 }),
      lineNode(64, 1800, 952, soft, 1.5, { name: '页脚线', cap: 'butt', opacity: 0.6 }),
      textNode('2026', 52, 96, 976, 270, { name: '角标', fontSize: 260, fontFamily: PLAYFAIR, textFill: solid(mustard), lineHeight: 1, letterSpacing: -6 }),
      textNode('这一年，慢慢长大', 64, 390, 952, 130, { name: '标题', fontSize: 96, fontFamily: SERIF, textFill: solid(cream), fontWeight: 'bold', letterSpacing: 2 }),
      textNode('五个节点，把一年的变化串起来', 64, 540, 952, 56, { name: '副标题', fontSize: 36, fontFamily: SERIF, textFill: solid(soft) }),
      ...step(0, '1 月', '立了个 flag：每周写一篇笔记'),
      ...step(1, '3 月', '第一篇破千赞，涨了 500 粉'),
      ...step(2, '6 月', '接到第一单商单合作'),
      ...step(3, '9 月', '粉丝破万，开始做系列内容'),
      ...step(4, '12 月', '工作室成立，全职做内容'),
      textNode('明年，把画画捡回来', 64, 1680, 952, 70, { name: '结论', fontSize: 46, fontFamily: SERIF, textFill: solid(mustard), fontWeight: 'bold' }),
      textNode('@叮卡成长记录', 64, 1826, 640, 48, { name: '品牌', fontSize: 28, fontFamily: SERIF, textFill: solid(soft), letterSpacing: 2 }),
    ], STORY),
  ])
}

function createBirthdayCardDocument(): FreeformDocument {
  const blush = '#f6e4de'
  const rose = '#b2394c'
  const ink = '#3b2226'
  const muted = '#73555a'
  const gold = '#d4a243'
  const teal = '#3f8f8a'
  const navy = '#2c3a66'
  const pink = '#e98a9a'
  // Confetti drifting in from the corners.
  const bits: Array<['rect' | 'ellipse' | 'star', number, number, number, number, string, number]> = [
    ['rect', 70, 46, 22, 58, gold, 28], ['ellipse', 168, 120, 26, 26, rose, 0], ['rect', 250, 40, 18, 50, teal, -24],
    ['star', 86, 188, 30, 30, gold, 8], ['rect', 330, 128, 16, 40, pink, 52], ['ellipse', 40, 310, 22, 22, gold, 0],
    ['rect', 740, 44, 20, 54, navy, 34], ['ellipse', 836, 120, 18, 18, gold, 0], ['rect', 930, 52, 22, 58, rose, -30],
    ['star', 994, 186, 36, 36, teal, -10], ['rect', 990, 300, 16, 44, gold, 18], ['ellipse', 690, 150, 14, 14, pink, 0],
    ['rect', 80, 940, 20, 54, teal, -32], ['star', 190, 992, 34, 34, gold, 14], ['rect', 40, 820, 16, 40, rose, 40],
    ['rect', 880, 960, 22, 56, gold, 24], ['ellipse', 990, 880, 26, 26, rose, 0], ['ellipse', 780, 1010, 16, 16, navy, 0],
  ]
  return documentFromSlides([
    slide('贺卡', solid(blush), [
      ...bits.map(([shape, x, y, width, height, color, rotation], index) => shapeNode(shape, x, y, width, height, solid(color), {
        name: `彩纸${index + 1}`, cornerRadius: shape === 'rect' ? 4 : undefined, rotation,
      })),
      textNode('Happy Birthday', 40, 160, 1000, 220, { name: '英文标语', fontSize: 156, fontFamily: VIBES, textFill: solid(rose), align: 'center', lineHeight: 1.3 }),
      textNode('生日快乐', 90, 412, 900, 130, { name: '标题', fontSize: 92, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', align: 'center', letterSpacing: 28 }),
      lineNode(476, 578, 128, gold, 3, { name: '分隔线', cap: 'butt' }),
      textNode('亲爱的小满：', 90, 622, 900, 60, { name: '名字', fontSize: 40, fontFamily: SERIF, textFill: solid(ink), align: 'center' }),
      textNode('愿你一直保有好奇心，吃得好、睡得香，\n把日子过成自己喜欢的样子。', 110, 702, 860, 130, { name: '正文', fontSize: 34, fontFamily: SERIF, textFill: solid(muted), align: 'center', lineHeight: 1.75 }),
      textNode('— 爱你的阿林', 90, 860, 900, 52, { name: '署名', fontSize: 32, fontFamily: SERIF, textFill: solid(rose), align: 'center', letterSpacing: 4 }),
    ], SQUARE),
  ])
}

function createPodcastCoverDocument(): FreeformDocument {
  const cream = '#efe7d8'
  const red = '#d6432f'
  const blue = '#2350a8'
  const yellow = '#f2b22e'
  const black = '#161616'
  // Tiles on the page edge bleed past it.
  const tile = (name: string, col: number, row: number, color: string) => {
    const left = col === 0 ? -TEMPLATE_EDGE_BLEED : 0
    const top = row === 0 ? -TEMPLATE_EDGE_BLEED : 0
    const right = col === 2 ? TEMPLATE_EDGE_BLEED : 0
    const bottom = row === 2 ? TEMPLATE_EDGE_BLEED : 0
    return shapeNode('rect', col * 360 + left, row * 360 + top, 360 - left + right, 360 - top + bottom, solid(color), { name, cornerRadius: 0 })
  }
  return documentFromSlides([
    slide('封面', solid(cream), [
      tile('黄块', 2, 0, yellow),
      pathNode('M 0 0 A 360 360 0 0 1 360 360 L 0 360 Z', 720, 0, 360, 360, { name: '四分之一圆', fill: solid(black), strokeWidth: 0 }),
      tile('蓝块', 0, 1, blue),
      pathNode('M 0 360 A 180 180 0 0 1 360 360 Z', 0, 360, 360, 360, { name: '半圆', fill: solid(cream), strokeWidth: 0 }),
      pathNode('M 0 150 A 150 150 0 1 1 300 150 A 150 150 0 1 1 0 150 Z', 390, 390, 300, 300, { name: '红圆', fill: solid(red), strokeWidth: 0 }),
      tile('黑块', 2, 1, black),
      pathNode('M 360 0 A 360 360 0 0 0 0 360 L 360 360 Z', 720, 360, 360, 360, { name: '黄四分圆', fill: solid(yellow), strokeWidth: 0 }),
      tile('红块', 0, 2, red),
      pathNode('M 0 0 A 180 180 0 0 0 360 0 Z', 0, 720, 360, 360, { name: '黑半圆', fill: solid(black), strokeWidth: 0 }),
      tile('蓝底', 2, 2, blue),
      shapeNode('ellipse', 800, 800, 200, 200, solid(cream), { name: '小圆' }),
      textNode('一张图\n改十遍', 56, 48, 640, 216, { name: '标题', fontSize: 96, fontFamily: HUANGYOU, textFill: solid(black), lineHeight: 1.12 }),
      lineNode(60, 266, 96, black, 6, { name: '标题线', cap: 'butt' }),
      textNode('和林一聊聊设计里的耐心', 60, 286, 640, 48, { name: '副标题', fontSize: 30, fontFamily: SANS, textFill: solid(black), letterSpacing: 2 }),
      textNode('EP.12', 384, 742, 320, 110, { name: '角标', fontSize: 92, fontFamily: ARCHIVO, textFill: solid(black), letterSpacing: -2 }),
      textNode('叮卡电台', 388, 960, 300, 52, { name: '品牌', fontSize: 34, fontFamily: SANS, textFill: solid(black), fontWeight: 'bold', letterSpacing: 6 }),
    ], SQUARE),
  ])
}

function createPitchCoverDocument(): FreeformDocument {
  const fog = '#dfe3e8'
  const ink = '#2b2e34'
  const muted = '#4c515b'
  const glow = (name: string, color: string, x: number, y: number, width: number, height: number, opacity?: number) =>
    shapeNode('ellipse', x, y, width, height, solid(color), { name, filter: { blur: 100 }, opacity })
  return documentFromSlides([
    slide('封面', solid(fog), [
      glow('光斑一', '#f8f9fb', -240, -320, 1300, 1000),
      glow('光斑二', '#a9c4e8', 960, 240, 1200, 1000),
      glow('光斑三', '#cec7ee', 1220, -380, 900, 800, 0.9),
      glow('光斑四', '#ecdacd', 80, 640, 1000, 760, 0.8),
      lineNode(96, 136, 1728, ink, 2, { name: '刊头线', cap: 'butt' }),
      textNode('DINGCARD', 96, 70, 700, 48, { name: '品牌', fontSize: 30, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 8 }),
      textNode('汇报人  林一', 1224, 72, 600, 48, { name: '信息一', fontSize: 30, fontFamily: SANS, textFill: solid(muted), align: 'right', letterSpacing: 2 }),
      textNode('增长计划', 76, 330, 1360, 420, { name: '标题', fontSize: 320, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', letterSpacing: -12, lineHeight: 1.2 }),
      textNode('商业计划书\nPitch Deck 2027', 1440, 560, 400, 140, { name: '副标题', fontSize: 40, fontFamily: SANS, textFill: solid(muted), lineHeight: 1.4 }),
      textNode('2027 年第一季度 · 内部分享', 96, 950, 1000, 48, { name: '信息二', fontSize: 30, fontFamily: SANS, textFill: solid(muted), letterSpacing: 2 }),
    ], LANDSCAPE),
  ])
}

function createPortfolioCoverDocument(): FreeformDocument {
  const paper = '#efece6'
  const ink = '#141414'
  const red = '#b3191f'
  return documentFromSlides([
    slide('封面', solid(paper), [
      pictureShape('主图', '/templates/editorial-building.webp', -TEMPLATE_EDGE_BLEED, 360, 1080 + TEMPLATE_EDGE_BLEED * 2, 1080 + TEMPLATE_EDGE_BLEED, { filter: { grayscale: 1, contrast: 1.08 } }),
      shapeNode('rect', 866, -TEMPLATE_EDGE_BLEED, 150, 290 + TEMPLATE_EDGE_BLEED, solid(red), { name: '红签', cornerRadius: 0 }),
      textNode('林一  LIN YI', 64, 72, 700, 48, { name: '品牌', fontSize: 26, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('2026', 866, 64, 150, 56, { name: '角标', fontSize: 38, fontFamily: PLAYFAIR, textFill: solid('#ffffff'), align: 'center' }),
      textNode('PORTFOLIO', 36, 156, 1010, 230, { name: '英文标语', fontSize: 172, fontFamily: PLAYFAIR, textFill: solid(ink), letterSpacing: -2, lineHeight: 1.2 }),
      lineNode(64, 1150, 120, '#ffffff', 4, { name: '标题线', cap: 'butt' }),
      textNode('城市与光', 64, 1166, 640, 120, { name: '标题', fontSize: 92, fontFamily: SERIF, textFill: solid('#ffffff'), fontWeight: 'bold', letterSpacing: 8 }),
      textNode('建筑摄影 · 精选作品 36 幅', 64, 1294, 640, 48, { name: '副标题', fontSize: 30, fontFamily: SERIF, textFill: solid('#ffffff'), letterSpacing: 4 }),
    ]),
  ])
}

/** The portfolio without a photo: the title set large on the paper between the masthead and the name. */
function portfolioCoverTextOnly(): FreeformSlide {
  const paper = '#efece6'
  const ink = '#141414'
  const red = '#b3191f'
  return slide('封面', solid(paper), [
    shapeNode('rect', 866, -TEMPLATE_EDGE_BLEED, 150, 290 + TEMPLATE_EDGE_BLEED, solid(red), { name: '红签', cornerRadius: 0 }),
    lineNode(64, 404, 952, ink, 2, { name: '刊头线', cap: 'butt' }),
    lineNode(64, 1080, 120, red, 4, { name: '标题线', cap: 'butt' }),
    lineNode(64, 1330, 952, ink, 2, { name: '页脚线', cap: 'butt' }),
    textNode('2026', 866, 64, 150, 56, { name: '角标', fontSize: 38, fontFamily: PLAYFAIR, textFill: solid('#ffffff'), align: 'center' }),
    textNode('PORTFOLIO', 36, 156, 1010, 230, { name: '英文标语', fontSize: 172, fontFamily: PLAYFAIR, textFill: solid(ink), letterSpacing: -2, lineHeight: 1.2 }),
    textNode('城市与光', 64, 440, 952, 600, { name: '标题', fontSize: 120, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 8, lineHeight: 1.25, verticalAlign: 'middle' }),
    textNode('建筑摄影 · 精选作品 36 幅', 64, 1104, 952, 48, { name: '副标题', fontSize: 30, fontFamily: SERIF, textFill: solid(ink), letterSpacing: 4 }),
    textNode('林一  LIN YI', 64, 1352, 700, 48, { name: '品牌', fontSize: 26, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 6 }),
  ])
}

function createDessertMenuDocument(): FreeformDocument {
  const cream = '#fbf4e8'
  const ink = '#3a2a1f'
  const brown = '#6f4a30'
  const orange = '#c4521a'
  const rule = '#e6d6bd'
  const item = (index: number, name: string, price: string) => {
    const y = 676 + index * 92
    const n = NUMBERED[index]
    return [
      lineNode(120, y + 70, 700, rule, 1.5, { name: `隔线${n}`, cap: 'butt' }),
      textNode(name, 120, y, 520, 60, { name: `菜品${n}`, fontSize: 42, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 2 }),
      textNode(price, 640, y, 180, 60, { name: `价格${n}`, fontSize: 42, fontFamily: SERIF, textFill: solid(orange), fontWeight: 'bold', align: 'right' }),
    ]
  }
  return documentFromSlides([
    slide('菜单', solid(cream), [
      illustrationNode('主图', '/templates/art-flowers.svg', '橙黄蓝三色的花和叶子', -48, -48, 660, 660),
      illustrationNode('花束', '/templates/art-flowers.svg', '橙黄蓝三色的花和叶子', 820, 1334, 460, 460, { rotation: 180 }),
      textNode('五月甜品', 990, 140, 190, 760, { name: '标题', fontSize: 160, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', vertical: true, letterSpacing: 16, lineHeight: 1.1 }),
      textNode('Dessert Menu', 680, 420, 520, 100, { name: '英文标语', fontSize: 76, fontFamily: VIBES, textFill: solid(orange), rotation: 90, align: 'center' }),
      textNode('每日现烤 · 当季水果', 120, 600, 700, 48, { name: '副标题', fontSize: 32, fontFamily: SERIF, textFill: solid(brown), letterSpacing: 6 }),
      ...item(0, '栗子蛋糕', '38'),
      ...item(1, '凤梨酥挞', '32'),
      ...item(2, '黑森林蛋糕', '42'),
      ...item(3, '草莓奶酪', '36'),
      ...item(4, '意式提拉米苏', '40'),
      ...item(5, '红莓松糕', '28'),
      ...item(6, '巧克力榛子', '38'),
      ...item(7, '焦糖布丁', '26'),
      pathNode('M 0 10 Q 15 0 30 10 T 60 10 T 90 10 T 120 10 T 150 10', 120, 1410, 150, 20, { name: '波浪线', stroke: orange, strokeWidth: 3, cap: 'round' }),
      textNode('整只蛋糕请提前一天预订，\n所有甜品都可以做小份。', 120, 1452, 640, 110, { name: '正文', fontSize: 30, fontFamily: SERIF, textFill: solid(brown), lineHeight: 1.7 }),
      textNode('叮卡甜品店 · 每日 10:00 – 20:00', 120, 1620, 680, 48, { name: '品牌', fontSize: 30, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 2 }),
    ], A4),
  ])
}

function createWeddingInvitationDocument(): FreeformDocument {
  const ivory = '#f6f2ea'
  const sage = '#55715e'
  const ink = '#2f3a33'
  const muted = '#5f6b63'
  const gold = '#b49a6c'
  return documentFromSlides([
    slide('请柬', solid(ivory), [
      illustrationNode('主图', '/templates/art-eucalyptus.svg', '一圈尤加利叶环', 30, 110, 1020, 1020),
      lineNode(470, 1476, 140, gold, 2, { name: '分隔线', cap: 'butt' }),
      shapeNode('rect', 320, 1620, 440, 104, { type: 'transparent' }, { name: '按钮底板', cornerRadius: 52, stroke: sage, strokeWidth: 2 }),
      textNode('Save the Date', 140, 440, 800, 170, { name: '英文标语', fontSize: 118, fontFamily: VIBES, textFill: solid(sage), align: 'center', lineHeight: 1.3 }),
      textNode('林一 & 陈默', 140, 636, 800, 120, { name: '标题', fontSize: 84, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', align: 'center', letterSpacing: 4 }),
      textNode('我们结婚啦', 140, 780, 800, 64, { name: '副标题', fontSize: 40, fontFamily: SERIF, textFill: solid(muted), align: 'center', letterSpacing: 18 }),
      textNode('2026.12.20', 90, 1160, 900, 120, { name: '信息一', fontSize: 96, fontFamily: SERIF, textFill: solid(ink), align: 'center', letterSpacing: 6 }),
      textNode('星期日 · 下午五点二十分', 90, 1292, 900, 60, { name: '信息二', fontSize: 40, fontFamily: SERIF, textFill: solid(muted), align: 'center', letterSpacing: 4 }),
      textNode('外滩源壹号 · 草坪', 90, 1366, 900, 64, { name: '信息三', fontSize: 44, fontFamily: SERIF, textFill: solid(ink), align: 'center', letterSpacing: 4 }),
      textNode('期待与您一同见证这一天', 90, 1516, 900, 60, { name: '正文', fontSize: 36, fontFamily: SERIF, textFill: solid(muted), align: 'center', letterSpacing: 4 }),
      textNode('敬请回复', 320, 1644, 440, 56, { name: '按钮文字', fontSize: 34, fontFamily: SERIF, textFill: solid(sage), align: 'center', letterSpacing: 12 }),
      textNode('林家 · 陈家 敬邀', 90, 1800, 900, 52, { name: '品牌', fontSize: 30, fontFamily: SERIF, textFill: solid(muted), align: 'center', letterSpacing: 6 }),
    ], STORY),
  ])
}

function createAutumnMarketDocument(): FreeformDocument {
  const cream = '#fbf1e2'
  const rust = '#a83e26'
  const brown = '#6f4127'
  const orange = '#c45f23'
  const muted = '#85654f'
  return documentFromSlides([
    slide('海报', stopsPaint([[0, cream], [1, '#f6e4cc']], 180), [
      illustrationNode('主图', '/templates/art-autumn-leaves.svg', '枫叶、银杏叶和落叶', 0, -36, 1080, 440),
      illustrationNode('落叶', '/templates/art-autumn-leaves.svg', '枫叶、银杏叶和落叶', 120, 1132, 840, 342, { rotation: 180 }),
      lineNode(150, 868, 110, orange, 2, { name: '饰线左', cap: 'butt' }),
      lineNode(820, 868, 110, orange, 2, { name: '饰线右', cap: 'butt' }),
      shapeNode('diamond', 250, 862, 14, 14, solid(orange), { name: '菱形左' }),
      shapeNode('diamond', 816, 862, 14, 14, solid(orange), { name: '菱形右' }),
      textNode('Autumn Market', 90, 396, 900, 104, { name: '英文标语', fontSize: 72, fontFamily: VIBES, textFill: solid(orange), align: 'center', lineHeight: 1.3 }),
      textNode('秋日市集', 60, 512, 960, 224, { name: '标题', fontSize: 172, fontFamily: SERIF, textFill: solid(rust), fontWeight: 'bold', align: 'center', letterSpacing: 16 }),
      textNode('带上朋友，来过一个慢慢的周末', 90, 742, 900, 56, { name: '副标题', fontSize: 36, fontFamily: SERIF, textFill: solid(brown), align: 'center', letterSpacing: 2 }),
      textNode('手作 · 咖啡 · 旧书 · 音乐', 260, 838, 560, 64, { name: '正文', fontSize: 40, fontFamily: SERIF, textFill: solid(orange), fontWeight: 'bold', align: 'center', letterSpacing: 2 }),
      textNode('10 月 24 – 25 日  10:00 起', 90, 938, 900, 70, { name: '信息一', fontSize: 50, fontFamily: SERIF, textFill: solid(brown), fontWeight: 'bold', align: 'center' }),
      textNode('城南创意园 · 中央草坪', 90, 1020, 900, 56, { name: '信息二', fontSize: 36, fontFamily: SERIF, textFill: solid(muted), align: 'center', letterSpacing: 4 }),
      textNode('叮卡生活节', 90, 1088, 900, 44, { name: '品牌', fontSize: 26, fontFamily: SERIF, textFill: solid(brown), fontWeight: 'bold', align: 'center', letterSpacing: 10 }),
    ]),
  ])
}

/**
 * A sun cut into bars by the horizon: the circle's cap above the first cut,
 * then the slices between cuts ([top, height] in the box), one path so its
 * gradient runs on unbroken.
 */
function slicedSun(r: number, cuts: ReadonlyArray<readonly [number, number]>): string {
  const edge = (y: number) => Math.sqrt(Math.max(0, r * r - (y - r) ** 2))
  const point = (x: number, y: number) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`
  const [first] = cuts
  const parts = [`M ${point(r - edge(first[0]), first[0])} A ${r} ${r} 0 1 1 ${point(r + edge(first[0]), first[0])} Z`]
  cuts.forEach(([top, height], index) => {
    const from = top + height
    const to = index + 1 < cuts.length ? cuts[index + 1][0] : 2 * r
    parts.push(`M ${point(r - edge(from), from)} A ${r} ${r} 0 0 0 ${point(r - edge(to), to)} L ${point(r + edge(to), to)} A ${r} ${r} 0 0 0 ${point(r + edge(from), from)} Z`)
  })
  return parts.join(' ')
}

/** A circle drawn as a path, so a big one reads as a mark, not as an empty picture place. */
function circlePath(cx: number, cy: number, r: number) {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
}

function createMagazineCoverDocument(): FreeformDocument {
  const paper = '#eeeae2'
  const ink = '#171513'
  const muted = '#655f56'
  return documentFromSlides([
    slide('封面', solid(paper), [
      textNode('DING', 40, 36, 1000, 320, { name: '刊名', fontSize: 290, fontFamily: PLAYFAIR, textFill: solid(ink), align: 'center', letterSpacing: 40, lineHeight: 1.1 }),
      lineNode(88, 362, 904, ink, 2, { name: '刊头线', cap: 'butt' }),
      textNode('VOL.12', 88, 382, 260, 40, { name: '角标', fontSize: 26, fontFamily: PLAYFAIR, textFill: solid(ink), letterSpacing: 4 }),
      textNode('2026 秋季号 · 城市与生活', 360, 382, 632, 40, { name: '副标题', fontSize: 26, fontFamily: SANS, textFill: solid(ink), align: 'right', letterSpacing: 4 }),
      pictureShape('主图', '/templates/editorial-building.webp', 88, 450, 904, 690),
      textNode('城市里的慢生活', 88, 1168, 904, 112, { name: '标题', fontSize: 88, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('从一条街开始，重新认识你住了五年的地方', 88, 1290, 904, 48, { name: '正文', fontSize: 32, fontFamily: SERIF, textFill: solid(muted), letterSpacing: 1 }),
      lineNode(88, 1352, 904, ink, 1.5, { name: '页脚线', cap: 'butt' }),
      textNode('建筑 · 旅行 · 生活方式', 88, 1366, 600, 40, { name: '品牌', fontSize: 24, fontFamily: SANS, textFill: solid(ink), letterSpacing: 6 }),
      textNode('¥ 48', 692, 1366, 300, 40, { name: '信息一', fontSize: 26, fontFamily: PLAYFAIR, textFill: solid(ink), align: 'right', fontWeight: 'bold' }),
    ]),
  ])
}

/** The magazine without a cover photo: the cover line set large where the photo was. */
function magazineCoverTextOnly(): FreeformSlide {
  const paper = '#eeeae2'
  const ink = '#171513'
  const muted = '#655f56'
  return slide('封面', solid(paper), [
    textNode('DING', 40, 36, 1000, 320, { name: '刊名', fontSize: 290, fontFamily: PLAYFAIR, textFill: solid(ink), align: 'center', letterSpacing: 40, lineHeight: 1.1 }),
    lineNode(88, 362, 904, ink, 2, { name: '刊头线', cap: 'butt' }),
    lineNode(88, 1112, 904, ink, 6, { name: '标题线', cap: 'butt' }),
    lineNode(88, 1352, 904, ink, 1.5, { name: '页脚线', cap: 'butt' }),
    textNode('VOL.12', 88, 382, 260, 40, { name: '角标', fontSize: 26, fontFamily: PLAYFAIR, textFill: solid(ink), letterSpacing: 4 }),
    textNode('2026 秋季号 · 城市与生活', 360, 382, 632, 40, { name: '副标题', fontSize: 26, fontFamily: SANS, textFill: solid(ink), align: 'right', letterSpacing: 4 }),
    textNode('城市里的\n慢生活', 88, 470, 904, 620, { name: '标题', fontSize: 150, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.2, letterSpacing: 6, verticalAlign: 'middle' }),
    textNode('从一条街开始，重新认识你住了五年的地方', 88, 1140, 904, 96, { name: '正文', fontSize: 32, fontFamily: SERIF, textFill: solid(muted), letterSpacing: 1, lineHeight: 1.4 }),
    textNode('建筑 · 旅行 · 生活方式', 88, 1366, 600, 40, { name: '品牌', fontSize: 24, fontFamily: SANS, textFill: solid(ink), letterSpacing: 6 }),
    textNode('¥ 48', 692, 1366, 300, 40, { name: '信息一', fontSize: 26, fontFamily: PLAYFAIR, textFill: solid(ink), align: 'right', fontWeight: 'bold' }),
  ])
}

function createBookListDocument(): FreeformDocument {
  const paper = '#f3eee4'
  const ink = '#26221d'
  const muted = '#6f675c'
  const shelf = 900
  const leaning = { x: 809, y: 374, width: 112, height: 520 }
  const books = [
    { x: 112, width: 118, height: 560, color: '#2f4b3d', text: '#f3ecdf', title: '慢慢来', note: '林夕 · 写给总在赶路的人' },
    { x: 244, width: 96, height: 486, color: '#c4583a', text: '#fbf3e8', title: '去看海', note: '陈默 · 一个人的旅行散文' },
    { x: 354, width: 138, height: 600, color: '#e7c46a', text: '#2a2620', title: '一个人的厨房', note: '苏禾 · 三十道一人食' },
    { x: 506, width: 104, height: 470, color: '#3d5c8c', text: '#f3f0ea', title: '城市漫步', note: '周遥 · 走路看城市' },
    { x: 624, width: 124, height: 540, color: '#2a2622', text: '#efe6d6', title: '夜晚的书', note: '许眠 · 失眠时读的短篇' },
  ]
  return documentFromSlides([
    slide('书单', solid(paper), [
      shapeNode('rect', 72, shelf, 936, 18, solid('#8a6a4f'), { name: '书架', cornerRadius: 2 }),
      lineNode(72, 932, 936, '#d9cdb8', 2, { name: '分隔线', cap: 'butt' }),
      ...books.flatMap((book, index) => {
        const n = NUMBERED[index]
        const top = shelf - book.height
        const band = (y: number, suffix: string) => shapeNode('rect', book.x, y, book.width, 8, solid(book.text), { name: `书标${n}${suffix}`, opacity: 0.55 })
        return [
          shapeNode('rect', book.x, top, book.width, book.height, solid(book.color), { name: `书脊${n}`, cornerRadius: 6 }),
          band(top + 40, ''),
          band(shelf - 56, '下'),
          textNode(book.title, book.x + (book.width - 64) / 2, top + 76, 64, book.height - 160, { name: `书名${n}`, fontSize: 40, fontFamily: SERIF, textFill: solid(book.text), fontWeight: 'bold', vertical: true, letterSpacing: 8, lineHeight: 1.1 }),
        ]
      }),
      // One more book leans on the row's end, resting on the shelf and its neighbour, its bands turned with it.
      shapeNode('rect', leaning.x, leaning.y, leaning.width, leaning.height, solid('#b49a74'), { name: '斜书', cornerRadius: 6, rotation: -14 }),
      ...[leaning.y + 40, leaning.y + leaning.height - 56].map((y, index) => {
        const at = turnedWith({ x: leaning.x, y, width: leaning.width, height: 8 }, leaning, -14)
        return shapeNode('rect', at.x, at.y, leaning.width, 8, solid('#f3ecdf'), { name: index === 0 ? '斜书标' : '斜书标下', opacity: 0.55, rotation: -14 })
      }),
      textNode('十月书单', 64, 72, 952, 150, { name: '标题', fontSize: 120, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 10 }),
      textNode('这个月读完的五本书，每一本都想推荐给你', 64, 232, 952, 48, { name: '副标题', fontSize: 32, fontFamily: SANS, textFill: solid(muted), letterSpacing: 2 }),
      ...books.flatMap((book, index) => {
        const n = NUMBERED[index]
        const y = 968 + index * 60
        return [
          textNode(String(index + 1).padStart(2, '0'), 72, y, 72, 44, { name: `序号${n}`, fontSize: 30, fontFamily: PLAYFAIR, textFill: solid(book.color === '#e7c46a' ? '#a2781a' : book.color), fontWeight: 'bold' }),
          textNode(book.note, 156, y, 860, 44, { name: `推荐${n}`, fontSize: 30, fontFamily: SANS, textFill: solid(ink) }),
        ]
      }),
      textNode('@林一的书房', 64, 1328, 952, 44, { name: '品牌', fontSize: 26, fontFamily: SANS, textFill: solid(muted), letterSpacing: 4 }),
    ]),
  ])
}

function createWordOfYearDocument(): FreeformDocument {
  const paper = '#f4f1ea'
  const ink = '#1b1917'
  const red = '#b8322a'
  const muted = '#6a645b'
  return documentFromSlides([
    slide('海报', solid(paper), [
      textNode('2026 年度汉字', 88, 120, 620, 52, { name: '副标题', fontSize: 34, fontFamily: SERIF, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 12 }),
      textNode('Word of the Year', 600, 124, 392, 48, { name: '英文', fontSize: 30, fontFamily: PLAYFAIR, textFill: solid(muted), italic: true, align: 'right' }),
      lineNode(88, 190, 904, ink, 2, { name: '刊头线', cap: 'butt' }),
      textNode('wěn', 140, 286, 800, 120, { name: '拼音', fontSize: 92, fontFamily: PLAYFAIR, textFill: solid(muted), italic: true, align: 'center' }),
      textNode('稳', 90, 400, 900, 840, { name: '标题', fontSize: 800, fontFamily: BRUSH, textFill: solid(ink), align: 'center', lineHeight: 1.05 }),
      shapeNode('rect', 786, 1250, 120, 120, solid(red), { name: '印章', cornerRadius: 8, rotation: -4 }),
      textNode('年度', 786, 1270, 120, 80, { name: '印章文字', fontSize: 50, fontFamily: BRUSH, textFill: solid('#ffffff'), align: 'center', rotation: -4, lineHeight: 1.2 }),
      textNode('稳，是这一年最想对自己说的话。\n不急，不慌，一步一步，把日子过稳。', 88, 1410, 904, 150, { name: '正文', fontSize: 40, fontFamily: SERIF, textFill: solid(ink), align: 'center', lineHeight: 1.75 }),
      lineNode(500, 1610, 80, red, 3, { name: '短线', cap: 'butt' }),
      textNode('你的年度汉字是哪一个？', 88, 1648, 904, 56, { name: '信息一', fontSize: 34, fontFamily: SERIF, textFill: solid(muted), align: 'center', letterSpacing: 4 }),
      textNode('叮卡 · 年终特辑', 88, 1796, 904, 48, { name: '品牌', fontSize: 28, fontFamily: SERIF, textFill: solid(ink), align: 'center', letterSpacing: 8 }),
    ], STORY),
  ])
}

function createMusicFestivalDocument(): FreeformDocument {
  const night = '#190a34'
  const white = '#ffffff'
  const yellow = '#ffd54a'
  const pink = '#ff6fa8'
  // The horizon cuts the sun into bars, thicker toward the ground.
  const cuts = [[380, 10], [440, 14], [492, 18], [540, 22], [586, 26], [632, 30]] as const
  const row = (index: number, label: string, value: string) => {
    const y = 1508 + index * 64
    const n = NUMBERED[index]
    return [
      textNode(label, 96, y + 4, 110, 44, { name: `标签${n}`, fontSize: 28, fontFamily: SANS, textFill: solid(yellow), fontWeight: 'bold', letterSpacing: 4 }),
      textNode(value, 210, y, 806, 50, { name: `信息${n}`, fontSize: 32, fontFamily: SANS, textFill: solid(white) }),
    ]
  }
  const grid = [
    ...[0, 180, 360, 540, 720, 900, 1080].map((x) => `M 540 0 L ${x} 220`),
    ...[36, 84, 146, 220].map((y) => `M 0 ${y} L 1080 ${y}`),
  ].join(' ')
  return documentFromSlides([
    slide('海报', stopsPaint([[0, night], [1, '#2c0b4f']], 180), [
      pathNode(slicedSun(350, cuts), 190, 260, 700, 700, { name: '太阳', fill: stopsPaint([[0, '#ffe066'], [0.55, '#ff8a5b'], [1, '#ff3d81']], 180), strokeWidth: 0 }),
      lineNode(48, 954, 984, pink, 4, { name: '地平线', cap: 'butt' }),
      pathNode(grid, 0, 960, 1080, 220, { name: '网格', stroke: pink, strokeWidth: 2, opacity: 0.55 }),
      textNode('SOUND WAVE FESTIVAL', 64, 84, 640, 44, { name: '品牌', fontSize: 26, fontFamily: SANS, textFill: solid(white), fontWeight: 'bold', letterSpacing: 6 }),
      textNode('VOL.03', 716, 80, 300, 48, { name: '角标', fontSize: 32, fontFamily: ARCHIVO, textFill: solid(white), align: 'right' }),
      textNode('LIVE MUSIC', 40, 1196, 1000, 170, { name: '英文标语', fontSize: 132, fontFamily: ARCHIVO, textFill: solid(white), align: 'center', letterSpacing: -2, lineHeight: 1.15 }),
      textNode('声浪音乐节', 64, 1366, 952, 112, { name: '标题', fontSize: 84, fontFamily: SANS, textFill: solid(white), fontWeight: 'bold', align: 'center', letterSpacing: 14 }),
      ...row(0, '周六', '落日飞行 · 海边的风 · 白日梦乐队'),
      ...row(1, '周日', '晚安星球 · 野草莓 · 城市漫游者'),
      ...row(2, '地点', '滨江公园大草坪 · 11 月 21 — 22 日'),
      shapeNode('rect', 340, 1724, 400, 96, solid(white), { name: '按钮底板', cornerRadius: 48 }),
      textNode('立即购票', 340, 1746, 400, 52, { name: '按钮文字', fontSize: 36, fontFamily: SANS, textFill: solid(night), fontWeight: 'bold', align: 'center', letterSpacing: 8 }),
    ], STORY),
  ])
}

/** The red and blue airmail stripes round a card's edge, as one path per colour. */
function airmailStripes(width: number, height: number, inset: number, band: number, offset: number): string {
  const run = 30
  const period = run * 4
  const parts: string[] = []
  for (let x = inset + offset; x < width - inset; x += period) {
    for (const y of [inset, height - inset - band]) {
      parts.push(`M ${x} ${y} L ${x + run} ${y} L ${x + run - band} ${y + band} L ${x - band} ${y + band} Z`)
    }
  }
  for (let y = inset + band + offset; y < height - inset - band; y += period) {
    for (const x of [inset, width - inset - band]) {
      parts.push(`M ${x} ${y} L ${x + band} ${y - band} L ${x + band} ${y - band + run} L ${x} ${y + run} Z`)
    }
  }
  return parts.join(' ')
}

/** A stamp's perforations: half-holes along its edges, cut in the card's colour. */
function perforations(x: number, y: number, width: number, height: number, radius: number, step: number): string {
  const hole = (cx: number, cy: number) => `M ${cx - radius} ${cy} A ${radius} ${radius} 0 1 0 ${cx + radius} ${cy} A ${radius} ${radius} 0 1 0 ${cx - radius} ${cy} Z`
  const parts: string[] = []
  for (let cx = x + step / 2; cx < x + width; cx += step) parts.push(hole(cx, y), hole(cx, y + height))
  for (let cy = y + step / 2; cy < y + height; cy += step) parts.push(hole(x, cy), hole(x + width, cy))
  return parts.join(' ')
}

function createTravelPostcardDocument(): FreeformDocument {
  const paper = '#f7f1e4'
  const red = '#cf3b2e'
  const blue = '#2a4f9e'
  const ink = '#2b2724'
  const muted = '#655d52'
  const rule = '#d9cdb8'
  const stamp = { x: 790, y: 96, width: 200, height: 244 }
  return documentFromSlides([
    slide('明信片', solid(paper), [
      pathNode(airmailStripes(1080, 1440, 22, 22, 0), 0, 0, 1080, 1440, { name: '航空边红', fill: solid(red), strokeWidth: 0 }),
      pathNode(airmailStripes(1080, 1440, 22, 22, 60), 0, 0, 1080, 1440, { name: '航空边蓝', fill: solid(blue), strokeWidth: 0 }),
      ...Array.from({ length: 6 }, (_, index) => shapeNode('rect', 88 + index * 54, 98, 44, 44, { type: 'transparent' }, { name: `邮编框${NUMBERED[index]}`, stroke: red, strokeWidth: 2.5, cornerRadius: 2 })),
      shapeNode('rect', stamp.x, stamp.y, stamp.width, stamp.height, solid('#ffffff'), { name: '邮票', shadow: { color: '#d8ccb6', blur: 12, offsetX: 0, offsetY: 4 } }),
      pathNode(perforations(8, 8, stamp.width, stamp.height, 7, 20), stamp.x - 8, stamp.y - 8, stamp.width + 16, stamp.height + 16, { name: '齿孔', fill: solid(paper), strokeWidth: 0 }),
      pictureShape('主图', '/templates/grid-sunset.svg', stamp.x + 16, stamp.y + 16, stamp.width - 32, stamp.height - 72),
      textNode('80 分', stamp.x + 16, stamp.y + stamp.height - 50, stamp.width - 32, 36, { name: '面值', fontSize: 24, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', align: 'right' }),
      shapeNode('ellipse', 616, 248, 196, 196, { type: 'transparent' }, { name: '邮戳', stroke: ink, strokeWidth: 3, opacity: 0.6 }),
      textNode('厦门\n2026.10.13', 616, 300, 196, 96, { name: '邮戳文字', fontSize: 26, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', align: 'center', rotation: -10, opacity: 0.7, lineHeight: 1.5 }),
      pathNode('M 0 20 Q 30 0 60 20 T 120 20 T 180 20 M 0 50 Q 30 30 60 50 T 120 50 T 180 50 M 0 80 Q 30 60 60 80 T 120 80 T 180 80', 430, 300, 180, 100, { name: '邮戳波纹', stroke: ink, strokeWidth: 3, opacity: 0.45, cap: 'round' }),
      textNode('POST CARD', 88, 172, 640, 84, { name: '英文标语', fontSize: 64, fontFamily: PLAYFAIR, textFill: solid(ink), letterSpacing: 12, lineHeight: 1.2 }),
      textNode('Greetings from the sea', 88, 258, 520, 40, { name: '英文', fontSize: 28, fontFamily: PLAYFAIR, textFill: solid(muted), italic: true }),
      textNode('来自海边的问候', 88, 400, 904, 92, { name: '标题', fontSize: 68, fontFamily: KAI, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 6 }),
      ...Array.from({ length: 6 }, (_, index) => lineNode(88, 576 + index * 72 - 6, 904, rule, 2, { name: `横线${NUMBERED[index]}`, cap: 'butt' })),
      textNode('这里的风是咸的，傍晚的海是粉色的。\n住在看得见灯塔的小旅馆，每天早上被海鸥叫醒。\n等你有空，我们一起来。', 88, 516, 904, 430, { name: '正文', fontSize: 40, fontFamily: KAI, textFill: solid(ink), lineHeight: 1.8 }),
      textNode('—— 林一，于厦门', 492, 960, 500, 56, { name: '署名', fontSize: 36, fontFamily: KAI, textFill: solid(ink), align: 'right' }),
      lineNode(88, 1060, 904, rule, 2, { name: '分隔线', cap: 'butt', dash: 10 }),
      textNode('TO', 88, 1100, 120, 64, { name: '收件', fontSize: 48, fontFamily: PLAYFAIR, textFill: solid(red), italic: true }),
      textNode('远方的你', 210, 1104, 600, 60, { name: '收件人', fontSize: 44, fontFamily: KAI, textFill: solid(ink), letterSpacing: 4 }),
      lineNode(210, 1172, 782, rule, 2, { name: '地址线一', cap: 'butt' }),
      textNode('北京市东城区 · 胡同里的那扇红门', 210, 1196, 782, 52, { name: '信息一', fontSize: 34, fontFamily: KAI, textFill: solid(muted) }),
      lineNode(210, 1258, 782, rule, 2, { name: '地址线二', cap: 'butt' }),
    ]),
  ])
}

function createDesignWeekDocument(): FreeformDocument {
  const paper = '#f1f0eb'
  const ink = '#111111'
  const red = '#e3352b'
  const muted = '#55544f'
  const column = (index: number, label: string, value: string) => {
    const x = 64 + index * 320
    const n = NUMBERED[index]
    return [
      lineNode(x, 1474, 292, ink, 3, { name: `栏线${n}`, cap: 'butt' }),
      textNode(label, x, 1494, 292, 40, { name: `标签${n}`, fontSize: 26, fontFamily: SANS, textFill: solid(red), fontWeight: 'bold', letterSpacing: 4 }),
      textNode(value, x, 1546, 292, 110, { name: `信息${n}`, fontSize: 32, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', lineHeight: 1.5 }),
    ]
  }
  return documentFromSlides([
    slide('海报', solid(paper), [
      pathNode(circlePath(260, 260, 260), 520, 210, 520, 520, { name: '红圆', fill: solid(red), strokeWidth: 0 }),
      textNode('26', 30, 120, 1020, 800, { name: '角标', fontSize: 760, fontFamily: ARCHIVO, textFill: solid(ink), letterSpacing: -40, lineHeight: 1.05 }),
      textNode('DESIGN WEEK 2026', 966, 984, 74, 470, { name: '副标题', fontSize: 38, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', vertical: true, letterSpacing: 4, lineHeight: 1.2 }),
      lineNode(64, 944, 952, ink, 6, { name: '刊头线', cap: 'butt' }),
      textNode('城市设计周', 64, 984, 880, 150, { name: '标题', fontSize: 124, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 6 }),
      lineNode(64, 1160, 96, red, 8, { name: '标题线', cap: 'butt' }),
      textNode('三十场展览、四十场讲座，\n看设计怎样改变一座城市。', 64, 1206, 880, 130, { name: '正文', fontSize: 38, fontFamily: SANS, textFill: solid(muted), lineHeight: 1.6 }),
      ...column(0, '时间', '11.18 — 11.24\n10:00 — 20:00'),
      ...column(1, '地点', '西岸艺术中心\n徐汇区龙腾大道'),
      ...column(2, '票价', '免费预约\n现场 50 元'),
      lineNode(64, 1786, 952, ink, 2, { name: '页脚线', cap: 'butt' }),
      textNode('主办：城市设计研究所', 64, 1808, 700, 48, { name: '品牌', fontSize: 28, fontFamily: SANS, textFill: solid(ink), fontWeight: 'bold', letterSpacing: 2 }),
      textNode('No.07', 716, 1808, 300, 48, { name: '编号', fontSize: 30, fontFamily: ARCHIVO, textFill: solid(ink), align: 'right' }),
    ], STORY),
  ])
}

type TemplateMeta = Pick<TemplateDefinition, 'title' | 'description' | 'pageCount' | 'tags' | 'format'>

const markdownSeriesMeta: Record<MarkdownTemplateSeriesId, TemplateMeta> = {
  column: {
    title: '专栏',
    description: '宋体正文配一点朱红，标题、导语、图注和引文都按杂志的版式排，适合随笔、观察和长文。',
    pageCount: 5,
    tags: ['随笔', '长文'],
    format: 'xhs',
  },
  memo: {
    title: '备忘录',
    description: '像手机里的一页备忘录：顶栏、日期、能勾选的待办和荧光笔重点，适合清单、攻略和生活记录。',
    pageCount: 3,
    tags: ['清单', '生活'],
    format: 'xhs',
  },
  letter: {
    title: '信笺',
    description: '霞鹜文楷写在红格信纸上，段落首行缩进，适合书信、日记和写给自己的话。',
    pageCount: 3,
    tags: ['书信', '日记'],
    format: 'xhs',
  },
  night: {
    title: '夜读',
    description: '深色底、暖灰色宋体和一弯金色月亮，适合读书笔记、夜晚随笔和情绪文字。',
    pageCount: 4,
    tags: ['读书', '随笔'],
    format: 'xhs',
  },
  aurora: {
    title: '极光',
    description: '柔和的彩色光晕上铺一张磨砂卡片，适合生活方式、习惯清单和成长分享。',
    pageCount: 4,
    tags: ['生活', '成长'],
    format: 'xhs',
  },
  doc: {
    title: '文档',
    description: '知识库式的页面：顶部路径、提示框、代码块和表格，适合教程、速查表和干货整理。',
    pageCount: 4,
    tags: ['教程', '干货'],
    format: 'xhs',
  },
  xuan: {
    title: '宣纸',
    description: '宣纸底色、宋体首行缩进，页码刻成一方朱红印章，适合节气、诗词和传统文化。',
    pageCount: 4,
    tags: ['国风', '节气'],
    format: 'xhs',
  },
  swiss: {
    title: '瑞士',
    description: '黑色粗线、一抹红和大号页码，像一页国际主义版式，适合设计、方法和观点。',
    pageCount: 4,
    tags: ['观点', '方法'],
    format: 'xhs',
  },
  journal: {
    title: '手账',
    description: '点阵纸上的霞鹜文楷，配荧光笔标题、胶带和便利贴，适合周末记录、vlog 和手账。',
    pageCount: 4,
    tags: ['手账', '生活'],
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
  brutalist: deck('粗野', '黄黑撞色、硬阴影和粗线，适合宣言与规则清单。', ['宣言', '海报']),
  blueprint: deck('蓝图', '工程网格、尺寸标注和图签，适合计划与结构拆解。', ['计划', '结构']),
  'talk-poster': poster('讲座', '大图配大标题，时间、地点、嘉宾一目了然，适合讲座、分享会和活动报名。', ['活动', '讲座'], 'story'),
  'sale-poster': poster('促销', '大字优惠配产品插画，适合新品、折扣和门店活动。', ['促销', '门店'], 'story'),
  'hiring-poster': poster('招聘', '团队头像排成一格，空着的那格留给新人，下面列职位和投递方式，适合招聘和团队介绍。', ['招聘', '团队'], 'story'),
  'festival-poster': poster('节日', '月亮、祥云和竖排标题，适合中秋等节日问候。', ['节日', '问候'], 'story'),
  invitation: poster('邀请函', '金色边框、居中排版，适合晚宴、发布会和典礼邀请。', ['邀请', '活动'], 'story'),
  'quote-card': poster('金句', '一句话配出处，适合金句、日签和读书摘抄。', ['金句', '日签'], 'square'),
  'product-card': poster('商品主图', '产品图配卖点和价格角标，适合电商主图和新品介绍。', ['电商', '产品'], 'square'),
  'video-cover': poster('视频封面', '相机取景框里的超大标题，带录制、时间码和对焦框，适合视频和直播封面。', ['封面', '视频', 'vlog'], 'landscape'),
  'article-cover': poster('公众号首图', '标题在左、图片在右，适合公众号文章首图。', ['封面', '公众号'], 'wechat-cover'),
  flyer: poster('宣传单', 'A4 单页：大标题、插画、时间地点和预约按钮，适合课程和活动传单。', ['印刷', '课程'], 'a4'),
  'note-cover': poster('干货笔记', '格子纸、荧光笔大标题和三条要点，适合小红书知识类笔记封面。', ['小红书', '封面'], 'xhs'),
  'photo-cover': poster('图片拼贴', '照片配胶带和角标贴纸，下面是大标题，适合小红书探店、旅行和生活封面。', ['小红书', '封面'], 'xhs'),
  menu: poster('菜单', 'A4 单页：店名大标题、八道菜品和价格，适合咖啡店、餐厅和饮品菜单。', ['菜单', '餐饮'], 'a4'),
  'price-list': poster('价目表', '撕下来的小票：虚线隔开的项目和价格、预约框和条码，适合美甲、美发、咖啡和工作室。', ['价目表', '门店', '小票'], 'story'),
  certificate: poster('证书', '金色双框、居中大字和奖章，适合荣誉证书、获奖证书和结业证书。', ['证书', '印刷'], 'a4-landscape'),
  'moments-grid': poster('朋友圈九宫格', '一整张插画配横跨中间一排的大标题，导出时切成九张，发朋友圈拼成一张大图。', ['朋友圈', '节日'], 'moments-grid'),
  timetable: poster('课程表', '表格按科目自动配色，适合学校课程表、培训排课和每周计划。', ['课程表', '学校'], 'a4-landscape'),
  'data-roundup': poster('数据盘点', '朱红大年份配三个大数字和一张柱状图，像杂志的数据页，适合年度盘点、月度总结和数据海报。', ['盘点', '数据'], 'story'),
  'birthday-card': poster('生日贺卡', '花体 Happy Birthday 配宋体祝福和几片彩纸，适合生日祝福、纪念日和好友卡片。', ['生日', '祝福'], 'square'),
  'compare-table': poster('对比表', '蓝色刊头配一张大字号的对比表格和一句结论，适合产品对比、方案选择和清单式总结。', ['对比', '清单'], 'story'),
  'growth-timeline': poster('成长记录', '墨绿底上金色大年份和一条时间线，一个节点一件事，适合年度总结、成长复盘和里程碑打卡。', ['成长', '复盘'], 'story'),
  'exhibition-poster': poster('展览海报', '黑白水墨条纹配超大 exhibition. 字标，适合展览、发布会和艺术活动。', ['展览', '活动'], 'story'),
  'launch-poster': poster('新品预告', '深色底上的彩色光斑、毛玻璃信息板和 COMING SOON 大字，适合新品预告、发布倒计时和预约。', ['新品', '预告'], 'story'),
  'solar-term': poster('节气', '水墨远山、落日和竖排毛笔大字，配一方红印，适合节气、节日和传统文化日签。', ['节气', '国风'], 'story'),
  'podcast-cover': poster('播客封面', '包豪斯色块和几何圆，配期数大字，适合播客、电台和系列节目封面。', ['播客', '封面'], 'square'),
  'pitch-cover': poster('演示封面', '雾面渐变底上一行巨大的标题，适合商业计划书、汇报和演讲的首页。', ['演示', '汇报'], 'landscape'),
  'portfolio-cover': poster('作品集封面', 'Playfair 大字 PORTFOLIO 压在黑白照片上，配一枚红签，适合作品集、摄影集和个人主页封面。', ['作品集', '封面'], 'xhs'),
  'dessert-menu': poster('甜品菜单', 'A4 单页：竖排大标题、八道甜品和价格，两角配橙黄蓝的花，适合甜品店、面包店和下午茶菜单。', ['菜单', '餐饮'], 'a4'),
  'wedding-invitation': poster('婚礼请柬', '尤加利叶环里写着花体 Save the Date 和两个人的名字，适合婚礼、订婚和纪念日邀请。', ['婚礼', '邀请'], 'story'),
  'autumn-market': poster('秋日市集', '枫叶和银杏叶上下围着宋体大标题，适合市集、秋季活动和周末聚会。', ['市集', '活动'], 'xhs'),
  'magazine-cover': poster('杂志封面', 'Playfair 大字刊名、细线刊头和一张大图，像一本独立杂志的封面，适合小红书封面、专题和期刊。', ['杂志', '封面'], 'xhs'),
  'book-list': poster('书单', '一排彩色书脊立在书架上，书名竖排在书脊里，下面一本一句推荐，适合书单、好物清单和年度推荐。', ['书单', '读书'], 'xhs'),
  'word-of-year': poster('年度汉字', '一个毛笔大字配拼音和一方朱红印章，适合年度汉字、年终总结和新年愿望。', ['年终', '国风'], 'story'),
  'music-festival': poster('音乐节', '夜空里一轮被地平线切开的渐变太阳和霓虹网格，配大字标题和演出阵容，适合音乐节、演出和派对。', ['音乐', '活动'], 'story'),
  'travel-postcard': poster('旅行明信片', '红蓝航空信封边、带齿孔的邮票和邮戳，霞鹜文楷写在横线上，适合旅行分享、问候和祝福。', ['旅行', '问候'], 'xhs'),
  'design-week': poster('设计周', '黑字大号数字压在一个红圆上，下面三栏信息，国际主义版式，适合设计周、展会和论坛。', ['展会', '设计'], 'story'),
}

const freeformFactories: Record<FreeformTemplateSeriesId, () => FreeformDocument> = {
  editorial: createEditorialDocument,
  checklist: createChecklistDocument,
  signal: createSignalDocument,
  'night-flight': createNightFlightDocument,
  brutalist: createBrutalistDocument,
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
  'data-roundup': createDataRoundupDocument,
  'birthday-card': createBirthdayCardDocument,
  'growth-timeline': createGrowthTimelineDocument,
  'compare-table': createCompareTableDocument,
  'exhibition-poster': createExhibitionPosterDocument,
  'launch-poster': createLaunchPosterDocument,
  'solar-term': createSolarTermDocument,
  'podcast-cover': createPodcastCoverDocument,
  'pitch-cover': createPitchCoverDocument,
  'portfolio-cover': createPortfolioCoverDocument,
  'dessert-menu': createDessertMenuDocument,
  'wedding-invitation': createWeddingInvitationDocument,
  'autumn-market': createAutumnMarketDocument,
  'magazine-cover': createMagazineCoverDocument,
  'book-list': createBookListDocument,
  'word-of-year': createWordOfYearDocument,
  'music-festival': createMusicFestivalDocument,
  'travel-postcard': createTravelPostcardDocument,
  'design-week': createDesignWeekDocument,
}

/**
 * The inner pages a deck draws besides its section page, by series. The
 * composer picks one by what a page holds (src/templates/slots.ts says where
 * the words go); the deck's own document keeps its three pages.
 */
export const FREEFORM_DECK_LAYOUTS: Partial<Record<FreeformDeckSeriesId, Record<DeckLayoutId, () => FreeformSlide>>> = {
  editorial: EDITORIAL_LAYOUTS,
  checklist: CHECKLIST_LAYOUTS,
  signal: SIGNAL_LAYOUTS,
  'night-flight': NIGHT_FLIGHT_LAYOUTS,
  brutalist: BRUTALIST_LAYOUTS,
  blueprint: BLUEPRINT_LAYOUTS,
}

/**
 * Posters drawn again for content that comes without a picture: the same
 * layers and slots (src/templates/slots.ts says where they differ), with type
 * and the template's colours holding the page where the photo or the
 * illustration was. The composer sets content without an image here.
 */
export const FREEFORM_POSTER_TEXT_ONLY: Partial<Record<FreeformPosterSeriesId, () => FreeformSlide>> = {
  'talk-poster': talkPosterTextOnly,
  'sale-poster': salePosterTextOnly,
  'product-card': productCardTextOnly,
  'article-cover': articleCoverTextOnly,
  flyer: flyerTextOnly,
  'photo-cover': photoCoverTextOnly,
  'portfolio-cover': portfolioCoverTextOnly,
  'magazine-cover': magazineCoverTextOnly,
}

const markdownSeriesIds: MarkdownTemplateSeriesId[] = [
  'column',
  'memo',
  'letter',
  'night',
  'aurora',
  'doc',
  'xuan',
  'swiss',
  'journal',
]
const freeformSeriesIds: FreeformTemplateSeriesId[] = [
  'editorial',
  'checklist',
  'signal',
  'night-flight',
  'brutalist',
  'blueprint',
  // Posters, the scenes asked for most first.
  'note-cover',
  'photo-cover',
  'magazine-cover',
  'book-list',
  'portfolio-cover',
  'menu',
  'dessert-menu',
  'price-list',
  'certificate',
  'moments-grid',
  'timetable',
  'exhibition-poster',
  'design-week',
  'music-festival',
  'talk-poster',
  'launch-poster',
  'sale-poster',
  'hiring-poster',
  'festival-poster',
  'solar-term',
  'word-of-year',
  'invitation',
  'wedding-invitation',
  'birthday-card',
  'travel-postcard',
  'autumn-market',
  'quote-card',
  'product-card',
  'video-cover',
  'pitch-cover',
  'podcast-cover',
  'article-cover',
  'flyer',
  'data-roundup',
  'compare-table',
  'growth-timeline',
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
