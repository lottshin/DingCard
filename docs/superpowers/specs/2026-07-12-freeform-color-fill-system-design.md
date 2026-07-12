# Freeform Color and Fill System Design

日期：2026-07-12
分支：`feature/freeform-editor`
状态：用户已确认把页面背景、形状填充、文字颜色和自由编辑属性面板控件统一作为同一批功能推进。

## 1. 背景

自由编辑模式已经支持多页、自由页面尺寸、文本、图片、形状、线条、图片填充、对齐、分布、吸附参考线、草稿和导出。当前短板集中在属性面板和颜色能力：

- 文本元素已有 `fontFamily` 数据字段，但属性面板没有字体选择入口。
- 页面背景只有纯色/透明，不支持渐变。
- 形状填充支持纯色/图片，但不支持渐变。
- 文本颜色只支持纯色，不支持渐变。
- 自由编辑属性面板里仍有不少浏览器原生控件外观，例如可见的 `input[type=color]`、数字输入和后续会用到的滑动条。

这些不是独立问题，而是一套“颜色/填充系统”没有统一完成。新设计必须把页面背景、形状填充和文字颜色作为同一能力处理。

## 2. 目标

- 选中文本框后，可以选择字体，字体列表复用 Markdown 工作区现有 `FONTS`。
- 文本颜色支持纯色和线性渐变。
- 页面背景支持纯色、线性渐变和透明。
- 形状填充支持纯色、线性渐变和图片填充。
- 渐变第一版支持两个颜色点和角度。
- 画布、左侧缩略图、草稿保存/读取、PNG/ZIP 导出都必须使用同一渲染结果。
- 自由编辑属性面板的选择器、颜色、数字输入、滑动条和按钮组统一成项目现有 UI 风格。
- 旧自由编辑草稿必须能读取，并迁移到新数据结构。
- Markdown 工作区现有行为不改变。

## 3. 非目标

- 不做多色标渐变编辑器。
- 不做径向渐变、锥形渐变、网格渐变。
- 不做渐变描边。形状描边和线条颜色本批仍为纯色，但控件外观要统一。
- 不做单个文本框内部的局部文字渐变；第一版作用于整个文本框。
- 不做富文本范围选择、按字局部换色或局部换字体。
- 不做图片填充裁剪器增强；沿用当前 `cover` / `contain`。
- 不引入新的远程字体管理。字体来源仍是当前项目已有字体列表和样式加载方式。

## 4. 方案选择

推荐方案：建立共享 `ColorPaint` 模型，并让页面背景、形状填充、文本颜色复用它。

对比方案：

1. 只给每个面板分别加字段
   实现快，但会出现三套渐变字段、三套 CSS 拼接和三套导出行为，后续维护成本高。

2. 建立共享颜色/填充模型
   初始改动稍大，但数据、渲染、草稿和导出逻辑一致。适合 PPT-like 编辑器继续扩展。

3. 引入完整设计软件级 paint 系统
   可以一步支持多色标、径向、混合模式等，但明显超出当前需求。

本批采用方案 2。

## 5. 数据模型

### 5.1 共享颜色模型

新增共享类型：

```ts
export type ColorPaint =
  | { type: 'solid'; color: string }
  | { type: 'linear-gradient'; from: string; to: string; angle: number }
```

约定：

- `color`、`from`、`to` 使用 CSS hex 颜色，例如 `#18181b`。
- `angle` 单位为度，保存为整数，规范化到 `0 <= angle < 360`。
- 非法颜色和非法角度必须通过 normalize helper 回退到稳定值，而不是把非法 CSS 写进 DOM。

### 5.2 页面背景

页面背景改为：

```ts
export type SlideBackground =
  | ColorPaint
  | { type: 'transparent' }
```

旧数据：

```ts
{ type: 'solid'; color: '#ffffff' }
{ type: 'transparent' }
```

继续有效。新增：

```ts
{ type: 'linear-gradient'; from: '#ffffff'; to: '#f97316'; angle: 135 }
```

### 5.3 形状填充

形状填充改为：

```ts
export type ShapeFill =
  | ColorPaint
  | { type: 'image'; src: string; fit: 'cover' | 'contain' }
```

旧的图片填充保持不变。渐变填充与页面背景共用 `linear-gradient` 数据结构。

### 5.4 文本颜色

文本元素从纯字符串颜色迁移为共享颜色模型：

```ts
interface FreeformTextElement extends FreeformElementBase {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: string
  textFill: ColorPaint
  align: 'left' | 'center' | 'right'
  fontWeight: 'normal' | 'bold'
}
```

旧字段：

```ts
color: '#18181b'
```

读取时迁移为：

```ts
textFill: { type: 'solid', color: '#18181b' }
```

内部实现不再新增新的 `color` 字符串字段，避免后续出现 `color` 与 `textFill` 两套来源。

### 5.5 文档版本

`FreeformDocument.documentVersion` 升到 `2`。

读取草稿时：

- v1 文档通过迁移函数转换为 v2。
- v2 文档通过 validator/normalizer 校验并补齐 fallback。
- 无法识别的结构返回 `null`，保持当前“跳过坏草稿”的策略。

