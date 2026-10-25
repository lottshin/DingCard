# 开发指南

前端、后端和 MCP 服务器都在这个仓库里。本地运行前端不需要后端；要联调账号、跨设备同步和服务端图片时，再启动仓库自带的 Fastify 服务。

## 本地运行

需要 Git、Node.js 22+ 和 npm：

```bash
git clone https://github.com/lottshin/DingCard.git
cd DingCard
npm ci
npm run dev
```

打开终端输出的地址即可使用。构建并预览生产版本：

```bash
npm run build
npm run preview
```

运行 Playwright E2E 和 MCP 无头渲染时还需要 Chrome；全栈联调和 Docker 部署才需要 Docker Compose。

## 数据模式

### 本地模式

本地模式是默认配置。账号和草稿保存在 `localStorage`，草稿里的大图存在 IndexedDB（`dingcard.pictures`），草稿只记引用；编辑中刚插入的图片也暂存在 `sessionStorage`。

- 不需要服务器，克隆后即可运行。
- 数据只存在当前浏览器，清理浏览器数据会删除本地内容。
- 本地账号仅用于浏览器内区分草稿，不是真实远程身份认证，请勿复用重要密码。
- 重要作品应及时导出。

### 服务器模式

服务器模式使用 `RemoteStore`，提供真实账号、SQLite 草稿和服务端图片存储。设置 `VITE_API_BASE` 后启用。

`LocalStore` 与 `RemoteStore` 是独立数据源，切换模式**不会迁移**已有账号、草稿或图片，也不会覆盖另一端的数据。

先安装后端依赖：

```bash
npm --prefix server ci
```

开发环境可不设置 `JWT_SECRET`，但服务每次重启会生成新密钥并使旧令牌失效；建议本地联调也显式设置。

#### PowerShell

终端一：

```powershell
$env:JWT_SECRET='replace-with-a-local-random-secret'
$env:CORS_ORIGINS='http://127.0.0.1:5173'
npm --prefix server run dev
```

终端二：

```powershell
$env:VITE_API_BASE='http://127.0.0.1:3000'
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

后端不会自动读取 `server/.env`；直跑时请像上面一样在进程环境中设置变量。完整变量说明见 `server/.env.example`。

#### POSIX Shell

终端一：

```bash
export JWT_SECRET='replace-with-a-local-random-secret'
export CORS_ORIGINS='http://127.0.0.1:5173'
npm --prefix server run dev
```

终端二：

```bash
export VITE_API_BASE='http://127.0.0.1:3000'
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

后端健康检查地址为 `http://127.0.0.1:3000/api/health`。

### 数据与部署边界

- 直跑后端默认把 SQLite 和上传文件写入 `server/data/`；可用 `DATA_DIR` 覆盖。
- Compose 使用独立的数据库卷和上传卷，升级镜像不会自动删除数据。
- 备份必须同时包含 SQLite 数据库与 `uploads` 目录。
- 正式环境必须在可信反向代理处终结 HTTPS，并限制数据库和上传目录权限。
- 当前不提供 LocalStore 到 RemoteStore 的自动导入流程。

部署、域名、备份和升级见[部署指南](deployment.md)。

## 测试与验证

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动 Vite 开发服务器。 |
| `npm run build` | 运行 TypeScript 检查并生成生产构建。 |
| `npm run preview` | 本地预览生产构建。 |
| `npm test` | 依次运行前端单元、后端、MCP 和完整 E2E。 |
| `npm run test:unit` | 运行前端 Vitest。 |
| `npm run test:unit:watch` | 以监听模式运行前端单元测试。 |
| `npm run test:server` | 运行后端 Node 测试。 |
| `node server/smoke-test.mjs` | 启动临时真实后端并验证 HTTP 契约。 |
| `npm run test:mcp` | 运行 MCP 包单元测试（模板、文档校验、动作归约、静态服务器、协议层）。 |
| `npm run test:mcp:render` | 运行 MCP 真实浏览器渲染管线测试（模板文档 → PNG）。 |
| `npm run mcp` | 以 stdio 启动 dingcard-mcp 服务器，供 MCP 客户端接入。 |
| `npm run test:e2e` | 运行 LocalStore E2E 与编辑器验收。 |
| `npm run test:e2e:headed` | 在可见浏览器中运行 E2E。 |
| `npm run test:acceptance` | 仅运行编辑器关键验收旅程。 |
| `npm run test:integration` | 运行真实 Fastify + RemoteStore 集成套件。 |
| `node --test scripts/release-readiness.test.mjs` | 检查发布文档、CI 和验证记录契约。 |

本地的 E2E 一次只跑指定的用例：`npm run test:e2e -- e2e/<spec 文件> -g "用例名"`。`scripts/e2e-guard.mjs` 会拒绝不带 `-g` 的完整套件，机器负载高时也会先拒绝；完整套件在 CI 上跑（那里设置了 `DINGCARD_FULL_E2E=1`）。

后端自身还提供 `npm --prefix server start`、`npm --prefix server run dev` 和 `npm --prefix server test`。

## 技术栈

- React 18、TypeScript、Vite
- CodeMirror 6、Marked
- Fastify、SQLite、JWT、bcrypt
- Vitest、Playwright
- Docker Compose
