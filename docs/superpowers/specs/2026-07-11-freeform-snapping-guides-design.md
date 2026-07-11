# Freeform Snapping Guides Design

日期：2026-07-11  
分支：`feature/freeform-editor`  
状态：用户已确认按推荐方案推进；等待 spec review 与用户最终 review

## 1. 背景

自由编辑模式已经支持多页、任意页面尺寸、文本/图片/形状/线条、图片填充、框选、多选、对齐、均分、多元素拖动、键盘微调、复制粘贴和导出。

下一步目标是提升排版效率：用户拖动元素或多选组时，靠近页面边缘、页面中心、其他元素边缘或中心时自动吸附，并显示临时参考线。该能力对应 PPT/设计工具里的基础智能参考线。

本设计只覆盖“拖动吸附参考线”。不覆盖 resize 吸附、旋转吸附、网格系统、手动参考线、标尺、间距测量、对象分布建议。

## 2. 目标

- 拖动单个元素时，靠近页面左/中/右、上/中/下时自动吸附。
- 拖动单个元素时，靠近其他元素左/中/右、上/中/下时自动吸附。
- 拖动多选组时，按多选组整体外接框参与吸附。
- 拖动时显示临时参考线。
- 松手后参考线消失。
- 参考线不进入 PNG/ZIP 导出。
- 方向键微调不吸附，保持精确移动。
- 框选不吸附。
- 吸附计算可单元测试，不依赖 DOM。
- 已有 Markdown 工作区行为不变。

## 3. 非目标

- 不做调整大小时的吸附。
- 不做旋转角度吸附。
- 不做网格吸附或网格开关。
- 不做用户可拖拽的永久参考线。
- 不做标尺。
- 不做间距提示或等距智能分布。
- 不做被旋转元素的视觉多边形吸附；第一版按未旋转 layout box 计算。
- 不新增用户设置项；吸附默认开启。

## 4. 交互规则

### 4.1 生效时机

吸附只在鼠标/触控拖动元素或多选组时生效。

以下操作不触发吸附：

- 框选拖拽。
- 方向键移动。
- Shift + 方向键移动。
- Inspector 输入框直接修改坐标。
- 对齐/均分按钮。
- 调整大小。
- 旋转；当前尚未提供旋转手柄。

### 4.2 吸附目标

页面参考：

- 垂直参考线：页面左边 `x=0`、页面水平中心 `x=width/2`、页面右边 `x=width`。
- 水平参考线：页面上边 `y=0`、页面垂直中心 `y=height/2`、页面下边 `y=height`。

其他元素参考：

- 垂直参考线：元素左边、水平中心、右边。
- 水平参考线：元素上边、垂直中心、下边。

当前被拖动的元素或多选组内元素不作为“其他元素”参考目标。

### 4.3 吸附对象

拖动对象也暴露 3 个横向锚点和 3 个纵向锚点：

- 横向：拖动外接框左边、水平中心、右边。
- 纵向：拖动外接框上边、垂直中心、下边。

当拖动对象任一锚点距离参考目标在阈值内时，修正拖动 delta。

### 4.4 阈值

第一版吸附阈值为 6 px，单位为页面坐标，而不是屏幕坐标。页面坐标与导出尺寸一致，不受当前缩放比例影响。

如果多个目标同时命中：

1. 选择距离最小的目标。
2. 距离相同，则页面参考优先于其他元素参考。
3. 仍相同，则拖动对象锚点按 `center`、`start`、`end` 优先级选择；横向的 `start/end` 对应左/右，纵向的 `start/end` 对应上/下。
4. 仍相同，则按参考线位置从小到大选择，保证结果稳定。

横向和纵向分别计算，可以同时吸附 x 和 y。

### 4.5 边界约束

当前拖动逻辑已经用 `moveElementsWithinSlide` 保证拖动组不会超出页面。吸附应在同一个边界约束模型里工作。

处理顺序：

1. 根据原始 pointer delta 计算基础移动。
2. `snapDrag(...)` 内部先复用与 `moveElementsWithinSlide(...)` 一致的整体边界 clamp，得到 clamped delta。
3. `snapDrag(...)` 基于 clamped delta 后的位置寻找吸附目标。
4. `snapDrag(...)` 对吸附后的 delta 再执行同一套边界 clamp，避免吸附把元素推出页面。
5. 调用方再使用返回的 dx/dy 调 `moveElementsWithinSlide(...)`，作为最终安全兜底。

### 4.6 参考线显示

拖动期间显示命中的参考线：

- 垂直吸附显示一条竖线。
- 水平吸附显示一条横线。
- 同时命中 x/y 时显示两条线。

参考线视觉规则：

- 使用现有 accent 颜色或相近高可见度颜色。
- 垂直参考线显示为页面内全高线，从 `top=0` 到 `bottom=slide.height`。
- 水平参考线显示为页面内全宽线，从 `left=0` 到 `right=slide.width`。
- 线条带 `freeform-ui-only`，导出过滤掉。
- 线条不响应 pointer 事件。
- 线条只在拖动过程中存在；pointer up 后清空。

## 5. 技术设计

### 5.1 新增纯函数模块

新增文件：

```text
src/freeform/snapping.ts
```

职责：

