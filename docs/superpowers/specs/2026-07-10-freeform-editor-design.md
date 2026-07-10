# 自由编辑模式设计说明

日期：2026-07-10  
分支：`feature/freeform-editor`  
状态：用户已确认方向，等待 spec review 与用户最终 review

## 1. 背景

当前应用是一套 Markdown 到卡片的图文切片工具：左侧 Markdown 编辑，右侧卡片预览和导出。现有模式应继续保留，不被自由编辑功能替换。

本设计新增第二套独立工作区：自由编辑模式。它面向类似 PPT 的排版场景，用户可以在页面内自由放置文本框、图片、形状、线条和箭头；每个作品可包含多页，每页可拥有独立尺寸，并可单页导出 PNG 或批量打包导出。

当前代码里 `App.tsx` 集中了 Markdown 编辑、分页、预览、导出、草稿和弹窗状态。自由编辑模式不应继续塞进现有 `App`，而应拆出应用壳和两个工作区，避免两套产品形态互相污染。

## 2. 目标与非目标

### 2.1 目标

- 保留现有 Markdown 卡片模式的入口、编辑体验、草稿和导出能力。
- 新增独立的自由编辑模式，作为第二套功能。
- 一个自由编辑作品包含多张页面。
- 每张页面可以单独设置尺寸。
- 新建页面默认继承当前页面尺寸。
- 提供常用比例预设：`1:1`、`3:4`、`4:3`、`9:16`、`16:9`。
- 支持自定义像素宽高。
- 支持插入文本框、图片、矩形、圆形、直线、箭头。
- 支持封闭形状的图片填充。
- 支持元素选择、移动、缩放、旋转、删除、复制粘贴、基础图层调整和基础撤销重做。
- 支持单页 PNG 导出。
- 支持多页 ZIP 导出；当作品内页面尺寸混合时提示用户，但不阻止导出。
- 引入版本化草稿模型，旧 Markdown 草稿能继续读取。

### 2.2 第一版不做

- 动画和转场。
- 表格和图表。
- 母版页、主题模板和批量套版。
- 云同步、协作编辑和分享链接。
- 对外部 PPT 文件的导入或导出。
- 完整 PowerPoint 级别的所有快捷键。
- 任意 HTML 导入。

### 2.3 第一版延后增强

以下能力按架构预留，但不作为第一版闭环的硬要求：

- 组合和取消组合。
- 锁定和隐藏。
- 复杂形状库。
- 复杂自由形状路径编辑。
- 复杂图片蒙版编辑。
- 高级吸附规则。
- 批量替换字体、主题色和品牌模板。

## 3. 产品设计

### 3.1 模式入口

应用顶层增加工作区模式切换：

- `Markdown 卡片`
- `自由编辑`

命名使用明确的业务名，代码中不要把它简写成含义模糊的 `Mode`。当前项目已有深浅色模式使用 `slicer.mode.v1`，该 key 只代表应用主题，不用于保存工作区模式。

建议代码类型：

```ts
type WorkspaceMode = 'markdown-card' | 'freeform-slide'
```

### 3.2 自由编辑主界面

自由编辑界面由四块组成：

- 顶部工具栏：模式切换、保存、导出、撤销/重做、页面尺寸入口、常用插入入口。
- 左侧页面栏：页面缩略图、新建、复制、删除、重排。
- 中央画布：显示当前页面，支持缩放、滚动、选中、拖拽和变形。
- 右侧属性面板：显示当前页面或当前元素的属性。

页面为空时，画布中央显示一张空白页面，并提供快速插入文本、图片、形状的入口。

### 3.3 页面尺寸

自由编辑页面的尺寸以最终导出像素为准。画布在界面中按比例缩放显示，但导出时不再像当前 Markdown 卡片那样固定乘以 `pixelRatio: 3`。

第一版预设尺寸：

| 预设 | 默认像素 |
|---|---:|
| 1:1 | 1080 × 1080 |
| 3:4 | 1080 × 1440 |
| 4:3 | 1440 × 1080 |
| 9:16 | 1080 × 1920 |
| 16:9 | 1920 × 1080 |

