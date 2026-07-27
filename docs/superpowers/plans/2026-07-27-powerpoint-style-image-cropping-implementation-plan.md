# PowerPoint 式图片裁剪 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把自由画布中的独立图片改成 PowerPoint 式原位裁剪，同时保留现有形状图片取景、v4 数据、保存与导出行为。

**Architecture:** 新增纯函数模块，以固定的起始裁剪平面保存临时裁剪框和原图矩形，并把合法结果反算成节点几何与 `framing`。独立图片使用专用 React 会话和 UI-only 裁剪层，`pointermove` 通过 `requestAnimationFrame` 直接更新预览，完成时才用新的原子 reducer action 一次写入 `x/y/width/height/framing`。现有 `ImageFramingSession` 缩小为形状图片填充专用路径，避免改变其取消语义。

**Tech Stack:** React 18、TypeScript、Vitest、Playwright、现有自由画布 reducer/history/scene matrix API、CSS。

---

## 文件结构

- Create `src/freeform/imageCrop.ts`：裁剪草稿、边柄投影、图片平移、比例预设、回代和节点 patch。
- Create `src/freeform/__tests__/imageCrop.test.ts`：纯几何与异常输入测试。
- Create `src/freeform/ImageCropOverlay.tsx`：框外暗图、框内亮图、八个裁剪柄。
- Create `src/freeform/useImageCropSession.ts`：会话状态、rAF 调度、指针所有权和手势结算。
- Modify `src/freeform/types.ts`：原子图片裁剪 action 类型。
- Modify `src/freeform/document.ts`：严格验证并原子更新独立图片几何和取景。
- Modify `src/freeform/__tests__/document.test.ts`：原子性、权限、同值和坏输入测试。
- Modify `src/freeform/FreeformSceneNodeView.tsx`：活动裁剪时只隐藏目标节点的原图片内容。
- Modify `src/freeform/FreeformWorkspace.tsx`：独立图片裁剪入口、工具栏、退出分派和命令阻断。
- Modify `src/styles.css`：PowerPoint 式裁剪视觉、命中区域和窄视口。
- Modify `e2e/freeform.spec.ts`：独立图片裁剪、形状取景回归、历史、性能和响应式验收。
- Modify `e2e-integration/backend.spec.ts`：远端 v4 草稿改用新裁剪入口并保留恢复断言。
- Modify `README.md`、`CHANGELOG.md`、`docs/freeform-editor.md`、`docs/backend-plan.md` 和旧取景规格：同步用户行为、版本与设计后续说明。
- Modify `package.json`、`package-lock.json`：根版本升到 `0.15.0`；不修改 `server` 版本。

## Task 1: 固定平面的裁剪几何

**Files:**
- Create: `src/freeform/imageCrop.ts`
- Create: `src/freeform/__tests__/imageCrop.test.ts`
- Reference: `src/freeform/imageFraming.ts`
- Reference: `src/freeform/sceneTransform.ts`

- [ ] **Step 1: 写裁剪草稿和回代的失败测试**

测试先声明希望使用的 API：

```ts
import {
  applyImageCropAspectRatio,
  createImageCropDraft,
  imageCropDraftToUpdate,
  panImageCropDraft,
  projectImageCropHandle,
  type ImageCropBounds,
  type ImageCropHandle,
} from '../imageCrop'
```

覆盖宽图、长图、方图，断言 `createImageCropDraft` 生成 `frame=[0,0,w,h]` 和与 `calculateFramedImageGeometry` 相同的 `image`。把框向内裁后调用 `imageCropDraftToUpdate`，再用更新后的尺寸与 framing 重算，断言原图矩形相对起始平面不移动。

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `npm run test:unit -- src/freeform/__tests__/imageCrop.test.ts`

Expected: FAIL，错误指向无法解析 `../imageCrop`，不是测试语法错误。

- [ ] **Step 3: 实现最小公开契约和草稿创建/回代**

在 `imageCrop.ts` 定义：

```ts
export type ImageCropHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export interface ImageCropBounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ImageCropDraft {
  frame: ImageCropBounds
  image: ImageCropBounds
  framing: ImageFraming
}

export interface ImageCropNodeUpdate {
  x: number
  y: number
  width: number
  height: number
  framing: ImageFraming
}

export interface ImageCropScreenTransformInput {
  screenDelta: Point
  renderScale: number
  startWorldMatrix: Matrix2D
}
```

