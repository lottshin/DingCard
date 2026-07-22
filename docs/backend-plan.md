# 叮卡 · 后端接入方案

> 当前发布版本：前端 `0.11.0`，后端 `0.3.0`。后端自动化测试可从仓库根目录运行 `npm run test:server`（等价于 `npm --prefix server test`，覆盖数据库迁移、图片引用扫描、租约回收与用户级资源锁）；端到端冒烟运行 `node server/smoke-test.mjs`。

把当前"纯浏览器存储"改造成真实后端,实现跨设备同步与真实账号。

- **技术栈**:Node + Fastify + SQLite(better-sqlite3)
- **认证**:bcrypt 存密码 + JWT
- **目标机器**:2c2g / 100Mbps 峰值 / 国内 / 已备案
- **图片**:本机磁盘,由 Fastify 提供 `/uploads`
- **部署形态**:后端可选 —— 默认纯本地(零部署),配了后端地址才走服务器(见第 10 章)

> 进度:后端、`src/storage/` 的 Local/Remote 双实现、远程联调与 Docker 部署均已落地。
> 图片租约/回收与 retain API 已接入前后端：RemoteStore 保存自由编辑 v3 递归场景树时执行“续租已有 URL → 上传历史 Data URL → 续租完整 URL → 提交草稿”，图片收集包含隐藏组及其后代。活动 Markdown/自由编辑文档还会在图片源变化、恢复联网、页面重新可见和每 5 分钟周期触发续租。认证、草稿与图片操作失败统一显示可恢复的非阻塞提示，不再静默失败。本文与代码保持同步。

---

## 1. 本地实现基线

原有浏览器存储逻辑仍由 `src/storage/local.ts` 封装为默认 LocalStore；配置 `VITE_API_BASE` 时，`src/storage/index.ts` 改选 `src/storage/remote.ts`。本地模式的数据仍只在浏览器，换设备/清缓存即丢失：

| 数据 | 现在存哪 | 相关文件 |
|---|---|---|
| 账号/密码/登录态 | `localStorage`,SHA-256(非加盐) | `src/storage/local.ts` 包装 `src/auth.ts` |
| 草稿 | `localStorage`,按 userId 分区 | `src/storage/local.ts` 包装 `src/drafts.ts` |
| 草稿内图片 | 编辑时可用会话级 `img:` 引用；保存副本物化为 Data URL | `src/storage/local.ts` 包装 `src/drafts.ts` + `src/imageStore.ts` |
| 会话图片缓存 | `sessionStorage` | `src/storage/local.ts` 包装 `src/imageStore.ts` |

`src/storage/types.ts` 定义统一异步契约，UI 只依赖 `store`。LocalStore 包装 `auth.ts` / `drafts.ts` / `imageStore.ts`，RemoteStore 通过 HTTP 调后端；切换模式不会自动把已有 localStorage 草稿或图片上传到服务器，需要用户显式导入。

---

## 2. 架构总览

```
                 宿主机(域名, HTTPS 由外层反代终结)
┌──────────────────────────────────────────────────────┐
│  Caddy / Nginx / 云负载均衡                           │
│       └── 127.0.0.1:8080                             │
│                                                      │
│  Fastify 单进程                                      │
│   ├── SPA 前端静态文件                                │
│   ├── /api 认证、草稿和图片接口                       │
│   └── /uploads 图片静态文件                           │
│                                                      │
│  SQLite 数据库 /data                                  │
│  上传目录       /data/uploads                         │
└──────────────────────────────────────────────────────┘
```

关键取舍:
- Fastify 在同一进程提供 SPA、`/api` 和 `/uploads`，不再维护内部 Nginx 或第二个应用容器。
- 图片文件放在 `uploads` 卷，SQLite 只保存路径和元数据；`db`、`uploads` 两个卷一起备份。
- 外层 Caddy、Nginx 或云负载均衡只负责 HTTPS 和转发，应用容器内不承担证书管理。
- 100M 带宽足够承载单图 100–300KB 的常见卡片；带宽不足时再把 `/uploads` 迁到对象存储。

---

