# 0.10.1 本地发布验证

- 验证日期：2026-07-20
- Commit under test：`abe54549666226d5acf426fff882d4da9db888b5`
- 环境：Microsoft Windows NT 10.0.22631.0、PowerShell 5.1.22621.6133、Node.js v20.18.0、npm 10.8.2、Python 3.13.3
- 容器工具：Docker 29.1.2、Docker Compose v2.40.3-desktop.1、Git Bash

状态含义：`PASS` 表示命令在本次验证中以预期结果完成；`FAIL` 表示已经执行但未满足契约；`NOT EXECUTED` 表示尚未执行或当前环境不具备前置条件。

| Check | Status | Evidence |
|---|---|---|
| Release contract | PASS | `node --test scripts/release-readiness.test.mjs`：4/4。 |
| Frontend unit | PASS | `npm run test:unit`：24 个测试文件、397/397。 |
| Backend tests | PASS | `npm run test:server`：48/48。 |
| Backend HTTP smoke | PASS | `node server/smoke-test.mjs`：认证、所有权、413/415/429、租约/GC 和并发配额全部通过；429 响应确认命中认证限流上限 12。 |
| Production build | PASS | `npm run build`：TypeScript 与 Vite 构建成功；保留已知的大块警告。 |
| CI YAML | PASS | PyYAML 6.0.3 成功解析 `.github/workflows/ci.yml`，并确认 `static`/`browser` 两个 job。 |
| Full E2E | PASS | `npm run test:e2e`：184/184，耗时约 4.9 分钟。 |
| Compose config | PASS | 唯一项目 `rednote-release-smoke-abe5454`、端口 18814；展开结果包含 `server` 与 `web`。 |
| Container smoke | PASS | 首页与 `/api/health` 首轮即 200；注册、图片上传、Nginx 只读卷直出均通过。 |
| Compose cleanup | PASS | 按 Compose project label 查询，容器、网络和卷结果均为空。 |

## 构建产物

- `dist/index.html`：2.35 kB，gzip 1.12 kB。
- `dist/assets/index-CvLZbRsD.css`：62.94 kB，gzip 10.56 kB。
- `dist/assets/index-r1MgV6ea.js`：1,111.54 kB，gzip 369.09 kB。
- Vite 仍提示单 chunk 超过 500 kB。该警告已知且本轮明确不做拆包优化，不影响构建退出状态。

## Docker 验证

- Docker CLI、Compose 插件和 daemon 分别检查，均可用。
- Compose 配置验证使用非生产测试密钥、唯一项目名和空闲高端口，不读取或写入项目 `.env`。
- 最终全栈冒烟使用项目 `rednote-release-smoke-abe5454` 和端口 18814。
- Git Bash 下发现 curl multipart 的 `@/tmp/...` 嵌入路径不会触发 MSYS 自动转换；新增 `cygpath` 条件转换后，Windows 与 Linux 路径采用各自原生形式，最终上传返回 200。
- 冒烟脚本使用实际 60 秒截止时间并为所有 HTTP 请求设置连接/总超时；启动或就绪失败会立即停止后续检查。
- 故障注入确认 Compose 清理失败会保留非零退出码并明确报错，不再误报“已清理”。
- 冒烟脚本通过 EXIT trap 执行 `down -v --remove-orphans`；随后用 Docker project label 独立确认容器、网络和卷为空。

## E2E 稳定性复验

- 首轮完整复验暴露颜色弹窗按 Escape 后的异步焦点恢复与数字输入之间存在测试时序竞争；应用运行时代码未改动。
- 测试改为等待颜色按钮恢复焦点后再编辑描边宽度；目标用例连续执行 10 次均通过，随后标准完整命令 184/184 通过。