自定义尺寸规则：

- 宽高单位为 px。
- 第一版允许范围：128 到 4096 px。
- 输入超出范围时，保存按钮禁用并显示明确错误。
- 修改当前页尺寸只影响当前页。
- 新建页面默认继承当前页尺寸。
- 复制页面保留源页面尺寸。

### 3.4 页面背景

第一版支持：

- 纯色背景。
- 透明背景选项。
- 图片背景作为后续增强，不进入第一版闭环。

透明背景导出 PNG 时保留透明通道。

## 4. 技术方案

### 4.1 推荐方案

采用 React + DOM 绝对定位 + SVG/HTML 元素。

理由：

- 项目已使用 `html-to-image` 导出 DOM，技术链路最短。
- 文本框富文本更适合 DOM 表达。
- 图片、形状、SVG、CSS 样式和导出结果能保持一致。
- 当前应用是视觉卡片工具，不是高性能绘图软件，DOM 性能足够支撑第一版。

### 4.2 备选方案不采用的原因

Fabric.js：

- 拖拽、缩放、旋转成熟。
- 但富文本、React 状态同步、形状图片填充和现有 `html-to-image` 导出链路不够贴合。

React-Konva / Konva：

- Canvas 性能强。
- 但 DOM 富文本、字体、局部样式和可访问输入会更复杂。

结论：自由编辑第一版使用 DOM/SVG。只有当未来页面元素数量达到 DOM 性能瓶颈，再考虑 Canvas 或混合渲染。

## 5. 架构设计

### 5.1 顶层拆分

目标结构：

```text
AppShell
├─ WorkspaceModeSwitch
├─ MarkdownWorkspace
└─ FreeformWorkspace
   ├─ FreeformToolbar
   ├─ SlideList
   ├─ CanvasViewport
   ├─ SlideCanvas
   ├─ ElementRenderer
   ├─ SelectionLayer
   ├─ TransformHandles
   └─ PropertiesPanel

shared services
├─ documentStore
├─ assetStore
├─ exportService
├─ appTheme
└─ auth
```

### 5.2 MarkdownWorkspace

现有 Markdown 功能迁移进 `MarkdownWorkspace`。迁移应保持行为不变：

- Markdown 输入。
- CodeMirror 实时预览。
- 自动分页。
- 右键单页导出。
- 多页 ZIP 导出。
- 平台、主题、字体、资料设置。
- 现有 E2E 测试继续通过。

迁移目标是拆边界，不改变现有功能。

### 5.3 FreeformWorkspace

`FreeformWorkspace` 持有当前自由编辑文档状态，并通过 reducer 修改文档。

核心状态：

- 当前文档。
- 当前页 ID。
- 当前选中元素 ID 集合。
- 当前工具：选择、文本、图片、形状、线、箭头。
- 画布缩放比例。
- 编辑中状态：文本编辑、图片填充编辑、拖拽变形等。
- 历史栈：撤销和重做。

文档修改必须通过 reducer 或等价的集中更新函数完成，避免多个组件直接改同一份嵌套状态。

## 6. 数据模型

### 6.1 草稿封套

草稿从单一 Markdown schema 升级为带模式和版本的封套。

```ts
type WorkspaceMode = 'markdown-card' | 'freeform-slide'

interface DraftEnvelope {
  id: string
  title: string
  schemaVersion: 2
  mode: WorkspaceMode
  updatedAt: number
  document: MarkdownCardDocument | FreeformDocument
}
```

旧草稿缺少 `schemaVersion` 和 `mode`。读取时按旧 Markdown 草稿处理，并转换成：

```ts
{
  schemaVersion: 2,
  mode: 'markdown-card',
  document: {
    source,
    platformId,
    themeId,
    fontFamily,
    profile,
    radius
  }
}
```

旧草稿里的 `radius` 不存在时使用当前默认值。

### 6.2 自由编辑文档