## 3. 数据库设计(SQLite)

三张表就够。用 `better-sqlite3`(同步 API、单文件、零配置、速度快)。

```sql
-- 用户
CREATE TABLE users (
  id          TEXT PRIMARY KEY,        -- uuid
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash     TEXT NOT NULL,           -- bcrypt hash(含盐)
  created_at  INTEGER NOT NULL         -- epoch ms
);

-- 草稿(通用版本化信封,一行一份)
-- 草稿 API 不解释 document 的业务结构,整坨当 JSON 存、原样取回；
-- 图片 GC 仅递归扫描其中的托管图片 URL，不依赖 markdown/freeform schema。
-- 这样无论前端草稿结构怎么演进(markdown-card / freeform-slide / 未来新模式),
-- 表结构都不用改。
CREATE TABLE drafts (
  id             TEXT PRIMARY KEY,      -- uuid
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  mode           TEXT NOT NULL,         -- 'markdown-card' | 'freeform-slide'
  schema_version INTEGER NOT NULL,      -- 信封 schemaVersion
  document       TEXT NOT NULL,         -- 整个 document,存 JSON 字符串(不透明)
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_drafts_user ON drafts(user_id, updated_at DESC);

-- 图片元数据(文件本体在磁盘,库里只存指针)
CREATE TABLE images (
  id               TEXT PRIMARY KEY,        -- 即 img:<id> 里的 id
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path             TEXT NOT NULL,           -- /uploads/<id>.jpg,前端直接当 src
  mime             TEXT NOT NULL,
  bytes            INTEGER NOT NULL,
  created_at       INTEGER NOT NULL,
  lease_expires_at INTEGER NOT NULL          -- 到期后且无草稿引用才允许回收
);
CREATE INDEX idx_images_user ON images(user_id);
```

要点:
- **图片二进制永不进库**,只存 `path`。备份时 copy `data.db` + `uploads/` 目录两样东西即可。
- **草稿 `document` 存不透明 JSON 字符串**。草稿读写不解释业务字段；图片 GC 只做与 schema 无关的托管 URL 扫描。markdown 和 freeform 两种模式共用同一张表,以后加新工作区模式也不用改表结构。
- 启动时会检查旧数据库的 `images` 表：缺少 `lease_expires_at` 就原地 `ALTER TABLE`，并把旧行回填为“迁移时刻 + 一个完整租约”。迁移幂等，不要求重建数据库。
- 开启 WAL 模式(`PRAGMA journal_mode=WAL`)提升并发读性能;开 `foreign_keys=ON` 让级联删除生效。

---

## 4. API 设计

统一前缀 `/api`。除注册/登录外都要带 `Authorization: Bearer <jwt>`。

### 认证
```
POST /api/auth/register   { username, password }  → { user, token }
POST /api/auth/login      { username, password }  → { user, token }
GET  /api/auth/me                                 → { user }        (校验 token)
```
- 密码用 **bcrypt**(cost 10~12)哈希存储。**绝不再用现在的 SHA-256**。
- 登录成功签发 JWT,载荷放 `{ sub: userId, username }`,有效期如 7 天。
- JWT 密钥从环境变量读(`JWT_SECRET`),不写进代码。
- 除注册和登录外，缺少、过期或无效 JWT 的受保护请求返回 401。前端只在“实际携带的 token 收到 401 且该 token 仍为当前会话”时清除登录态；网络错误、5xx 和迟到的旧请求不会误登出用户。
- 注册/登录是公共请求，即使浏览器已有 token 也不附带 `Authorization`。它们的 401 只表示本次凭据失败，不会清除已有会话。
- RemoteStore 统一抛出带 `status: number | null` 的 `ApiError`：HTTP 错误保留实际状态码；网络失败、客户端预校验或已被更新会话取代的认证请求没有对应 HTTP 状态，使用 `null`；无效 JSON 使用稳定错误“服务器返回了无效响应”。只有实际携带的 token 收到 401、且该 token 仍是当前值时才清除并通知 `onInvalidated`；迟到的旧请求 401、网络错误、5xx 和无效 JSON 都不误清新 token，旧 `/me` 响应遇到新 token 时会重新校验新会话。
- token 同时保留在模块内存；`localStorage` 因隐私模式或安全策略不可用时，同一页面内登录和 `/me` 仍可工作。`current()` 只在没有 token 或收到 401 时返回 `null`，其他失败继续抛给 UI。

