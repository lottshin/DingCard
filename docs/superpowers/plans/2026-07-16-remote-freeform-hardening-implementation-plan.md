# 远程自由编辑接入加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持默认本地模式可离线使用的前提下，修复跨用户草稿覆盖、自由编辑图片绕过存储层、远程认证/错误失真和图片生命周期不可回收问题，并让真实后端联调在无外网字体环境中稳定通过。

**Architecture:** 后端把草稿写操作和图片生命周期操作放入用户级串行临界区，图片由已保存草稿引用和可续期租约共同保护；前端统一通过 `Storage` 适配层插入、解析、续租和持久化图片。LocalStore 在保存副本中物化 `img:`，RemoteStore 上传历史 Data URL、归一化所有草稿响应，并通过 token 条件失效与订阅同步认证状态。

**Tech Stack:** React 18、TypeScript、Vitest、Playwright、Fastify 4、better-sqlite3、Node.js 20 内置 test runner、Docker Compose。

---

## 文件边界

- `server/src/dbMigrations.js`：只负责可重复执行的 SQLite schema 升级。
- `server/src/imageRefs.js`：只负责从任意 JSON/URL 中规范化并收集本站上传路径。
- `server/src/userAssetLock.js`：只负责按用户串行执行异步资产变更。
- `server/src/imageGc.js`：只负责根据草稿引用、租约和文件/DB 结果回收图片。
- `server/src/imagePersistence.js`：只负责“写文件 → 插入记录”及失败补偿。
- `src/freeform/imageAssets.ts`：自由编辑文档图片源的收集、物化和远程 Data URL 上传转换。
- `src/storage/*`：本地/远程存储契约、token 和 HTTP 错误，不承载 React UI。
- `src/workspaces/useImageLease.ts`：活动文档的后台租约续期；安全操作前仍由调用方显式 `await retain()`。
- `src/workspaces/OperationNotice.tsx`：认证、草稿和图片操作的统一非阻塞错误提示。

### Task 1: 草稿写入所有权与 HTTP 契约

**Files:**
- Modify: `server/smoke-test.mjs`
- Modify: `server/src/db.js`
- Modify: `server/src/routes/drafts.js`

- [ ] **Step 1: 先让冒烟入口与调用目录无关，再写跨用户与非法 ID 的失败测试**

`smoke-test.mjs` 当前用相对当前 shell 的 `src/index.js` 启动子进程；先改为以脚本自身目录作为 `cwd`，保证计划中从仓库根执行的命令真实可用：

```js
import { fileURLToPath } from 'node:url'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const server = spawn(process.execPath, ['src/index.js'], {
  cwd: serverDir,
  // existing options
})
```

在 Alice 保存草稿、Bob 注册后增加断言：