`createImageCropDraft` 只接受正有限自然尺寸、合法图片节点和可计算的 cover 几何。`imageCropDraftToUpdate` 使用规格中的 `s/baseScale/focus` 公式回代；再调用 `calculateFramedImageGeometry` 做等价检查。节点位置使用：

```ts
const resizedSeed = { ...startNode, width: frameWidth, height: frameHeight }
const shiftedMatrix = multiply(sceneNodeLocalMatrix(startNode), translation(frame.left, frame.top))
const resized = sceneNodeWithLocalMatrix(resizedSeed, shiftedMatrix, startNode.scale)
```

任何无效输入返回 `null`；不得返回部分 patch。

- [ ] **Step 4: 运行聚焦测试并确认基础回代通过**

Run: `npm run test:unit -- src/freeform/__tests__/imageCrop.test.ts`

Expected: PASS 基础草稿和回代用例。

- [ ] **Step 5: 写八个柄、对称柄和连续投影的失败测试**

表驱动覆盖：

- 八个 handle 的固定边。
- 四个边柄在 `symmetric=true` 时围绕中心变化。
- 角柄不使用边柄对称规则。
- 原图边界、现有最小 40 世界像素换算后的本地宽高、`zoom=4`。
- cover 主导轴合法切换可以继续，宽高同时越界停在合法连续分量末端。
- 一次大位移和拆成 120 次相同总位移得到同一结果。
- 屏幕位移经过 30/90 度旋转图片、缩放组和两层嵌套缩放组后，得到正确起始裁剪平面位移。
- 节点/祖先 world scale 把 40 世界像素几何下限换算为裁剪平面本地尺寸；这个下限与手柄 24 屏幕像素命中区分别测试。
- `renderScale`、节点/祖先 scale 都进入屏幕比例；本地 `24 / screenScale` 手柄命中区在屏幕上仍为 24px。
- 零/非有限 renderScale、非有限矩阵和不可逆矩阵返回 `null`，调用方保持原草稿引用。

- [ ] **Step 6: 运行测试并确认失败来自未实现的投影**

Run: `npm run test:unit -- src/freeform/__tests__/imageCrop.test.ts`

Expected: FAIL，断言显示 handle 结果缺失或仍为开始框。

- [ ] **Step 7: 实现手势路径投影**

`projectImageCropHandle` 从手势开始框和总本地位移构造 `C(t)`。调用方必须传入 `minimumFrameSize`，其宽高来自现有普通叶子 resize 契约 `40 / worldScale`；纯函数不硬编码 24 或 40。收集 `t=0/1` 以及边碰原图、宽高碰最小值、宽高触发 `zoom=4`、cover 主导轴相等的分段点；排序去重后检查端点和区间中点，选择包含 `t=0` 的合法连续分量最大值。主导轴切换只分段，不自动判非法。

每个候选统一通过 `imageCropDraftToUpdate` 回代；无效时返回输入草稿的原引用。

同时实现 `imageCropLocalDeltaFromScreen`：先除正有限 `renderScale`，再用固定 `startWorldMatrix` 的逆矩阵调用 `transformVector`。实现 `imageCropScreenScale`：使用 `decomposeSimilarity(startWorldMatrix).scale * renderScale`；任一输入无效返回 `null`。组件不得自行只除画布缩放。

- [ ] **Step 8: 写图片平移和比例预设的失败测试**

覆盖：平移四边夹取、1px/10px 位移、原图/1:1/4:3/3:4/16:9/9:16、比例候选内接当前框、`zoom=4` 阻止比例时整条命令返回原引用。再传入与黑柄相同的 `minimumFrameSize`，断言目标比例会让任一边低于 `40 / worldScale` 时整条命令返回原引用，不生成近似比例。

- [ ] **Step 9: 实现平移和比例预设并运行完整几何测试**

`applyImageCropAspectRatio` 必须和 `projectImageCropHandle` 接收同一个调用方 `minimumFrameSize`，并复用同一候选合法性函数检查原图范围、最小宽高、framing 回代和 `zoom<=4`。比例路径不得另写一套较宽松的校验。