### 草稿
```
GET    /api/drafts            → Draft[]           (只返回当前用户的,按 updated_at 倒序)
GET    /api/drafts/:id        → Draft
POST   /api/drafts            { ...envelope }  → Draft   (upsert:带 id 覆盖,无 id 新建)
DELETE /api/drafts/:id        → { ok: true }
```
- 请求体是完整信封 `{ id?, title?, schemaVersion, mode, document }`。`mode` 只接受 `markdown-card` / `freeform-slide`,其余返回 400。
- `document` 缺失或不是对象、`id` 存在但为空/不是字符串时返回 400；GET 查询不到草稿、或带 `id` 更新不存在/属于其他用户的草稿时返回 404。不带 `id` 才创建新草稿。
- `title` 缺省时后端派生:markdown 取正文首行、freeform 取首页名。
- `document` 原样存取；草稿 API 不解析内部业务结构，GC 只递归收集托管图片 URL。
- 每个查询都带 `WHERE user_id = ?`,从 JWT 取 userId,**不信任前端传的 user_id**。

### 图片
```
POST /api/images   (multipart/form-data, 字段 file)  → { ref: "img:<id>", url: "/uploads/<id>.jpg" }
POST /api/images/retain   { urls: string[] }          → { retained: number }
```
- 上传限制：缺文件返回 400；MIME 不在 png/jpeg/webp 白名单返回 415；单图过大返回 413。随机文件名不使用客户端原始名，避免路径穿越。
- 配额超限返回 413 + `IMAGE_QUOTA_EXCEEDED`。上传前会先尝试 GC，但 GC 只回收“租约已过期且没有任何草稿引用”的图片，因此删除草稿后释放空间可能延迟。
- 新上传图片获得 `IMAGE_LEASE_MS` 租约；retain 对普通 `/uploads/...`、同公开 request origin 的绝对 URL 或协议相对 URL 续租，外部 origin/data URL 会忽略。反代部署时公开协议取可信 `X-Forwarded-Proto` 的第一个 `http`/`https` 值，公开 authority 取请求 `Host`（包含非默认端口）；因此 HTTPS 页面只接受同 host、同端口的 HTTPS 绝对图片 URL，不会把 HTTP URL 当同源。
- retain 的 `urls` 不是数组时返回 400 + `INVALID_IMAGE_RETAIN_REQUEST`；单次托管路径超过 500 条时返回 400 + `IMAGE_RETAIN_LIMIT_EXCEEDED`；任一路径不存在或不属于当前用户时整批返回 409 + `IMAGE_RETAIN_CONFLICT`，不会部分续租。
- 同一用户的草稿写入/删除、retain、上传共用一把资源锁。上传临界区完整覆盖“GC → 配额检查 → 文件持久化 → SQLite insert”，避免并发上传都基于旧配额通过；删除草稿后也在同一锁内触发 GC。
- **降采样仍在前端做**（现有 `downscaleDataUrl` 保留）：Markdown 粘图默认限制到 1200px，自由编辑图片与形状填充限制到 1800px，上传前先缩图以节省带宽和磁盘。
- 图片按 `/uploads/<id>.jpg` 存盘,`url` 直接可作 `<img src>`。Fastify static 在开发、联调和生产都提供该路径。

### 状态码约定

| 状态码 | 稳定语义 |
|---|---|
| 400 | 请求结构或字段无效，例如草稿信封、草稿 ID、retain 数组或 retain 数量上限不符合契约。 |
| 401 | 公共登录请求凭据错误，或受保护请求的 JWT 缺失/无效/过期；只有后者满足当前 token 条件时才使客户端会话失效。 |
| 404 | 草稿不存在，或调用者尝试读取/更新不属于自己的草稿；不泄露其他用户草稿是否存在。 |
| 409 | 用户名冲突，或 retain 中至少一个托管图片不存在/不属于当前用户；retain 整批失败，不部分续租。 |
| 413 | 单图超过上传上限，或用户图片配额不足。 |
| 415 | 上传文件 MIME 不在 PNG/JPEG/WebP 白名单。 |
| 429 | 全局或认证路由触发限流；注册、登录等认证请求需稍后重试。 |

