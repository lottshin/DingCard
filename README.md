# 叮卡

<div align="center">
  <p><strong>小红书长文排版 + 轻设计出图</strong></p>
  <p>把一篇长文自动排成适合滑动阅读的图文卡片，也可以在自由画布中制作封面、重点页和多页视觉内容。</p>
</div>

<p align="center">
  <img src="docs/assets/markdown-workspace.png" width="49%" alt="叮卡 Markdown 长文排版工作区">
  <img src="docs/assets/freeform-workspace.png" width="49%" alt="叮卡自由画布轻设计工作区">
</p>

<p align="center"><sub>左：Markdown 长文自动分页　右：自由画布轻设计出图</sub></p>

叮卡把内容排版和轻量设计放在同一个浏览器工具中：

- 写长文时，用 Markdown 专注内容，实时预览分页效果。
- 做封面或重点页时，切到自由画布编辑文字、图片、形状和图层。
- 完成后导出当前页，或把整组图片打包为 ZIP。
- 默认数据保存在本地浏览器；需要跨设备同步时，可以连接仓库自带的 Fastify + SQLite 服务。

## 两种创作方式

### Markdown 长文排版

粘贴或编写 Markdown，叮卡会按照目标平台尺寸自动分页。编辑区和图片预览实时并排，适合教程、清单、知识分享和小红书长图文。

支持：

- 小红书、微博和推特尺寸预设。
- 主题、字体、圆角和个人资料样式。
- Markdown 标题、列表、引用、代码块与手动分页。
- 图片粘贴、宽度调整、单页导出和全部分页打包。

![叮卡 Markdown 长文排版工作区](docs/assets/markdown-workspace.png)

### 自由画布轻设计

自由画布用于制作封面、重点页和更灵活的多页图文。它保留了轻量工具的上手速度，同时提供完整的图层与嵌套编辑能力。

支持：

- 文本、图片、矩形、圆形、三角形、直线和箭头。
- 多页面、页面尺寸、缩放、吸附、对齐与分布。
- 图层树、重命名、拖放排序、分组与取消分组。
- 嵌套作用域、锁定、隐藏、撤销与重做。
- 当前页 PNG 导出和全部页面 ZIP 导出。

![叮卡自由画布轻设计工作区](docs/assets/freeform-workspace.png)

## 快速开始

环境要求：

- Node.js 20+
- npm
- Chrome（运行 Playwright E2E 时需要）
- Docker 与 Compose 插件（仅 Docker 部署和全栈冒烟需要）

默认启动本地模式，不需要后端：

```bash
npm ci
npm run dev
```

打开终端输出的地址即可使用。生产构建与本地预览：

```bash
npm run build
npm run preview
```

## 数据模式

### 本地模式

本地模式是默认配置。账号和草稿保存在 `localStorage`，图片由 `sessionStorage` 和草稿副本管理。

- 不需要服务器，克隆后即可运行。
- 数据只存在当前浏览器，清理浏览器数据会删除本地内容。
- 本地账号仅用于浏览器内区分草稿，不是真实远程身份认证，请勿复用重要密码。
- 重要作品应及时导出。

### 服务器模式

服务器模式使用 `RemoteStore`，提供真实账号、SQLite 草稿和服务端图片存储。设置 `VITE_API_BASE` 后启用。

`LocalStore` 与 `RemoteStore` 是独立数据源，切换模式**不会迁移**已有账号、草稿或图片，也不会覆盖另一端的数据。

<details>
<summary><strong>展开服务器模式开发说明</strong></summary>

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

复制环境变量模板：

```powershell
Copy-Item server/.env.example server/.env
```

模板用于核对变量；后端不会自动读取 `.env`，直跑时仍需在进程环境中设置变量。

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

复制环境变量模板：

```bash
cp server/.env.example server/.env
```

后端健康检查地址为 `http://127.0.0.1:3000/api/health`。

</details>

## Docker Compose

Docker Compose 以同源方式启动前端 Nginx 和后端服务。先复制根环境模板并填写强随机 `JWT_SECRET`。

<details>
<summary><strong>展开 Docker Compose 启动说明</strong></summary>

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

生产部署还必须配置 HTTPS、宿主机数据权限和备份。完整拓扑、配置和安全清单见[后端接入方案](docs/backend-plan.md)。

</details>

## 开发与验证

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

## 数据与部署边界

- 直跑后端默认把 SQLite 和上传文件写入 `server/data/`；可用 `DATA_DIR` 覆盖。
- Compose 使用独立的数据库卷和上传卷，升级镜像不会自动删除数据。
- 备份必须同时包含 SQLite 数据库与 `uploads` 目录。
- 正式环境必须在可信反向代理处终结 HTTPS，并限制数据库和上传目录权限。
- 当前不提供 LocalStore 到 RemoteStore 的自动导入流程。

## 技术栈

- React 18、TypeScript、Vite
- CodeMirror 6、Marked
- Fastify、SQLite、JWT、bcrypt
- Vitest、Playwright
- Docker Compose、Nginx

## 文档

- [自由画布数据模型与交互说明](docs/freeform-editor.md)
- [后端接入与部署方案](docs/backend-plan.md)
- [0.10.1 本地发布验证](docs/release-verification.md)
- [更新日志](CHANGELOG.md)