Run: `npm run test:unit -- src/freeform/__tests__/imageCrop.test.ts src/freeform/__tests__/imageFraming.test.ts src/freeform/__tests__/sceneTransform.test.ts`

Expected: PASS，且既有 image framing/scene transform 不回归。

- [ ] **Step 10: 提交纯几何**

```bash
git add src/freeform/imageCrop.ts src/freeform/__tests__/imageCrop.test.ts
git commit -m "feat: add deterministic image crop geometry"
```

## Task 2: 原子几何与取景 reducer action

**Files:**
- Modify: `src/freeform/types.ts`
- Modify: `src/freeform/document.ts`
- Modify: `src/freeform/__tests__/document.test.ts`

- [ ] **Step 1: 写原子 action 的失败测试**

新增测试构造：

```ts
const action: FreeformAction = {
  type: 'node/update-image-crop',
  slideId,
  path,
  patch: { x, y, width, height, framing },
}
```

断言一次 reducer 调用同时更新五个字段；同值返回原 document；目标不是 `image`、未知路径、锁定祖先、隐藏目标、**隐藏祖先**、额外键、非有限几何和非法 framing 都返回原 document。再断言更新嵌套图片会重算祖先组边界，且输入 framing 被深复制。

- [ ] **Step 2: 运行测试并确认 action 类型或 reducer 分支缺失**

Run: `npm run test:unit -- src/freeform/__tests__/document.test.ts`

Expected: FAIL，原因是 `node/update-image-crop` 尚不存在。

- [ ] **Step 3: 增加严格 action 类型**

在 `types.ts` 增加：

```ts
export interface FreeformImageCropPatch {
  x: number
  y: number
  width: number
  height: number
  framing: ImageFraming
}

// FreeformAction union
| {
    type: 'node/update-image-crop'
    slideId: string
    path: ScenePath
    patch: FreeformImageCropPatch
  }
```

名称必须全项目 grep，禁止出现 `cropGeometry`、`imageCropFraming` 等同义字段。

- [ ] **Step 4: 实现 reducer 原子更新**

新增专用 reducer helper，按以下顺序执行：

1. 严格检查 action、path 和 patch 精确键集合。
2. 用 `canApplySceneAction` 同时检查 `geometry` 和 `style` 权限。
3. 用现有 `effectiveSceneState(slide.nodes, path)` 显式拒绝目标或任意祖先 hidden；不能假设 `canApplySceneAction` 会检查 hidden。
4. 只接受独立 `image`。
5. 先在局部节点上调用既有 `applyGeometryPatch`，再调用 `applyStylePatch({ framing })`。
6. 用一次 `updateNodesAtPaths(..., { recenterChangedGroups: true })` 写回。
7. 完整 `validateSceneNodesForMutation` 后才返回新文档。

任一步失败都返回传入 document 原引用；不能先写几何再丢掉 framing。

- [ ] **Step 5: 运行 reducer 与场景树测试**

Run: `npm run test:unit -- src/freeform/__tests__/document.test.ts src/freeform/__tests__/sceneTree.test.ts src/freeform/__tests__/history.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交原子 action**

```bash
git add src/freeform/types.ts src/freeform/document.ts src/freeform/__tests__/document.test.ts
git commit -m "feat: update image crop geometry atomically"
```

## Task 3: PowerPoint 式裁剪层

**Files:**
- Create: `src/freeform/ImageCropOverlay.tsx`
- Modify: `src/freeform/FreeformSceneNodeView.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: 写裁剪层结构的失败 E2E**

新增 `PowerPoint crop shows the full source around the crop frame`：上传宽图，选择并点击“裁剪”，断言：

- 独立图片入口文案为“裁剪”，形状仍为“调整取景”。
- 双击独立图片进入 crop overlay；双击图片填充形状仍进入旧 framing surface。
- 存在 `freeform-image-crop-overlay`、暗图、亮图和 8 个有名称的 handle。
- 暗图矩形超出 crop frame，亮图被 frame 裁切。
- 原场景图片内容带 `data-image-crop-hidden=true`，但节点仍存在。
- 不再显示独立图片缩放滑杆和三等分线。

