# Freeform Image Framing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为自由编辑中的独立图片和形状图片填充加入可逆的焦点与缩放取景，保证画布、缩略图、保存恢复和 PNG 导出使用同一份数据与渲染结果。

**Architecture:** 将功能拆成三层：`imageFraming.ts` 只负责严格数据契约和纯几何；`FramedImage.tsx` 统一所有图片展示、解码状态和精确定位；`FreeformWorkspace.tsx` 只编排取景会话、历史、异步身份和导出等待。自由编辑文档升级到严格 v4，v1/v2/v3 只在读取边界迁移，后端继续把文档当作不透明 JSON。

**Tech Stack:** React 18、TypeScript、Vitest、Playwright（独立 system Chrome）、html-to-image、现有递归场景树和本地/远程草稿存储。

---

## Implementation Invariants

- `ImageFraming` 在运行时 v4 图片和图片填充上始终存在，不使用可选字段或渲染层补默认值。
- `focusX/focusY` 的合法范围为 `0..1`，`zoom` 为 `1..4`；相等判断使用 `1e-6`，持久化不做显示精度取整。
- `contain` 只忽略、绝不改写 `framing`；切回 `cover` 恢复原取景。
- 非默认 `cover` 在原图尺寸未知时显示中性加载面，不能先显示错误的居中裁切；默认取景和 `contain` 才可使用等价的 `object-fit` fallback。
- 画布、缩略图和导出复用同一个 `FramedImage` DOM/几何路径。只有活动画布报告入口解码状态。
- 一次取景会话最多产生一条撤销记录；取消、回到原值和失效会话不产生历史。
- 取景会话中只允许更新当前目标的 `framing`。页面、草稿、账号或工作区切换必须先取消旧会话，再切换作用域。
- 后端 API、SQLite 结构、`DraftEnvelope.schemaVersion` 和 `server` 版本不变；根应用版本从 `0.13.5` 升到 `0.14.0`。

## File Structure

- Create `src/freeform/imageFraming.ts`
  - 默认值、校验、深克隆、相等判断、cover/contain 几何和拖动反算。
- Create `src/freeform/__tests__/imageFraming.test.ts`
  - 纯计算、非法输入、旋转/缩放矩阵和平移边界测试。
- Modify `src/freeform/types.ts`
  - v4 文档、`ImageFraming`、图片/图片填充和版本无关运行时类型。
- Modify `src/freeform/sceneDocument.ts`
  - v1/v2/v3 到 v4 的迁移以及严格 v4 归一化。
- Modify `src/freeform/document.ts`
  - 新建、更新、替换、重置、原子 src 更新、深相等和 reducer 无操作语义。
- Modify `src/freeform/sceneTree.ts`
  - 严格键校验、深复制、递归遍历和 mutation 校验。
- Modify `src/freeform/imageAssets.ts`, `src/freeform/fontRequests.ts`, `src/drafts.ts`
  - 版本无关运行时命名和取景数据跨物化、上传、保存的保留。
- Modify `src/templates/registry.ts`
  - 内置自由编辑模板升级到合法 v4。
- Create `src/freeform/FramedImage.tsx`
  - 共享图片 DOM、引用解析、解码代次、精确几何和安全 fallback。
- Create `src/freeform/imageReadiness.ts`
  - 活动画布解码身份、状态表和导出等待的纯辅助函数。
- Create `src/freeform/__tests__/imageReadiness.test.ts`
  - 旧作用域/旧源报告拒绝、状态清理、超时和失败聚合测试。
- Modify `src/freeform/FreeformSceneNodeView.tsx`, `src/freeform/FreeformSlidePreview.tsx`, `src/freeform/paint.ts`
  - 独立图片和形状图片填充统一接入 `FramedImage`。
- Modify `src/freeform/FreeformWorkspace.tsx`, `src/freeform/PaintField.tsx`
  - 入口、会话、历史、快捷键、异步令牌、属性面板和导出等待。
- Modify `src/styles.css`
  - 裁切容器、形状遮罩、三等分线、上下操作条和窄视口布局。
- Modify affected unit tests under `src/freeform/__tests__/`, `src/storage/*.test.ts`, and `src/templates/registry.test.ts`
  - v4 fixture、深复制、迁移、存储和回归覆盖。
- Modify `e2e/freeform.spec.ts`, `e2e/editor-acceptance.spec.ts`, `e2e-integration/backend.spec.ts`
  - 浏览器交互、像素一致性、本地/远程恢复和多视口验收。
- Modify `README.md`, `CHANGELOG.md`, `docs/freeform-editor.md`, `docs/backend-plan.md`, `package.json`, `package-lock.json`
  - 功能、契约、快捷键、版本和后端不变范围同步。

### Task 1: Add the pure framing contract and geometry