图片 retain 的机器可读错误码为 `INVALID_IMAGE_RETAIN_REQUEST`、`IMAGE_RETAIN_LIMIT_EXCEEDED`、`IMAGE_RETAIN_CONFLICT`；配额错误码为 `IMAGE_QUOTA_EXCEEDED`。

---

## 5. 前端改动(双实现 + 后端可选)

因为项目要开源(见 §11),前端**不能硬编码成必须连后端**。做法:每个存储模块内部维护"本地 / 远程"两套实现,由一个开关选择,UI 层无感。

**开关**:读环境变量 `VITE_API_BASE`。
- 未配置 → `LocalStore`(现有 localStorage 实现,零部署、开箱即用,开源默认)
- 配置了 → `RemoteStore`(fetch 后端,多设备同步 + 真账号)

| 文件 | 实际职责 |
|---|---|
| `src/storage/types.ts` | 定义 `AuthStore` / `DraftStore` / `ImageStore` / `Storage` 统一契约。 |
| `src/storage/local.ts` | 包装现有 `auth.ts` / `drafts.ts` / `imageStore.ts`，保留浏览器本地数据与兼容逻辑。 |
| `src/storage/remote.ts` | 封装 fetch、JWT、条件认证失效、草稿归一化、图片上传与 `/api/images/retain`；远程图片返回真实 URL。 |
| `src/storage/index.ts` | 模块加载时读取 `VITE_API_BASE`，只在这里选择 LocalStore 或 RemoteStore。 |

设计上刻意让**接口形状一致**，两套实现对 UI 基本无感。`AuthStore.onInvalidated` 在 LocalStore 中是空订阅，在 RemoteStore 中只对符合条件的受保护请求 401 发出通知；显式退出和较新的注册/登录请求还会使较早的成功响应失效，避免迟到响应恢复或覆盖会话。`ImageStore.retain` 在 LocalStore 中立即成功；RemoteStore 过滤空值、Data URL、`img:` 和外部 origin，把同源根路径候选交给服务端，由服务端按实际 `UPLOADS_PUBLIC_PATH` 判定托管图片，因此自定义 `/media/...` 前缀也不会被客户端静默漏掉。模式切换只改变之后的读写目标，**不会自动迁移**已有 localStorage 账号、草稿或图片；需要迁移时必须提供显式导入流程。

RemoteStore 的草稿 `list` 与 `save` 都经过 `normalizeDraftForRead`：列表顶层不是数组时明确失败，数组内坏项丢弃，legacy Markdown 与 freeform v1/v2 使用和 LocalStore 一致的迁移；保存输入在任何续租、上传或 POST 前先校验，单项保存响应无效时也拒绝交给工作区。保存自由编辑草稿时，先续租输入文档已有的托管 URL，再把历史 `data:image/...` 克隆、上传并替换为服务器 URL，随后续租转换后的完整 URL 集合，最后才 POST 草稿。任一续租或上传失败都不会提交草稿；映射只在单次保存内去重，提交失败后下次保存会重新上传，输入文档保持不变。

Markdown 粘贴图片、自由编辑普通图片和形状图片填充都统一执行“读取 → 前端降采样 → `store.images.put()`”，渲染时再由 `store.images.resolve()` 解析本地 `img:` 引用或远程 URL。LocalStore 保存自由编辑草稿时只克隆并物化待保存副本，不把活动文档膨胀成 Base64；RemoteStore 会把历史 Data URL 上传并替换为服务器 URL，服务器草稿不会继续积累 Base64。