- [ ] **Step 2: 运行测试并确认因新入口/DOM 不存在而失败**

Run: `npm run test:e2e -- e2e/freeform.spec.ts --grep "PowerPoint crop shows"`

Expected: FAIL，找不到“裁剪”按钮或 crop overlay。

- [ ] **Step 3: 实现纯展示组件**

`ImageCropOverlay` 接收 `draft`、固定 `worldMatrix`、`screenScale`、图片源、事件回调和活动 handle。DOM 分三层：

```text
.freeform-image-crop-overlay
  img.freeform-image-crop-dim
  .freeform-image-crop-window
    img.freeform-image-crop-bright
  .freeform-image-crop-frame
    button[data-crop-handle=n|ne|e|se|s|sw|w|nw] × 8
```

暗图和亮图引用同一 `resolvedSrc`。window 的位置尺寸来自 `draft.frame`，其内部亮图偏移为 `image.left-frame.left` / `image.top-frame.top`。组件不解析图片、不写文档、不保存内部业务状态。

- [ ] **Step 4: 只隐藏当前独立图片的内容**

给 `FreeformSceneNodeView` 增加可选 `hiddenImageContentPathKey`。仅当 path 完全相等且 leaf 为 image 时，在 `FramedImage` 外层标记隐藏；组内其他图片、形状图片和 presentation-only 实例不受影响。

- [ ] **Step 5: 接入最小裁剪入口和 CSS**

独立图片点击“裁剪”或双击时创建只读初始 draft 并展示 overlay；形状仍走原 `ImageFramingSession`。入口统一核对 active scope、effective lock/hidden、cover、readiness identity 和 pending replacement。CSS 使用黑色短粗柄、1px 白色描边/阴影和半透明暗层；命中区域用 `24 / screenScale` 本地像素计算，保证屏幕至少 24px。不得增加卡片、渐变或装饰动画。

- [ ] **Step 6: 运行结构 E2E 和明暗主题截图检查**

Run: `npm run test:e2e -- e2e/freeform.spec.ts --grep "PowerPoint crop shows"`

Expected: PASS。

- [ ] **Step 7: 提交裁剪层**

```bash
git add src/freeform/ImageCropOverlay.tsx src/freeform/FreeformSceneNodeView.tsx src/freeform/FreeformWorkspace.tsx src/styles.css e2e/freeform.spec.ts
git commit -m "feat: render PowerPoint-style image crop overlay"
```

## Task 4: 单帧手势会话与裁剪柄

