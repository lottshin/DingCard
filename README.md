# 叮卡

叮卡是一个在浏览器中制作社交媒体图文卡片和自由画布的编辑器。

- **Markdown 卡片**：把 Markdown 自动分页为固定尺寸卡片，并导出单页或 ZIP。
- **自由画布**：编辑多页面图文作品，支持文本、形状、图片、线条、嵌套分组、图层树、锁定/隐藏和 PNG/ZIP 导出。

默认使用浏览器本地存储，不需要后端；配置 `VITE_API_BASE` 后可连接仓库内的 Fastify + SQLite 服务。

## 环境要求

- Node.js 20+
- npm
- Chrome（运行 Playwright E2E 时需要）
- Docker 与 Compose 插件（仅 Docker 部署和全栈冒烟需要）

## 本地模式

本地模式是默认配置，账号、草稿和图片数据保存在当前浏览器中。

```powershell
npm ci
npm run dev
```

打开终端输出的本地地址。生产构建与本地预览：

```powershell
npm run build
npm run preview
```

`LocalStore` 使用 `localStorage` 保存账号与草稿，使用 `sessionStorage` 和草稿副本管理图片。清理浏览器数据会删除本地内容，应先导出重要作品。

## 服务器模式

服务器模式使用 `RemoteStore`，提供真实账号、SQLite 草稿和服务端图片存储。`LocalStore` 与 `RemoteStore` 是独立数据源；设置或清空 `VITE_API_BASE` **不会迁移**已有账号、草稿或图片。

先安装后端依赖：

```powershell
npm --prefix server ci
```

以下示例使用两个终端。开发环境可不设置 `JWT_SECRET`，但服务每次重启会生成新密钥并使旧令牌失效；建议本地联调也显式设置。

### PowerShell

终端一：

```powershell
$env:JWT_SECRET='replace-with-a-local-random-secret'
$env:CORS_ORIGINS='http://127.0.0.1:5173'
npm --prefix server run dev
```

终端二：

```powershell
$env:VITE_API_BASE='http://127.0.0.1:3000'
npm run dev -- --host 127.0.0.1 --port 5173
```

复制环境变量模板时，PowerShell 使用：

```powershell
Copy-Item server/.env.example server/.env
```

模板用于核对变量；后端不会自动读取 `.env`，直跑时仍需在进程环境中设置变量。

### POSIX Shell

终端一：

```bash
export JWT_SECRET='replace-with-a-local-random-secret'
export CORS_ORIGINS='http://127.0.0.1:5173'
npm --prefix server run dev
```

终端二：

```bash
export VITE_API_BASE='http://127.0.0.1:3000'
npm run dev -- --host 127.0.0.1 --port 5173
```

复制环境变量模板时，POSIX Shell 使用：

```bash
cp server/.env.example server/.env
```

后端健康检查地址为 `http://127.0.0.1:3000/api/health`。

## Docker Compose

Docker Compose 以同源方式启动前端 Nginx 和后端服务。先复制根环境模板并填写强随机 `JWT_SECRET`。

PowerShell：

```powershell
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose up -d --build
```

POSIX Shell：

```bash
cp .env.example .env
openssl rand -hex 32
docker compose up -d --build
```

把生成值写入 `.env` 的 `JWT_SECRET=`，不要提交 `.env`。默认入口为 `http://127.0.0.1:8080/`，健康检查为 `http://127.0.0.1:8080/api/health`。

生产部署还必须配置 HTTPS、宿主机数据权限和备份。完整拓扑、配置和安全清单见 [后端接入方案](docs/backend-plan.md)。

## 命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动 Vite 开发服务器。 |
| `npm run build` | 运行 TypeScript 检查并生成生产构建。 |
| `npm run preview` | 本地预览生产构建。 |
| `npm test` | 依次运行前端单元、后端和完整 E2E。 |
| `npm run test:unit` | 运行前端 Vitest。 |
| `npm run test:unit:watch` | 以监听模式运行前端单元测试。 |
| `npm run test:server` | 运行后端 Node 测试。 |
| `node server/smoke-test.mjs` | 启动临时真实后端并验证 HTTP 契约。 |
| `npm run test:e2e` | 运行 LocalStore E2E 与编辑器验收。 |
| `npm run test:e2e:headed` | 在可见浏览器中运行 E2E。 |
| `npm run test:acceptance` | 仅运行编辑器关键验收旅程。 |
| `npm run test:integration` | 运行真实 Fastify + RemoteStore 集成套件。 |
| `node --test scripts/release-readiness.test.mjs` | 检查发布文档、CI 和验证记录契约。 |

后端自身还提供 `npm --prefix server start`、`npm --prefix server run dev` 和 `npm --prefix server test`。

## 数据与部署

- 本地模式数据只存在当前浏览器，仓库不提供自动迁移到服务器的流程。
- 直跑后端默认把 SQLite 和上传文件写入 `server/data/`；可用 `DATA_DIR` 覆盖。
- Compose 使用独立的数据库卷和上传卷，升级镜像不会自动删除数据。
- 备份必须同时包含 SQLite 数据库与 uploads 目录。
- 正式环境必须在可信反向代理处终结 HTTPS，并限制数据库和上传目录权限。

自由画布的数据模型、迁移和交互契约见 [自由编辑器说明](docs/freeform-editor.md)。