```js
const bobAuth = { authorization: `Bearer ${bob.token}` }

r = await fetch(`${base}/api/drafts`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...bobAuth },
  body: JSON.stringify({ ...mdEnvelope, id: mdDraft.id, title: 'Bob overwrite' }),
})
check('cross-user update -> 404', r.status === 404, r.status)

r = await fetch(`${base}/api/drafts/${mdDraft.id}`, { headers: auth })
body = await r.json()
check('cross-user update leaves owner draft unchanged', body.title === '改过的标题', body)

for (const invalidId of ['', '   ', 42, {}]) {
  r = await fetch(`${base}/api/drafts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ ...mdEnvelope, id: invalidId }),
  })
  check(`invalid draft id -> 400 (${JSON.stringify(invalidId)})`, r.status === 400, r.status)
}
```

另测 Bob 提交一个不存在但格式合法的 UUID 返回 404，且 Bob 列表仍为空。

- [ ] **Step 2: 运行冒烟测试确认 RED**

Run: `node server/smoke-test.mjs`

Expected: 跨用户更新当前返回 200 并覆盖 Alice；合法但不存在 ID 当前会新建；至少这些断言失败。

- [ ] **Step 3: 用独立 INSERT/UPDATE 替换全局 upsert**

在 `server/src/db.js` 定义：

```js
insertDraft: db.prepare(`INSERT INTO drafts (...) VALUES (...)`),
updateDraft: db.prepare(`
  UPDATE drafts
  SET title=@title, mode=@mode, schema_version=@schema_version,
      document=@document, updated_at=@updated_at
  WHERE id=@id AND user_id=@user_id
`),
```

在路由中严格区分：省略 `id` 才生成并插入；传入 `id` 必须是 trim 后非空字符串，并执行带用户条件的 UPDATE；`changes === 0` 返回 404。删除继续使用 `id + user_id` 且保持幂等成功。

- [ ] **Step 4: 验证 GREEN 和回归**

Run: `node server/smoke-test.mjs`

Expected: 全部通过，Alice 内容不变，Bob 没有凭指定 ID 新建草稿。

- [ ] **Step 5: 提交**

```text
git add server/src/db.js server/src/routes/drafts.js server/smoke-test.mjs
git commit -m "fix(server): scope draft updates to owner"
```

### Task 2: 图片生命周期纯模块与数据库迁移

**Files:**
- Create: `server/src/dbMigrations.js`
- Create: `server/src/dbMigrations.test.mjs`
- Create: `server/src/imageRefs.js`
- Create: `server/src/imageRefs.test.mjs`
- Create: `server/src/userAssetLock.js`
- Create: `server/src/userAssetLock.test.mjs`
- Create: `server/src/imageGc.js`
- Create: `server/src/imageGc.test.mjs`
- Create: `server/src/imagePersistence.js`
- Create: `server/src/imagePersistence.test.mjs`
- Modify: `server/package.json`
- Modify: `docs/backend-plan.md`

- [ ] **Step 1: 接入 Node 内置测试命令**

给 `server/package.json` 增加 `"test": "node --test"`。这一步只建立测试入口，不改变生产行为；同时在 `docs/backend-plan.md` 测试章节登记 `npm --prefix server test`，不留下未文档化脚本。

- [ ] **Step 2: 先写所有生命周期契约测试**

覆盖以下真实行为，不测试 mock 的调用次数替代结果：

```js
test('normalizes relative and absolute upload URLs to one pathname', () => {})
test('collects upload paths recursively from arbitrary JSON values', () => {})
test('serializes same-user tasks but allows different users to overlap', async () => {})
test('adds lease_expires_at to an old images table and backfills one full lease', () => {})
test('keeps saved references even after their lease expires', async () => {})
test('keeps unreferenced images while their lease is valid', async () => {})
test('deletes expired unreferenced images', async () => {})
test('aborts the whole GC pass when any draft JSON is corrupt', async () => {})
test('treats ENOENT as an already removed file and deletes the row', async () => {})
test('keeps the DB row when file deletion fails', async () => {})
test('leaves the row retryable when DB deletion fails after file removal', async () => {})
test('removes a newly written file when image row insertion fails', async () => {})
test('logs compensation unlink failure but rethrows the original insert error', async () => {})
```

迁移测试用 `new Database(':memory:')` 建旧版 `images` 表，插入旧记录，再调用 `ensureImageLeaseSchema(db, now, leaseMs)`，断言列存在、旧值等于 `now + leaseMs`，重复调用不改变已有未来租约。

- [ ] **Step 3: 运行测试确认 RED**

Run: `npm --prefix server test`

Expected: FAIL，因为五个模块尚不存在。

- [ ] **Step 4: 实现最小纯模块**

关键公开契约：

```js
export function ensureImageLeaseSchema(db, now, leaseMs) {}
export function normalizeManagedImagePath(value, uploadsPublicPath) {}
export function collectManagedImagePaths(value, uploadsPublicPath) {}
export function createUserAssetLock() { return { run(userId, task) {} } }
export async function reclaimExpiredImages(deps, userId, now) {}
export async function persistImageFile(deps, row, bytes) {}
```

`reclaimExpiredImages` 先解析该用户全部草稿；任一解析失败立即返回 `{ reclaimedBytes: 0, aborted: true }`。只对不在引用集合且 `lease_expires_at <= now` 的记录执行删除；非 ENOENT 文件错误保留行。`persistImageFile` 接收显式 `logger` 依赖；仅在写文件成功、插库失败时执行补偿 unlink。补偿成功或失败都重新抛出原始插库错误；补偿失败额外 `logger.error({ err: cleanupError, path }, 'failed to remove untracked upload')`，不能让 unlink 错误覆盖根因。

- [ ] **Step 5: 运行测试确认 GREEN**

Run: `npm --prefix server test`

Expected: 全部通过，无未处理 rejection。

- [ ] **Step 6: 提交**

```text
git add server/package.json server/src/dbMigrations* server/src/imageRefs* server/src/userAssetLock* server/src/imageGc* server/src/imagePersistence* docs/backend-plan.md
git commit -m "feat(server): add leased image lifecycle primitives"
```

### Task 3: 把租约、回收和并发配额接入真实后端

**Files:**
- Create: `server/src/routes/assetLock.integration.test.mjs`
- Modify: `server/src/config.js`
- Modify: `server/src/db.js`
- Modify: `server/src/index.js`
- Modify: `server/src/routes/drafts.js`
- Modify: `server/src/routes/images.js`
- Modify: `server/smoke-test.mjs`
- Modify: `.env.example`
- Modify: `server/.env.example`
- Modify: `docker-compose.yml`
- Modify: `docs/backend-plan.md`

- [ ] **Step 1: 扩展真实 HTTP 冒烟测试**

使用 Node `Blob`/`FormData` 上传一张小 PNG，并通过独立 SQLite 连接调整测试记录租约，覆盖：

- 上传响应 URL 可读取，记录带未来租约；
- `/api/images/retain` 对本人相对/绝对 URL 成功；外部 URL 忽略；任一本站未知或他人路径使整次请求 409；
- 已保存草稿中的绝对 URL 即使租约过期也不会被 GC；删除草稿后、租约过期才被回收；
- 两个同用户并发上传在只能容纳一张的配额下恰好一个成功、另一个 413；
- 不同用户仍可独立上传；
- 草稿删除触发回收，配额检查前也触发回收。

另用 Fastify `inject` 注册实际 drafts/images route，并向两个插件注入同一个可控 barrier lock 与假 statements：先让 draft POST 持锁，再并发调用 image retain；断言 retain 在释放前没有进入 DB，释放后才执行。这个测试必须在实现者误给两个 route 各建一把锁时稳定失败，不能只分别测试锁和单一路由。

- [ ] **Step 2: 运行测试确认 RED**

Run: `node server/smoke-test.mjs`

Expected: FAIL，retain 路由、租约列和回收尚未接线，并发上传可能共同越过配额。

- [ ] **Step 3: 接线数据库和配置**

`config.imageLeaseMs` 从 `IMAGE_LEASE_MS` 读取，非法/负数回退到 24 小时。`db.js` 启动时执行 `ensureImageLeaseSchema`；新增以下语义明确的 statements：用户草稿文档列表、用户图片列表、按用户/路径查询与续租、按用户/ID 删除图片。

同一任务同步 `.env.example`、`server/.env.example`、`docker-compose.yml` 和 `docs/backend-plan.md`：Compose 必须把 `${IMAGE_LEASE_MS:-86400000}` 传给 server；文档记录 retain 409、租约/GC 和新增 server test 命令，不能把配置/API 文档拖到后续任务。

- [ ] **Step 4: 接线用户级完整临界区**

`index.js` 创建唯一 `userAssetLock` 实例并作为插件 option 同时注入 drafts/images route；测试也通过同一注入点替换可控锁：

```text
POST draft:  lock -> insert/update -> unlock
DELETE draft: lock -> delete -> GC -> unlock
POST retain: lock -> validate all managed paths -> transaction renew -> unlock
POST image:  parse buffer -> lock -> GC -> quota -> write -> insert -> unlock
```

`retain` 的托管路径集合必须全部属于当前用户，否则返回 409 且一个都不更新。上传 route 的文件写入/插库使用 `persistImageFile`。配额错误保留 413，但文案说明租约未过期的图片不会立即释放。

- [ ] **Step 5: 让联调拓扑可读取上传文件**

Fastify 始终在 `UPLOADS_PUBLIC_PATH` 注册静态目录；生产 Nginx 仍优先直出该路径，Fastify 监听在内部地址，不改变公网拓扑。这使真实后端 Playwright 无需另起 Nginx 也能验证图片内容。

- [ ] **Step 6: 验证 GREEN**

Run: `npm --prefix server test`

Run: `node server/smoke-test.mjs`

Expected: 单元与 HTTP 冒烟全部通过。

- [ ] **Step 7: 提交**

```text
git add server/src/config.js server/src/db.js server/src/index.js server/src/routes/drafts.js server/src/routes/images.js server/src/routes/assetLock.integration.test.mjs server/smoke-test.mjs .env.example server/.env.example docker-compose.yml docs/backend-plan.md
git commit -m "feat(server): enforce leased image cleanup and quota"
```

### Task 4: 自由编辑图片转换与 LocalStore 原子持久化

**Files:**
- Create: `src/freeform/imageAssets.ts`
- Create: `src/freeform/__tests__/imageAssets.test.ts`
- Create: `src/storage/local.test.ts`
- Modify: `src/storage/local.ts`

- [ ] **Step 1: 写纯转换和 LocalStore 失败原子性测试**

构造同时含普通图片与形状图片填充的两页文档，覆盖：

```ts
it('collects and deduplicates image element and shape fill sources', () => {})
it('materializes local img refs in a clone without mutating the source document', () => {})
it('leaves data, relative, absolute and external URLs unchanged', () => {})
it('throws when any local img ref cannot resolve', () => {})
it('does not overwrite an existing local draft when materialization fails', async () => {})
it('uploads duplicate inline data URLs once per remote preparation', async () => {})
it('rejects img refs during remote preparation', async () => {})
```

最后一组先定义 Task 5 将使用的异步 API，但实现仍放在本任务的纯模块中。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm run test:unit -- src/freeform/__tests__/imageAssets.test.ts src/storage/local.test.ts`

