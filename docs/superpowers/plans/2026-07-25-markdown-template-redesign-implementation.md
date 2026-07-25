# Markdown 三套模板重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已确认的“编辑档案”“公共剧场”“议题封面”接入 Markdown 工作区，使模板中心、编辑预览、自动分页与 PNG 导出使用同一套视觉系统，同时保留旧草稿兼容能力。

**Architecture:** Markdown 解析器先为内容块写入稳定的语义类型，分页器再根据主题、页序和块类型生成页面角色。`Card` 只负责挂载主题/角色数据属性和装饰层，具体视觉以 `data-card-theme` 与 `data-page-role` 限定在 Markdown 卡片内部。模板注册表拆开 Markdown 与自由画布系列，旧主题继续解析但从常规选择列表隐藏。

**Tech Stack:** React 18、TypeScript、Vite、Marked、Vitest、Playwright、CSS、html-to-image

---

## Task 1：为 Markdown 块增加稳定语义，并建立页面角色纯函数

**Files:**

- Modify: `src/markdown.ts`
- Create: `src/templates/markdownPresentation.ts`
- Modify: `src/__tests__/markdown.test.ts`
- Create: `src/templates/markdownPresentation.test.ts`

- [x] **Step 1: 先写解析语义的失败测试**

  在 `src/__tests__/markdown.test.ts` 增加标题、段落、纯图片段落、图文混排、引用、列表、代码块、分页标记和未知 token 的断言。测试必须检查 `Block.kind`，并确认分页标记仍由 `isBreak` 单独区分。

- [x] **Step 2: 运行测试，确认因 `kind` 缺失而失败**

  Run: `npm run test:unit -- src/__tests__/markdown.test.ts`

  Expected: FAIL，错误指向 `Block.kind` 或预期语义类型不匹配。

- [x] **Step 3: 实现块语义映射**

  在 `src/markdown.ts` 导出：

  ```ts
  export type MarkdownBlockKind =
    | 'paragraph'
    | 'heading'
    | 'blockquote'
    | 'list'
    | 'code'
    | 'image'
    | 'other'
  ```

  每个返回的 `Block` 必须有 `kind`。只含图片的段落归为 `image`，图片与文字共存时仍为 `paragraph`；无法识别的 token 使用 `other`。

- [x] **Step 4: 先写页面角色与页码格式的失败测试**

  `src/templates/markdownPresentation.test.ts` 覆盖：普通/未知主题、空页、单页、首屏、引用页、列表页、尾页、中间正文页以及 1/9、1/10 的补零格式。

- [x] **Step 5: 实现纯函数**

  `src/templates/markdownPresentation.ts` 导出：

  ```ts
  export type MarkdownPageRole = 'cover' | 'article' | 'quote' | 'list' | 'close'

  export function isMarkdownTemplateTheme(themeId: unknown): boolean
  export function resolveMarkdownPageRole(input: {
    themeId: unknown
    blocks: Block[]
    pageIndex: number
    includesLastContentBlock: boolean
  }): MarkdownPageRole
  export function formatMarkdownPageNumber(pageIndex: number, pageCount: number): string
  ```

  判定顺序严格按设计规格执行，页码对负值/非有限数值先做安全归一化，不返回 `NaN`。

- [x] **Step 6: 运行定向测试**

  Run: `npm run test:unit -- src/__tests__/markdown.test.ts src/templates/markdownPresentation.test.ts`

  Expected: PASS。

- [x] **Step 7: 提交语义基础**

  ```bash
  git add src/markdown.ts src/__tests__/markdown.test.ts src/templates/markdownPresentation.ts src/templates/markdownPresentation.test.ts
  git commit -m "feat: classify markdown blocks for template layouts"
  ```

## Task 2：扩展主题契约，并保留旧草稿兼容

**Files:**

- Modify: `src/theme.ts`
- Create: `src/theme.test.ts`
- Modify: `src/workspaces/markdown/MarkdownWorkspace.tsx`

