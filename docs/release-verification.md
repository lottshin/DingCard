# 0.16.0 发布验证

- 验证日期：2026-09-27
- 版本标签：`v0.16.0`（指向 `cec7319`）
- Commit under test：`cec7319e1491722c371fc8d790278571db901a51`（含发布过程中的两处修复，见下）
- GitHub CI：[run 36289333590](https://github.com/lottshin/DingCard/actions/runs/36289333590)（标签）；master 同步绿（run 36289328416）
- 镜像发布：[run 36289333613](https://github.com/lottshin/DingCard/actions/runs/36289333613)

`PASS` 表示对应命令已按预期完成，`NOT EXECUTED` 表示本机未执行（附原因），`FAIL` 表示执行了但未按预期完成。本报告只记录实际执行结果。

## 发布过程记录

发布期间发现并修复了两个问题，均已在最终标签中：

1. **mcp 锁文件失同步**：首次标签推送后 CI 在 `npm --prefix mcp ci` 失败——`mcp/package-lock.json` 缺少后来加入 devDependencies 的 `@types/node`。本机预检曾误报通过（管道吞掉了 `npm ci` 的非零退出码）。修复于 `508cf2c`（重新生成锁文件，并以严格退出码本地全链复验 ci/单测/构建/渲染管线）。
2. **存量抖动 e2e**：重打标签后 CI 在 `image framing … viewport widths and themes` 失败（该用例在本机与干净 `a0c4ec6`（v0.15.0）上同样失败过，属存量问题）。根因：视口变化后"舞台尺寸 → ResizeObserver → React 提交新画板缩放"的链路可能滞后于测试测量，慢环境下快照会抓到旧缩放（440px 时取景面实测 10.67px 而非 ≥120px）。修复于 `cec7319`：测量前轮询取景面宽度稳定。修复前本机约半数运行失败，修复后 6/6 通过；最终标签 CI 的 browser 作业全绿。

## 验证结果

| Check | Status | Evidence |
|---|---|---|
| Release contract | PASS | `node --test scripts/release-readiness.test.mjs`：12/12（含 MCP 包合同）；CI static 作业同步执行。 |
| Frontend unit | PASS | `npm run test:unit`：33 个测试文件，645/645（含 JSON 草稿导入解析 6 例）；CI 同步执行。 |
| MCP unit | PASS | `npm run test:mcp`：4 个测试文件，27/27（模板、文档校验/检查/动作、静态服务器、协议层、MCP 资源）；CI static 作业执行 `npm --prefix mcp ci` + `npm --prefix mcp run build` + `npm --prefix mcp test`。 |
| MCP render pipeline | PASS | `npm run test:mcp:render`：4/4；自由画布模板渲染 3 张、Markdown 模板渲染 ≥4 张 1080×1440 PNG，PNG IHDR 与尺寸一致；CI browser 作业在 Ubuntu + Node 20 + Chrome 上执行通过。 |
| MCP render 对照 | PASS | Markdown 无头渲染与真实 UI 导出逐像素对比：99.8% 一致（差异为文字抗锯齿级）；边缘伪影（box-shadow 在 html-to-image 下的 3px 深边）与 UI 导出逐字节一致。 |
| MCP stdio 端到端 | PASS | `mcp/dist/index.mjs` 经 stdio JSON-RPC 握手、`tools/list`（7 个工具）与 `tools/call`；自由画布闭环：实例化 `signal-freeform` → `inspect_document` → `apply_actions` 改写文本（changes=true）→ `render_document` 3 张 PNG；Markdown 闭环：实例化 `editorial-archive-markdown` → `render_markdown` 4 张 PNG（页数与模板元数据一致）。 |
| MCP build | PASS | `npm --prefix mcp run build`：tsc 类型检查 + esbuild 打包；CI 同步执行。 |
| Backend tests | PASS | 本机 Node 26 下 `better-sqlite3` 预编译下载超时未执行；CI（Ubuntu + Node 20）`npm run test:server` 通过（本次未改动 `server/`）。 |
| Backend HTTP smoke | PASS | CI static 作业执行 `node server/smoke-test.mjs` 通过。 |
| Production build | PASS | `npm run build` 完成 TypeScript 与 Vite 构建；新增 `dist/render.html` 入口。保留已知的单 chunk 体积警告。 |
| CI YAML | PASS | static、browser、container 三个 job 全部通过（run 36289333590，9m14s）；static 含 mcp 构建/单元测试，browser 含 mcp 渲染管线测试。 |
| Full E2E | PASS | CI browser 作业全部通过，含新增 JSON 草稿导入 2 例与此前抖动的 `image framing … viewport widths and themes`（测试已修复）。本机全量运行仅 `number inspector … negative decimal keyboard input` 失败（干净 `a0c4ec6` 同样失败，属本机 macOS 环境问题；CI 通过）。 |
| Editor acceptance | PASS | `npm run test:acceptance`：2/2。 |
| Compose config | PASS | CI container 作业运行 `deploy/compose-smoke.sh`；展开后的服务只有 `app`。 |
| Container smoke | PASS | 迁移账号、草稿和图片由新 `app` 继续读取；Fastify 提供首页、`/api/health`、注册、上传和 `/assets/`。 |
| Compose cleanup | PASS | smoke 结束后，临时容器、网络、卷和镜像标签均不存在。 |
| Image manifest | PASS | `ghcr.io/lottshin/dingcard:0.16.0` digest 为 `sha256:1238465e30040d99954df3e06eab41fb1f14b0d761f2a34e8d9f413901da2ad9`，包含 `linux/amd64` 与 `linux/arm64`（匿名 token 请求 manifest 验证）。 |
| Anonymous pull | PASS | publish job 登出 GHCR 后，通过公开 token 请求取得 `0.16.0` manifest；本机亦以匿名 token 复核（HTTP 200，OCI image index）。 |
| amd64 image smoke | PASS | run 36289333613 匿名拉取 `linux/amd64`，首页、健康接口和静态资源检查通过。 |
| arm64 image smoke | PASS | run 36289333613 通过 QEMU 匿名拉取 `linux/arm64`，首页、健康接口和静态资源检查通过。 |

## 构建产物

- `dist/index.html`：2.38 kB，gzip 1.14 kB。
- `dist/render.html`：1.26 kB，gzip 0.67 kB（MCP 无头渲染入口）。
- `dist/assets/main-BKApd-I-.js`：914.45 kB，gzip 306.10 kB（主应用入口）。
- `dist/assets/render-BJKLQajj.js`：4.10 kB，gzip 1.99 kB（无头渲染入口）。
- `dist/assets/styles-DZTA1r_Y.js`：284.77 kB，gzip 90.05 kB；`dist/assets/styles-ZQijpWZE.css`：102.96 kB，gzip 16.49 kB（index 与 render 两个入口共享的 chunk）。
- `mcp/dist/index.mjs`：163.7 kB（SDK、playwright-core、zod 外置为运行时依赖）。
- Vite 仍提示单 chunk 超过 500 kB。本次发布保留现有包体积，构建退出码为 0。

## 镜像

```bash
docker pull ghcr.io/lottshin/dingcard:0.16.0
```

镜像同时发布了 `0.16`、`latest` 和提交 SHA 标签，并带有 SBOM、provenance 与 OCI 元数据。Compose 默认仍固定 `0.15.0`，生产部署不依赖浮动的 `latest`；升级到 `0.16.0` 只需修改 `.env` 中的 `DINGCARD_VERSION`。

## MCP 数据边界

MCP 服务器只读写调用方指定的本地输出目录；静态文件服务器仅监听 `127.0.0.1` 随机端口并在渲染后关闭；不连接 LocalStore/RemoteStore，不迁移任何账号、草稿或图片。