**Files:**
- Create: `src/freeform/imageFraming.ts`
- Create: `src/freeform/__tests__/imageFraming.test.ts`
- Reference: `src/freeform/sceneTransform.ts`

- [ ] **Step 1: Write failing validation, clone and equality tests**

Cover these contracts before production code exists:

- `createDefaultImageFraming()` returns a new `{ focusX: 0.5, focusY: 0.5, zoom: 1 }` object on every call;
- `isValidImageFraming` accepts boundary values and rejects missing/extra keys, strings, `NaN`, infinities and values outside the ranges;
- `cloneImageFraming` returns an owned object;
- `imageFramingEquals` accepts per-field deltas at or below `SCENE_EPSILON` and rejects larger deltas;
- invalid values are never silently repaired by strict validation.

Use a factory instead of exporting one shared mutable default object. Export numeric constants for the zoom bounds and keep the equality tolerance aligned with `SCENE_EPSILON`.

- [ ] **Step 2: Write failing geometry and drag tests**

Define explicit inputs and outputs:

```ts
interface ImageFrameSize { width: number; height: number }

interface FramedImageGeometry {
  left: number
  top: number
  width: number
  height: number
}

interface CalculateFramedImageGeometryInput {
  naturalSize: ImageFrameSize
  frameSize: ImageFrameSize
  fit: 'cover' | 'contain'
  framing: ImageFraming
}

interface PanImageFramingInput {
  naturalSize: ImageFrameSize
  frameSize: ImageFrameSize
  framing: ImageFraming
  localDelta: { x: number; y: number }
}

interface PanImageFramingFromScreenInput extends Omit<PanImageFramingInput, 'localDelta'> {
  screenDelta: { x: number; y: number }
  renderScale: number
  worldMatrix: Matrix2D
}
```

Test:

- wide, tall and square images in wide, tall and square frames for `cover` and `contain`;
- all four focus corners at zoom `1` and `4`;
- cover output always covers the frame without a positive gap after clamping;
- contain is centered and does not depend on the saved framing;
- a drag followed by its inverse returns to the original framing within tolerance when it did not hit a clamp;
- `panImageFraming` consumes an already-local delta so keyboard movement can be exactly 1/10 local px;
- `panImageFramingFromScreen` converts pointer screen deltas through `invert(worldMatrix)` and `transformVector`, then divides by the positive finite `renderScale` before calling the same local pan helper;
- rotated nodes, scaled groups and nested transforms preserve the visual drag direction;
- zero/negative/non-finite sizes, invalid framing or local delta, invalid render scale, non-finite matrix and non-invertible matrix return `null` geometry or the exact original framing reference;
- a clamped or epsilon-equal no-op returns the exact original framing reference.

- [ ] **Step 3: Run the focused test to verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/imageFraming.test.ts
```

Expected: Vitest fails because `imageFraming.ts` and its exports do not exist. This missing module is the RED evidence.

- [ ] **Step 4: Implement the smallest pure module**

Implement only the contracts above. The cover calculation must follow the approved formula:

```ts
const baseScale = Math.max(frame.width / natural.width, frame.height / natural.height)
const scale = baseScale * framing.zoom
const width = natural.width * scale
const height = natural.height * scale
const left = clamp(frame.width / 2 - framing.focusX * width, frame.width - width, 0)
const top = clamp(frame.height / 2 - framing.focusY * height, frame.height - height, 0)
```

For panning, calculate current `left/top`, add the local delta, clamp, then derive focus from the clamped coordinates. `panImageFramingFromScreen` only performs the pointer-specific coordinate conversion before delegating to `panImageFraming`. Do not duplicate either the geometry formula or pointer conversion in the workspace/component.

- [ ] **Step 5: Verify focused and transform regression tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/imageFraming.test.ts src/freeform/__tests__/sceneTransform.test.ts
```

Expected: both files pass and no case produces `NaN`.

- [ ] **Step 6: Commit the pure contract**

```powershell
git add src/freeform/imageFraming.ts src/freeform/__tests__/imageFraming.test.ts
git commit -m "feat: add image framing geometry"
```

### Task 2: Upgrade the freeform document contract from v3 to strict v4

**Files:**
- Modify: `src/freeform/types.ts`
- Modify: `src/freeform/sceneDocument.ts`
- Modify: `src/freeform/sceneTree.ts`
- Modify: `src/freeform/document.ts`
- Modify: `src/freeform/__tests__/sceneDocument.test.ts`
- Modify: `src/freeform/__tests__/sceneTree.test.ts`
- Modify: `src/freeform/__tests__/document.test.ts`
- Modify: `src/freeform/__tests__/sceneProperties.test.ts`

- [ ] **Step 1: Add failing migration and strict-v4 tests**

Add recursive fixtures containing standalone images and image-filled rect/ellipse/triangle leaves at root, hidden nodes and multiple nested group depths. Assert:

- v1/v2 still migrate through their existing legacy path and finish as v4;
- valid v3 receives an owned default framing object on every image-bearing leaf;
- migration does not mutate the input;
- valid v4 survives normalization with owned nested objects;
- v4 rejects the whole document when `framing` is missing, has extra keys, has non-finite numbers or is out of range;
- v4 does not fall through to the v3/legacy repair path;
- unsupported versions return `null`;
- cloning a node/page gives every image framing its own object;
- image fill exact-key validation now requires `framing` and rejects extra keys.

- [ ] **Step 2: Add failing reducer tests for update semantics**

Assert:

- new standalone images and new image fills get independent default framing;
- a valid image `framing` style patch updates it and an epsilon-equal patch returns the original document/node reference;
- an invalid framing patch is rejected without a partial update;
- changing standalone `src` resets framing atomically and preserves `fit`/`alt` as specified;
- changing only `alt` preserves framing;
- changing `fit` preserves framing in both directions;
- replacing a shape image source preserves its previous fit and resets framing;
- converting a color/gradient fill to an image starts at `cover` plus default framing;
- shape type, geometry, rotation and group transforms preserve framing;
- image-fill equality compares `src`, `fit` and nested `framing`, instead of relying on shallow `paintEquals`.

- [ ] **Step 3: Run the focused contract suite to verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneDocument.test.ts src/freeform/__tests__/sceneTree.test.ts src/freeform/__tests__/document.test.ts src/freeform/__tests__/sceneProperties.test.ts
```

Expected: new v4 assertions fail because current documents are v3 and image records have no framing.

- [ ] **Step 4: Introduce v4 types and versionless runtime names**

In `types.ts`:

- set `FreeformDocument.documentVersion` to `4`;
- add `ImageFraming` and require it on `FreeformImageElement` and image `ShapeFill`;
- allow `framing?: ImageFraming` in `FreeformNodeStylePatch`, with reducer category validation deciding where it is legal;
- rename `FreeformActionV3` to `FreeformAction` and remove current-runtime `FreeformDocumentV3`/`FreeformSlideV3` aliases;
- introduce private/historical v3 input types in `sceneDocument.ts` rather than exporting a shipping v3 runtime alias.

Only validators/migrations for historical wire formats keep `V1`, `V2` or `V3` suffixes.

- [ ] **Step 5: Implement strict normalization and migration**

In `sceneDocument.ts`:

- preserve an internal strict v3 validator so corrupted v3 is not repaired;
- implement `migrateFreeformDocumentV3ToV4` by recursively mapping every leaf and adding new default framing objects;
- change the public read boundary to `normalizeFreeformDocument` returning v4 for v1/v2/v3/v4;
- implement strict v4 exact-key cloning for image nodes and image fills;
- rename current leaf mappers to `mapFreeformDocumentLeaves` and `mapFreeformDocumentLeavesAsync`;
- keep input immutable and ensure nested `framing` is deep-cloned.

- [ ] **Step 6: Update reducer and tree ownership rules**

In `document.ts` and `sceneTree.ts`:

- replace hard-coded v3 runtime names with versionless names;
- use `cloneImageFraming`, `imageFramingEquals`, `cloneShapeFill` and `shapeFillEquals` consistently;
- extend strict key validators;
- make src reset and fill replacement atomic;
- return the original reference for same-value patches;
- ensure `cloneSceneNodes`, `copySceneNodeValue`, page duplication, legacy element adapters and recursive mappers own framing objects.

- [ ] **Step 7: Update all typed fixtures and run the complete unit suite**

Search first so no current-runtime v3 name is missed:

```powershell
rg -n "Freeform(Document|Slide|Action)V3|reduceFreeformDocumentV3|mapFreeformDocumentV3|normalizeFreeformDocumentToV3" src e2e e2e-integration
```

Update affected test factories to emit legal v4 objects. Historical fixture names may retain v3 when they deliberately test migration.

Run:

```powershell
npm run test:unit
```

Expected: all unit tests pass. Then rerun the `rg`; only intentional historical migration identifiers/fixtures remain.

- [ ] **Step 8: Commit the v4 contract**

```powershell
git add src/freeform/types.ts src/freeform/sceneDocument.ts src/freeform/sceneTree.ts src/freeform/document.ts src/freeform/__tests__
git commit -m "feat: migrate freeform documents to v4"
```

### Task 3: Preserve framing through templates, image assets and storage

**Files:**
- Modify: `src/drafts.ts`
- Modify: `src/freeform/imageAssets.ts`
- Modify: `src/freeform/fontRequests.ts`
- Modify: `src/freeform/__tests__/draftMigration.test.ts`
- Modify: `src/freeform/__tests__/imageAssets.test.ts`
- Modify: `src/freeform/__tests__/fontRequests.test.ts`
- Modify: `src/storage/local.test.ts`
- Modify: `src/storage/remote.test.ts`
- Modify: `src/templates/registry.ts`
- Modify: `src/templates/registry.test.ts`

- [ ] **Step 1: Add failing round-trip and ownership tests**

Use non-default framing so accidental fallback to the default is visible. Assert:

- `normalizeDraftForRead` migrates v1/v2/v3 freeform drafts to v4;
- `normalizeDraftForWrite` rejects bad v4 rather than partially repairing it;
- local save/read preserves exact framing values;
- remote adapter serialization/normalization preserves exact framing values and rejects a malformed v4 response;
- image source collection still finds root/nested standalone and fill images;
- local materialization and inline upload replace only `src`, preserving `fit`, `alt` and framing with an owned copy;
- upload/materialization failure returns the same behavioral fallback as before without losing framing;
- font collection traverses v4 without changing image data;
- all registered freeform templates normalize as v4 and do not share framing object references.

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/draftMigration.test.ts src/freeform/__tests__/imageAssets.test.ts src/freeform/__tests__/fontRequests.test.ts src/storage/local.test.ts src/storage/remote.test.ts src/templates/registry.test.ts
```