- [x] **Step 1: 先写主题行为的失败测试**

  测试以下契约：

  - `buildConfig()` 原样写入有效主题 ID。
  - 空值、非字符串和未知 ID 统一回退默认主题。
  - 三个新主题可见。
  - 四个旧模板主题仍能解析，但默认不出现在选择器。
  - 当前草稿正使用旧主题时，选择器临时保留当前旧主题；切换后不再出现。
  - 生成选项的函数不修改 `THEMES`。

- [x] **Step 2: 运行测试，确认新契约尚未实现**

  Run: `npm run test:unit -- src/theme.test.ts`

  Expected: FAIL。

- [x] **Step 3: 实现主题与安全归一化**

  在 `Theme` 增加 `hidden?: boolean`，在 `CardConfig` 增加 `themeId: string`；新增三个主题，旧模板主题标为隐藏。新增并使用：

  ```ts
  export function resolveTheme(themeId: unknown): Theme
  export function themesForPicker(activeThemeId: unknown): Theme[]
  ```

  `buildConfig()` 始终使用 `resolveTheme()` 的结果，工作区移除 `THEMES.find(...)!`。

- [x] **Step 4: 运行主题及现有选择器测试**

  Run: `npm run test:unit -- src/theme.test.ts src/Select.test.tsx`

  Expected: PASS。

- [x] **Step 5: 提交主题兼容层**

  ```bash
  git add src/theme.ts src/theme.test.ts src/workspaces/markdown/MarkdownWorkspace.tsx
  git commit -m "feat: add markdown template themes with legacy fallback"
  ```

## Task 3：让自动分页按真实模板角色测量

**Files:**

- Modify: `src/paginate.ts`
- Modify: `src/workspaces/markdown/MarkdownWorkspace.tsx`
- Create: `e2e/markdown-template-pagination.spec.ts`

- [x] **Step 1: 先写分页浏览器测试**

  测试用较长的五段 Markdown 内容覆盖自动分页和手动分页，检查：

  - 第一页、引用页、列表页和最后一页角色正确。
  - 单页与空文档回退为 `article`。
  - 五页以上页码使用实际总页数。
  - 每页 `scrollHeight - clientHeight <= 1`、`scrollWidth - clientWidth <= 1`。

- [x] **Step 2: 运行测试，确认当前页面没有角色数据**

  Run: `npm run test:e2e -- e2e/markdown-template-pagination.spec.ts`

  Expected: FAIL，缺少 `data-page-role` 或角色错误。

- [x] **Step 3: 改造分页结果与测量探针**

  `Page` 增加 `role`。分页前计算最后一个非分页标记块；每次试放块时重新调用 `resolveMarkdownPageRole()`，并在隐藏探针上同步：

  ```text
  class="card-content"
  data-card-theme="..."
  data-page-role="..."
  ```

  探针继续使用与真实卡片相同的 CSS 变量、页头高度和可用高度。`flush()` 保存最后一次实际测量的角色，不能渲染时再推断。

- [x] **Step 4: 将分页角色传入工作区页面状态**

  保持现有异步 effect 与图片重排机制不变，主题、字体、圆角、平台或页头策略变化时仍会重新分页。

- [x] **Step 5: 暂运行类型检查与语义单测**

  Run: `npm run build`

  Expected: 若 `Card` 尚未接收新参数，可以只出现计划内的调用点类型错误；不得出现分页器自身类型错误。完成 Task 4 后必须全绿。

## Task 4：把装饰层接入真正可导出的 Card

**Files:**

- Create: `src/MarkdownCardChrome.tsx`
- Create: `src/MarkdownCardChrome.test.tsx`
- Modify: `src/Card.tsx`
- Modify: `src/templates/TemplateGallery.tsx`
- Modify: `src/workspaces/markdown/MarkdownWorkspace.tsx`