**Files:**
- Create: `src/freeform/useImageCropSession.ts`
- Modify: `src/freeform/ImageCropOverlay.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: 写图片平移和八柄操作的失败 E2E**

新增 `PowerPoint crop pans the picture and crops from every handle`。用带四角标记的测试图，分别拖动画面、四条边和四个角；断言 DOM draft 数据与视觉边界变化正确，固定边不动，原图矩形在黑柄裁剪时不动。

同一批失败测试在实现前继续覆盖：

- `Ctrl` + 边柄对称变化、角柄不对称、键盘 1px/Shift 10px。
- 旋转图片、缩放组、两层嵌套组与非 100% 画布 zoom 下，屏幕拖动方向和距离正确。
- 鼠标 `pointercancel`、window blur 回滚本段；至少一例 `pointerType: 'pen'` 的触控笔中断也回滚；外来 pointer 和第二 pointer 不抢占；卸载 cleanup 后迟到事件无效。
- gesture 中触发 viewport resize 迫使 React 父级重渲染，预览仍保持最新 rAF draft，不回到 settled draft。
- 不可逆/失效矩阵通过纯函数测试返回原引用；E2E 不制造非法持久化场景。
- 一次 gesture 同帧派发 120 次 pointermove，预览 DOM 每个 animation frame 最多提交一次，最终状态采用最新指针。

- [ ] **Step 2: 运行 E2E 并确认指针操作尚未生效**

Run: `npm run test:e2e -- e2e/freeform.spec.ts --grep "PowerPoint crop"`

Expected: Task 3 的展示测试保持通过，本任务新增的平移、所有权、重渲染和 batching 测试 FAIL；失败原因是 draft 不变化或每个 move 都提交，而不是测试安装错误。

- [ ] **Step 3: 实现 `useImageCropSession` 会话契约**

Hook 对外暴露：

```ts
interface ImageCropSessionApi {
  session: ImageCropSession | null
  overlayRef: RefObject<ImageCropOverlayHandle>
  renderDraft: ImageCropDraft | null
  start(input: StartImageCropInput): boolean
  finish(reason: ImageCropFinishReason): ImageCropFinishResult
  invalidate(): void
  panPointerDown(event: React.PointerEvent): void
  handlePointerDown(handle: ImageCropHandle, event: React.PointerEvent): void
  nudgePan(delta: Point): void
  nudgeHandle(handle: ImageCropHandle, delta: Point, symmetric: boolean): void
  applyAspectRatio(ratio: number): boolean
}
```

Hook 保存 settled draft、活动 gesture 起点、`previewDraftRef`、最新指针、rAF id、pointer id 和 imperative overlay binding。`pointermove` 只覆盖最新指针；同一帧最多调用一次 `projectImageCropHandle` 或 `panImageCropDraft`，把结果先写 `previewDraftRef`，再通过 `overlayRef.current.renderDraft()` 写 overlay 层的 style/data 属性。

Hook 每次 React render 返回 `previewDraftRef.current` 作为 `renderDraft`，而不是只返回 settled state；`useLayoutEffect` 在 overlay 挂载或父级重渲染后再次把该 preview 写入 imperative binding。这样无关重渲染不会用旧 settled draft 覆盖正在拖动的 DOM。

`finish()` 和 `invalidate()` 的职责在 hook 内闭合：

- `finish()`：取消 pending rAF；若 gesture 有尚未绘制的最新指针，同步运行一次纯几何计算；把结果写入 preview/settled ref；释放 pointer capture、移除窗口监听；返回包含 start session 与最终 draft 的 completion snapshot；随后清空 hook session。它不写文档。
- `invalidate()`：取消 pending rAF、释放 pointer capture、移除监听，直接清空 gesture、preview、settled 和 session；绝不结算最新指针，也不返回可提交结果。

`finish()` / `invalidate()` 在无会话时稳定返回 `null`/no-op，重复调用不产生迟到 DOM 写入。Step 1 的失败测试必须分别覆盖 pending rAF 下的两条路径。

- [ ] **Step 4: 实现手势结算与回滚**

- `pointerup`：同步 flush 最新指针，写 settled draft，一次 React setState，释放捕获。
- `pointercancel` / blur：cancel rAF，恢复 gesture start draft，释放捕获，保留会话。
- 外来 pointer id：忽略。
- 第二根指针：不得抢占 owner。
- effect cleanup：cancel rAF、移除 window listener、释放可释放的 capture。

DOM 快速更新调用与 React render 共用 `imageCropDraftToOverlayStyle` 纯格式化函数，禁止复制第二套几何公式。

这些所有权、回滚、cleanup 和重渲染规则必须由 Step 1 的失败测试先覆盖；本步骤不得边实现边补测试。

- [ ] **Step 5: 复跑 120 次 pointermove 的提交次数测试**

使用 Step 1 已经失败过的 `requestAnimationFrame` 计数与 crop overlay mutation observer 用例，断言现在每帧最多一次预览提交、pointerup 后稳定 React 状态与最后一帧相同。不得在调度器实现之后才第一次添加该测试。

- [ ] **Step 6: 运行聚焦 E2E 和几何测试**

Run: `npm run test:unit -- src/freeform/__tests__/imageCrop.test.ts`

Run: `npm run test:e2e -- e2e/freeform.spec.ts --grep "PowerPoint crop (pans|batches)"`

Expected: PASS。

- [ ] **Step 7: 提交会话与手势**

```bash
git add src/freeform/useImageCropSession.ts src/freeform/ImageCropOverlay.tsx src/freeform/FreeformWorkspace.tsx e2e/freeform.spec.ts
git commit -m "feat: add frame-scheduled image crop gestures"
```

## Task 5: 比例、完成语义、历史与形状隔离

**Files:**
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/freeform/ImageCropOverlay.tsx`
- Modify: `e2e/freeform.spec.ts`
- Modify: `e2e-integration/backend.spec.ts`