Expected: FAIL，模块和本地物化行为尚不存在。

- [ ] **Step 3: 实现图片源转换 API**

```ts
export function collectFreeformImageSources(document: FreeformDocument): string[]
export function materializeLocalFreeformImages(
  document: FreeformDocument,
  images: Pick<ImageStore, 'isRef' | 'resolve'>,
): FreeformDocument
export async function uploadInlineFreeformImages(
  document: FreeformDocument,
  upload: (dataUrl: string) => Promise<string>,
): Promise<FreeformDocument>
```

所有函数克隆被修改的 document/slide/element/fill；不修改输入。缺失 `img:` 抛出稳定中文错误。异步上传只在一次调用内用 Map 去重，调用结束不保留映射。

- [ ] **Step 4: 在 LocalStore 保存副本中物化**

`createLocalStore().drafts.save` 在 freeform 分支先物化，再调用 `draftsImpl.saveDraft`。保存结果再次经过 `normalizeDraftForRead`；理论上无效时抛出明确错误。物化必须发生在任何 localStorage 写入之前。

- [ ] **Step 5: 验证 GREEN 与现有迁移测试**

Run: `npm run test:unit -- src/freeform/__tests__/imageAssets.test.ts src/storage/local.test.ts src/freeform/__tests__/draftMigration.test.ts`