```ts
interface FreeformDocument {
  documentVersion: 1
  slides: FreeformSlide[]
  activeSlideId: string
}

interface FreeformSlide {
  id: string
  name: string
  width: number
  height: number
  background: SlideBackground
  elements: FreeformElement[]
}
```

坐标系规则：

- 所有元素坐标均使用页面内像素坐标。
- `x`、`y` 表示元素未旋转包围盒的左上角。
- `width`、`height` 表示元素未旋转尺寸。
- `rotation` 使用角度，顺时针为正。
- `zIndex` 或数组顺序决定图层顺序；第一版采用数组顺序作为图层顺序，越靠后越在上层。
- 画布缩放只影响 UI 显示，不改变文档坐标。

### 6.3 元素通用字段

```ts
interface BaseElement {
  id: string
  type: FreeformElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  name?: string
}
```

第一版不把 `locked`、`hidden`、`groupId` 作为必做能力，但模型可预留字段，UI 不暴露或仅在后续版本使用。

### 6.4 文本元素

文本框存储结构化富文本，而不是直接保存 HTML。

```ts
interface TextElement extends BaseElement {
  type: 'text'
  text: RichTextDocument
  verticalAlign: 'top' | 'middle' | 'bottom'
  padding: number
  fill: Fill
  stroke?: Stroke
}

interface RichTextDocument {
  blocks: RichTextBlock[]
}

interface RichTextBlock {
  type: 'paragraph'
  align: 'left' | 'center' | 'right'
  runs: RichTextRun[]
}

interface RichTextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  fontSize?: number
  fontFamily?: string
}
```

第一版支持：

- 同一文本框内局部加粗、斜体、下划线、颜色、字号和字体。
- 段落左对齐、居中、右对齐。
- 粘贴内容默认转为安全纯文本，保留换行，不导入任意 HTML。
- 文本编辑期间必须兼容中文 IME。

### 6.5 图片元素

```ts
interface ImageElement extends BaseElement {
  type: 'image'
  assetRef: string
  alt?: string
  fit: 'cover' | 'contain' | 'stretch'
  crop: ImageCrop
}

interface ImageCrop {
  scale: number
  offsetX: number
  offsetY: number
}
```

第一版支持：

- 插入本地图片。
- 替换图片。
- 按元素框裁剪显示。
- 在图片填充编辑状态中拖动图片位置、缩放填充。

### 6.6 形状元素

```ts
type ShapeKind = 'rect' | 'ellipse'

interface ShapeElement extends BaseElement {
  type: 'shape'
  shape: ShapeKind
  fill: Fill
  stroke?: Stroke
  cornerRadius?: number
}

type Fill =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  | { type: 'image'; assetRef: string; fit: 'cover' | 'contain'; crop: ImageCrop }

interface Stroke {
  color: string
  width: number
  style: 'solid' | 'dashed'
}
```

第一版封闭形状包括矩形和圆形。封闭形状支持图片填充、替换、移除、裁剪缩放和拖动填充位置。

### 6.7 线和箭头

```ts
interface LineElement extends BaseElement {
  type: 'line'
  start: Point
  end: Point
  stroke: Stroke
  arrowStart?: ArrowHead
  arrowEnd?: ArrowHead
}
```

直线和线型箭头只支持描边，不支持图片填充。  
有面积的块箭头属于后续形状库增强，不进入第一版闭环。

## 7. 编辑交互

### 7.1 选择

第一版支持：

- 点击选中单个元素。
- Shift 点击增减选中。
- 空白区域拖拽框选。
- Esc 清空选择或退出文本编辑。
- 双击文本框进入文本编辑。
- 双击图片填充或形状图片填充进入裁剪/填充编辑。

### 7.2 移动、缩放、旋转

第一版支持：

- 鼠标拖动移动。
- 八个缩放控制点。
- 旋转控制点。
- 按住 Shift 等比例缩放。
- 方向键微调 1 px。
- Shift + 方向键微调 10 px。

元素变换时使用临时 UI 状态做实时反馈，松手后提交为一次历史记录。

### 7.3 对齐、等距、吸附

第一版支持基础能力：

