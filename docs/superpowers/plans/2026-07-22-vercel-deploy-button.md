# Vercel Deploy Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 README 顶部加入 Vercel 官方一键部署按钮，让其他人可以直接克隆 DingCard 并部署前端本地模式。

**Architecture:** 只修改项目文档，不改变应用或构建配置。按钮使用 Vercel 托管的官方 SVG，目标链接通过 `repository-url` 指向公开仓库；按钮附近明确默认部署不包含 Fastify + SQLite 服务端。

**Tech Stack:** GitHub Markdown、HTML、Vercel Deploy Button

---

### Task 1: 添加一键部署入口

**Files:**
- Modify: `README.md`

- [x] **Step 1: 在在线体验下方加入官方按钮**

```html
<p>
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Flottshin%2FDingCard">
    <img src="https://vercel.com/button" alt="Deploy with Vercel">
  </a>
</p>
```

- [x] **Step 2: 说明默认部署范围**

按钮下说明一键部署默认使用前端本地模式，无需环境变量；Fastify + SQLite 服务端需按 README 另行部署。保留现有在线 Demo 和本地数据提示。

### Task 2: 验证文档和部署链接

**Files:**
- Test: `README.md`
- Test: `scripts/release-readiness.test.mjs`

- [x] **Step 1: 检查 Markdown 差异**

Run: `git diff --check`

Expected: exit 0，无空白错误。

- [x] **Step 2: 运行发布文档检查**

Run: `node --test scripts/release-readiness.test.mjs`

Expected: 4 项测试全部通过。

- [x] **Step 3: 检查 Vercel 官方资源**

请求 `https://vercel.com/button` 和带 DingCard `repository-url` 参数的一键部署链接。

Expected: 两个地址都返回 HTTP 200；按钮内容类型为 SVG。

### Task 3: 发布并核验

**Files:**
- Commit: `README.md`
- Commit: `docs/superpowers/specs/2026-07-22-vercel-deploy-button-design.md`
- Commit: `docs/superpowers/plans/2026-07-22-vercel-deploy-button.md`

- [ ] **Step 1: 提交 README 和计划文档**

Run: `git commit -m "docs: add Vercel deploy button"`

- [ ] **Step 2: 推送 master**

Run: `git push`

Expected: `origin/master` 指向本地最终提交。

- [ ] **Step 3: 核验远端 README 与 CI**

检查 GitHub README 包含 DingCard 的一键部署链接，并等待该提交的 CI 完成。

Expected: 远端 README 内容正确，CI conclusion 为 `success`。
