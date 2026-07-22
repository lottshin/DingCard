# 单镜像发布设计

## 背景

叮卡当前的 Docker Compose 由两个容器组成：Nginx 负责前端静态文件、`/api` 反向代理和 `/uploads` 直出，Fastify 负责认证、草稿、图片接口和 SQLite。这个拓扑可以工作，但自托管发布需要同时维护两个镜像、两个容器和一组必须匹配的镜像版本。

后端已经依赖 `@fastify/static` 并直接提供 `/uploads`。对使用 SQLite 和本地上传卷的单机应用而言，让 Fastify 同时提供前端构建产物，可以减少发布单元而不引入多进程容器。

## 目标

1. 发布一个可直接运行完整叮卡的 GHCR 镜像 `ghcr.io/lottshin/dingcard`。
2. 保持用户访问端口、SQLite 数据和上传图片的持久化方式兼容。
3. 支持 `linux/amd64` 与 `linux/arm64`，并在发布流程中验证两个架构可启动。
4. 版本发布只由 `v*` 标签触发，固定版本是部署文档默认值，`latest` 仅作便捷标签。
5. 开源仓库补齐 MIT License、镜像发布说明和匿名拉取验证。

## 非目标

- 不优化前端 JavaScript 包体积。
- 不改变编辑、保存、导出、认证或草稿数据模型。
- 不把 Nginx 和 Node 作为两个进程塞入同一容器。
- 不自动迁移或删除已有 Compose 数据卷。
- 不承诺 GHCR 在中国大陆网络中的可用性；国内镜像源留作后续独立工作。

## 运行时架构

最终镜像使用多阶段构建：

1. 前端构建阶段在根目录执行 `npm ci` 和 `npm run build`，生成 `dist`。
2. 后端依赖阶段在 `server` 目录执行 `npm ci --omit=dev`。
3. 最终阶段基于 `node:20-slim`，复制后端源码、生产依赖和前端 `dist`，以镜像内置的非 root `node` 用户运行。

Fastify 保持 `/api/*` 和 `/uploads/*` 现有行为，并新增前端静态站点：

- `/assets/*` 返回带哈希资源并设置长期不可变缓存。
- 已存在的静态文件按原路径返回。
- 非 `/api`、非 `/uploads` 的 HTML 页面请求回退到 `index.html`，支持 SPA 路由和刷新。
- 未知 API、上传路径和非 HTML 请求保持 404，不能被 SPA 回退掩盖。
- 根页面和 `index.html` 不使用长期缓存，以免升级后继续加载旧入口。
- `MAX_UPLOAD_BYTES` 继续由 Fastify `bodyLimit` 与 multipart 限制统一执行。

为便于测试，应用装配与进程监听分离：装配函数接收配置和依赖，入口文件只负责创建应用、监听以及启动失败处理。静态站点注册拆成独立插件，边界输入和回退行为通过 Fastify `inject` 测试。

## Compose 与数据兼容

Compose 改为单个 `app` 服务，对外仍映射 `${WEB_PORT:-8080}`，容器内端口改为 `3000`。服务同时声明：

- `image: ghcr.io/lottshin/dingcard:${DINGCARD_VERSION:-0.11.0}`，供普通用户拉取固定版本。
- `build: .`，供贡献者执行 `docker compose up -d --build` 本地构建。

生产说明使用 `docker compose pull` 后执行 `docker compose up -d --no-build`，避免 Compose 在拉取失败时静默回退到本地构建。开发说明显式使用 `--build`。

继续挂载现有 `db:/data` 和 `uploads:/data/uploads` 两个命名卷。虽然单容器可以合并为一个卷，但保留名称和挂载点可以避免已有部署升级时看不到原数据。

## 镜像发布

新增 GitHub Actions 工作流，仅在 `v*` 标签推送时发布：

- 使用 GHCR 和仓库自带的 `GITHUB_TOKEN`，权限限定为 `contents: read`、`packages: write`、`attestations: write`、`id-token: write`。
- 产出语义版本、主次版本、`latest` 和提交 SHA 标签；预发布标签不更新 `latest`。
- 使用 Buildx/QEMU 构建 `linux/amd64,linux/arm64`。
- 添加 OCI source、revision、version、license 等标签，并生成 SBOM 与 provenance。
- 发布后检查 manifest 同时包含两个架构。
- 分别以 `linux/amd64` 和 `linux/arm64` 启动镜像，验证 `/`、`/api/health` 和静态资源；清理测试容器和卷。

GHCR 包首次创建后必须设置为 public，并在发布验收中使用未登录请求验证 manifest 可读。公开权限无法可靠地仅靠仓库可见性推断，因此它是显式发布门槛。

## 版本与文档

- 根版本从 `0.10.1` 升到 `0.11.0`，因为新增了单镜像自托管发布能力。
- 后端版本从 `0.2.0` 升到 `0.3.0`，因为 Fastify 新增前端静态站点职责。
- 同步 `package.json`、两个 lockfile、README 徽章、CHANGELOG 和版本相关契约测试。
- 新增 MIT License，版权年份与署名为 `2026 lottshin`。
- README 提供镜像快速部署；`docs/deployment.md` 继续作为 HTTPS、备份、升级和源码构建的详细说明。
- 技术栈移除生产 Nginx 描述；保留 Vercel 纯前端部署说明。

## 错误与兼容边界

- `WEB_ROOT` 缺失或不是目录时，开发模式允许仅启动 API；生产镜像必须在启动时给出稳定错误并退出，防止发布一个只有 API 的残缺容器。
- `/api/*` 和 `/uploads/*` 永远不会回退到 `index.html`。
- 前端静态文件不存在时，只有接受 HTML 的 GET/HEAD 页面导航请求回退；其他方法和内容类型返回 404。
- 健康检查继续使用 `/api/health`，返回结构不变。
- Compose 变量缺失时，`JWT_SECRET` 仍在配置展开阶段报错；`DINGCARD_VERSION` 有固定版本默认值。

## 验证

本地验证包括：

- 新增静态站点插件的单元/集成测试先失败后通过。
- 现有 397 项前端测试、48 项后端测试、后端 HTTP smoke、生产构建和完整 E2E。
- `docker compose config` 验证只存在一个应用服务、固定镜像标签、两个兼容卷和正确端口。
- Docker 引擎可用时执行本地镜像冒烟；不可用时如实记录为未执行，由 GitHub 发布工作流承担镜像级门槛。
- 工作流 YAML 解析、发布标签规则和镜像名通过仓库契约测试。
- 最终执行 `git diff --check`、命名全仓搜索、版本同步检查和文档命令核对。

## 验收标准

1. 一个镜像同时返回首页、前端资源、上传图片和健康接口。
2. 页面导航可 SPA 回退，未知 API/上传/非 HTML 请求仍为 404。
3. `docker compose up -d` 只启动一个应用容器，已有两个卷保持原名和挂载路径。
4. 发布标签生成公开的 amd64/arm64 manifest；两个架构均通过实际启动冒烟。
5. README 的默认部署固定到 `0.11.0`，升级命令不会依赖浮动 `latest`。
6. 根版本、后端版本、License、CHANGELOG、部署文档和自动化契约保持一致。