- 左对齐、水平居中、右对齐。
- 顶对齐、垂直居中、底对齐。
- 水平均分、垂直均分。
- 吸附到页面边缘、页面中心线、其他元素边缘和中心线。

吸附参考线只在拖动或缩放时显示，不参与导出。

### 7.4 图层

第一版支持：

- 上移一层。
- 下移一层。
- 置于顶层。
- 置于底层。

图层顺序由 `slide.elements` 数组顺序决定。

### 7.5 撤销重做

自由编辑模式使用独立历史栈，不复用 CodeMirror 历史。

第一版要求：

- 支持撤销和重做。
- 拖拽过程只在松手时入栈一次。
- 文本输入合并为合理的编辑批次。
- 页面增删、元素增删、图层调整、尺寸修改都进入历史。

### 7.6 复制粘贴和删除

第一版支持：

- Ctrl/Cmd + C 复制选中元素。
- Ctrl/Cmd + V 粘贴为新元素，新元素相对原位置偏移 16 px。
- Delete / Backspace 删除选中元素。
- 文本编辑中按键优先由文本编辑器处理，不触发画布删除。

跨浏览器粘贴外部图片作为后续增强。第一版图片插入通过工具栏文件选择实现。

## 8. 图片资产与存储

### 8.1 assetStore

现有 `imageStore.ts` 可复用图片压缩和 `img:<id>` 引用思路，但自由编辑需要独立的结构化资产收集逻辑。

建议新增共享资产服务：

```ts
interface AssetRecord {
  ref: string
  dataUrl: string
  mimeType: string
  width: number
  height: number
  createdAt: number
}
```

第一版仍使用浏览器本地存储，不引入后端。

### 8.2 图片压缩

插入图片时：

- 默认最大边压缩到 1600 px。
- 保留透明 PNG。
- 非透明图片可转 JPEG 以控制体积。
- 压缩失败时保留原图，但给出非阻断提示。

### 8.3 localStorage 容量策略

当前项目把草稿保存在 localStorage。自由编辑作品如果包含多张大图，很容易触发浏览器配额限制。

第一版处理规则：

- 保存前估算草稿 JSON 字节数。
- 保存失败时显示明确错误，不静默丢失。
- 图片过大时提示用户压缩或减少图片数量。
- 文档仍可在当前内存会话中继续编辑。
- 不承诺跨设备同步。

后续版本可迁移到 IndexedDB，但第一版不强制引入。

## 9. 导出设计

### 9.1 exportService

现有 Markdown 导出逻辑位于 `App.tsx`，通过切换 `active` 页再截图唯一 DOM 节点。自由编辑模式不应沿用这种强依赖活动 UI 状态的方式。

新增共享导出服务：

```ts
interface ExportSlideRequest {
  slide: FreeformSlide
  assets: AssetRecord[]
  fileName: string
}
```

导出时使用当前文档快照渲染独立导出节点，避免用户在导出期间切换页面或编辑导致结果不一致。

### 9.2 单页导出

单页导出规则：

- 导出当前页。
- PNG 宽高等于页面 `width` 和 `height`。
- 文件名：`slide-01.png` 或基于页面名称生成安全文件名。
- 导出失败时显示错误并保持编辑状态。

### 9.3 多页 ZIP 导出

多页导出规则：

- 按页面栏顺序导出。
- ZIP 内文件名按序号补齐：`slide-01.png`、`slide-02.png`。
- 允许不同页面尺寸混合。
- 若检测到混合尺寸，导出前提示：本作品包含不同尺寸页面，ZIP 中图片将保留各自尺寸。
- 用户确认后继续导出。

### 9.4 导出时不包含编辑 UI

以下内容不进入导出：

- 选中框。
- 控制点。
- 吸附线。
- 光标。
- 工具栏。
- 页面阴影。
- 缩略图。

## 10. 错误处理

第一版必须有用户可见错误，而不是静默失败：

