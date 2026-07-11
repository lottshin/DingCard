# 叮卡 · 后端接入方案

把当前"纯浏览器存储"改造成真实后端,实现跨设备同步与真实账号。

- **技术栈**:Node + Fastify + SQLite(better-sqlite3)
- **认证**:bcrypt 存密码 + JWT
- **目标机器**:2c2g / 100Mbps 峰值 / 国内 / 已备案
- **图片**:本机磁盘 + Nginx 直出(不上 CF)

本文只描述方案,不含实际改动。确认后再动代码。

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

-- 草稿(正文 + 配置,一行一份)
CREATE TABLE drafts (
  id          TEXT PRIMARY KEY,        -- uuid
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  source      TEXT NOT NULL,           -- markdown 正文
  platform_id TEXT NOT NULL,
  theme_id    TEXT NOT NULL,
  font_family TEXT NOT NULL,
  profile     TEXT NOT NULL,           -- Profile 对象,存 JSON 字符串
  updated_at  INTEGER NOT NULL
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
- `profile` 直接存 JSON 字符串,字段变动不用改表结构。
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
POST   /api/drafts            { ...draft }  → Draft   (无 id 则新建)
PUT    /api/drafts/:id        { ...draft }  → Draft   (覆盖)
DELETE /api/drafts/:id        → { ok: true }
```
- 每个查询都带 `WHERE user_id = ?`,从 JWT 取 userId,**不信任前端传的 user_id**。

### 图片
```
POST /api/images   (multipart/form-data, 字段 file)  → { ref: "img:<id>", url: "/uploads/<id>.jpg" }
```
- 服务端限制:大小上限(如 5MB)、MIME 白名单(png/jpeg/webp)、随机文件名(不用原始名,防路径穿越)。
- **降采样仍在前端做**(现有 `downscaleDataUrl` 保留),上传前就压到 1200px,省带宽和磁盘。
- 图片按 `/uploads/<id>.jpg` 存盘,`url` 直接可作 `<img src>`,由 Nginx 直出。

---

## 5. 前端改动(最小面)

只动存储层,UI/编辑器/分页/导出全都不碰。

| 文件 | 改动 |
|---|---|
| `src/auth.ts` | 内部实现从 localStorage 换成 `fetch('/api/auth/...')`;导出的 `register/login/logout/current` 签名不变。`current()` 现在需异步(读 `/me`),这一处调用方要跟着改 await。 |
| `src/drafts.ts` | `listDrafts/saveDraft/deleteDraft` 换成调 `/api/drafts`。返回类型 `Draft` 不变。 |
| `src/imageStore.ts` | `putImage` 改为:先 `downscaleDataUrl` → `POST /api/images` → 返回 `img:<id>` ref;`resolveImage` 直接返回 `/uploads/<id>.jpg`(不再从 sessionStorage 取 base64)。草稿不再内嵌 base64 图片。 |
| 新增 `src/api.ts` | 封装 fetch:自动带 JWT 头、统一错误处理、base URL。token 存 localStorage。 |

设计上刻意让**接口形状不变**,所以 `App.tsx` 里除了 `current()` 从同步变异步这一处,几乎无感。

### 一个建议的中间步骤(可选)
先把 `auth.ts`/`drafts.ts`/`imageStore.ts` 抽象成一个 `StorageAdapter` 接口,保留现在的 localStorage 实现作为 `LocalAdapter`,后端好了再加 `RemoteAdapter`。好处:后端开发期间前端仍可跑,切换只改一行 `const storage = new RemoteAdapter()`。

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

## 10. 分阶段落地建议

1. **抽存储适配层**(前端,不接后端)— 风险最低,先让代码结构就位
2. **搭后端骨架** — Fastify + SQLite + 三张表 + 认证 + 草稿 API
3. **接图片上传** — 前端 `imageStore` 改造 + `/api/images`
4. **前端切到 RemoteAdapter** — 联调
5. **部署** — Nginx + systemd + HTTPS + 备份 crontab
6. **(可选,后置)接邮件** — 阿里云邮件推送 + `email_tokens` 表 + 找回密码 API(见第 9 章)

每步都能独立验证。前 5 步先把产品跑起来,第 6 步等真有找回密码需求了再做。确认方案后,告诉我从哪一步开始。