Expected: 全部通过。

- [ ] **Step 6: 提交**

```text
git add src/freeform/imageAssets.ts src/freeform/__tests__/imageAssets.test.ts src/storage/local.ts src/storage/local.test.ts
git commit -m "fix(storage): persist local freeform image references"
```

### Task 5: RemoteStore 错误、认证、归一化和图片租约契约

**Files:**
- Create: `src/storage/remote.test.ts`
- Modify: `src/storage/types.ts`
- Modify: `src/storage/local.ts`
- Modify: `src/storage/remote.ts`
- Modify: `docs/backend-plan.md`

- [ ] **Step 1: 写 RemoteStore 失败矩阵测试**

使用真实 `Response`、受控 fetch promise 和会抛 `SecurityError` 的 localStorage 覆盖：

- `ApiError.status`：网络为 `null`，HTTP 为实际状态，无效 JSON 给稳定消息；
- 401 受保护请求仅在请求 token 仍为当前 token 时清除并通知订阅者；
- 迟到的旧 token 401 不清新登录 token；
- register/login 不带 Authorization，错误密码 401 不清已有 token；
- 网络、500、200 无效 JSON 均保留 token；
- localStorage 读写被阻止时，登录后同页 `/me` 仍使用内存 token；
- `/me` 仅对 401 返回 null，其余错误继续抛出；
- list 顶层非数组报错，数组中坏项丢弃并归一化 legacy/v1/v2；save 返回坏草稿报错；
- freeform save 先 retain 输入文档中已有的托管 URL，再上传历史 Data URL，再 retain 转换后的完整托管 URL，最后 POST draft，且输入不变；任一 retain/上传失败不发送 draft POST；提交失败后下一次保存重新上传；
- `images.retain` 对空/外部 URL 不发请求，对托管 URL 调用 `/api/images/retain`。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm run test:unit -- src/storage/remote.test.ts`

Expected: FAIL，现有实现清除任意 `/me` 错误，没有内存 token、ApiError、订阅、retain 或归一化。

- [ ] **Step 3: 扩展 Storage 契约**

```ts
interface AuthStore {
  // existing methods
  onInvalidated(listener: () => void): () => void
}
interface ImageStore {
  // existing methods
  retain(hrefs: readonly string[]): Promise<void>
}
```

LocalStore 的 `onInvalidated` 返回空 unsubscribe，`retain` 立即 resolve。

- [ ] **Step 4: 实现条件 token 失效与 ApiError**

模块内维护 `memoryToken`。每次请求捕获 `requestToken`；公共 auth 请求显式 `{ authenticated: false }`，不附加 token。只有携带 token 的响应为 401 且当前 token 仍等于 `requestToken` 时才清除并通知。JSON parse 错误转换成 `ApiError('服务器返回了无效响应', status)`。

- [ ] **Step 5: 实现归一化、历史图片上传和 retain**

Remote list/filter 与 LocalStore 使用同一个 `normalizeDraftForRead`。Remote save 先 retain 输入中已有的服务器 URL，确保随后上传历史 Data URL 所触发的 GC 不会删掉当前活动资源；再调用 `uploadInlineFreeformImages`，retain 转换后的完整 URL 集合并 POST。返回值必须归一化。不要跨保存缓存 Data URL 映射。

同一任务更新 `docs/backend-plan.md` 的 RemoteStore 契约、公共认证请求、条件 401、200 无效 JSON、retain/save 顺序及 list/save 归一化，保证新增接口与错误语义随代码提交。

- [ ] **Step 6: 验证 GREEN**

Run: `npm run test:unit -- src/storage/remote.test.ts src/storage/local.test.ts src/freeform/__tests__/draftMigration.test.ts`

Expected: 全部通过。

- [ ] **Step 7: 提交**

```text
git add src/storage/types.ts src/storage/local.ts src/storage/remote.ts src/storage/remote.test.ts docs/backend-plan.md
git commit -m "fix(storage): harden remote auth and draft contracts"
```

### Task 6: 自由编辑图片统一走 ImageStore 并采用成功快照

**Files:**
- Create: `e2e/offlineFonts.ts`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `e2e/freeform.spec.ts`
- Modify: `e2e/ime.spec.ts`
- Modify: `e2e-integration/backend.spec.ts`

- [ ] **Step 1: 先隔离外部字体，再写本地与真实后端失败测试**

先创建 `installOfflineFontRoutes(context)`：fulfill `fonts.googleapis.com` 为空 CSS，并 fulfill/abort `fonts.gstatic.com`。在本地两个 spec、integration 默认 context 和手工创建 context 中安装；这是所有 Playwright RED 之前的测试基础设施，不得等到后续任务。

新增测试：插入普通图片和形状图片填充后，`sessionStorage['slicer.images.v1']` 有两个记录；DOM 中普通图片已成功 decode，形状有可解析背景图。注册、保存后检查 localStorage 草稿只含 Data URL、不含 `img:`；清空 sessionStorage 并 reload，重新打开草稿，两个图片仍可见且导出 PNG 成功。

同时在真实后端 spec 用内存 PNG 写第一条远程闭环验收：注册 → 插入普通图片与形状填充，并在点击保存前断言已经完成两次 `/api/images` POST、活动 DOM 使用服务器 `/uploads/` URL → 保存 → GET `/api/drafts` 断言含 `/uploads/` 且无 `data:image/` → reload/open → 两类图片成功加载 → 导出当前页。保存前上传断言专门证明插入处理器经过 ImageStore，不会被 Task 5 的“保存历史 Data URL 时迁移”掩盖。

- [ ] **Step 2: 运行目标 E2E 确认 RED**

Run: `npm run test:e2e -- e2e/freeform.spec.ts -g "persists image element and shape fill through ImageStore"`

Run: `npm run test:integration -- -g "uploads and restores remote freeform images"`

Expected: 两个测试都到达业务断言后 FAIL；本地 sessionStorage 没有对应记录，远程在点击保存前没有任何 `/api/images` 请求。不得因 Google Fonts 超时得到伪 RED。

- [ ] **Step 3: 插入和渲染统一接入 store.images**

普通图片与形状填充都按 `read -> downscale -> await store.images.put` 后写入 document。渲染 `<img>` 和 shape background 前调用 `store.images.resolve`，确保 LocalStore 的 `img:` 与 RemoteStore URL 使用同一路径。

- [ ] **Step 4: 成功保存时安全采用服务端 URL 快照**

保存前捕获 `const snapshot = doc`。若返回 freeform draft 且 `history.current` 仍与 snapshot 同一引用，则只替换 current 为服务端返回 document；保存期间如果用户已继续编辑，不覆盖新状态。LocalStore 返回物化副本时也不得把活动文档强制膨胀为 Base64，因此仅在 `store.remote` 时采用返回快照。

- [ ] **Step 5: 验证 GREEN 与导出回归**

Run: `npm run test:e2e -- e2e/freeform.spec.ts -g "persists image element and shape fill through ImageStore|exports current"`

Run: `npm run test:integration -- -g "uploads and restores remote freeform images"`

Expected: 本地图片持久化、远程无 Base64/重载/导出和现有导出回归通过。

- [ ] **Step 6: 提交**

```text
git add e2e/offlineFonts.ts src/freeform/FreeformWorkspace.tsx e2e/freeform.spec.ts e2e/ime.spec.ts e2e-integration/backend.spec.ts
git commit -m "fix(freeform): route images through storage adapter"
```

### Task 7: 活动图片续租与认证/草稿可见错误

**Files:**
- Create: `src/workspaces/useImageLease.ts`
- Create: `src/workspaces/useImageLease.test.ts`
- Create: `src/workspaces/OperationNotice.tsx`
- Modify: `src/markdown.ts`
- Modify: `src/MarkdownEditor.tsx`
- Modify: `src/workspaces/AppHeader.tsx`
- Modify: `src/workspaces/AppShell.tsx`
- Modify: `src/workspaces/markdown/MarkdownWorkspace.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `e2e-integration/backend.spec.ts`