- 草稿读取失败：跳过损坏草稿，显示“部分草稿无法读取”。
- 草稿保存失败：显示保存失败原因和建议。
- 图片读取失败：显示“图片无法读取或格式不支持”。
- 图片资产丢失：画布显示占位框，导出也显示占位框，避免页面结构消失。
- 页面尺寸非法：阻止保存尺寸并提示范围。
- 导出失败：显示导出失败，不改变文档。
- 字体加载失败：回退系统字体并继续导出。

## 11. 测试设计

### 11.1 回归测试

现有 Markdown 行为必须继续通过：

- 中文 IME 输入后按 Enter 不丢字。
- 普通输入场景不回退。
- 紧贴正文的 `---` 仍分页。
- 代码块内 `---` 不分页。

### 11.2 自由编辑单元测试

新增纯逻辑测试覆盖：

- 页面增删复制和当前页切换。
- 页面尺寸预设和自定义校验。
- 元素插入、删除、复制、图层调整。
- 坐标变换、缩放、旋转计算。
- 多选对齐和等距。
- 吸附计算。
- 撤销重做。
- 旧草稿迁移到 v2 封套。
- 图片资产收集。

### 11.3 自由编辑 E2E

新增 Playwright 测试覆盖：

- 从 Markdown 模式切到自由编辑模式。
- 新建自由编辑作品。
- 修改页面尺寸为 9:16 和自定义尺寸。
- 插入文本框并编辑中文。
- 插入图片。
- 插入矩形和圆形。
- 拖动、缩放、旋转元素。
- 多选并对齐。
- 保存草稿后刷新页面能恢复。
- 单页导出触发下载。
- 多页 ZIP 导出触发下载。

### 11.4 导出验证

导出测试至少验证：

- PNG 文件数量。
- ZIP 文件名顺序。
- 自由编辑 PNG 尺寸等于页面尺寸。
- 混合尺寸页面导出不被阻止。
- 编辑 UI 不出现在导出结果中。

## 12. 版本与文档

新增自由编辑模式属于 minor 功能。实现完成时版本从 `0.1.0` 升为 `0.2.0`，同步更新：

- `package.json`
- `package-lock.json` 顶层版本
- `package-lock.json` packages 根版本

新增或更新文档：

- README：说明 Markdown 模式和自由编辑模式。
- 草稿 schema 说明：解释 v1 旧草稿和 v2 封套。
- 用户说明：本地账号、本地草稿、图片容量限制、跨设备不同步。
- CHANGELOG 或发布说明：记录 `0.2.0` 的自由编辑能力。

## 13. 实施顺序建议

正式实施计划由后续 writing-plans 阶段生成。设计层建议顺序如下：

1. 拆 `AppShell` 和 `MarkdownWorkspace`，保持现有行为不变。
2. 引入 v2 草稿封套和旧草稿迁移。
3. 建立 `FreeformDocument` 数据模型、reducer 和历史栈。
4. 搭出自由编辑空工作区、页面栏和尺寸设置。
5. 实现画布渲染、缩放和页面背景。
6. 实现基础元素：文本、图片、矩形、圆形、线、箭头。
7. 实现选择、移动、缩放、旋转和键盘操作。
8. 实现图层、复制粘贴、删除、基础对齐和吸附。
9. 实现图片填充与裁剪。
10. 实现自由编辑保存和恢复。
11. 实现单页和多页导出。
12. 补齐测试、文档和版本号。

## 14. 接受标准

实现完成后应满足：

- 用户可以继续使用原 Markdown 卡片模式，现有测试通过。
- 用户可以进入自由编辑模式，创建包含多页的自由编辑作品。
- 每页可以独立设置尺寸，新页默认继承当前页尺寸。
- 用户可以插入文本、图片、矩形、圆形、线和箭头。
- 用户可以移动、缩放、旋转、复制、删除元素，并调整基础图层。
- 用户可以保存自由编辑草稿，并在刷新后恢复。
- 旧 Markdown 草稿能继续读取。
- 用户可以单页导出 PNG，PNG 尺寸等于页面尺寸。
- 用户可以批量导出 ZIP，混合尺寸页面保留各自尺寸。
- 保存、图片和导出失败时有可见提示。
- 版本号更新为 `0.2.0`。