- [ ] **Step 1: 写比例和完成语义的失败 E2E**

新增/改写测试覆盖：

- “比例”菜单的原图、1:1、4:3、3:4、16:9、9:16。
- 预设是一次性内接调整，之后角柄可自由改变比例。
- `Escape`、`Enter`、外部点击、“完成”都保留独立图片结果。
- 完成后一次 undo 同时恢复几何和 framing；无改动不写历史。
- `Escape` 在 pending rAF 手势中提交最新指针状态，退出后没有迟到 mutation。
- 形状取景仍有完成/取消/缩放条，`Escape` 仍取消。
- page、draft、account、workspace 四类切换都做对照：独立 crop 先 flush pending rAF 并完成，shape framing 取消。
- 模拟权威草稿作用域或 readiness identity 已变化后再切换，两类会话都只清临时状态，不把旧结果写进新文档。
- crop 期间保存、导出、undo/redo、fit、换图、锁定、隐藏、删除、粘贴、重排和结构命令全部禁用或 no-op。
- 图片 decode/error 报告、源/path/scope 不匹配或目标被权威状态隐藏/锁定时立即取消 rAF、释放指针并丢弃 crop session，开始文档不变。
- 真实 decode error 显示现有图片加载操作错误；scope/path/source 身份过期只静默清理。
- 用户已经产生非同值裁剪，但 `node/update-image-crop` 被 reducer 拒绝时不写历史，并显示现有裁剪失败提示。
- 在实现前同步改写 `e2e-integration/backend.spec.ts` 的 `migrates a nested v3 image frame and persists it as v4`，改用新 crop 入口/手势/完成；此时测试应先因新 UI 尚不存在而失败。

- [ ] **Step 2: 运行测试并确认旧 Escape/transition 语义失败**

Run: `npm run test:e2e -- e2e/freeform.spec.ts --grep "(crop aspect ratios|crop finish semantics|crop transition|crop blocks commands|crop invalidates|shape image framing)"`

Run: `npm run test:integration -- --grep "nested v3 image frame"`

Expected: 两条命令都 FAIL；前者因为独立图片仍走旧取消路径或缺少比例菜单，后者因为改写后的远端测试找不到新 crop UI。

- [ ] **Step 3: 接入比例菜单**

使用项目现有 option menu/select 模式，按钮文字为“比例”，选项只有规格定义的六项。菜单交互不触发外部点击完成；失败时通过 `OperationNotice` 显示“当前裁剪范围无法应用该比例”。

- [ ] **Step 4: 实现严格完成顺序**

`finishImageCrop` 必须：settle gesture → 核对 scope/path/source/fit/readiness → 构造 `node/update-image-crop` → 在一次同步 history updater 中运行 reducer、验证命中并提交 → 清理。不要调用返回 `void` 的 `replaceCurrent` 后立刻读取 `currentDocumentRef`，那会读到旧快照。

新增内部 `applyAndCommitLiveEdit(startDocument, action, expectedChanged)`。先对 `currentDocumentRef.current` 同步运行 reducer 做 preflight：期望有变化却返回原引用时返回 `rejected`，由调用方显示现有裁剪失败提示；期望无变化时走 cancel 路径。preflight 命中后，在同一个 `updateHistory(current => ...)` 中：

1. 对 `current.current` 调用 `freeformReducer` 得到 `next`。
2. 若 reducer 返回原引用，恢复/保留 `startDocument`，不写 past。
3. 若变化，复用 `commitLiveEdit` 对 successful-save rebase 的 `historyStart` 选择规则，一次返回 `{ past: [...past, historyStart], current: next, future: [] }`。
4. 同一个 updater 之外只更新 `savedAt`、OperationNotice 和会话清理；不得先产生只有 geometry 或只有 framing 的中间 current。

`Escape`、`Enter`、外部画布 pointerdown 和“完成”共用这一入口。外部点击在 capture 阶段同步清理 session ref，使同一次点击可以继续执行普通选择。

