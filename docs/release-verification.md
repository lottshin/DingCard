# 0.16.0 发布验证

- 验证日期：2026-09-26
- 版本标签：`v0.16.0`（待推送）
- Commit under test：发布提交前的工作树（基于 `a0c4ec6`）；标签推送后由 GitHub CI 复核。
- GitHub CI：推送后执行（static 作业含 MCP 构建与单元测试，browser 作业含 MCP 渲染管线测试）。
- 镜像发布：`0.16.0` 尚未发布远端镜像；Compose 与部署文档继续固定已发布的 `0.15.0`。

`PASS` 表示对应命令已按预期完成，`NOT EXECUTED` 表示本机未执行（附原因），`FAIL` 表示执行了但未按预期完成。本报告只记录实际执行结果。

| Check | Status | Evidence |
|---|---|---|
| Release contract | PASS | `node --test scripts/release-readiness.test.mjs`：12/12（含新增 MCP 包合同）。 |
| Frontend unit | PASS | `npm run test:unit`：33 个测试文件，645/645（含 JSON 草稿导入解析 6 例）。 |
| MCP unit | PASS | `npm run test:mcp`：4 个测试文件，26/26（模板、文档校验/检查/动作、静态服务器、MCP 协议层）。 |
| MCP render pipeline | PASS | `npm run test:mcp:render`：4/4；自由画布模板渲染 3 张、Markdown 模板渲染 ≥4 张 1080×1440 PNG，PNG IHDR 与尺寸一致；像素抽样确认自由画布模板配色正确。 |
| MCP render 对照 | PASS | Markdown 无头渲染与真实 UI 导出逐像素对比：99.8% 一致（差异为文字抗锯齿级）；边缘伪影（box-shadow 在 html-to-image 下的 3px 深边）与 UI 导出逐字节一致。 |
| MCP stdio 端到端 | PASS | `mcp/dist/index.mjs` 经 stdio JSON-RPC 握手、`tools/list`（7 个工具）与 `tools/call`；自由画布闭环：实例化 `signal-freeform` → `inspect_document` 定位标题节点 → `apply_actions` 改写文本（changes=true）→ `render_document` 产出 3 张 PNG；Markdown 闭环：实例化 `editorial-archive-markdown` → `render_markdown` 产出 4 张 PNG（页数与模板元数据一致）。 |
| MCP build | PASS | `npm --prefix mcp run build`：tsc 类型检查 + esbuild 打包（154 kB）。 |
| Backend tests | NOT EXECUTED | 本机 Node 26 下 `better-sqlite3` 预编译下载超时（ETIMEDOUT）、源码回退编译失败，属环境限制；CI 在 Node 20 执行 72 例。本次未改动 `server/`。 |
| Backend HTTP smoke | NOT EXECUTED | 同上（依赖 server 依赖安装）；CI static 作业执行 `node server/smoke-test.mjs`。 |
| Production build | PASS | `npm run build` 完成 TypeScript 与 Vite 构建；新增 `dist/render.html` 入口。保留已知的单 chunk 体积警告。 |
| CI YAML | PASS | `node --test scripts/release-readiness.test.mjs` 解析 `ci.yml` 与 `publish-image.yml`；static 作业新增 `npm --prefix mcp ci`、`npm --prefix mcp run build`、`npm --prefix mcp test`，browser 作业新增 `npm run build` + `npm --prefix mcp run test:render`。 |
| Full E2E | FAIL | `npm run test:e2e` 多轮运行 240–241 通过（含 JSON 草稿导入 2 例），至多 2 例失败——`image framing … viewport widths and themes` 与 `number inspector … negative decimal keyboard input`（两例均在无本次改动的干净 `a0c4ec6`（v0.15.0）上复现失败，属本机环境存量问题且轮次间波动；待 GitHub CI（Ubuntu + Node 20）复核）。 |
| Editor acceptance | PASS | `npm run test:acceptance`：2/2。 |
| Compose config | NOT EXECUTED | 由 GitHub CI container 作业运行 `deploy/compose-smoke.sh`。 |
| Container smoke | NOT EXECUTED | 同上；镜像发布后按 `0.15.0` 流程补记。 |
| Compose cleanup | NOT EXECUTED | 同上。 |
| Image manifest | NOT EXECUTED | `0.16.0` 镜像未发布；标签推送后由 publish 工作流发布多架构镜像并补记。 |
| Anonymous pull | NOT EXECUTED | 同上。 |
| amd64 image smoke | NOT EXECUTED | 同上。 |
| arm64 image smoke | NOT EXECUTED | 同上。 |

## 构建产物

- `dist/index.html`：2.38 kB，gzip 1.14 kB。
- `dist/render.html`：1.26 kB，gzip 0.67 kB（MCP 无头渲染入口）。
- `dist/assets/main-B9EiAYgG.js`：959.70 kB，gzip 320.33 kB。
- `dist/assets/render-vCL2hka1.js`：1.98 kB，gzip 1.17 kB（与主应用共享样式 chunk）。
- `dist/assets/index-CVfg75Wi.css`：102.39 kB，gzip 16.41 kB。
- `mcp/dist/index.mjs`：154 kB（SDK、playwright-core、zod 外置为运行时依赖）。
- Vite 仍提示单 chunk 超过 500 kB。本次发布保留现有包体积，构建退出码为 0。

## MCP 数据边界

MCP 服务器只读写调用方指定的本地输出目录；静态文件服务器仅监听 `127.0.0.1` 随机端口并在渲染后关闭；不连接 LocalStore/RemoteStore，不迁移任何账号、草稿或图片。