两个工作区都从活动文档收集图片源并使用 `useImageLease` 续租。后台续租失败会在 30 秒后保留唯一自动重试；删除草稿和上传新图片前会显式等待安全续租，失败时中止危险操作并显示 `OperationNotice`。草稿列表、保存、删除、图片上传和认证检查都捕获错误并保留上一次成功状态；`AuthStore.onInvalidated` 让受保护请求的有效 401 立即同步到登录 UI。同一工作区的保存请求采用单飞门禁，保存期间按钮禁用，避免旧请求迟到后覆盖较新的文档；Markdown 的“已保存”状态按完整草稿文档修订判断，正文、平台、主题、字体、个人资料或圆角任一变化都会立即清除标记。

---

## 6. 部署(Docker,推荐)

发布镜像把前端构建产物和 Fastify 服务放进同一个非 root Node 容器。Compose 只启动 `app`，并继续使用原有两个命名卷。

### 6.1 拓扑

```
                    宿主机(域名与 HTTPS)
┌──────────────────────────────────────────────────────┐
│  外层反代 / 云负载均衡 → 127.0.0.1:8080              │
│                                                      │
│  app 容器 (Fastify :3000)                            │
│   ├── /            SPA 前端                           │
│   ├── /api/*       认证、草稿和图片接口               │
│   └── /uploads/*   上传图片                           │
│                                                      │
│  db 卷       → /data                                 │
│  uploads 卷  → /data/uploads                         │
└──────────────────────────────────────────────────────┘
```

浏览器通过同一入口访问前端、API 和图片。`WEB_PORT` 在正式环境绑定 `127.0.0.1:8080`，由宿主机 Caddy、Nginx 或云负载均衡终结 HTTPS。

### 6.2 相关文件

| 文件 | 作用 |
|---|---|
| `docker-compose.yml` | 编排 `app` 与 `db`、`uploads` 两个命名卷。 |
| `Dockerfile` | 构建前端和服务端依赖，生成单个非 root Node 镜像。 |
| `.env.example` / `server/.env.example` | Compose 与直跑后端的环境变量模板。 |
| `deploy/compose-smoke.sh` | 构建单镜像，验证旧 `server/web` 数据迁移、页面、API、上传和静态资源后清理。 |

### 6.3 环境变量

复制模板、生成密钥、绑定域名和配置 HTTPS 的实际操作见[Docker 部署与维护](deployment.md)。

| 键 | 说明 | 默认 |
|---|---|---|
| `DINGCARD_VERSION` | GHCR 发布镜像版本 | 0.11.0 |
| `JWT_SECRET` | **必填**,JWT 签名密钥,强随机 | 无(缺失则拒绝启动) |
| `WEB_PORT` | 宿主机到 `app:3000` 的端口映射 | 8080 |
| `JWT_EXPIRY` | 登录有效期 | 7d |
| `RATE_LIMIT_MAX` | 全局每分钟请求上限(正整数) | 300 |
| `AUTH_RATE_LIMIT_MAX` | 注册、登录与 `/me` 每分钟请求上限(正整数) | 20 |
| `USER_QUOTA_BYTES` | 每用户图片配额 | 500MB |
| `IMAGE_LEASE_MS` | 新上传/续租图片的租约时长(毫秒) | 86400000(24 小时) |
| `MAX_UPLOAD_BYTES` | Fastify 接收的单图上限 | 6MB |

### 6.4 部署边界

首次部署、端口绑定、HTTPS、备份恢复、升级和卸载步骤统一见[Docker 部署与维护](deployment.md)。生产默认拉取固定版本镜像；源码构建有单独入口。`db` 与 `uploads` 两个命名卷必须一起备份。

### 6.5 自动化验证入口

| 命令 | 覆盖范围 |
|---|---|
| `npm run test:server` | SQLite 迁移、图片引用/租约/GC、用户级资源锁和后端路由单元/集成测试。 |
| `node server/smoke-test.mjs` | 直连 Fastify 的认证、跨用户草稿隔离、图片上传/retain/配额/回收及静态图片路径。 |
| `npm run test:integration` | 真实 Fastify 后端 + RemoteStore 前端，包括 v3 嵌套草稿、隐藏图片租约/GC、延迟保存权威门、认证失效和可恢复错误 UI。 |
| `npm run test:acceptance` | 自由编辑布局、可访问控件、嵌套图层保存/重载和 5000 ms 导出预算。 |
| `npm run test:e2e` | 默认 LocalStore、离线字体和自由编辑导出等浏览器回归。 |
| `$env:JWT_SECRET='compose-validation-secret'; docker compose config` | 展开并校验 Compose 配置，确认环境变量进入 `app`。 |
| `deploy/compose-smoke.sh` | 验证旧双服务停机后命名卷仍可由单个 `app` 读取，并检查首页、`/api`、上传和构建资源。 |