Expected: v4 round-trip/template assertions fail while the code still imports v3 runtime helpers.

- [ ] **Step 3: Update storage boundaries and current-runtime traversal**

- make `Draft.document` and `SaveDraftInput.document` use `FreeformDocument`;
- call `normalizeFreeformDocument` for both local and remote read/write boundaries;
- update asset/font traversal to the versionless mappers;
- replace source fields without reconstructing or sharing the nested framing object;
- upgrade built-in templates to `documentVersion: 4` and explicit independent framing values;
- do not modify backend routes, SQLite migrations or envelope schema.

- [ ] **Step 4: Verify focused tests and server opacity**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/draftMigration.test.ts src/freeform/__tests__/imageAssets.test.ts src/freeform/__tests__/fontRequests.test.ts src/storage/local.test.ts src/storage/remote.test.ts src/templates/registry.test.ts
npm run test:server
```

Expected: both commands pass; server tests confirm the document remains opaque JSON.

- [ ] **Step 5: Commit persistence support**

```powershell
git add src/drafts.ts src/freeform/imageAssets.ts src/freeform/fontRequests.ts src/freeform/__tests__ src/storage src/templates/registry.ts src/templates/registry.test.ts
git commit -m "feat: persist image framing in freeform drafts"
```

### Task 4: Build the shared renderer and decode identity contract

**Files:**
- Create: `src/freeform/FramedImage.tsx`
- Create: `src/freeform/imageReadiness.ts`
- Create: `src/freeform/__tests__/imageReadiness.test.ts`
- Modify: `src/freeform/FreeformSceneNodeView.tsx`
- Modify: `src/freeform/FreeformSlidePreview.tsx`
- Modify: `src/freeform/paint.ts`
- Modify: `src/freeform/__tests__/paint.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing readiness identity tests**

Define a complete identity:

```ts
interface ImageDecodeIdentity {
  scopeGeneration: number
  slideId: string
  scenePathKey: string
  logicalSrc: string
  resolvedSrc: string
}

type ImageDecodeReport =
  | { identity: ImageDecodeIdentity; status: 'loading' | 'error' }
  | {
      identity: ImageDecodeIdentity
      status: 'ready'
      naturalWidth: number
      naturalHeight: number
    }
```

Test helpers that:

- accept ready only for positive finite natural sizes and an exact identity match;
- reject a late report from an old scope, slide, path, logical source or resolved source;
- clear slide entries on slide switch and all entries on scope switch;
- do not let a stale error overwrite a new ready state;
- treat shape fills and standalone images at the same path as different current node/source matches through current-tree validation in the caller.

- [ ] **Step 2: Run the readiness test to verify RED**

```powershell
npm run test:unit -- src/freeform/__tests__/imageReadiness.test.ts
```

Expected: module-not-found RED.

- [ ] **Step 3: Implement `FramedImage` with safe fallback behavior**

The component receives logical/resolved sources, alt, fit, framing, frame width/height and optional active-canvas report identity/callback. It must:

- resolve no source internally except through passed `resolvedSrc`, so logical and resolved identities stay explicit;
- use one clipped, `position: relative` container and one absolutely positioned real `<img>`;
- increment a local generation on every `resolvedSrc` change and unmount;
- report `loading` before accepting `load`/`decode()` callbacks;
- accept a callback only when local generation and source still match;
- render exact geometry after dimensions are ready;
- use centered `object-fit: contain` for contain and centered `object-fit: cover` only for default framing while dimensions are unavailable;
- render a neutral loading surface for non-default cover until exact dimensions are ready;
- expose a stable `data-image-load-state` for browser tests without showing implementation copy in the UI;
- omit decode reporting entirely for preview/presentation-only instances.