把 crop session ref 纳入 `blockDocumentMutationDuringInteraction`、toolbar/right-panel `disabled`、保存/导出入口和全局快捷键分支。readiness effect 和权威目标核对失败统一调用 hook 的 `invalidate()`，不能走完成路径；真实 decode error 随后调用现有 `showOperationError`/`OperationNotice`，身份过期不提示。reducer preflight 返回 `rejected` 时显示“图片裁剪未能应用，请重试”。

- [ ] **Step 5: 分派切换行为**

在 Step 1 的四类失败测试已经存在后，把现有切换 helper 改成模式分派：

- 独立 image crop：有效同作用域先完成，再切页/切草稿/切账号/切工作区。
- shape framing：继续 `cancelLiveEdit(startDocument)`，再切换。
- 作用域或权威目标已经失效：两者都只清临时状态，不写旧快照。

不要把形状 session 改成新的 `Escape` 语义。

- [ ] **Step 6: 更新既有 framing E2E**

把原来混合测试拆成独立图片 crop 与形状 framing 两组。删除只属于旧独立图片 UI 的 slider/cancel 断言；保留形状对应断言。保存、复制、页面复制测试改用 crop 完成后的 v4 数据。

确认 Step 1 已经先改写的 `e2e-integration/backend.spec.ts` 远端流程现在通过：它使用 `freeform-image-crop` 入口、黑柄/图片平移和“完成”，不再引用独立图片 `freeform-framing-zoom` / `freeform-framing-cancel`，并继续断言远端保存与重载后的 v4 `framing` 和几何一致。

- [ ] **Step 7: 运行相关 E2E 与历史测试**

Run: `npm run test:unit -- src/freeform/__tests__/history.test.ts src/freeform/__tests__/document.test.ts`

Run: `npm run test:e2e -- e2e/freeform.spec.ts --grep "(crop|framing)"`

Run: `npm run test:integration -- --grep "nested v3 image frame"`

Expected: PASS。

- [ ] **Step 8: 提交完整命令语义**

```bash
git add src/freeform/FreeformWorkspace.tsx src/freeform/ImageCropOverlay.tsx e2e/freeform.spec.ts e2e-integration/backend.spec.ts
git commit -m "feat: complete PowerPoint-style crop commands"
```

## Task 6: 响应式、可访问性与视觉验收

**Files:**
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: 写多环境布局和可访问性失败测试**

在 1440、1024、440 三种视口与浅/深主题循环验证：

- 八个柄屏幕命中区域至少 24px，视觉粗细稳定。
- 顶部比例/完成不重叠、不截断，不产生横向滚动。
- 440px 收起普通工具栏和左右面板，完成后恢复。
- 每个 handle 可聚焦，名称为“裁剪上边/右上角…”；方向键与 `Ctrl` 规则正确。
- 暗图、亮图、黑柄和白色轮廓在明暗图片上都有可辨识像素差。

- [ ] **Step 2: 运行测试并确认具体布局/命中失败**

Run: `npm run test:e2e -- e2e/freeform.spec.ts --grep "crop stays usable"`

Expected: FAIL，报告当前 CSS 尺寸或窄屏结构不满足。

- [ ] **Step 3: 精修 CSS**

沿用现有静默工具界面，不引入新字体、卡片、渐变、圆形装饰或大面积品牌色。黑柄使用接近 `#111` 的实色、白色 1px halo；暗图只降低亮度/透明度，不模糊。手柄的 hit target 与视觉 bar 分离，光标按方向设置。

所有固定格式元素用显式宽高/transform origin，hover/focus 不改变布局。窄屏工具栏使用稳定 grid，不让长文本挤出按钮。

- [ ] **Step 4: 截取隔离 Chrome 的桌面/窄屏明暗主题截图**

使用 Playwright 自己启动的 Chrome，保存临时截图到 `D:\tmp`，不连接、不关闭用户浏览器。检查裁剪框、黑柄、框外原图、工具栏和页面边界；发现重叠先修 CSS 再重跑。

- [ ] **Step 5: 运行响应式、acceptance 与构建**

Run: `npm run test:e2e -- e2e/freeform.spec.ts --grep "crop stays usable"`

Run: `npm run test:acceptance`

Run: `npm run build`

