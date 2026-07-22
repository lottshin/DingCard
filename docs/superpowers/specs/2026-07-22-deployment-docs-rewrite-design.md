# 部署教程重写设计

## 目标

让第一次打开仓库的人先选对部署方式，再按顺序完成操作。README 提供最短可执行路径，独立部署文档承接上线后的配置和维护，不再让普通部署者阅读后端实现设计。

## 参考项目

- [Uptime Kuma](https://github.com/louislam/uptime-kuma#-how-to-install) 把 Docker Compose 放在安装入口，并在命令后立即给出访问地址。
- [Umami](https://github.com/umami-software/umami#-installing-with-docker) 将源码安装、Docker 和升级分成独立章节。
- [LobeChat](https://github.com/lobehub/lobe-chat#-self-hosting) 先区分云平台与 Docker，再把详细环境变量交给独立文档。
- [Docmost](https://github.com/docmost/docmost#getting-started) 保持 README 克制，把复杂自托管说明放在文档中。

叮卡采用相同的分层思路，但保留一段完整 Docker 快速部署流程，避免 README 只剩跳转链接。

## README 结构

### 0. 项目头部

使用现有的 `public/favicon.svg` 作为 README 标识，将项目名、产品定位、简短说明和部署入口放在居中头部。徽章只显示有仓库证据的状态：当前版本、GitHub CI、在线 Demo 和 Docker 部署。仓库尚无 `LICENSE` 文件，因此不显示许可证徽章。

### 1. 使用和部署

按使用成本排列三条路线：

1. 打开在线 Demo，适合先体验功能。
2. 点击 Vercel 按钮，部署前端本地模式。无需环境变量，数据保存在访问者浏览器。
3. 使用 Docker Compose 部署完整前后端，获得真实账号、SQLite 草稿和服务端图片。

### 2. Docker Compose 最短流程

面向已安装 Git、Docker Engine 和 Docker Compose 的 Linux VPS。命令必须按真实执行顺序排列：

```bash
git clone https://github.com/lottshin/DingCard.git
cd DingCard
cp .env.example .env
JWT_SECRET="$(openssl rand -hex 32)"
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
unset JWT_SECRET
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:8080/api/health
```

命令后直接给出访问地址 `http://服务器地址:8080`。同时提醒：公网正式使用前需要配置 HTTPS；数据库和图片分别位于 Compose 命名卷，不能只备份其中一个。

首次启动为了便于验证，可以保留 `WEB_PORT=8080`。接入宿主机 Caddy、Nginx 或云负载均衡后，应把 `.env` 改为 `WEB_PORT=127.0.0.1:8080` 并重建 `web` 容器，避免用户绕过 HTTPS 直接访问 Compose 的 HTTP 端口。Compose 已验证可以把该值展开为 `host_ip: 127.0.0.1` 与 `published: 8080`。

Windows 与 macOS 可以使用 Docker Desktop 试跑同一套 Compose，但不作为生产部署主线。

### 3. 本地开发

本地开发独立成节，补齐 `git clone` 和 `cd DingCard`，再执行 `npm ci` 与 `npm run dev`。Chrome 和 Docker 不再列为基础要求：Chrome 只在运行 E2E 时需要，Docker 只在全栈开发或部署时需要。

### 4. 数据模式

保留 LocalStore 与 RemoteStore 的边界说明。服务器模式的本地联调仍放在折叠区，但删除没有实际执行作用的 `.env` 复制步骤，直接说明后端不会自动读取该文件。

## 独立部署文档

新增 `docs/deployment.md`，面向已经完成 Docker 快速部署的人，内容按运维顺序编排：

1. 部署前检查：Linux VPS、域名、端口、磁盘和 Docker Compose。
2. 首次部署：展开 README 的最短流程，解释 `.env` 与验证结果。
3. HTTPS：给出 Caddy 和宿主机 Nginx 两种入口，推荐 Caddy；明确反代到 `127.0.0.1:8080`。
4. 数据与备份：列出 `db` 与 `uploads` 两个卷，提供可执行的备份和恢复步骤。SQLite 使用 WAL，备份前必须先停止后端写入；备份通过 Compose 的 server 容器定位挂载，不硬编码带项目名前缀的实际卷名。归档必须同时覆盖 `/data` 与嵌套的 `/data/uploads`。
5. 升级：`git pull` 后重新构建，升级前先备份。
6. 日志和排查：`docker compose ps`、`logs`、`config`、健康检查及常见错误。
7. 停止与卸载：区分保留数据的 `down` 和删除数据的 `down -v`，后者明确标为危险操作。

详细环境变量仍以根目录 `.env.example` 为准，部署文档只解释常用项，避免复制一份容易过期的完整表格。

恢复步骤必须先停止 `web` 与 `server`，明确会覆盖当前数据库和图片，并要求恢复前再做一次当前数据备份。删除数据只允许出现在单独的危险操作说明中，不能混入普通停止命令。

## 原有文档分工

- `README.md`：选择部署方式，完成首次运行。
- `docs/deployment.md`：把 Docker 实例接入公网并维护。
- `docs/backend-plan.md`：后端实现、接口、安全契约和架构证据。

README 的“文档”章节将同时链接部署指南和后端接入方案，并标明用途。

## Compose 配置结论

当前 Compose 已具备同源 Nginx、非 root 后端、健康检查、数据库与上传卷分离。使用临时 `JWT_SECRET` 运行 `docker compose config --quiet` 已通过，因此本次不改 Compose 或镜像配置。

当前机器的 Docker Desktop daemon 未运行，本轮无法重跑 `deploy/compose-smoke.sh`。实施后仍需运行配置展开检查、文档契约测试和项目测试；全栈 Compose 冒烟以现有 CI/发布证据为基线，并在 Docker daemon 可用时补跑。

## 不在本次范围内

- 不发布 GHCR 或 Docker Hub 预构建镜像。
- 不增加新的部署平台。
- 不改变 LocalStore、RemoteStore、Compose 拓扑或版本号。