- [ ] **Step 4: Replace both old image rendering paths**

In `FreeformSceneNodeView.tsx`:

- pass `slideId`, `scopeGeneration`, logical source and scene path down the branch;
- render standalone images through `FramedImage`;
- render image fills as a child `FramedImage` inside the existing shape container;
- preserve the shape container's border, rect radius, ellipse radius and triangle clipping;
- keep pure color/gradient shapes on `shapeFillToStyle`;
- keep `FreeformSlidePreview` and export presentation rendering on the same component tree, with no readiness callback.

In `paint.ts`, remove `backgroundImage` generation for image fills or narrow the function to color paint. Add a regression test ensuring image fills cannot accidentally regain a second CSS-background rendering path.

- [ ] **Step 5: Add renderer and shape clipping CSS**

Add stable dimensions and clipping rules for:

- standalone frame container;
- shape image child under rect/ellipse/triangle masks;
- neutral loading/error surface;
- pointer events remaining on the scene node wrapper, not the inner `<img>`.

Do not add decorative cards or new palettes. The framing controls are added later; this task only establishes pixel-identical rendering.

- [ ] **Step 6: Verify unit tests and build**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/imageReadiness.test.ts src/freeform/__tests__/imageFraming.test.ts src/freeform/__tests__/paint.test.ts
npm run build
```

Expected: tests and TypeScript build pass; there are no remaining `backgroundImage`/`backgroundPosition` image-fill branches in the freeform scene renderer.

- [ ] **Step 7: Commit shared rendering**

```powershell
git add src/freeform/FramedImage.tsx src/freeform/imageReadiness.ts src/freeform/__tests__/imageReadiness.test.ts src/freeform/FreeformSceneNodeView.tsx src/freeform/FreeformSlidePreview.tsx src/freeform/paint.ts src/freeform/__tests__/paint.test.ts src/styles.css
git commit -m "feat: render freeform images with shared framing"
```

### Task 5: Add framing entry points and the single-history session

**Files:**
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/freeform/PaintField.tsx`
- Modify: `src/freeform/FreeformSceneNodeView.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Add failing entry-condition and control tests**

Create a deterministic test document with a four-quadrant image and cover mode. Browser assertions:

- a selected unlocked standalone image can enter via double-click and “调整取景”;
- an image-filled rect/ellipse/triangle can enter from its fill controls and double-click;
- nested active-scope leaves work only after entering the existing group scope;
- hidden nodes, locked nodes, inherited locked nodes, `contain`, loading/error images and pending replacement do not enter;
- disabled inspector actions expose a useful accessible name/tooltip without extra visible explanatory text;
- “重置取景” is enabled only for non-default cover framing and returns to center/100%;
- switching contain -> cover restores the saved non-default framing;
- replacing an image preserves fit and resets framing.

- [ ] **Step 2: Add failing session/history tests**

Assert:

- entering hides selection/resize/rotate handles and shows the rule-of-thirds overlay, top Cancel/Done and bottom zoom controls;
- pointer drag updates the image live; slider changes by 1%, +/- buttons by 10%; arrow keys move 1 local px and Shift+arrow 10 local px;
- Enter commits, Escape cancels;
- several drags/zoom changes followed by Done add exactly one undo entry;
- returning to the exact starting value followed by Done adds none;
- Cancel/Escape restore the starting document and saved/dirty state;
- `pointercancel` and window blur roll back only the active drag segment but retain earlier changes in the session;
- controls stay inside 440px viewport, do not overlap, and create no horizontal page scroll.

- [ ] **Step 3: Run focused Playwright tests to verify RED**

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "image framing"
```

Expected: framing controls and mode do not exist.

- [ ] **Step 4: Add active-canvas readiness state and strict entry guards**

In `FreeformWorkspace.tsx`:

- keep readiness keyed by the complete `ImageDecodeIdentity`;
- derive identities from `documentIdentityGenerationRef`, active slide, full path, current node type and current source;
- accept reports only after re-reading the current node and confirming all fields still match;
- clear active-slide records when the active slide changes and clear all records when document scope generation changes;
- copy the ready natural dimensions into a newly opened session rather than reading mutable DOM later;
- block entry while the shape replacement token for that exact scope/slide/path is pending.

- [ ] **Step 5: Implement the framing session on existing live-edit primitives**

Session state must retain at least:

```ts
interface ImageFramingSession {
  scopeGeneration: number
  draftScopeKey: string
  slideId: string
  path: ScenePath
  targetKind: 'image' | 'shape-fill'
  logicalSrc: string
  resolvedSrc: string
  naturalSize: ImageFrameSize
  startDocument: FreeformDocument
  startFraming: ImageFraming
}
```