- [ ] **Step 1: 写 UI/请求顺序的失败联调测试**

用 Playwright route/request 观察真实远程前端：

- 活动自由编辑图片插入后、触发 `online` 后都会请求 retain；
- 用 Vitest 假时钟让首次后台 retain 失败，断言 30 秒时自动发起第二次调用，不需要额外 sources/online/visible 事件；卸载后重试计时器被取消；
- 已有活动图片时，第二次上传前 retain 完成；若 retain 返回 500，不发送新的 `/api/images` POST，并显示 role=alert；
- RemoteStore 保存链路或工作区删除前的 retain 失败时不发送 draft POST/DELETE；
- 草稿 list/save/delete 和 Markdown 图片粘贴失败显示错误且没有 `pageerror`；
- `/me` 网络失败保留 token，显示“登录状态尚未确认”和重试；重试成功恢复头像；
- 受保护请求 401 后 AppShell 清用户并显示重新登录入口。

- [ ] **Step 2: 运行目标联调确认 RED**

Run: `npm run test:integration -- -g "retains active images|shows recoverable remote errors|invalidates expired session"`

Run: `npm run test:unit -- src/workspaces/useImageLease.test.ts`

Expected: FAIL，当前没有 retain、错误提示、重试或认证失效订阅 UI。

- [ ] **Step 3: 实现租约 hook 和 Markdown 图片源收集**