Expected: 全部 PASS；仅允许仓库已有的 bundle size 警告，不允许新增运行时/类型警告。

- [ ] **Step 6: 提交视觉与响应式**

```bash
git add src/styles.css e2e/freeform.spec.ts
git commit -m "fix: polish image crop controls across viewports"
```

## Task 7: 文档与版本同步

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/freeform-editor.md`
- Modify: `docs/backend-plan.md`
- Modify: `docs/superpowers/specs/2026-07-26-freeform-image-framing-design.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 更新根版本**

运行 `npm version 0.15.0 --no-git-tag-version`，确认只修改根 `package.json` 与根 `package-lock.json` 的应用版本。`server/package.json` 和 `server/package-lock.json` 保持 `0.3.0`。把 `docs/backend-plan.md` 顶部“当前源码版本”的前端值同步为 `0.15.0`，后端值保持 `0.3.0`；其 v4 存储说明不变。

- [ ] **Step 2: 更新用户文档**

README 用两句话区分：独立图片使用 PowerPoint 式裁剪；矩形、圆形和三角形图片填充使用调整取景。避免把功能写成名词堆叠。

`docs/freeform-editor.md` 写明黑柄、移动图片、比例、`Escape`/外部点击完成、一次撤销，以及形状 `Escape` 取消。旧规格顶部增加“独立图片现行交互由 2026-07-27 规格覆盖”，不改写历史设计正文。

- [ ] **Step 3: 更新 CHANGELOG**

新增 `0.15.0` 条目，记录交互变化、性能路径、兼容性和无文档版本升级。不要声称裁剪会删除原图像素。

- [ ] **Step 4: 全项目命名和版本 grep**

Run: `rg -n "imageCrop|ImageCrop|node/update-image-crop|0\.14\.0|0\.15\.0" src docs README.md CHANGELOG.md package.json package-lock.json server/package.json server/package-lock.json`

Expected: 新命名一致；旧 `0.14.0` 只存在历史 changelog/设计语境；server 仍为 0.3.0。

- [ ] **Step 5: 文档差异检查并提交**

Run: `git diff --check`

```bash
git add README.md CHANGELOG.md docs/freeform-editor.md docs/backend-plan.md docs/superpowers/specs/2026-07-26-freeform-image-framing-design.md package.json package-lock.json
git commit -m "docs: release PowerPoint-style crop in 0.15.0"
```

## Task 8: 完整验证与自检

**Files:**
- Verify all changed files

- [ ] **Step 1: 运行所有单元、服务端和 E2E**

Run: `npm test`

Expected: unit、server、E2E 全部 PASS。

- [ ] **Step 2: 运行 acceptance 与 integration**

Run: `npm run test:acceptance`

Run: `npm run test:integration`

Expected: PASS，远端草稿 v4 framing 和真实后端流程不回归。

- [ ] **Step 3: 构建和仓库卫生**

Run: `npm run build`

Run: `git diff --check`

Run: `git status --short`

Expected: 构建 PASS，无空白错误；只保留计划内文件，`.superpowers/` 视觉伴随物和 `D:\tmp` 截图不提交。

- [ ] **Step 4: 按 AGENTS.md 六项清单复核**

逐项确认：

1. 所有纯函数对 null 等价输入、零尺寸、非有限值和不可逆矩阵返回稳定 `null`/原引用。
2. `imageCrop`、`ImageCropSession` 和 `node/update-image-crop` 全项目命名一致。
3. 没有新增 HTTP/错误码；操作失败走既有 OperationNotice。
4. README、CHANGELOG、编辑器文档和旧规格已同步。
5. 根版本 0.15.0，server 0.3.0。
6. 图片比例、嵌套/旋转、明暗主题、1440/1024/440、本地/远端、鼠标/触控笔/键盘均有覆盖。

- [ ] **Step 5: 请求代码审查并修复实质问题**

使用 `superpowers:requesting-code-review` 审查相对本计划起点 `cd8361d` 的完整差异。若发现问题，先写失败测试再修复，并重跑相关聚焦测试和最终验证。

- [ ] **Step 6: 提交审查修复并确认工作树干净**

如有修复，按行为拆分提交。最后 `git status --short --branch` 必须只显示分支头，无未提交文件。