Keep the current pointer id, drag origin and drag-start framing separately. Use `replaceCurrent` for every live update. On Done compare final/start framing using `imageFramingEquals`, then call exactly one of `commitLiveEdit(startDocument)` or `cancelLiveEdit(startDocument)`. Cancel always uses `cancelLiveEdit` only when the session still belongs to the same draft scope; otherwise discard transient state without restoring an old document into the new scope.

Convert pointer screen deltas through `sceneWorldMatrixAtPath`, its inverse and current `renderScale`, using `panImageFramingFromScreen`. Direction keys call `panImageFraming` directly with `{ x: +/-1|10, y: +/-1|10 }` in target-local coordinates; they must not pass through the inverse matrix. Never implement a second conversion in the component.

- [ ] **Step 6: Render controls and inspector actions**

- add “调整取景” and “重置取景” beside standalone image controls;
- extend `PaintField` with optional image-framing actions for image fills without coupling the generic color picker to workspace state;
- use existing Lucide icon/button/tooltip patterns for +/- and reset controls;
- make the crop surface focusable with an accessible label;
- show the three-by-three guide and ensure all helper UI carries `freeform-ui-only`;
- disable conflicting inspector and layer controls while framing rather than allowing event leakage.

- [ ] **Step 7: Implement keyboard and pointer segment semantics**

- pointer down captures only the framing surface and records the segment start;
- pointer move updates from segment start, not cumulatively from rounded state;
- pointer up retains the segment in the still-open session;
- pointer cancel/window blur restores only the segment start framing;
- direction keys move the image by exactly 1 local px, or 10 local px with Shift, regardless of ancestor rotation/scale;
- Escape cancels the whole session, Enter completes it;
- stop handled framing keys before global canvas shortcuts run;
- make slider and buttons produce the same history behavior as pointer movement.

