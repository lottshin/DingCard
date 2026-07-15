# 叮卡 · 后端接入方案

把当前"纯浏览器存储"改造成真实后端,实现跨设备同步与真实账号。

- **技术栈**:Node + Fastify + SQLite(better-sqlite3)
- **认证**:bcrypt 存密码 + JWT
- **目标机器**:2c2g / 100Mbps 峰值 / 国内 / 已备案
- **图片**:本机磁盘 + Nginx 直出(不上 CF)
- **部署形态**:后端可选 —— 默认纯本地(零部署),配了后端地址才走服务器(见第 10 章)

> 进度:后端已实现并通过冒烟测试(`server/`,认证 + 草稿双模式 + 图片上传)。
> 前端接后端(双实现开关)与部署尚未开始。本文与代码保持同步。

---

## 1. 现状回顾

所有数据都在浏览器,换设备/清缓存即丢失:

| 数据 | 现在存哪 | 相关文件 |
|---|---|---|
| 账号/密码/登录态 | `localStorage`,SHA-256(非加盐) | `src/auth.ts` |
| 草稿 | `localStorage`,按 userId 分区 | `src/drafts.ts` |
| 草稿内图片 | base64 内嵌进草稿 JSON | `src/drafts.ts` + `src/imageStore.ts` |
| 会话图片缓存 | `sessionStorage` | `src/imageStore.ts` |

好在 `auth.ts` / `drafts.ts` 的接口本就设计成异步 API 形状,替换实现时 UI 代码几乎不动。

---

## 2. 架构总览

```
                    你的服务器 (2c2g, 已备案域名)
┌──────────────────────────────────────────────────────┐
│  Nginx  (:443, HTTPS, Let's Encrypt)                   │
│   ├── /            → 前端静态文件 (dist/)               │
│   ├── /api/*       → 反代 127.0.0.1:3000 (Node)         │
│   └── /uploads/*   → 磁盘图片,Nginx 直出(不经 Node)   │
│                                                        │
│  Node + Fastify  (127.0.0.1:3000, systemd 守护)        │
│   ├── 认证:bcrypt + JWT                                │
│   ├── 草稿:SQLite 读写                                 │
│   └── 图片:接收上传 → 写 /var/dinka/uploads → 存路径   │
│                                                        │
│  SQLite 单文件  /var/dinka/data.db                     │
│  图片目录       /var/dinka/uploads/                    │
└──────────────────────────────────────────────────────┘
```

