# Docker 部署与维护

这份文档用于部署叮卡的完整前后端。只需要前端时，使用 README 顶部的 Vercel 按钮即可，不必准备服务器。

Docker Compose 会启动一个 `app` 容器。容器内的 Fastify 直接提供前端页面、`/uploads` 图片和 `/api` 接口。`db` 卷保存 SQLite 数据库，`uploads` 卷保存上传图片。

## 部署前准备

建议使用一台 Linux 服务器，并提前准备：

- 已安装 Git、[Docker Engine](https://docs.docker.com/engine/install/)、[Docker Compose](https://docs.docker.com/compose/install/linux/) 和 OpenSSL。
- 一个指向服务器的域名。只在本机或内网试用时可以暂时不用域名。
- 对外开放 80 和 443 端口。8080 只用于首次检查，正式环境不应直接暴露。
- 足够存放图片和备份的磁盘空间。

Windows 和 macOS 可以通过 Docker Desktop 试跑，但下面的公网部署步骤以 Linux 为准。

## 首次部署

克隆仓库并创建配置：

```bash
git clone https://github.com/lottshin/DingCard.git
cd DingCard

cp .env.example .env
JWT_SECRET="$(openssl rand -hex 32)"
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
unset JWT_SECRET
chmod 600 .env
```

模板已经固定 `DINGCARD_VERSION=0.11.0`。先检查配置，再拉取预构建镜像并启动 `app`：

```bash
docker compose config --quiet
docker compose pull
docker compose up -d --no-build
docker compose ps app
curl -f http://127.0.0.1:8080/api/health
```

`docker compose pull` 返回非零时先停止部署，检查版本号、网络和 GHCR 包权限，解决后再重试。

健康检查应返回：

```json
{"ok":true}
```

首次检查时可以通过 `http://服务器地址:8080` 打开叮卡。此时还是明文 HTTP，不要在公网注册正式账号或录入重要内容。

如果启动失败，先查看 `app` 日志：

```bash
docker compose logs --tail=100 app
```

## 配置域名和 HTTPS

正式环境应由宿主机上的 Caddy、Nginx 或云负载均衡接收 80/443，再转发到 Compose。先把 `.env` 中的端口改为：

```dotenv
WEB_PORT=127.0.0.1:8080
```

确认 Compose 只监听本机：

```bash
docker compose config | grep -F 'host_ip: 127.0.0.1'
docker compose config | grep -F 'published: "8080"'
```

两条检查都输出匹配结果后再执行重建：

```bash
docker compose up -d --force-recreate app
```

此后不要再把防火墙的 8080 端口开放到公网。

### 使用 Caddy

Caddy 会自动申请和续期证书。按[官方说明](https://caddyserver.com/docs/install)安装 Caddy 后，在 `/etc/caddy/Caddyfile` 中加入：

```caddyfile
dingcard.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

把域名替换成自己的地址，然后检查并重载：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### 使用宿主机 Nginx

证书可以交给 Certbot 管理。站点的 HTTPS `server` 块至少需要下面的代理配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

证书路径、80 到 443 的跳转和 TLS 参数应由 [Certbot](https://certbot.eff.org/) 或现有 Nginx 配置生成。配置完成后检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

最后从外网访问域名，并再次检查：

```bash
curl -f https://dingcard.example.com/api/health
```

## 常用环境变量

完整说明和默认值见根目录的 `.env.example`。通常只需要关注下面几项：

| 变量 | 用途 |
|---|---|
| `DINGCARD_VERSION` | GHCR 镜像版本，当前固定为 `0.11.0`。生产环境不要默认使用 `latest`。 |
| `JWT_SECRET` | JWT 签名密钥。必须随机生成，不要提交到 Git。 |
| `WEB_PORT` | Compose 对外端口。接入 HTTPS 后使用 `127.0.0.1:8080`。 |
| `JWT_EXPIRY` | 登录有效期，默认 `7d`。 |
| `USER_QUOTA_BYTES` | 每个用户可使用的图片空间。 |
| `MAX_UPLOAD_BYTES` | Fastify 接收的单张图片上限；修改后需要重建 `app`。 |

修改 `.env` 后先运行 `docker compose config --quiet`，再让容器读取新值：

```bash
docker compose up -d --force-recreate app
```

## 备份

数据库使用 SQLite WAL。为了得到一致的数据库和图片快照，备份时先停止 `app`。下面的命令从 `app` 容器动态取得实际卷名，不依赖仓库所在目录的名称。

```bash
APP_ID="$(docker compose ps --all -q app)"
test -n "$APP_ID"
DB_VOLUME="$(docker inspect "$APP_ID" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
UPLOADS_VOLUME="$(docker inspect "$APP_ID" --format '{{range .Mounts}}{{if eq .Destination "/data/uploads"}}{{.Name}}{{end}}{{end}}')"
test -n "$DB_VOLUME" && test -n "$UPLOADS_VOLUME"

BACKUP_DIR="$(pwd)/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

docker compose stop app
docker run --rm -v "$DB_VOLUME:/source:ro" alpine:3.22 tar -czf - -C /source . > "$BACKUP_DIR/db.tar.gz"
docker run --rm -v "$UPLOADS_VOLUME:/source:ro" alpine:3.22 tar -czf - -C /source . > "$BACKUP_DIR/uploads.tar.gz"
docker compose start app

tar -tzf "$BACKUP_DIR/db.tar.gz" >/dev/null
tar -tzf "$BACKUP_DIR/uploads.tar.gz" >/dev/null
ls -lh "$BACKUP_DIR"
```

备份必须同时包含 `db.tar.gz` 和 `uploads.tar.gz`。它们不包含 `.env`，请单独保管一份受限访问的配置副本。定期把备份复制到另一台机器或对象存储；只留在当前服务器上不能防止磁盘损坏。

## 恢复备份

恢复会覆盖当前数据库和全部图片。先为当前数据再做一次备份，并确认目标目录同时包含两个归档文件。

新服务器还没有 `app` 容器时，先执行：

```bash
docker compose pull
docker compose create --no-build app
```

已有 `app` 容器时跳过上面两条命令。然后获取卷名并恢复归档：

```bash
BACKUP_DIR="$(pwd)/backups/替换为备份目录"
test -f "$BACKUP_DIR/db.tar.gz"
test -f "$BACKUP_DIR/uploads.tar.gz"

APP_ID="$(docker compose ps --all -q app)"
test -n "$APP_ID"
DB_VOLUME="$(docker inspect "$APP_ID" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
UPLOADS_VOLUME="$(docker inspect "$APP_ID" --format '{{range .Mounts}}{{if eq .Destination "/data/uploads"}}{{.Name}}{{end}}{{end}}')"
test -n "$DB_VOLUME" && test -n "$UPLOADS_VOLUME"

read -r -p '输入 RESTORE 覆盖当前数据：' CONFIRM
test "$CONFIRM" = 'RESTORE'

docker compose stop app
docker run --rm -i -v "$DB_VOLUME:/target" alpine:3.22 sh -c 'rm -rf /target/* /target/.[!.]* /target/..?* && tar -xzf - -C /target' < "$BACKUP_DIR/db.tar.gz"
docker run --rm -i -v "$UPLOADS_VOLUME:/target" alpine:3.22 sh -c 'rm -rf /target/* /target/.[!.]* /target/..?* && tar -xzf - -C /target' < "$BACKUP_DIR/uploads.tar.gz"
docker compose start app

curl -f http://127.0.0.1:8080/api/health
```

如果正式环境已经绑定域名，也应通过 HTTPS 地址再检查一次。恢复失败时不要反复启动服务，先保留现场并查看归档文件和 `app` 日志。

## 升级

升级前先备份。先用当前版本的 Compose 配置停掉旧容器，再拉取新版代码和预构建镜像：

```bash
docker compose down --remove-orphans
git pull --ff-only
sed -i 's/^DINGCARD_VERSION=.*/DINGCARD_VERSION=0.11.0/' .env
docker compose config --quiet
docker compose pull
docker compose up -d --no-build
docker compose ps app
curl -f http://127.0.0.1:8080/api/health
```

`down --remove-orphans` 会移除旧容器和网络，但会保留 `db`、`uploads` 命名卷。从 `0.10.x` 升级时，旧 `server` 和 `web` 容器也会在这一步移除，不会占用新 `app` 的端口。不要把 `-v` 或 `--volumes` 写进升级脚本。

## 从源码构建

需要验证本地修改或 GHCR 暂无目标版本时，可以从当前源码构建：

```bash
docker compose up -d --build app
curl -f http://127.0.0.1:8080/api/health
```

源码构建是单独的部署方式，不是镜像拉取失败后的自动回退。

## 日志和排查

```bash
# 查看 app 状态
docker compose ps app

# 查看最近日志；需要持续跟随时加 -f
docker compose logs --tail=100 app
docker compose logs -f --tail=100 app

# 检查环境变量和端口展开结果
docker compose config

# 重新创建 app，不改镜像版本
docker compose up -d --force-recreate app
```

常见问题：

- 提示 `JWT_SECRET` 缺失：检查 `.env` 中该值是否为空，再运行 `docker compose config --quiet`。
- `/api/health` 不是 200：运行 `docker compose ps app` 和 `docker compose logs --tail=100 app` 检查启动错误。
- 页面能打开但上传失败：检查 `MAX_UPLOAD_BYTES`、磁盘空间和 `uploads` 卷。
- 域名出现重定向或同源问题：确认外层代理传递了原始 `Host`，并把 `X-Forwarded-Proto` 设置为实际协议。
- 修改 `.env` 后没有生效：用 `docker compose up -d --force-recreate app` 重建容器。

## 停止或卸载

临时停止并保留数据：

```bash
docker compose stop app
```

移除容器和网络，但保留数据库与图片卷：

```bash
docker compose down
```

下面的命令会永久删除数据库和全部上传图片，只能在已经确认备份可用、并且确实要清空实例时执行：

```bash
docker compose down -v
```

后端实现、接口和安全契约见[后端实现与接入方案](backend-plan.md)。

## 首次发布 GHCR 包（维护者）

本节只供仓库维护者使用，普通部署用户不需要执行。

首次推送版本标签后，GitHub Packages 中的新包可能默认是 private。维护者需要把 `ghcr.io/lottshin/dingcard` 设为 public，然后重新运行发布工作流。只有匿名 manifest 检查以及 amd64、arm64 两个镜像 smoke job 都通过，才创建 GitHub Release。