保存草稿时：

- 新自由编辑草稿保存为 v2。
- `DraftEnvelope.schemaVersion` 不需要因为自由编辑内部字段变化而升级；变更点在 `FreeformDocument.documentVersion`。

## 6. 渲染规则

### 6.1 CSS helper

新增纯函数模块：

```text
src/freeform/paint.ts
```

职责：

- normalize `ColorPaint`、`SlideBackground`、`ShapeFill`。
- 把页面背景转换为 CSS background。
- 把形状填充转换为 CSS background/backgroundImage。
- 把文本填充转换为 React style。
- 提供 fallback color，供光标、可访问性和非法数据回退使用。

建议函数：

```ts
export function normalizeColorPaint(value: unknown, fallback: ColorPaint): ColorPaint
export function normalizeAngle(angle: unknown): number
export function paintToCssBackground(paint: ColorPaint): string
export function slideBackgroundToCss(background: SlideBackground): string
export function shapeFillToStyle(fill: ShapeFill): React.CSSProperties
export function textFillToStyle(fill: ColorPaint): React.CSSProperties
export function paintFallbackColor(fill: ColorPaint): string
```

函数契约：

- `null`、`undefined`、空对象、非法颜色、`NaN` 角度都返回 fallback。
- solid 与 linear-gradient 的 fallback 行为一致：能恢复为合法 CSS，不抛异常。
- helper 不读取 DOM，不依赖 React state，不修改输入对象。

### 6.2 页面背景

画布和缩略图都使用 `slideBackgroundToCss(...)`。

- solid：`background: #ffffff`
- transparent：`background: transparent`
- linear-gradient：`background: linear-gradient(<angle>deg, <from>, <to>)`

### 6.3 形状填充

形状元素继续使用当前 div/clip-path 渲染方式。

- solid：设置 `background`
- linear-gradient：设置 `background`
- image：设置 `backgroundImage`、`backgroundSize`、`backgroundPosition`、`backgroundRepeat`

三角形继续使用现有 `clip-path`。渐变和图片填充都必须被 clip-path 裁剪。

### 6.4 文本渐变

当前画布文本是 `textarea`。为了避免“编辑时纯色、导出时才渐变”的假支持，画布文本编辑面需要改成 plain-text `contentEditable`：

- 用 `div contentEditable` 渲染文本。
- `white-space: pre-wrap` 保留换行。
- paste 时只接收纯文本，不导入任意 HTML。
- 输入时更新元素 `text`。
- composition/IME 期间不得用 React 重新写入 DOM 导致中文输入丢字。
- 渐变文字使用：

```css
background-image: linear-gradient(...);
background-clip: text;
-webkit-background-clip: text;
color: transparent;
-webkit-text-fill-color: transparent;
caret-color: <fallback color>;
```

solid 文字仍使用普通 `color`。

属性面板里的“文本内容”输入区可以继续作为纯文本编辑控件；它不需要展示渐变，但样式必须统一。

## 7. 属性面板交互

### 7.1 字体选择

选中文本元素后，文字属性区增加字体选择：

- 复用 `src/theme.ts` 的 `FONTS`。
- 复用现有 `Select` 组件，并开启字体预览。
- 选择后更新当前文本元素 `fontFamily`。
- 字体选择作用于整个文本框。

### 7.2 颜色/填充编辑器

新增可复用的 paint 编辑控件，建议文件：

```text
src/freeform/PaintField.tsx
```

交互结构：

- 顶部用 segmented control 切换类型。
- solid 模式显示一个样式化颜色按钮和 hex 文本。
- gradient 模式显示：
  - 起始颜色按钮
  - 结束颜色按钮
  - 角度滑动条
  - 角度数字输入
- transparent 模式只用于页面背景。
- image 模式只用于形状填充，沿用当前图片选择按钮、清除图片和 `cover` / `contain`。

颜色选择实现：

- 可使用隐藏的 `input[type=color]` 触发系统取色器。
- 原生 color input 不作为可见控件出现。
- 可见部分必须是项目样式的按钮/色块。

### 7.3 页面背景区

页面属性区显示：

- 页面名称
- 背景类型：纯色 / 渐变 / 透明
- 对应 paint 控件

### 7.4 文本属性区

文本属性区显示：

- 文本内容
- 字体
- 字号
- 文字颜色：纯色 / 渐变
- 对齐：左 / 中 / 右

### 7.5 形状属性区

形状属性区显示：

- 形状类型
- 填充类型：纯色 / 渐变 / 图片
- 填充 paint 控件或图片填充控件
- 描边颜色：纯色，使用样式化颜色控件
- 描边宽度：样式化数字输入，可补充样式化滑动条

填充类型切换规则：

- 纯色切到渐变：用当前纯色作为 `from`，`to` 使用默认强调色或当前纯色的浅/深变体，角度默认 `135`。
- 渐变切到纯色：用当前渐变 `from` 作为纯色。
- 图片切到纯色或渐变：替换当前填充，原图片不再作为该形状的隐藏状态保留。
- 纯色或渐变切到图片：用户需要选择图片后才进入图片填充；未选择图片时保留原填充。
- 图片填充的 `cover` / `contain` 只在 `fill.type === 'image'` 时存在。

