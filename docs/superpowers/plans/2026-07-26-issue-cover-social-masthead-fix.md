# Issue Cover Social Masthead Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“议题封面”在微博和推特下的通用社交页头改为已确认的左上刊物署名，并保证四种页面角色、长资料和仅首页显示模式稳定。

**Architecture:** 不改 `Card` 结构、分页算法或资料模型，只在 `template-issue-cover` 且存在社交页头时覆盖现有页头排版。E2E 通过真实模板、真实平台切换和 DOM 几何验证刊头位置；版本与发布文档按补丁版本同步。

**Tech Stack:** React 18、TypeScript、CSS、Playwright、Node.js release contract tests、Vite。

---

## File Map

- Modify `docs/superpowers/specs/2026-07-25-markdown-template-redesign-design.md`: 记录已确认的 v20 刊头规则。
- Modify `e2e/markdown-template-pagination.spec.ts`: 覆盖左右位置、四页角色、微博/推特、长资料和仅首页模式。
- Modify `src/styles.css`: 实现严格限定在“议题封面 + 社交页头”的刊头样式。
- Modify `package.json`, `package-lock.json`: 补丁版本升至 `0.13.4`。
- Modify `README.md`, `CHANGELOG.md`, `docs/backend-plan.md`, `scripts/release-readiness.test.mjs`: 同步可见版本和修复说明。

### Task 1: Add the failing masthead contracts

**Files:**

- Modify: `e2e/markdown-template-pagination.spec.ts`

- [x] **Step 1: Add a geometry helper and the four-page platform test**

  对“议题封面”的微博、推特逐页断言：页头高度为 24px；头像位于左侧；资料左对齐；刊头线横跨内容宽度；封面 `ISSUE` 位于右上；其余页的 `.markdown-chrome-label` 可见且右对齐；正文与刊头无重叠。

  ```ts
  test('issue-cover uses a left profile masthead on every social page', async ({ page }) => {
    await applyTemplate(page, '议题封面')
    const platformButtons = page.locator('.seg[role="tablist"]').first().locator('button')

    for (const platformIndex of [1, 2]) {
      await platformButtons.nth(platformIndex).click()
      for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
        await page.locator('.page-dot').nth(pageIndex).click()
        const geometry = await page.locator('.stage .card').evaluate((card) => {
          const header = card.querySelector<HTMLElement>('.cardhead')!
          const avatar = card.querySelector<HTMLElement>('.avatar')!
          const meta = card.querySelector<HTMLElement>('.cardhead-meta')!
          const line = getComputedStyle(header, '::after')
          return {
            headerHeight: header.getBoundingClientRect().height,
            avatarLeft: avatar.getBoundingClientRect().left,
            headerLeft: header.getBoundingClientRect().left,
            metaAlign: getComputedStyle(meta).textAlign,
            lineStyle: line.borderTopStyle,
            lineRight: line.right,
          }
        })
        expect(geometry.headerHeight).toBe(24)
        expect(Math.abs(geometry.avatarLeft - geometry.headerLeft)).toBeLessThanOrEqual(1)
        expect(geometry.metaAlign).toBe('left')
        expect(geometry.lineStyle).toBe('solid')
        expect(geometry.lineRight).toBe('-104px')
      }
    }
  })
  ```

- [x] **Step 2: Update the long-profile contract**

  把“议题封面”长资料测试的固定高度从 40px 改为 24px，并分别覆盖微博和推特；继续要求昵称和次级资料使用 ellipsis，页头无横向溢出。

- [x] **Step 3: Run the focused test and verify RED**

  Run: `npm run test:e2e -- e2e/markdown-template-pagination.spec.ts --grep "issue-cover uses|long profile"`

  Expected: FAIL。当前页头仍为 40px，资料仍使用通用布局，内页期号标签仍被隐藏。

### Task 2: Implement the scoped editorial masthead

**Files:**

- Modify: `src/styles.css`

- [x] **Step 1: Add the smallest scoped CSS implementation**

  所有新选择器必须同时包含 `[data-has-social-header="true"]`、`[data-card-theme="template-issue-cover"]`。实现：24px 页头、30px 下间距、22px 头像、左对齐资料、104px 右侧期号安全区、横向刊头线、长资料省略、明暗页面配色，以及封面/内页期号右对齐。

- [x] **Step 2: Run the focused test and verify GREEN**

  Run: `npm run test:e2e -- e2e/markdown-template-pagination.spec.ts --grep "issue-cover uses|long profile"`

  Expected: PASS。

- [x] **Step 3: Run the full Markdown template E2E file**

  Run: `npm run test:e2e -- e2e/markdown-template-pagination.spec.ts`

  Expected: PASS，现有三套模板平台适配、分页、回退和导出测试均保持通过。

- [x] **Step 4: Review scope and naming**

  Run: `rg -n "template-issue-cover|cardhead|markdown-chrome-label" src/styles.css e2e/markdown-template-pagination.spec.ts`

  Expected: 新规则不影响普通主题、其他模板和自由画布；没有新增 API、状态码、配置或持久化字段。

### Task 3: Synchronize the patch release

**Files:**

- Modify: `scripts/release-readiness.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/backend-plan.md`

- [x] **Step 1: Change release contracts to 0.13.4 and verify RED**

  将 release contract 的版本、README 徽章、CHANGELOG 章节和后端规划断言改为 `0.13.4`。

  Run: `node --test scripts/release-readiness.test.mjs`

  Expected: FAIL，生产版本和文档仍是 `0.13.3`。

- [x] **Step 2: Bump and document the patch release**

  Run: `npm version 0.13.4 --no-git-tag-version`

  在 CHANGELOG 记录“议题封面”微博/推特刊头修复；README 徽章和 `docs/backend-plan.md` 当前前端版本同步为 `0.13.4`。服务端保持 `0.3.0`，已发布 GHCR 镜像仍固定 `0.11.0`。

- [x] **Step 3: Verify release contracts GREEN**

  Run: `node --test scripts/release-readiness.test.mjs`

  Expected: PASS。

### Task 4: Full verification and commit

**Files:**

- Inspect all changed files.
- Modify only files required by discovered regressions.

- [x] **Step 1: Capture the approved visual matrix**

  在 1440x900 桌面视口逐一截取微博和推特的封面、正文、引语、收尾页；另在 390x844 检查工作区。确认左上资料、右上期号、刊头线、橙色页签、正文安全区和页码均完整，不关闭用户现有浏览器。

- [x] **Step 2: Run repository verification**

  Run:

  ```text
  npm run test:unit
  npm run test:e2e -- e2e/template-gallery.spec.ts e2e/markdown-template-pagination.spec.ts
  node --test scripts/release-readiness.test.mjs
  npm run build
  ```

  Expected: 全部命令退出码为 0；仅允许保留已有的主包体积警告，不得新增依赖或构建错误。

- [x] **Step 3: Apply the repository checklist**

  检查函数/fallback 契约、命名引用、错误/状态码、文档、版本和多环境组合。确认无函数、API、CLI、配置、状态码、草稿格式和服务端代码变化。

- [x] **Step 4: Inspect the final diff and commit locally**

  Run: `git diff --check`、`git diff --stat`、`git status --short`

  Commit: `git commit -m "fix: integrate issue cover social masthead"`

  不 push、不 merge、不创建远端 PR。