- [ ] **Step 8: Verify focused E2E and unit regressions**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "image framing"
npm run test:unit -- src/freeform/__tests__/document.test.ts src/freeform/__tests__/history.test.ts src/freeform/__tests__/imageFraming.test.ts
```

Expected: all framing entry, interaction and single-history assertions pass.

- [ ] **Step 9: Commit the interaction**

```powershell
git add src/freeform/FreeformWorkspace.tsx src/freeform/PaintField.tsx src/freeform/FreeformSceneNodeView.tsx src/styles.css e2e/freeform.spec.ts
git commit -m "feat: add freeform image framing controls"
```

### Task 6: Harden transitions, replacement races and mutation blocking

**Files:**
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `e2e/freeform.spec.ts`
- Modify: `e2e/editor-acceptance.spec.ts`

- [ ] **Step 1: Add failing scope-transition and mutation-block tests**

Exercise every blocked command while framing:

- selection and active-scope change;
- move, resize, rotate and nudge;
- fit, source, fill type, shape type, border, lock and hide;
- add, delete, paste, duplicate, reorder, group and ungroup;
- undo/redo, save, single export and export all.

Assert commands do nothing until the user finishes/cancels. Separately assert that page, draft, account and workspace transitions cancel the framing session first and then perform the requested transition on the restored document.

Race cases:

- late decode from old source cannot enable the new source;
- old scope reusing the same `slideId/path/src` cannot populate the new scope;
- pending replacement cannot enter framing;
- if an authoritative same-scope replacement invalidates the target, restore/cancel transient framing before applying it;
- if the authoritative response belongs to another scope, clear only transient session/readiness state and never write the old snapshot.

- [ ] **Step 2: Run focused tests to verify RED**

```powershell
npm run test:e2e -- e2e/freeform.spec.ts e2e/editor-acceptance.spec.ts --grep "framing guard|framing transition|stale image"
```

Expected: at least one current mutation or transition bypasses the new session because only pointer/marquee interactions are presently guarded.

- [ ] **Step 3: Centralize mutation and transition gates**

- extend the existing mutation guard so it returns true for pointer, marquee or framing sessions;
- audit every handler found by `rg -n "blockDocumentMutationDuringInteraction|updateHistory|replaceCurrent|toBlob" src/freeform/FreeformWorkspace.tsx`;
- use one `cancelFramingThenTransition` path for slide, draft, account and workspace changes;
- order it exactly: verify old scope -> restore old start document -> clear session/readiness -> transition;
- if scope already changed, skip document restoration and only clear stale transient state;
- integrate replacement tokens with scope generation, slide, full path and current node/source validation.

- [ ] **Step 4: Verify guards and the existing editor journeys**

```powershell
npm run test:e2e -- e2e/freeform.spec.ts e2e/editor-acceptance.spec.ts --grep "framing|save|switches pages|undo"
```

Expected: framing guard/race tests and existing save/page/undo journeys pass.

- [ ] **Step 5: Commit hardening**

```powershell
git add src/freeform/FreeformWorkspace.tsx e2e/freeform.spec.ts e2e/editor-acceptance.spec.ts
git commit -m "fix: isolate freeform framing sessions"
```

### Task 7: Wait for exact image rendering before PNG export

**Files:**
- Modify: `src/freeform/imageReadiness.ts`
- Modify: `src/freeform/__tests__/imageReadiness.test.ts`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `e2e/editor-acceptance.spec.ts`

- [ ] **Step 1: Add failing export-wait unit tests**

Specify a helper that receives the current artboard root and a deadline/clock abstraction. Assert:

- it waits for every descendant framed `<img>` to reach a current successful `decode()`;
- already complete images with positive natural sizes still run `decode()` when available;
- a source change while waiting invalidates the old completion and waits for the current image;
- decode rejection, load error or deadline expiry returns a typed failure rather than hanging;
- an empty artboard succeeds immediately;
- completion does not mutate the document.

Keep the public result local to the frontend, for example `{ ok: true } | { ok: false; reason: 'image-load' | 'timeout' }`; do not add HTTP/status codes.

- [ ] **Step 2: Run the focused test to verify RED**

```powershell
npm run test:unit -- src/freeform/__tests__/imageReadiness.test.ts
```

Expected: new wait/timeout assertions fail.

- [ ] **Step 3: Implement bounded decode plus render settling**

Before every `toBlob`:

1. wait for current artboard framed images to decode within a deadline that keeps the existing total 5-second acceptance bound;
2. verify each element still has the source observed when waiting began, restarting for a current source if necessary;
3. await two `requestAnimationFrame` callbacks;
4. call `toBlob` only if all checks succeeded.

For all-page export, perform this sequence after selecting each slide and before each capture. On failure/timeout, abort the current operation, restore the original active slide, show the existing operation error surface, and leave document/history unchanged.

- [ ] **Step 4: Add four-quadrant pixel-parity browser tests**

Use a generated data URL or existing deterministic local fixture with distinct corner colors. Apply a non-default framing to standalone and shape fill images, then compare sampled pixels/bounds from:

- active canvas;
- page thumbnail/presentation renderer;
- exported PNG decoded in the test page.

Include a decode-delayed source and a failing source. Assert export waits for the former and fails visibly for the latter without downloading a stale image.

- [ ] **Step 5: Verify export and acceptance tests**

```powershell
npm run test:unit -- src/freeform/__tests__/imageReadiness.test.ts
npm run test:acceptance
```

Expected: decode wait, timeout/error, single-page and all-page parity assertions pass within the suite's existing 5-second export budget.

- [ ] **Step 6: Commit export readiness**

```powershell
git add src/freeform/imageReadiness.ts src/freeform/__tests__/imageReadiness.test.ts src/freeform/FreeformWorkspace.tsx e2e/editor-acceptance.spec.ts
git commit -m "fix: wait for framed images before export"
```

### Task 8: Complete local, remote and responsive acceptance coverage

**Files:**
- Modify: `e2e/freeform.spec.ts`
- Modify: `e2e/editor-acceptance.spec.ts`
- Modify: `e2e-integration/backend.spec.ts`
- Modify: `playwright.config.ts` only if an existing project needs a scoped viewport addition

- [ ] **Step 1: Add failing persistence and environment tests**

Cover both user/storage paths:

- guest/local: adjust, save, reload, duplicate node, duplicate page and verify non-default framing;
- authenticated/remote integration: migrate a v3 draft, adjust, save, reload and verify v4 framing;
- delayed old remote response does not overwrite the current scope/session;
- malformed v4 from either adapter is rejected consistently;
- no backend API or error-code expectation changes.

Cover geometry and UI combinations:

- standalone and image-filled rect/ellipse/triangle;
- root, rotated leaf, scaled group and two-level nested group;
- page resize and shape change preserve data without gaps;
- desktop widths 1440 and 1024, mobile width 440;
- light and dark theme;
- mouse plus keyboard-only operation; use Playwright touch only if the current project already exposes a touch project, otherwise document touch as residual risk instead of silently claiming it.

- [ ] **Step 2: Run the new focused cases to verify RED**

```powershell
npm run test:e2e -- e2e/freeform.spec.ts e2e/editor-acceptance.spec.ts --grep "framing responsive|framing persistence|framing nested"
npm run test:integration -- e2e-integration/backend.spec.ts --grep "freeform framing"
```

Expected: new local/remote and responsive cases fail until their fixtures/assertions and any remaining implementation gaps are completed.

- [ ] **Step 3: Fix only failures within the approved framing scope**

Address actual contract, geometry or responsive defects discovered by the matrix. Do not refactor unrelated selection, layer or export architecture. For every fix, first retain the failing test that exposed it.

- [ ] **Step 4: Run all browser and integration suites**

```powershell
npm run test:e2e
npm run test:acceptance
npm run test:integration
```

Expected: all pass in independent headless Playwright Chrome; no command attaches to or closes the user's current browser.

- [ ] **Step 5: Commit acceptance coverage**

```powershell
git add e2e/freeform.spec.ts e2e/editor-acceptance.spec.ts e2e-integration/backend.spec.ts playwright.config.ts
git commit -m "test: cover image framing across environments"
```

Do not stage `playwright.config.ts` when it did not need modification.

### Task 9: Synchronize version, documentation and final verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/freeform-editor.md`
- Modify: `docs/backend-plan.md`