### 7.6 线条属性区

线条颜色和粗细仍为纯色/数字，但控件外观要统一。

## 8. 控件视觉规范

自由编辑属性面板不能再露出默认浏览器 UI。

要求：

- 不使用可见原生 `<select>`；需要选择时使用 `Select` 或同风格组件。
- 可见颜色控件是色块按钮，不是默认 `input[type=color]`。
- 数字输入统一高度、边框、圆角、字体、focus ring，并隐藏 WebKit spinner。
- 滑动条使用自定义 track/thumb 样式，适配 light/dark theme。
- 文件 input 保持隐藏，用样式化按钮触发。
- 所有控件在窄 inspector 内不能溢出。
- hover、focus、disabled 态必须与现有 `mini-btn`、`seg-btn`、`text-input` 一致。

## 9. 草稿迁移和兼容

### 9.1 迁移函数

新增或扩展草稿 normalizer：

- `migrateFreeformDocumentV1ToV2(raw)`
- `normalizeFreeformDocument(raw)`
- `normalizeFreeformElement(raw)`

迁移规则：

- v1 slide background 保持 solid/transparent；若缺失，回退白色 solid。
- v1 text `color` 字符串迁移为 `textFill.solid`。
- v1 text 缺 `fontFamily` 时回退到当前默认字体。
- v1 shape fill solid/image 保持；非法 fill 回退到 solid。
- v1 line stroke 非法时回退到默认纯色。
- unknown element type 跳过，而不是破坏整个文档。
- active slide id 不存在时回退第一张 slide。

### 9.2 保存行为

- 新建文档使用 v2。
- 读取 v1 后，如果用户保存，写回 v2。
- 保存失败仍按当前错误策略反馈，不静默丢数据。

## 10. 导出

导出必须复用与画布一致的渲染 helper。

要求：

- 单页 PNG 中页面背景渐变正确。
- ZIP 中每页保留自己的背景/形状/文字渐变。
- 文本渐变导出与画布编辑态一致。
- 选择框、控制点、参考线、隐藏 color/file input 不进入导出。
- 字体加载失败时仍按现有字体 fallback 策略导出，不阻塞整张图。

## 11. 测试设计

### 11.1 单元测试

新增 `src/freeform/__tests__/paint.test.ts`：

- solid paint 转 CSS。
- linear-gradient paint 转 CSS。
- angle 负数、超过 360、浮点和 NaN 的 normalize。
- 非法颜色 fallback。
- transparent background 转 CSS。
- image fill 转 style。
- text gradient 转 style，并包含 `backgroundClip` 和 `caretColor`。

扩展 `draftMigration.test.ts`：

- v1 text `color` 迁移为 v2 `textFill`。
- v1 background 迁移后仍能渲染。
- v2 gradient background/text/shape 能通过 normalizer。
- malformed gradient 回退到合法 solid 或默认 gradient。

### 11.2 E2E 测试

扩展 `e2e/freeform.spec.ts`：

- 选中文本框后可以修改字体，画布元素 `font-family` 更新。
- 文本颜色切到渐变后，画布文本展示 gradient text style。
- 页面背景切到渐变后，画布和缩略图 background 都更新。
- 形状填充切到渐变后，形状 background 更新。
- 形状图片填充仍可用；从图片切换到纯色/渐变会按规格替换当前填充，从纯色/渐变切到图片但取消文件选择时保留原填充。
- 修改渐变角度滑动条，CSS angle 更新。
- 中文文本在 contentEditable 文本框里输入/修改后不丢字。
- 导出当前页时不包含编辑 UI，且不会因为 gradient style 报错。

### 11.3 回归测试

- 现有自由编辑选择、拖拽、缩放、复制粘贴、对齐、吸附仍通过。
- 现有 Markdown 工作区导出和字体选择不受影响。
- light/dark theme 下属性面板控件都可见。

## 12. 实施边界和风险

主要风险是文本编辑从 `textarea` 切到 `contentEditable` 后可能影响光标、IME 和快捷键。

降低风险：

- 仅支持 plain text contentEditable，不引入富文本 DOM。
- composition 期间不从 React 反向覆盖 DOM。
- paste 强制转纯文本。
- 保留属性面板 textarea 作为文本内容编辑的稳定入口。
- E2E 覆盖中文输入和快捷键。

另一个风险是草稿兼容。必须先写迁移测试，再实现 normalizer。

## 13. 验收标准

- 文本元素可选择字体。
- 文本颜色支持纯色和渐变，编辑态和导出态一致。
- 页面背景支持纯色、渐变和透明。
- 形状填充支持纯色、渐变和图片。
- 形状/线条描边控件外观统一，虽然描边本批仍只支持纯色。
- 属性面板不再暴露明显原生样式的 select/color/range 控件。
- 旧自由编辑草稿可正常读取。
- 新草稿保存后可恢复渐变和字体。
- `npm run build`、`npm run test:unit`、相关 E2E 通过。
- 版本号按新功能做 minor bump，并同步 `package.json` 与 lockfile。