- [x] **Step 1: 先写装饰层静态渲染测试**

  使用 `renderToStaticMarkup()` 检查：

  - 三个新主题会输出各自稳定的装饰根类。
  - 装饰层带 `aria-hidden="true"`。
  - 普通主题、旧主题和未知主题返回空。
  - 页码从 `pageIndex + 1` 与 `pageCount` 动态生成。

- [x] **Step 2: 运行测试，确认组件尚不存在**

  Run: `npm run test:unit -- src/MarkdownCardChrome.test.tsx`

  Expected: FAIL，模块不存在。

- [x] **Step 3: 实现 `MarkdownCardChrome`**

  组件只接收 `themeId`、`pageRole`、`pageIndex`、`pageCount`，只输出装饰节点，不读取 Markdown HTML。网格、竖轨、信号线、期数、印章、页签和图片裁切框均位于 `.card` 内。

- [x] **Step 4: 扩展 `Card` 契约**

  `Card` 必填 `pageIndex`、`pageCount`、`pageRole`，根节点增加：

  ```text
  data-card-theme
  data-page-role
  data-page-index
  data-page-count
  data-has-social-header
  ```

  `.card-content` 同步主题与角色。使用内容区域的捕获阶段 `onError` 标记 `.img-wrap.image-load-error`；非图片事件、已卸载节点和不在 `.img-wrap` 内的图片不得抛异常。

- [x] **Step 5: 更新全部 `Card` 调用点**

  模板缩略图先以第一页角色渲染；工作区使用分页器返回的真实角色和实际页数。不得增加第二套仅供缩略图使用的 HTML。

- [x] **Step 6: 运行组件测试和构建**

  Run: `npm run test:unit -- src/MarkdownCardChrome.test.tsx && npm run build`

  Expected: PASS。

- [x] **Step 7: 提交渲染契约**

  ```bash
  git add src/paginate.ts src/Card.tsx src/MarkdownCardChrome.tsx src/MarkdownCardChrome.test.tsx src/templates/TemplateGallery.tsx src/workspaces/markdown/MarkdownWorkspace.tsx e2e/markdown-template-pagination.spec.ts
  git commit -m "feat: render role-aware markdown cards"
  ```

## Task 5：拆分模板注册表，并写入三套四页示例

**Files:**

- Modify: `src/templates/types.ts`
- Modify: `src/templates/registry.ts`
- Modify: `src/templates/registry.test.ts`

- [ ] **Step 1: 先改注册表测试为新契约**

  断言 Markdown 仅有三套新模板、自由画布仍为四套旧模板、全部 ID 唯一。三套 Markdown 源码都应有四页、各自 profile 不共享引用，并使用存在的平台/主题/字体。

- [ ] **Step 2: 运行测试，确认旧注册表不满足要求**

  Run: `npm run test:unit -- src/templates/registry.test.ts`

  Expected: FAIL，Markdown 数量和系列 ID 仍为旧值。

- [ ] **Step 3: 拆分系列类型与注册表**

  新建 `MarkdownTemplateSeriesId` 与 `FreeformTemplateSeriesId`，分别维护 `markdownSeriesIds`、`freeformSeriesIds`、`markdownDocuments`、`freeformFactories`。外部仍通过 `templatesForWorkspace()` 查询。

- [ ] **Step 4: 写入用户已确认的四页示例正文**

  三套模板分别使用清楚、短促、可真实发布的中文正文。每套用三个 `---` 形成四页；标题、引用和列表结构要能驱动页面角色，避免宣传口号和模板化 AI 文案。

- [ ] **Step 5: 运行注册表与 Markdown 单测**

  Run: `npm run test:unit -- src/templates/registry.test.ts src/__tests__/markdown.test.ts src/templates/markdownPresentation.test.ts`

  Expected: PASS。

- [ ] **Step 6: 提交模板数据**

  ```bash
  git add src/templates/types.ts src/templates/registry.ts src/templates/registry.test.ts
  git commit -m "feat: replace markdown gallery with three design systems"
  ```

## Task 6：加入项目自有建筑图并实现三套视觉系统

