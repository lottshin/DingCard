# 0.18.0 发布验证

- 验证日期：2026-09-27
- 版本标签：`v0.18.0`（指向 `77c02cd`）
- Commit under test：`77c02cd4c1f63816a4633a0b08f728c390e99398`
- GitHub CI：[run 36320403985](https://github.com/lottshin/DingCard/actions/runs/36320403985)（标签）；master 同步绿（run 36319834302）
- 镜像发布：[run 36320403999](https://github.com/lottshin/DingCard/actions/runs/36320403999)
- 发布内容：v7 视觉外观（滤镜、混合模式、虚线与线帽、五角星/六边形，文档版本 v7）、内置自由画布模板从四套扩充到八套、MCP `0.18.0`。

`PASS` 表示对应命令已按预期完成，`NOT EXECUTED` 表示本机未执行（附原因），`FAIL` 表示执行了但未按预期完成。本报告只记录实际执行结果。

## 验证结果

| Check | Status | Evidence |
|---|---|---|
| Release contract | PASS | `node --test scripts/release-readiness.test.mjs`：12/12（含 MCP 包合同与部署钉点 `0.17.0` 镜像）；CI static 作业同步执行。 |
| Frontend unit | PASS | `npm run test:unit`：35 个测试文件，710/710（含 v7 外观校验、归约器滤镜/混合/虚线补丁、场景树运行时校验与 v1–v6 迁移链用例）；CI 同步执行。 |
| MCP unit | PASS | `npm run test:mcp`：4 个测试文件，28/28（模板、文档校验/检查/动作含 v7 字段应用与清除、静态服务器、协议层、MCP 资源）；干净 `npm --prefix mcp ci` 后全绿。 |
| MCP render pipeline | PASS | `npm run test:mcp:render`：5/5；模板渲染 1080×1440 PNG（IHDR 一致），含同一文档带/不带 `spans` 渲染出像素级不同 PNG 的用例；CI browser 作业在 Ubuntu + Node 20 + Chrome 上执行通过。 |
| MCP stdio 端到端 | PASS | `mcp/dist/index.mjs`（`dingcard-mcp@0.18.0`）经 stdio JSON-RPC：握手、`validate_document` 校验含滤镜/混合模式文本、虚线线帽与五角星的 v7 文档（ok=true）、`apply_actions` 为五角星加阴影+透明度并清除虚线（changes=[true,true]）、`list_templates` 返回 8 套自由画布模板（含 `neon-freeform`）。 |
| MCP build | PASS | `npm --prefix mcp run build`：tsc 类型检查 + esbuild 打包（216,781 字节）；CI static 作业同步执行。 |
| Backend tests | PASS | 本机 Node 26 下 `better-sqlite3` 预编译下载超时未执行；CI（Ubuntu + Node 20）`npm run test:server` 通过（本次未改动 `server/`）。 |
| Backend HTTP smoke | PASS | CI static 作业执行 `node server/smoke-test.mjs` 通过。 |
| Production build | PASS | `npm run build` 完成 TypeScript 与 Vite 构建；`dist/render.html` 无头渲染入口正常产出。保留已知的单 chunk 体积警告。 |
| CI YAML | PASS | 标签 CI（run 36320403985）static、browser、container 三个作业全部通过；browser 作业含全量 e2e 与 MCP 渲染管线测试。 |
| Full E2E | PASS | CI browser 作业全部通过，含 v7 视觉外观闭环用例（滤镜、混合模式、虚线线帽、五角星/六边形插入与图层锁定键盘流）。本机 248/248 全绿（此前 macOS 负数小数用例已按 Meta+A 全选修正，随本次 e2e 代码发布）。 |
| Editor acceptance | PASS | `npm run test:acceptance`：2/2。 |
| Compose config | PASS | 标签 CI container 作业运行 `deploy/compose-smoke.sh`；展开后的服务只有 `app`。 |
| Container smoke | PASS | 迁移账号、草稿和图片由新 `app` 继续读取；Fastify 提供首页、`/api/health`、注册、上传和 `/assets/`。 |
| Compose cleanup | PASS | smoke 结束后，临时容器、网络、卷和镜像标签均不存在。 |
| Image manifest | PASS | `ghcr.io/lottshin/dingcard:0.18.0` digest 为 `sha256:1a2dbf558425e305770807a4ebd16d31131da3587665d14933a8efd41312c17f`，包含 `linux/amd64` 与 `linux/arm64`（匿名 token 请求 manifest 验证，HTTP 200，OCI image index）。 |
| Anonymous pull | PASS | publish job 登出 GHCR 后，通过公开 token 请求取得 `0.18.0` manifest；本机亦以匿名 token 复核。 |
| amd64 image smoke | PASS | run 36320403999 匿名拉取 `linux/amd64`，首页、健康接口和静态资源检查通过。 |
| arm64 image smoke | PASS | run 36320403999 通过 QEMU 匿名拉取 `linux/arm64`，首页、健康接口和静态资源检查通过。 |

## 构建产物

- `dist/index.html`：2.38 kB，gzip 1.15 kB。
- `dist/render.html`：1.26 kB，gzip 0.68 kB（MCP 无头渲染入口）。
- `dist/assets/main-Dwo6ciw8.js`：958.47 kB，gzip 315.26 kB（主应用入口）。
- `dist/assets/render-RbgCQ2ce.js`：4.26 kB，gzip 2.01 kB（无头渲染入口）。
- `dist/assets/styles-DWyl1kL1.js`：297.88 kB，gzip 93.88 kB；`dist/assets/styles-BmRjFKyn.css`：104.77 kB，gzip 16.89 kB（index 与 render 两个入口共享的 chunk）。
- `mcp/dist/index.mjs`：216.8 kB（SDK、playwright-core、zod 外置为运行时依赖）。
- Vite 仍提示单 chunk 超过 500 kB。本次发布保留现有包体积，构建退出码为 0。

## 镜像

`v0.18.0` 镜像已发布：`docker pull ghcr.io/lottshin/dingcard:0.18.0`（digest `sha256:1a2dbf55…`，linux/amd64 + linux/arm64，带 SBOM、provenance 与 OCI 元数据，同时发布 `0.18`、`latest` 和提交 SHA 标签）。Compose 与部署文档固定已发布的 GHCR `0.17.0` 镜像，生产部署不依赖浮动的 `latest`；升级到 `0.18.0` 只需修改 `.env` 中的 `DINGCARD_VERSION`。

## MCP 数据边界

MCP 服务器只读写调用方指定的本地输出目录；静态文件服务器仅监听 `127.0.0.1` 随机端口并在渲染后关闭；不连接 LocalStore/RemoteStore，不迁移任何账号、草稿或图片。