- [ ] **Step 1: Update the application version only**

Change the root package version from `0.13.5` to `0.14.0` in `package.json` and both root package entries in `package-lock.json`. Confirm `server/package.json` and its lockfile remain `0.3.0` because no backend contract changed.

- [ ] **Step 2: Update user and developer documentation**

- README: add image framing to the freeform feature description without expanding the opening into a long feature dump;
- CHANGELOG: add `0.14.0` with standalone/shape framing, v4 migration and export consistency;
- `docs/freeform-editor.md`: document v4 required fields, migration, contain/cover behavior, entry conditions, drag/zoom/reset, Enter/Escape and one-history semantics;
- `docs/backend-plan.md`: replace current-runtime v3 references with v4 while stating that envelope/API/SQLite/server version stay unchanged;
- keep wording direct and avoid release claims that have not been verified.

- [ ] **Step 3: Run the AGENTS.md consistency audit**

Run:

```powershell
rg -n '"version": "0\.(13\.5|14\.0|3\.0)"' package.json package-lock.json server/package.json server/package-lock.json
rg -n "documentVersion: 3|documentVersion === 3|Freeform(Document|Slide|Action)V3|reduceFreeformDocumentV3|mapFreeformDocumentV3|normalizeFreeformDocumentToV3" src e2e e2e-integration README.md docs
rg -n "framing|ImageFraming|imageFramingEquals|cloneImageFraming|shapeFillEquals" src
rg -n "status(code)?|error(code)?|错误码|状态码" README.md docs server/src src | Select-Object -First 200
```

Interpretation:

- version grep shows root `0.14.0` and server `0.3.0` only;
- v3 grep shows only deliberate historical fixtures/validators/migration documentation;
- framing names are consistent and there is exactly one geometry implementation;
- no new HTTP error/status code needs documentation.

- [ ] **Step 4: Run the full verification matrix**

```powershell
npm test
npm run test:acceptance
npm run test:integration
npm run build
git diff --check
git status --short
```

Expected:

- unit, server and Playwright suites pass;
- acceptance and backend integration pass;
- TypeScript and Vite production build pass;
- diff check reports no whitespace errors;
- status contains only intentional task files and never includes `.claude/settings.local.json` or `.superpowers/` companion artifacts.

- [ ] **Step 5: Perform visual and pixel self-checks without touching the user's browser**

Start the existing dev server on a free port, then use independent Playwright headless Chrome to capture:

- standalone image and all three shape types at non-default focus/zoom;
- rotated and nested examples;
- 1440, 1024 and 440 widths in light/dark themes;
- crop controls at minimum and maximum zoom;
- page thumbnail beside active canvas and the exported PNG result.

Check screenshots for blank seams, reversed drag direction, clipped controls, overlap, horizontal scrolling and fallback flashes. Use pixel sampling for the four-corner asset; do not rely only on visual inspection.

- [ ] **Step 6: Request a final code review and resolve findings**

Use `superpowers:requesting-code-review` against the approved spec and this plan. Fix verified findings with a failing test first, rerun the smallest affected suite, then rerun the full verification matrix. Do not accept stylistic scope expansion as a blocker.

- [ ] **Step 7: Commit release metadata and any reviewed fixes**

```powershell
git add package.json package-lock.json README.md CHANGELOG.md docs/freeform-editor.md docs/backend-plan.md
git commit -m "docs: release freeform image framing"
```

If review fixes changed production/tests after the previous task commit, commit those separately before the documentation commit with a message describing the behavior fixed.

## Completion Criteria

- Every checkbox above is complete and every RED step was observed before its matching implementation.
- All old v1/v2/v3 drafts read as v4; malformed v4 never enters the workspace.
- Independent image and shape-fill framing works through pointer, keyboard, reset, undo, save/reload and export.
- No legal cover state exposes a blank seam; no unresolved non-default crop displays a false centered frame.
- Page thumbnails, active canvas and PNG export show the same crop.
- Local and remote persistence behavior match while the backend contract remains unchanged.
- Root version is `0.14.0`, server remains `0.3.0`, and documentation matches shipping behavior.
- Full tests, integration, build, diff and independent visual/pixel checks pass before completion is claimed.
