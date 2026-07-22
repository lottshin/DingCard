# Deployment Documentation Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把叮卡的体验、Vercel、本地开发和 Docker 全栈部署整理成读者可以直接选择并执行的教程。

**Architecture:** README 负责选择路径和首次运行，`docs/deployment.md` 负责 Docker 实例上线与维护，`docs/backend-plan.md` 继续记录实现设计。Compose 与应用代码保持不变，只同步 `.env.example` 的端口说明和发布文档契约。

**Tech Stack:** GitHub Markdown、Docker Compose、Nginx、Caddy、PowerShell、POSIX Shell

---

### Task 1: 重排 README 部署入口

**Files:**
- Modify: `README.md`

- [x] **Step 1:** 使用现有 favicon 重做居中项目头部，加入版本、CI、在线 Demo 和 Docker 四个真实徽章。
- [x] **Step 2:** 把顶部 Vercel 说明压缩为一条不重复的数据模式提示。
- [x] **Step 3:** 新增“使用与部署”，列出在线体验、Vercel 前端和 Docker 全栈三条路线。
- [x] **Step 4:** 在 README 写出严格按顺序执行的 Linux Docker Compose 快速部署命令，并给出健康检查、访问地址和 HTTPS 提醒。
- [x] **Step 5:** 把“快速开始”改成“本地开发”，补齐克隆仓库与进入目录，区分基础环境和测试/全栈可选环境。
- [x] **Step 6:** 删除服务器本地联调中无效且顺序靠后的 `.env` 复制步骤。
- [x] **Step 7:** 删除旧的重复 Docker Compose 章节，并在文档索引加入部署指南。

### Task 2: 编写 Docker 部署指南

**Files:**
- Create: `docs/deployment.md`
- Modify: `.env.example`

- [x] **Step 1:** 写清 Linux VPS 前置条件与首次部署流程。
- [x] **Step 2:** 推荐 Caddy 终结 HTTPS，并提供宿主机 Nginx 的代理请求头配置。
- [x] **Step 3:** 要求正式环境把 `WEB_PORT` 绑定到 `127.0.0.1:8080`，同步更新 `.env.example` 注释。
- [x] **Step 4:** 使用容器挂载动态解析 `db` 与 `uploads` 卷名，提供停写备份与覆盖式恢复命令。
- [x] **Step 5:** 添加升级、日志、排错、停止和危险卸载说明。

### Task 3: 增加文档契约并验证

**Files:**
- Modify: `scripts/release-readiness.test.mjs`
- Test: `README.md`
- Test: `docs/deployment.md`
- Test: `docker-compose.yml`

- [x] **Step 1:** 断言部署指南存在，并包含随机密钥、Compose 配置检查、回环端口、HTTPS、两个数据卷、升级和 `down -v` 危险提示。
- [x] **Step 2:** 运行 `node --test scripts/release-readiness.test.mjs`，预期全部通过。
- [x] **Step 3:** 运行 `JWT_SECRET=... docker compose config --quiet` 及回环端口展开检查，预期通过。
- [x] **Step 4:** 运行 `npm run build` 与 `git diff --check`，预期退出码为 0。
- [ ] **Step 5:** Docker daemon 可用时运行 `deploy/compose-smoke.sh`；本次机器的 Docker Desktop daemon 未运行，因此仅完成 Compose 配置验证，未将容器烟测标为通过。

### Task 4: 发布并核验

**Files:**
- Commit all files from Tasks 1-3

- [x] **Step 1:** 暂存并核对只包含部署文档、文档测试和计划文件。
- [x] **Step 2:** 提交为 `docs: simplify deployment guide`。
- [x] **Step 3:** 推送 `master`，等待 GitHub CI 和 Vercel 自动部署。
- [x] **Step 4:** 核对远端 README、部署指南、最终 SHA 和工作区状态。