`useImageLease(sources, enabled, onError)` 在 sources 首次/变化、`online`、`visibilitychange` 到 visible、每 5 分钟调用 retain。失败全部 catch，并立即安排唯一的 30 秒 `setTimeout` 自动重试；成功或新的主动触发取消旧重试，unmount 清除 interval/timeout/listener。把调度核心写成可注入 timer 的小单元供 Vitest 假时钟验证。hook 返回 `retainNow()`，供删除和上传前显式 await。保存所需的 pre-retain/转换后 retain 已由 Task 5 的 RemoteStore 原子顺序负责。Markdown 图片 URL 收集函数增加纯单测或并入现有 markdown 测试。

- [ ] **Step 4: 所有安全操作先续租**

两个工作区在 remote 模式下只对“删除草稿、上传新图片”显式 `await retainNow()`；保存直接调用 RemoteStore.save，由存储层完成一次 pre-retain → 转换 → final-retain → POST，工作区不得再重复续租。任一安全续租失败设置可见错误并 return。`MarkdownEditor` 把 paste handler 改为接收 `beforeImageUpload` 与 `onImageError`，FileReader/downscale/put 全链路捕获异常。

- [ ] **Step 5: 统一草稿和认证错误 UI**

`OperationNotice` 使用 `role="alert"`，支持关闭和可选重试按钮。两个工作区的列表 effect、refresh、save、remove、image upload 全部 try/catch，失败保留上一次成功状态。AppShell 维护 `checking | ready | error`，订阅 `auth.onInvalidated`；网络/5xx 显示重试但不清 token，401 清 user 并引导登录。AppHeader 在初次检查期间不把未知状态伪装成已退出。

