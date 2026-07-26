# Template Social Masthead Alignment Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“编辑档案”和“公共剧场”在微博、推特下复用已确认的 v20 左上刊物署名，并保持无页头模式、四种页面角色和长资料稳定。

**Architecture:** 不改 `Card` DOM、分页算法、资料模型或模板数据，只把现有“议题封面”社交刊头的公共几何规则扩展到三套 Markdown 模板。模板标识与明暗配色继续由 `MarkdownCardChrome` 的现有节点和页面角色控制，所有新规则同时受 `data-has-social-header="true"` 与模板主题限定。

**Tech Stack:** React 18、TypeScript、CSS、Playwright、Node.js release contract tests、Vite

---

## File Map

- Modify `e2e/markdown-template-pagination.spec.ts`: 增加三套模板共享刊头、长资料和无页头回退的几何契约。
- Modify `src/styles.css`: 提取 v20 共享刊头规则，并为三套模板设置右上标识与页面角色配色。
- Modify `docs/superpowers/specs/2026-07-25-markdown-template-redesign-design.md`: 记录 v20 刊头扩展边界。
- Modify `scripts/release-readiness.test.mjs`: 把发布契约推进到 `0.13.5`。
- Modify `package.json`, `package-lock.json`, `README.md`, `CHANGELOG.md`, `docs/backend-plan.md`: 同步补丁版本与修复说明。

### Task 1: Add failing shared-masthead contracts

**Files:**

- Modify: `e2e/markdown-template-pagination.spec.ts`

- [x] **Step 1: Add the shared v20 geometry test**

  对“编辑档案”“公共剧场”的微博和推特逐页断言：页头高 24px、头像 22px、资料左对齐、昵称继承刊头颜色、右侧保留 104px 模板标识安全区、刊头线横跨安全区、模板标识位于右上且与账号不相撞。黑底、纸张和荧光黄页面分别断言正确的明暗颜色。

- [x] **Step 2: Expand the long-profile test**

  将长昵称、长账号和长地点测试扩展到三套模板及两个平台；要求卡片无横向溢出、页头仍为 24px、昵称与次级资料都使用 ellipsis，且内容不越过右侧模板标识安全区。

- [x] **Step 3: Strengthen the first-page-only fallback test**

  在“公共剧场”后续页关闭社交页头后，除断言 `.cardhead` 消失外，还断言 `PUBLIC / ACT` 恢复到左侧竖排位置，证明 fallback 与无页头主路径一致。

- [x] **Step 4: Run focused E2E and verify RED**

  Run: `npm run test:e2e -- e2e/markdown-template-pagination.spec.ts --grep "v20 masthead|long profile|first-page-only"`

  Expected: FAIL；“编辑档案”和“公共剧场”仍使用 40px 通用页头，模板标识未进入右上刊头安全区。

### Task 2: Implement the smallest scoped CSS fix

**Files:**

- Modify: `src/styles.css`

- [x] **Step 1: Share only the approved v20 geometry**

  将 24px 页头、30px 下间距、22px 头像、150px 资料上限、左对齐、长文本省略和横向刊头线应用到三套 Markdown 模板。选择器必须同时包含 `data-has-social-header="true"` 和对应 `data-card-theme`，不得影响普通主题、自由画布或无页头页面。

- [x] **Step 2: Position template labels and role colors**

  “编辑档案”将 `DING / ARCHIVE` 放到右上，收尾页避开右侧红栏；“公共剧场”将 `PUBLIC / ACT` 从竖栏移到右上；“议题封面”保持现有 v20 特例。按规格设置三套模板各页面角色的刊头颜色，不新增文字、节点或状态字段。

- [x] **Step 3: Run focused E2E and verify GREEN**

  Run: `npm run test:e2e -- e2e/markdown-template-pagination.spec.ts --grep "v20 masthead|long profile|first-page-only"`

  Expected: PASS。

- [x] **Step 4: Run the complete template E2E file**

  Run: `npm run test:e2e -- e2e/markdown-template-pagination.spec.ts`

  Expected: PASS；分页、内容安全区、信号线和平台切换保持稳定。

### Task 3: Synchronize patch version and documentation

**Files:**

- Modify: `scripts/release-readiness.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/backend-plan.md`

- [x] **Step 1: Change release contracts to 0.13.5 and verify RED**

  Run: `node --test scripts/release-readiness.test.mjs`

  Expected: FAIL；生产包和可见文档仍为 `0.13.4`。

- [x] **Step 2: Bump and document the patch release**

  Run: `npm version 0.13.5 --no-git-tag-version`

  在 CHANGELOG 记录三套模板统一 v20 刊头；README 徽章和 `docs/backend-plan.md` 当前前端版本同步为 `0.13.5`。服务端保持 `0.3.0`，已发布 GHCR 镜像继续固定 `0.11.0`。

- [x] **Step 3: Verify release contracts GREEN**

  Run: `node --test scripts/release-readiness.test.mjs`

  Expected: PASS。

### Task 4: Visual and repository verification

**Files:**

- Inspect all changed files.
- Modify only files required by discovered regressions.

- [x] **Step 1: Capture the platform matrix**

  在 1440x900 下截取三套模板的微博、推特四页；在 390x844 下检查工作区。另用长昵称、长账号、长地点检查右侧安全区，并覆盖“仅首页显示个人信息”。不得关闭用户现有浏览器。

- [x] **Step 2: Run repository verification**

  Run:

  ```text
  npm run test:unit
  npm run test:e2e -- e2e/template-gallery.spec.ts e2e/markdown-template-pagination.spec.ts
  node --test scripts/release-readiness.test.mjs
  npm run build
  ```

  Expected: 全部命令退出码为 0；仅允许保留既有的大包体积警告。

- [x] **Step 3: Apply the repository checklist**

  检查函数契约、命名引用、错误码/状态码、文档、版本和多环境组合。确认无新函数、API、CLI、配置、状态码、草稿格式、服务端代码或远端状态变化。

- [x] **Step 4: Inspect and commit locally**

  Run: `git diff --check`, `git diff --stat`, `git status --short`

  Commit: `git commit -m "fix: align template social mastheads"`

  不 push、不 merge、不创建远端 PR。
