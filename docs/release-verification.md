# 0.17.0 发布验证

- 验证日期：2026-09-27
- 版本标签：`v0.17.0`（待推送）
- 发布内容：存为模板、自由画布富文本片段（`spans`，文档版本 v5）、MCP 只读资源。

`PASS` 表示对应命令已按预期完成，`NOT EXECUTED` 表示本机未执行（附原因），`FAIL` 表示执行了但未按预期完成。本报告只记录实际执行结果。

## 验证结果

| Check | Status | Evidence |
|---|---|---|
| Release contract | PASS | `node --test scripts/release-readiness.test.mjs`：12/12（含 MCP 包合同与部署钉点 `0.16.0` 镜像）。 |
| Frontend unit | PASS | `npm run test:unit`：35 个测试文件，690/690（含 richText 算法 22 例、v5 校验 6 例、归约器 spans 4 例、草稿导入 6 例）；CI static 作业同步执行。 |
| MCP unit | PASS | `npm run test:mcp`：4 个测试文件，28/28（模板、文档校验/检查/动作含 spans 应用与保留、静态服务器、协议层、MCP 资源）。 |
| MCP render pipeline | PASS | `npm run test:mcp:render`：5/5；模板渲染 1080×1440 PNG（IHDR 一致），新增用例验证同一文档带/不带 `spans` 渲染出像素级不同的 PNG。 |
| MCP stdio 端到端 | PASS | `mcp/dist/index.mjs`（`dingcard-mcp@0.17.0`）经 stdio JSON-RPC：握手、`tools/list`（7 个工具）、实例化 `signal-freeform`（v5、3 页）、`apply_actions` 写入 spans（changes=true）、`validate_document` 通过、越界 spans 补丁被拒（changes=false）、`render_document` 渲染 1 张 PNG（105,940 字节）。 |
| MCP build | PASS | `npm --prefix mcp run build`：tsc 类型检查 + esbuild 打包（169,362 字节）；CI static 作业同步执行。 |
| Backend tests | NOT EXECUTED | 本机 Node 26 下 `better-sqlite3` 预编译下载超时未执行；CI（Ubuntu + Node 20）`npm run test:server` 执行（本次未改动 `server/`）。 |
| Backend HTTP smoke | NOT EXECUTED | CI static 作业执行 `node server/smoke-test.mjs`（本机因同一 `better-sqlite3` 原因未执行）。 |
| Production build | PASS | `npm run build` 完成 TypeScript 与 Vite 构建；`dist/render.html` 无头渲染入口正常产出。保留已知的单 chunk 体积警告。 |
| CI YAML | NOT EXECUTED | 待 `v0.17.0` 标签推送后在标签 CI 上执行（master CI 会先跑一遍同套流程）。 |
| Full E2E | FAIL | 本机 244 例中 243 通过：`number inspector keeps negative decimal keyboard input` 为本机 macOS 已知环境失败（干净 `a0c4ec6`（v0.15.0）同样失败，历次 CI 通过）；新增富文本 spans 闭环用例（选区加粗/标色 → 渲染 → 编辑保样式 → 删除）与存为模板闭环用例均通过。 |
| Editor acceptance | PASS | `npm run test:acceptance`：2/2。 |
| Compose config | NOT EXECUTED | 待标签 CI container 作业运行 `deploy/compose-smoke.sh`。 |
| Container smoke | NOT EXECUTED | 待标签 CI container 作业执行。 |
| Compose cleanup | NOT EXECUTED | 待标签 CI container 作业执行。 |
| Image manifest | NOT EXECUTED | 待 `v0.17.0` 镜像发布后取 digest 验证。 |
| Anonymous pull | NOT EXECUTED | 待镜像发布后匿名验证。 |
| amd64 image smoke | NOT EXECUTED | 待 publish 作业匿名拉取验证。 |
| arm64 image smoke | NOT EXECUTED | 待 publish 作业通过 QEMU 匿名拉取验证。 |

## 构建产物

- `dist/index.html`：2.38 kB，gzip 1.14 kB。
- `dist/render.html`：1.26 kB，gzip 0.67 kB（MCP 无头渲染入口）。
- `dist/assets/main-Cu0oLGlh.js`：922.32 kB，gzip 308.80 kB（主应用入口）。
- `dist/assets/render-CSnQCION.js`：4.10 kB，gzip 1.99 kB（无头渲染入口）。
- `dist/assets/styles-DSUfJzny.js`：289.94 kB，gzip 91.78 kB；`dist/assets/styles-BzH4shBJ.css`：104.56 kB，gzip 16.78 kB（index 与 render 两个入口共享的 chunk）。
- `mcp/dist/index.mjs`：169.4 kB（SDK、playwright-core、zod 外置为运行时依赖）。
- Vite 仍提示单 chunk 超过 500 kB。本次发布保留现有包体积，构建退出码为 0。

## 镜像

`v0.17.0` 镜像尚未发布。Compose 与部署文档固定已发布的 GHCR `0.16.0` 镜像；升级到 `0.17.0` 只需在镜像发布后修改 `.env` 中的 `DINGCARD_VERSION`。

## MCP 数据边界

MCP 服务器只读写调用方指定的本地输出目录；静态文件服务器仅监听 `127.0.0.1` 随机端口并在渲染后关闭；不连接 LocalStore/RemoteStore，不迁移任何账号、草稿或图片。