真实后端集成测试与用户预览端口隔离：后端固定使用 `5310`，前端固定使用 `5273`，二者统一从 `e2e-integration/ports.ts` 读取。该配置为每次运行创建临时数据目录，并仅在集成环境把 `IMAGE_LEASE_MS` 缩短为 `500`；生产默认值和常用的 `3100`/`5174` 本地服务不会被复用或停止。

### 6.6 资源占用

单个 Node 镜像同时包含 Fastify、服务端依赖和前端静态产物。目标机器仍按 2 核、2GB 内存规划，实际容量以目标主机 smoke 和监控数据为准。

不用 Docker 时，可在宿主机运行 `node server/src/index.js`，用 `server/.env.example` 配置环境变量，再由 systemd 守护。宿主机反向代理仍负责 HTTPS。

---

## 7. 安全清单(上生产前必须)

- [x] 密码 **bcrypt/argon2**,弃用 SHA-256
- [x] `JWT_SECRET` 走环境变量且生产环境非空,不进 git
- [ ] `JWT_SECRET` 使用足够随机的生产密钥(部署环境核验)
- [x] 所有草稿/图片查询强制 `WHERE user_id = <来自 JWT>`,不信前端
- [x] 上传校验:大小上限、MIME 白名单、随机文件名(防路径穿越)
- [ ] 全站 HTTPS(Let's Encrypt)
- [x] 注册加基础限流(防刷号),可用 `@fastify/rate-limit`
- [ ] `data.db` 权限 600,`uploads/` 不允许执行
- [ ] CORS:同域部署可不开;若前后端分离域名则精确白名单

这里的 `[x]` 只表示仓库同时具备**实现/配置证据**和**自动化测试/冒烟证据**，不代表目标主机已经完成部署审计：

| 已完成项 | 实现/配置证据 | 自动化测试/冒烟证据 |
|---|---|---|
| bcrypt 密码存储 | `server/src/routes/auth.js` | `server/smoke-test.mjs` 检查数据库 bcrypt hash、登录和错误密码。 |
| 生产 JWT 环境变量与非空校验 | `server/src/config.js`、根 `.env.example`、`server/.env.example` | `server/src/config.test.mjs` 验证生产空密钥拒绝启动；`server/smoke-test.mjs` 使用生产配置启动。 |
| 草稿/图片所有权 | `server/src/db.js`、`server/src/routes/drafts.js`、`server/src/routes/images.js` | `server/smoke-test.mjs` 覆盖跨用户草稿与图片隔离；`server/src/routes/assetLock.integration.test.mjs` 覆盖 retain 原子所有权校验。 |
| 上传校验 | `server/src/routes/images.js` | `server/smoke-test.mjs` 覆盖单文件 413、MIME 415、UUID 文件名和并发配额。 |
| 认证限流 | `server/src/index.js`、`server/src/config.js` | `server/smoke-test.mjs` 以固定上限验证注册路由返回 429。 |

JWT 密钥随机强度、HTTPS、宿主机文件权限必须在真实部署环境验收。CORS 已有条件启用实现，但尚无直接覆盖启用/禁用行为的自动化测试，因此仍保持未完成。

---

## 8. 备份

- **数据**:定时 `sqlite3 data.db ".backup backup.db"`(热备份,不锁库),配合 `uploads/` 目录一起打包
- **异地**:定期把备份包同步到国内对象存储(便宜、异地容灾)
- 频率:个人项目每日一次足够;crontab 一行搞定

---

## 9. 邮件(账号验证与找回)

> ⚠️ 可选、后置能力。纯 username + password 能先跑起来;等真有"找回密码"需求再接。

### 9.1 绝不自建 SMTP

国内环境自建发信基本发不出去:
- 云厂商默认**封 25 端口出站**,个人几乎申请不到解封
- 新 VPS 的 IP **没有发信信誉**,即便发出也进垃圾箱或被拒收
- Gmail / QQ / 163 反垃圾门槛极高

结论:用**事务邮件服务的 HTTP API**(走 443,不碰 25 端口),信誉与合规由服务商负责。

### 9.2 选服务

你已备案、服务器在国内,**优先国内服务商**(到 QQ/163/126 到达率最好):

| 服务 | 说明 |
|---|---|
| **阿里云邮件推送(DirectMail)** | 国内首选,便宜,到国内邮箱稳 |
| 腾讯云 SES | 同上,贴腾讯云生态 |
| Resend / SendGrid / Mailgun | 国外服务,API 好用;从国内调偶尔慢,到国内邮箱到达率略逊 |

### 9.3 DNS 配置(不进垃圾箱的关键)

注册一个发信子域名(如 `mail.your-domain.com`),在 DNS 配三条记录:
- **SPF** — 声明哪些服务器可以以你的域名发信
- **DKIM** — 邮件签名,服务商会给你一段公钥记录
- **DMARC** — 告诉收件方对未通过校验的邮件怎么处理

具体记录值由所选服务商控制台生成,照抄即可。

### 9.4 数据库:临时 token 表

```sql
CREATE TABLE email_tokens (
  token      TEXT PRIMARY KEY,     -- 随机串(crypto.randomBytes)
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL,        -- 'verify' | 'reset'
  expires_at INTEGER NOT NULL,     -- 过期时间,如 30 分钟后
  used       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_email_tokens_user ON email_tokens(user_id);
```

`users` 表相应加两列(接邮件时才加):
```sql
ALTER TABLE users ADD COLUMN email          TEXT UNIQUE COLLATE NOCASE;
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
```

### 9.5 API

```
POST /api/auth/send-verify     { }                    → { ok }   (给当前用户邮箱发验证链接)
GET  /api/auth/verify          ?token=xxx             → 标记 email_verified=1
POST /api/auth/forgot          { email }              → { ok }   (发重置链接,邮箱不存在也返回 ok,防枚举)
POST /api/auth/reset           { token, password }    → { ok }   (校验 token → 改密码 → 作废 token)
```

流程:
1. 生成随机 token 写入 `email_tokens`(带 `purpose` 和过期时间)
2. 调邮件 API 发一封含 `https://域名/verify?token=xxx`(或 6 位验证码)的信
3. 用户点链接 → 后端校验:token 存在、未过期、`used=0` → 执行动作 → 置 `used=1`

链接 vs 验证码:链接对桌面友好,验证码对手机友好,二选一即可。

### 9.6 安全

- **发信限流**:同一邮箱/同一 IP 60 秒内只能发一次,防被当轰炸机(`@fastify/rate-limit`)
- **token 一次性 + 短过期**:用完即作废,30 分钟过期
- **防用户枚举**:`forgot` 接口无论邮箱是否存在都返回成功
- **API Key** 走环境变量,不进 git

### 9.7 需不需要做?分级

- **不做邮箱**:纯账密,忘密码找站长手动重置。个人项目最省事
- **只做找回密码**:邮件的真正刚需场景,建议到这步再引入
- **强制注册验证**:除非担心刷号,否则增加注册流失,一般不必

建议:**先纯账密上线**,有找回密码需求了再接阿里云邮件推送 —— 那时加一张表 + 几个 API 即可,不用重构。

---

## 10. 后端可选部署(开源友好)

项目开源后,后端必须是**可选的**:大多数 clone 项目的人只想本地跑起来,不该被迫搭服务器 + 数据库。做法是让前端**同时支持两套存储实现**,用一个环境变量切换。

### 10.1 两种模式

| 模式 | 触发条件 | 存储 | 能力 |
|---|---|---|---|
| **本地模式(默认)** | 未配 `VITE_API_BASE` | localStorage(现有实现) | 开箱即用,零部署,不注册也能用;不跨设备 |
| **服务器模式** | 配了 `VITE_API_BASE` | 你的后端(SQLite + 磁盘) | 真账号、多设备同步、图片存服务器 |

别人 `git clone` 后 `npm run build` 直接得到本地模式,不需要 Node 后端、不需要 SQLite、不需要登录。想要同步的人,自部署一套后端并配上地址即可。

### 10.2 技术实现:存储适配层

给三个存储模块各定义一个接口,提供 Local / Remote 两个实现,启动时按开关选一个:

```
src/storage/
  ├── types.ts          # AuthStore / DraftStore / ImageStore 接口
  ├── local.ts          # 包装现有 auth.ts/drafts.ts/imageStore.ts
  ├── remote.ts         # fetch 后端、JWT、草稿与图片上传
  └── index.ts          # 按 VITE_API_BASE 选择 LocalStore / RemoteStore
```

```ts
// index.ts —— 唯一的开关
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').trim()
export const store = API_BASE ? createRemoteStore(API_BASE) : createLocalStore()
```

UI 层只 import `store`,对两种模式无感。这正是之前"抽 StorageAdapter"那一步 —— 开源场景下它从"可选优化"变成**刚需**,因为它就是"后端可选"的实现载体。

### 10.3 模式边界与迁移

当前 LocalStore 保留 localStorage 版账号与多用户命名空间；RemoteStore 使用后端真账号和 JWT。两者是独立数据源，设置或清空 `VITE_API_BASE` **不会自动迁移** localStorage 中的账号、草稿或图片，也不会静默覆盖服务器数据。需要转移数据时应提供用户显式触发、可核对结果的导入流程。

### 10.4 开源前检查清单

- [x] **密钥不进仓库**:`JWT_SECRET`、邮件 API Key 等全走环境变量;提供 `server/.env.example` 模板(只有键名,无值)
- [ ] **`.superpowers/`**:确认目录内无不宜公开内容(设计稿注明"不属于产品源代码"),按需加进 `.gitignore` 或清理
- [x] **LICENSE**:采用 MIT License，Copyright (c) 2026 lottshin
- [x] **README**:说明两种模式;本地模式一键跑,服务器模式指向部署文档(本文)
- [x] **示例配置**:根 `.env.example` 写明 `VITE_API_BASE`（留空 = 本地模式）；Docker Compose 构建仍固定使用同源 `/`。

---

## 11. 分阶段落地建议

进度标记:✅ 已完成 / ⏭️ 待做

1. ✅ **搭后端骨架** — Fastify + SQLite + 三张表 + 认证 + 草稿 API + 图片上传、租约/GC 与 retain；单元/集成测试和后端冒烟均通过
2. ✅ **草稿改通用信封** — 适配 markdown-card + freeform-slide 双模式
3. ✅ **前端抽存储适配层** — `src/storage/` 三接口 + Local/Remote 双实现 + 环境变量开关；含条件 401、草稿归一化、统一图片上传、保存期 retain 与活动文档续租(见第 10 章)
4. ✅ **前端接后端联调** — `current()` 转异步；认证失效、草稿/图片错误提示和端到端联调测试（真后端 + 远程前端）均已接入
5. ✅ **Docker 全栈容器化 + 部署文档** — 一条 `docker compose up` 起全套（见第 6 章），并提供 Compose 配置检查与全链路烟测入口
6. ⏭️ **(可选,后置)接邮件** — 阿里云邮件推送 + `email_tokens` 表 + 找回密码 API(见第 9 章)

第 1-5 步的实现与自动化入口已完成；本地模式和真实 Fastify 远程模式由仓库测试覆盖，CI 会运行 `deploy/compose-smoke.sh` 验证旧双服务到单容器的迁移，目标环境上线前也应再运行一次。第 6 步邮件等真有找回密码需求了再做。

> 本次加固不会自动上传或迁移已有 localStorage 账号、草稿和图片。未来若提供迁移能力，必须是用户显式触发、可预览并可核对结果的独立导入流程。