- [ ] **Step 6: 验证 GREEN**

Run: `npm run test:integration -- -g "retains active images|shows recoverable remote errors|invalidates expired session"`

Run: `npm run test:unit`

Expected: 目标联调和全量单元测试通过，无未处理 Promise rejection。

- [ ] **Step 7: 提交**

```text
git add src/workspaces/useImageLease.ts src/workspaces/useImageLease.test.ts src/workspaces/OperationNotice.tsx src/markdown.ts src/MarkdownEditor.tsx src/workspaces/AppHeader.tsx src/workspaces/AppShell.tsx src/workspaces/markdown/MarkdownWorkspace.tsx src/freeform/FreeformWorkspace.tsx src/styles.css e2e-integration/backend.spec.ts
git commit -m "fix(ui): surface remote failures and retain active images"
```

### Task 8: 真实后端历史图片与离线稳定性验收

**Files:**
- Modify: `e2e-integration/backend.spec.ts`

- [ ] **Step 1: 增加剩余跨层回归验收**

Task 6 已在首次 Playwright RED 前安装外部字体拦截并覆盖新图片闭环。本任务不再声称对已实现功能制造 RED，只补跨层验收：

- 无 Google Fonts 响应时连续 goto/reload 仍在正常超时内到达明确 UI；
- 通过 API 预置一个含历史 Data URL 的远程草稿，UI 打开并保存后，服务端版本已替换成 URL，活动快照未被后续编辑覆盖；
- 模拟图片上传成功但草稿 POST 失败，再次保存时观察图片重新上传而非复用失败批次 URL；
- 完整远程图片测试实际下载 PNG 并验证尺寸/非空，而不只检查 DOM URL。

- [ ] **Step 2: 运行验收并按根因处理失败**

Run: `npm run test:integration -- -g "legacy data URL|reuploads after failed draft save|offline font routes|uploads and restores remote freeform images"`

Expected: 这些是前面 RED/单元/局部联调的跨层验证，允许直接通过。若失败，先按 systematic-debugging 定位：产品契约缺陷则修对应实现并重跑其单元/联调；仅选择器/等待条件问题才修测试。不得限定为“只修测试层”。

若验收暴露产品缺陷：先写/强化能在更低层稳定复现的失败测试，修复实现，运行相关测试；用 `git diff --name-only` 明确列出实际修复文件并单独提交 `fix: ...`。不能把未知产品文件留到只暂存 integration spec 的测试提交，也不能用宽泛 `git add -A` 混入无关变更。

- [ ] **Step 3: 验证本地和远程浏览器套件**

Run: `npm run test:integration`

Run: `npm run test:e2e`

Expected: 两套 Playwright 在拦截外部字体后全部通过，不启动或关闭用户现有 Chrome；Playwright 仅使用自己的 headless context。

- [ ] **Step 4: 提交**

