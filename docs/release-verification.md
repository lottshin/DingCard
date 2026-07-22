# 0.11.0 本地发布验证

- 验证日期：2026-07-22
- Commit under test：`573ca44`
- 环境：Microsoft Windows NT 10.0.22631.0、PowerShell 5.1.22621.6133、Node.js v20.18.0、npm 10.8.2、Python 3.13.3
- 容器工具：Docker 29.1.2、Docker Compose v2.40.3-desktop.1、Git Bash

状态含义：`PASS` 表示命令在本次验证中以预期结果完成；`FAIL` 表示已经执行但未满足契约；`NOT EXECUTED` 表示尚未执行或当前环境不具备前置条件。

| Check | Status | Evidence |
|---|---|---|
| Release contract | PASS | `node --test scripts/release-readiness.test.mjs`：10/10。 |
| Frontend unit | PASS | `npm run test:unit`：24 个测试文件、397/397。 |
| Backend tests | PASS | `npm run test:server`：72/72。 |
| Backend HTTP smoke | PASS | `node server/smoke-test.mjs`：认证、所有权、413/415/429、租约/GC 和并发配额全部通过；429 响应确认命中认证限流上限 12。 |
| Production build | PASS | `npm run build`：TypeScript 与 Vite 构建成功；保留已知的大块警告。 |
| CI YAML | PASS | PyYAML 6.0.3 成功解析 `.github/workflows/*.yml`，包含 `ci.yml` 与 `publish-image.yml`。 |
| Full E2E | PASS | `npm run test:e2e`：184/184，耗时约 4.9 分钟。 |
| Compose config | PASS | `docker compose config --quiet` 通过，`docker compose config --services` 仅输出 `app`。 |
| Container smoke | PASS | 单个 `app` 容器由 Fastify 提供首页、`/api/health`、注册、上传与 `/assets/` 构建资源，全部返回预期结果。 |
| Compose cleanup | PASS | `dingcard-single-smoke-docs-a87b8af` 的容器、网络、卷以及 smoke 镜像标签经独立查询均不存在。 |
| Image manifest | NOT EXECUTED | `v0.11.0` 标签尚未发布，GHCR 中没有可检查的版本 manifest。 |
| Anonymous pull | NOT EXECUTED | `v0.11.0` 标签尚未发布，无法从 GHCR 匿名拉取该版本。 |
| amd64 image smoke | NOT EXECUTED | `v0.11.0` 标签尚未发布，发布工作流的 amd64 镜像 smoke 尚未运行。 |
| arm64 image smoke | NOT EXECUTED | `v0.11.0` 标签尚未发布，发布工作流的 arm64 镜像 smoke 尚未运行。 |

## 构建产物

- `dist/index.html`：2.35 kB，gzip 1.12 kB。
- `dist/assets/index-CvLZbRsD.css`：62.94 kB，gzip 10.56 kB。
- `dist/assets/index-r1MgV6ea.js`：1,111.54 kB，gzip 369.09 kB。
- Vite 仍提示单 chunk 超过 500 kB。该警告已知且本轮明确不做拆包优化，不影响构建退出状态。

## Docker 验证

- 单容器 smoke：PASS；本地构建的 `app` 同时通过首页、API、上传和静态资源检查。
- Docker CLI、Compose 插件与 Docker daemon 29.1.2 均可用。
- Compose 配置验证使用非生产测试密钥，不读取或写入项目 `.env`；展开后的服务仅为 `app`。
- Git Bash 对 `deploy/compose-smoke.sh` 的静态语法检查通过。
- 单容器 smoke 使用唯一项目 `dingcard-single-smoke-docs-a87b8af` 和端口 18094；首页与 `/api/health` 首轮即 200，注册、上传、Fastify 图片直出和动态提取的 hash 资源均通过。
- 冒烟脚本使用唯一 `DINGCARD_VERSION` 构建标签，不会覆盖本地同名正式版本镜像。
- EXIT trap 完成 `down -v --remove-orphans` 和 smoke 镜像删除；随后按 Compose project label 独立查询，容器、网络、卷和唯一镜像标签均为空。

## E2E 稳定性复验

- 首轮完整复验暴露颜色弹窗按 Escape 后的异步焦点恢复与数字输入之间存在测试时序竞争；应用运行时代码未改动。
- 测试改为等待颜色按钮恢复焦点后再编辑描边宽度；目标用例连续执行 10 次均通过，随后标准完整命令 184/184 通过。