关键取舍:
- **图片走 Nginx 直出,不进数据库、不进 Node**。SQLite 存二进制会撑爆库、拖垮备份;Node 转发静态文件是浪费。
- **100M 带宽足够**:单图 100–300KB,一个卡片集 ~1MB,首屏 ~0.1s,浏览器还会缓存回访。
- 真到带宽瓶颈,只需把 `/uploads` 迁到国内 OSS+CDN,改图片 URL 前缀即可,其余不动。

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
-- 后端是「哑存储」:不解析 document 内部结构,整坨当 JSON 存、原样取回。
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
  id          TEXT PRIMARY KEY,        -- 即 img:<id> 里的 id
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,           -- /uploads/<id>.jpg,前端直接当 src
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_images_user ON images(user_id);
```

要点:
- **图片二进制永不进库**,只存 `path`。备份时 copy `data.db` + `uploads/` 目录两样东西即可。
- **草稿 `document` 存不透明 JSON 字符串**,后端不解析其内部。markdown 和 freeform 两种模式共用同一张表,以后加新工作区模式也不用改表结构。
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

### 草稿
```
GET    /api/drafts            → Draft[]           (只返回当前用户的,按 updated_at 倒序)
GET    /api/drafts/:id        → Draft
POST   /api/drafts            { ...envelope }  → Draft   (upsert:带 id 覆盖,无 id 新建)
DELETE /api/drafts/:id        → { ok: true }
```
- 请求体是完整信封 `{ id?, title?, schemaVersion, mode, document }`。`mode` 只接受 `markdown-card` / `freeform-slide`,其余返回 400。
- `title` 缺省时后端派生:markdown 取正文首行、freeform 取首页名。
- `document` 原样存取,后端不解析内部结构。
- 每个查询都带 `WHERE user_id = ?`,从 JWT 取 userId,**不信任前端传的 user_id**。

### 图片
```
POST /api/images   (multipart/form-data, 字段 file)  → { ref: "img:<id>", url: "/uploads/<id>.jpg" }
```
- 服务端限制:大小上限(如 5MB)、MIME 白名单(png/jpeg/webp)、随机文件名(不用原始名,防路径穿越)。
- **降采样仍在前端做**(现有 `downscaleDataUrl` 保留),上传前就压到 1200px,省带宽和磁盘。
- 图片按 `/uploads/<id>.jpg` 存盘,`url` 直接可作 `<img src>`,由 Nginx 直出。

---

## 5. 前端改动(双实现 + 后端可选)

因为项目要开源(见 §11),前端**不能硬编码成必须连后端**。做法:每个存储模块内部维护"本地 / 远程"两套实现,由一个开关选择,UI 层无感。

**开关**:读环境变量 `VITE_API_BASE`。
- 未配置 → `LocalAdapter`(现有 localStorage 实现,零部署、开箱即用,开源默认)
- 配置了 → `RemoteAdapter`(fetch 后端,多设备同步 + 真账号)

| 文件 | 改动 |
|---|---|
| 新增 `src/api.ts` | 封装 fetch:base URL 读 `VITE_API_BASE`、自动带 JWT 头、统一错误处理。token 存 localStorage。导出 `hasBackend()` 供各模块判断走哪套实现。 |
| `src/auth.ts` | 保留现有 localStorage 实现作为本地分支;新增远程分支调 `/api/auth/*`。导出的 `register/login/logout/current` 签名尽量不变。`current()` 远程分支需异步(读 `/me`),调用方跟着改 await。 |
| `src/drafts.ts` | `listDrafts/saveDraft/deleteDraft` 增加远程分支调 `/api/drafts`。返回类型 `Draft`(信封)两套实现一致,不变。 |
| `src/imageStore.ts` | 远程分支:`putImage` 先 `downscaleDataUrl` → `POST /api/images` → 返回 `img:<id>` ref;`resolveImage` 返回后端 `url`。本地分支保持现有 sessionStorage + base64 内嵌行为。 |

设计上刻意让**接口形状不变**,两套实现对 UI 完全一致,`App.tsx` 里除 `current()` 变异步这一处几乎无感。

> freeform 目前把图片 base64 内嵌进 `element.src`。远程模式下应改成走 `/api/images` 上传、element 只存 URL;本地模式维持内嵌。这是前端改造的活,后端不变。

---

## 6. 部署

### 目录约定
```
/var/dinka/
  ├── data.db          # SQLite 库
  ├── uploads/         # 图片
  ├── server/          # 后端代码 + node_modules
  └── web/             # 前端 dist(npm run build 产物)
```

### Nginx(核心片段)
```nginx
server {
  listen 443 ssl http2;
  server_name your-domain.com;        # 已备案域名

  ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

  # 前端
  root /var/dinka/web;
  location / { try_files $uri /index.html; }

  # 图片:Nginx 直出,长缓存
  location /uploads/ {
    alias /var/dinka/uploads/;
    expires 30d;
    add_header Cache-Control "public, immutable";
  }

  # API:反代到 Node
  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    client_max_body_size 6m;          # 允许图片上传
  }
}
```
80 端口用 Certbot 自动跳 443 + 续证书。

### 进程守护(systemd)
一个 `dinka.service` 跑 `node server/index.js`,`Restart=always`,`EnvironmentFile` 里放 `JWT_SECRET`、`DB_PATH` 等。开机自启、崩溃自拉。

### 资源占用(2c2g 完全够)
- Node + Fastify 常驻内存 ~60–120MB
- SQLite 几乎不占额外内存
- Nginx ~20MB
- 剩下的内存给系统缓存,轻松有余

---

## 7. 安全清单(上生产前必须)

- [ ] 密码 **bcrypt/argon2**,弃用 SHA-256
- [ ] `JWT_SECRET` 走环境变量,足够随机,不进 git
- [ ] 所有草稿/图片查询强制 `WHERE user_id = <来自 JWT>`,不信前端
- [ ] 上传校验:大小上限、MIME 白名单、随机文件名(防路径穿越)
- [ ] 全站 HTTPS(Let's Encrypt)
- [ ] 注册加基础限流(防刷号),可用 `@fastify/rate-limit`
- [ ] `data.db` 权限 600,`uploads/` 不允许执行
- [ ] CORS:同域部署可不开;若前后端分离域名则精确白名单

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
  ├── local.ts          # localStorage 实现(现有 auth.ts/drafts.ts/imageStore.ts 逻辑搬进来)
  ├── remote.ts         # fetch 后端实现
  └── index.ts          # const store = API_BASE ? remote : local
```

```ts
// index.ts —— 唯一的开关
const API_BASE = import.meta.env.VITE_API_BASE ?? ''
export const store = API_BASE ? createRemoteStore(API_BASE) : createLocalStore()
```

UI 层只 import `store`,对两种模式无感。这正是之前"抽 StorageAdapter"那一步 —— 开源场景下它从"可选优化"变成**刚需**,因为它就是"后端可选"的实现载体。

### 10.3 注意:本地模式没有"登录"

本地模式下没有真账号。两种处理:
- **A(简单)**:本地模式隐藏登录入口,草稿存在一个固定的本地命名空间下。
- **B(一致)**:保留现有 localStorage 版"假登录"(多用户命名空间),行为和现在一样。

建议 A —— 开源用户本地自用,登录是多余步骤;服务器模式才显示登录。

### 10.4 开源前检查清单

- [ ] **密钥不进仓库**:`JWT_SECRET`、邮件 API Key 等全走环境变量;提供 `server/.env.example` 模板(只有键名,无值)
- [ ] **`.superpowers/`**:确认目录内无不宜公开内容(设计稿注明"不属于产品源代码"),按需加进 `.gitignore` 或清理
- [ ] **LICENSE**:选协议(个人项目 MIT 最省心)
- [ ] **README**:说明两种模式;本地模式一键跑,服务器模式指向部署文档(本文)
- [ ] **示例配置**:前端 `.env.example` 写明 `VITE_API_BASE`(留空 = 本地模式)

---

## 11. 分阶段落地建议

进度标记:✅ 已完成 / ⏭️ 待做

1. ✅ **搭后端骨架** — Fastify + SQLite + 三张表 + 认证 + 草稿 API + 图片上传(冒烟测试 15 项通过)
2. ✅ **草稿改通用信封** — 适配 markdown-card + freeform-slide 双模式
3. ⏭️ **前端抽存储适配层** — `src/storage/` 三接口 + Local/Remote 双实现 + 环境变量开关(见第 10 章)
4. ⏭️ **前端接后端联调** — 图片改走 `/api/images`,`current()` 转异步
5. ⏭️ **部署** — Nginx + systemd + HTTPS + 备份 crontab
6. ⏭️ **(可选,后置)接邮件** — 阿里云邮件推送 + `email_tokens` 表 + 找回密码 API(见第 9 章)

每步都能独立验证。第 3 步是开源"后端可选"的关键,做完本地模式即完备;第 4-5 步让服务器模式跑通;第 6 步等真有找回密码需求了再做。