**Files:**

- Create: `public/templates/editorial-building.webp`
- Modify: `src/styles.css`

- [ ] **Step 1: 生成并压缩项目自有建筑图**

  生成一张适合杂志裁切的现代建筑立面图，禁止带文字、水印和商标。转为 WebP 后检查：长边不超过 1600px、文件不超过 180KB。两套模板复用同一文件，不复制不同裁切版本。

  Run: PowerShell 文件尺寸检查，并用图片查看工具检查构图。

  Expected: `public/templates/editorial-building.webp` 存在且满足尺寸限制。

- [ ] **Step 2: 实现严格限定作用域的 CSS**

  所有规则从 `.card[data-card-theme="..."]` 或 `.card-content[data-card-theme="..."]` 开始，按已确认 v15 稿分别实现：

  - 编辑档案：暖白纸张、八栏网格、黑红层级、横向建筑条、校样圆与黑底收尾。
  - 公共剧场：黑/米白/荧光黄/红、左侧竖轨、统一 64% 信号线、低噪正文和编号列表。
  - 议题封面：建筑裁切、奶油/粉/蓝/橙、大号期数、不规则圆、逐页下移页签和蓝底收尾。

  正文继续使用 `--card-font`；小号英文仅复用现有 `Instrument Sans`。装饰层 `pointer-events: none`，全部被卡片边界裁切。页头偏移使用现有 CSS 变量。

- [ ] **Step 3: 实现图片失败回退样式**

  `.image-load-error` 隐藏破图与缩放手柄，但保留布局底色和可读正文。普通主题也不能显示破图图标。

- [ ] **Step 4: 构建并检查产物**

  Run: `npm run build`

  Expected: PASS；构建产物只包含一份本地建筑图，不出现 `unsplash.com` 等运行时资源。

- [ ] **Step 5: 提交视觉系统**

  ```bash
  git add public/templates/editorial-building.webp src/styles.css
  git commit -m "feat: style three editorial markdown templates"
  ```

## Task 7：完成模板中心与工作区端到端验收

**Files:**

- Modify: `e2e/template-gallery.spec.ts`
- Modify: `e2e/markdown-template-pagination.spec.ts`
- Modify: `src/templates/TemplateGallery.tsx`（仅在验收暴露缺口时）
- Modify: `src/workspaces/markdown/MarkdownWorkspace.tsx`（仅在验收暴露缺口时）

- [ ] **Step 1: 更新模板中心测试**

  断言 Markdown 显示三套新名称，缩略图为真实 `Card`，自由画布仍显示四套。逐一应用模板，确认四页、主题、字体、角色和装饰均正确。

- [ ] **Step 2: 增加响应式和平台组合**

  在 390×844、1024×768、1440×900 下检查模板中心和工作区。切换小红书、微博、推特，并覆盖“所有页显示页头”和“仅首屏页头”。

- [ ] **Step 3: 增加编辑与回退场景**

  覆盖长标题、删除图片、追加正文、第五页、普通主题切换、切回模板主题、单页、空文档以及旧隐藏主题草稿。

- [ ] **Step 4: 增加导出一致性检查**

  触发单页 PNG 导出，确认捕获节点包含装饰、页码和本地图片，并拦截/统计网络请求，确保没有外部图片域名。

- [ ] **Step 5: 运行定向 E2E**

  Run: `npm run test:e2e -- e2e/template-gallery.spec.ts e2e/markdown-template-pagination.spec.ts`

  Expected: PASS，所有页面溢出差值不超过 1px。

- [ ] **Step 6: 截图自检并修正细节**

  在真实浏览器中逐页查看三套模板，重点对照 v15：层级、留白、信号线位置、装饰与正文安全区、四页节奏和缩略图可读性。只修正设计系统内的问题，不改变已确认方向。

- [ ] **Step 7: 提交集成验收**

  ```bash
  git add e2e/template-gallery.spec.ts e2e/markdown-template-pagination.spec.ts src/templates/TemplateGallery.tsx src/workspaces/markdown/MarkdownWorkspace.tsx
  git commit -m "test: cover markdown template layouts end to end"
  ```