```text
git add e2e-integration/backend.spec.ts
git commit -m "test: cover remote freeform image recovery"
```

Expected: 此测试提交前 `git status --short` 只剩计划内测试文件；若前一步产生产品修复，它已经在独立提交中完整收口。

### Task 9: 版本、配置和后端文档同步

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Modify: `.env.example`
- Modify: `server/.env.example`
- Modify: `docker-compose.yml`
- Modify: `docs/backend-plan.md`

- [ ] **Step 1: 写同步检查清单并 grep 全项目**

Run: `rg -n '0\.8\.0|0\.1\.0|IMAGE_LEASE_MS|src/api\.ts|src/storage' package.json package-lock.json server docs .env.example docker-compose.yml`

Expected: 暴露所有待同步版本和旧架构描述。

- [ ] **Step 2: 同步版本与脚本**

根应用 `0.8.0 -> 0.9.0`，server `0.1.0 -> 0.2.0`，两个 lockfile 同步。根脚本增加 `test:server`，并把它纳入 `npm test`，确保图片生命周期单测不会被默认测试遗漏。

- [ ] **Step 3: 同步环境和 Docker 传递**

根/server 环境示例记录 `IMAGE_LEASE_MS=86400000`；`docker-compose.yml` 的 server environment 明确传入 `${IMAGE_LEASE_MS:-86400000}`，避免根 `.env` 配了却未进入容器。

- [ ] **Step 4: 把后端文档改成实际实现**

删除/改写旧的 `src/api.ts` 方案与“前端/部署尚未开始”；记录：`src/storage/*` 双实现、自由编辑普通/形状图片流、retain 409、草稿 400/404、401 条件失效、租约与 GC、旧 DB 迁移、测试命令、Nginx 与 Fastify 测试静态路径。明确不自动上传 localStorage 草稿。

- [ ] **Step 5: 验证命名、错误码、版本与 Compose**

Run: `rg -n 'IMAGE_LEASE_MS|onInvalidated|lease_expires_at|/api/images/retain' . -g '!node_modules/**' -g '!dist/**'`

Run: `$env:JWT_SECRET='compose-validation-secret'; docker compose config`

Run: `git diff --check`

Expected: 所有名称一致；文档包含新增 400/404/409/413/401 语义；Compose 展开后 server 含租约配置；无空白错误。

- [ ] **Step 6: 提交**

```text
git add package.json package-lock.json server/package.json server/package-lock.json .env.example server/.env.example docker-compose.yml docs/backend-plan.md
git commit -m "docs: sync remote image lifecycle release"
```

### Task 10: 完整验证与最终审查

**Files:**
- Review only; only fix test-proven regressions found by verification/review.

- [ ] **Step 1: 运行服务端测试和冒烟**

Run: `npm run test:server`

Run: `node server/smoke-test.mjs`

Expected: 全部通过，输出 0 failures。

- [ ] **Step 2: 运行前端单元与构建**

Run: `npm run test:unit`

Run: `npm run build`

Expected: 单元 0 failures，TypeScript/Vite build exit 0；记录但不把既有 chunk size warning 误报为失败。

- [ ] **Step 3: 运行两套浏览器自动化**

Run: `npm run test:integration`

Run: `npm run test:e2e`

Expected: 真实后端与本地模式全部通过，外部字体被测试层隔离。

- [ ] **Step 4: 验证部署配置和仓库卫生**

Run: `$env:JWT_SECRET='compose-validation-secret'; docker compose config`

Run: `git diff --check`

Run: `git status --short --branch`

Expected: Compose 解析成功；无未提交实现文件、无意外主仓修改。

- [ ] **Step 5: 按 AGENTS.md 做最终契约审计**

逐项记录：空/异常/fallback 契约；新增命名全局 grep；400/401/404/409/413 文档；API/配置/脚本文档；0.9.0/0.2.0 全位置；本地/远程、正常/断网/401/损坏数据/离线字体/旧 DB 多环境覆盖。

- [ ] **Step 6: 独立最终代码审查**

以规格文档、计划、实现起始 SHA `1abf924` 和当前 HEAD 交给独立 reviewer。Critical/Important 必须修复、重跑相关测试并复审；最后再进入分支合并决策，不自动合并 `master`。