- 计算拖动组外接框。
- 生成页面参考目标。
- 生成其他元素参考目标。
- 根据原始 delta、页面尺寸、元素列表和 selection 计算吸附后的 delta。
- 返回需要显示的参考线。

该模块不引用 React、不访问 DOM、不修改文档状态。

### 5.2 类型草案

```ts
export interface SnapLine {
  axis: 'x' | 'y'
  position: number
  source: 'page' | 'element'
}

export interface SnapResult {
  dx: number
  dy: number
  lines: SnapLine[]
}

export interface SnapOptions {
  threshold: number
}

export function snapDrag(
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  elements: FreeformElement[],
  selectedIds: string[],
  dx: number,
  dy: number,
  options?: Partial<SnapOptions>,
): SnapResult
```

默认 `threshold` 为 `6`。

`snapDrag` 返回的 `dx/dy` 必须已经完成边界 clamp 和吸附修正。调用方仍会把该结果传给 `moveElementsWithinSlide(...)`，但这只是第二道安全兜底，不应改变正常吸附结果。

### 5.3 与现有拖动逻辑集成

当前 `FreeformWorkspace.onElementPointerDown` 在 pointer move 中：

- 根据 pointer delta 计算 dx/dy。
- 调用 `moveElementsWithinSlide(...)` 得到 patches。
- 用一次 state update 应用 patches。
- pointer up 时 `commitLiveEdit(startDocument)`，保证一次拖动只入历史一次。

新增吸附后，流程变为：

1. 计算原始 dx/dy。
2. 调用 `snapDrag(...)` 得到已完成边界 clamp 和吸附修正的 dx/dy，以及参考线。
3. 用修正后的 dx/dy 调用 `moveElementsWithinSlide(...)`。
4. 设置 `snapLines` UI 状态。
5. pointer up 时清空 `snapLines` 并提交历史。

不改变历史模型：拖动过程仍然 live update，松手后只入栈一次。

### 5.4 UI 状态

`FreeformWorkspace` 新增：

```ts
const [snapLines, setSnapLines] = useState<SnapLine[]>([])
```

渲染位置在 artboard 内，与 marquee 类似：

- `axis === 'x'`：竖线，`left: position`。
- `axis === 'y'`：横线，`top: position`。

class 建议：

```text
freeform-snap-line
freeform-snap-line-x
freeform-snap-line-y
freeform-ui-only
```

## 6. 错误处理和边界

- selection 为空时不吸附，返回原始 dx/dy 和空 lines。
- selection 中 id 不存在时忽略不存在的 id。
- 所有 selection id 无效时不吸附。
- 没有其他元素时，仍可吸附到页面参考。
- 拖动对象比页面更大时，沿用 `moveElementsWithinSlide` 的边界 fallback；吸附不能让状态崩溃。
- 旋转元素按现有 layout box 计算，不按旋转后视觉轮廓计算。
- 多个参考线同时命中时，横向最多 1 条、纵向最多 1 条，避免 UI 噪声。

## 7. 测试设计

### 7.1 单元测试

新增：

```text
src/freeform/__tests__/snapping.test.ts
```

覆盖：

- 拖动元素接近页面中心时吸附到页面中心。
- 拖动元素接近页面左边/右边时吸附到页面边缘。
- 拖动元素接近其他元素左边/中心/右边时吸附。
- 纵向参考线同理至少覆盖页面中心和其他元素上边。
- 超过阈值时不吸附。
- 多选组按整体外接框吸附。
- selectedIds 内的元素不作为其他元素参考。
- 多个目标命中时选择距离最近；距离相同页面参考优先。
- 同距离、同来源、同位置时按拖动对象锚点 `center`、`start`、`end` 稳定排序。
- 吸附候选接近页面边缘时，最终 delta 不会把拖动组推出页面。
- invalid selection 返回原始 delta 和空 lines。

### 7.2 E2E 测试

新增到：

```text
e2e/freeform.spec.ts
```

覆盖：

- 拖动矩形接近页面中心，松手后元素中心对齐页面中心。
- 拖动矩形接近另一个元素左边，松手后边缘对齐。
- 拖动过程中参考线出现，松手后消失。
- 多选组拖动接近页面中心，按组整体吸附。

### 7.3 回归验证

完整验证命令：

```powershell
npm run build
npm run test:unit
npm run test:e2e
git diff --check
```

## 8. 版本与文档

该能力属于自由编辑模式的 minor 功能增强。当前分支版本已是 `0.3.0`，但该版本号已经用于上一批选择控制功能。本批实现完成时按 AGENTS.md 规则 bump 到 `0.4.0`，并同步：

- `package.json`
- `package-lock.json` 顶层版本
- `package-lock.json` packages 根版本

本批至少新增：

- 本设计文档。
- 实现计划文档。

如果项目后续补 README/CHANGELOG，本功能应记录为：

- 自由编辑支持拖动吸附参考线。

## 9. 接受标准

- 拖动单个元素接近页面或其他元素参考位置时会自动吸附。
- 拖动多选组时按组整体吸附。
- 吸附参考线拖动时可见，松手后消失。
- 参考线不进入导出图片。
- 框选、键盘微调、对齐、均分、复制粘贴、删除仍保持原行为。
- Markdown 工作区 E2E 继续通过。
- 单元测试覆盖吸附计算边界。
- 完整 build/unit/e2e 通过。