## Task 8：同步版本、README、更新日志与产品截图

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/backend-plan.md`
- Modify: `scripts/release-readiness.test.mjs`
- Modify: `docs/assets/markdown-workspace.png`

- [ ] **Step 1: 先更新发布就绪测试为 0.13.0**

  测试应检查根包、lockfile 顶层/根包、README 徽章、CHANGELOG 章节和后端规划中的前端版本一致。服务端版本继续是 0.3.0，Docker/Compose 文档继续指向已发布的 0.11.0 镜像。

- [ ] **Step 2: 运行测试，确认文档版本尚未同步**

  Run: `node --test scripts/release-readiness.test.mjs`

  Expected: FAIL，仍检测到 0.12.0。

- [ ] **Step 3: 同步版本和产品文档**

  使用 `npm version 0.13.0 --no-git-tag-version` 同步根包和 lockfile；README 改为三套 Markdown + 四套自由画布，模板说明采用简洁功能列表，不重复段落、不写宣传式 AI 文案。CHANGELOG 记录页面角色、三套模板、旧主题兼容和本地图片资源。

- [ ] **Step 4: 重截 README 工作区图片**

  保持浏览器现有会话，打开本地应用并应用一套新模板；截取与 README 现有布局匹配的工作区画面，覆盖 `docs/assets/markdown-workspace.png`。不得关闭用户当前浏览器。

- [ ] **Step 5: 运行发布就绪测试**

  Run: `node --test scripts/release-readiness.test.mjs`

  Expected: PASS。

- [ ] **Step 6: 提交版本与文档**

  ```bash
  git add package.json package-lock.json README.md CHANGELOG.md docs/backend-plan.md scripts/release-readiness.test.mjs docs/assets/markdown-workspace.png
  git commit -m "docs: release markdown template redesign"
  ```

## Task 9：按项目纪律做全量自检

**Files:**

- Inspect all changed files
- Modify only files required by discovered regressions

- [ ] **Step 1: 函数契约与回退检查**

  人工检查空文档、单页、未知主题、旧主题、图片失败、超高单块、五页以上、页头策略。确认主路径与 fallback 都返回稳定角色和可导出页面。

- [ ] **Step 2: 命名和引用一致性检查**

  Run: `rg -n "editorial-archive|public-theatre|issue-cover|MarkdownPageRole|themeId" src e2e docs README.md`

  Expected: ID 与字段命名统一，无旧名称误用；自由画布旧 ID 仍只在自由画布或兼容主题中出现。

- [ ] **Step 3: 文档、版本和资源检查**

  Run: `rg -n '0\\.12\\.0|0\\.13\\.0|0\\.11\\.0|0\\.3\\.0' package.json package-lock.json README.md CHANGELOG.md docs scripts`

  Expected: 当前源码版本统一 0.13.0；历史记录、服务端 0.3.0、已发布 Docker 0.11.0 保留在正确语境。

- [ ] **Step 4: 定向与全量验证**

  Run:

  ```bash
  npm run test:unit
  npm run test:server
  npm run build
  npm run test:e2e
  node --test scripts/release-readiness.test.mjs
  git diff --check
  git status --short --branch
  ```

  Expected: 全部通过；只允许 Vite 已知的大 chunk 警告，不允许测试失败、类型错误、CSS 溢出或未解释的工作区文件。

- [ ] **Step 5: 最终视觉核对**

  对照 `docs/assets/markdown-template-redesign-v15.png` 查看三套模板四页截图。确认不是只靠“大字 + 色块”，每套都有稳定的网格、编号、轨道/页签、图像裁切和正文安全区系统。

- [ ] **Step 6: 若自检修复了问题，单独提交**

  ```bash
  git add <only-the-files-fixed-during-verification>
  git commit -m "fix: address markdown template verification findings"
  ```
