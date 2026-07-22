# Docker 部署与维护

这份文档用于部署叮卡的完整前后端。只需要前端时，使用 README 顶部的 Vercel 按钮即可，不必准备服务器。

Docker Compose 会启动两个容器：`web` 提供前端页面并转发 `/api`，`server` 负责账号、草稿和图片。SQLite 与上传图片分别保存在两个 Docker 命名卷中。

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

先检查配置，再构建并启动：

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:8080/api/health
```

健康检查应返回：

```json
{"ok":true}
```

首次检查时可以通过 `http://服务器地址:8080` 打开叮卡。此时还是明文 HTTP，不要在公网注册正式账号或录入重要内容。

如果启动失败，先查看日志：

```bash
docker compose logs --tail=100 server web
```

## 配置域名和 HTTPS

正式环境应由宿主机上的 Caddy、Nginx 或云负载均衡接收 80/443，再转发到 Compose。先把 `.env` 中的端口改为：

```dotenv
WEB_PORT=127.0.0.1:8080
```

确认 Compose 只监听本机，然后重建 `web` 容器：

```bash
docker compose config | grep -E 'host_ip: 127\.0\.0\.1|published: "8080"'
docker compose up -d --force-recreate web
```

展开结果中应出现 `host_ip: 127.0.0.1`。此后不要再把防火墙的 8080 端口开放到公网。

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
| `JWT_SECRET` | JWT 签名密钥。必须随机生成，不要提交到 Git。 |
| `WEB_PORT` | Compose 对外端口。接入 HTTPS 后使用 `127.0.0.1:8080`。 |
| `JWT_EXPIRY` | 登录有效期，默认 `7d`。 |
| `USER_QUOTA_BYTES` | 每个用户可使用的图片空间。 |
| `MAX_UPLOAD_BYTES` | 单张图片上限；修改时还要同步调整 `deploy/nginx.conf`。 |

修改 `.env` 后运行 `docker compose config --quiet`。需要让容器读取新值时，执行：

```bash
docker compose up -d --force-recreate
```

## 备份

数据库使用 SQLite WAL。为了得到一致的数据库和图片快照，备份时先停止两个服务。下面的命令从 `server` 容器动态取得实际卷名，不依赖仓库所在目录的名称。

```bash
SERVER_ID="$(docker compose ps --all -q server)"
DB_VOLUME="$(docker inspect "$SERVER_ID" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
UPLOADS_VOLUME="$(docker inspect "$SERVER_ID" --format '{{range .Mounts}}{{if eq .Destination "/data/uploads"}}{{.Name}}{{end}}{{end}}')"
test -n "$DB_VOLUME" && test -n "$UPLOADS_VOLUME"

BACKUP_DIR="$(pwd)/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

docker compose stop
docker run --rm -v "$DB_VOLUME:/source:ro" alpine:3.22 tar -czf - -C /source . > "$BACKUP_DIR/db.tar.gz"
docker run --rm -v "$UPLOADS_VOLUME:/source:ro" alpine:3.22 tar -czf - -C /source . > "$BACKUP_DIR/uploads.tar.gz"
docker compose start

tar -tzf "$BACKUP_DIR/db.tar.gz" >/dev/null
tar -tzf "$BACKUP_DIR/uploads.tar.gz" >/dev/null
ls -lh "$BACKUP_DIR"
```

备份必须同时包含 `db.tar.gz` 和 `uploads.tar.gz`。它们不包含 `.env`，请单独保管一份受限访问的配置副本。定期把备份复制到另一台机器或对象存储；只留在当前服务器上不能防止磁盘损坏。

## 恢复备份

恢复会覆盖当前数据库和全部图片。先为当前数据再做一次备份，并确认目标目录同时包含两个归档文件。

```bash
BACKUP_DIR="$(pwd)/backups/替换为备份目录"
test -f "$BACKUP_DIR/db.tar.gz"
test -f "$BACKUP_DIR/uploads.tar.gz"

# 新服务器还没有容器时，先运行：docker compose create --build
SERVER_ID="$(docker compose ps --all -q server)"
DB_VOLUME="$(docker inspect "$SERVER_ID" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
UPLOADS_VOLUME="$(docker inspect "$SERVER_ID" --format '{{range .Mounts}}{{if eq .Destination "/data/uploads"}}{{.Name}}{{end}}{{end}}')"
test -n "$DB_VOLUME" && test -n "$UPLOADS_VOLUME"

read -r -p '输入 RESTORE 覆盖当前数据：' CONFIRM
test "$CONFIRM" = 'RESTORE'

docker compose stop
docker run --rm -i -v "$DB_VOLUME:/target" alpine:3.22 sh -c 'rm -rf /target/* /target/.[!.]* /target/..?* && tar -xzf - -C /target' < "$BACKUP_DIR/db.tar.gz"
docker run --rm -i -v "$UPLOADS_VOLUME:/target" alpine:3.22 sh -c 'rm -rf /target/* /target/.[!.]* /target/..?* && tar -xzf - -C /target' < "$BACKUP_DIR/uploads.tar.gz"
docker compose start

curl -f http://127.0.0.1:8080/api/health
```

如果正式环境已经绑定域名，也应通过 HTTPS 地址再检查一次。恢复失败时不要反复启动服务，先保留现场并查看归档文件和容器日志。

## 升级

升级前先备份，然后拉取代码并重新构建：

```bash
git pull --ff-only
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:8080/api/health
```

`docker compose up -d --build` 不会主动删除命名卷。不要把 `down -v` 写进升级脚本。

## 日志和排查

```bash
# 查看容器状态
docker compose ps

# 跟随日志
docker compose logs -f --tail=100 server web

# 检查环境变量和端口展开结果
docker compose config

# 重新构建单个服务
docker compose up -d --build server
docker compose up -d --build web
```

常见问题：

- 提示 `JWT_SECRET` 缺失：检查 `.env` 中该值是否为空，再运行 `docker compose config --quiet`。
- `/api/health` 返回 502：查看 `server` 是否为 `healthy`，并检查后端日志。
- 页面能打开但上传失败：检查 `MAX_UPLOAD_BYTES`、磁盘空间和 `uploads` 卷。
- 域名出现重定向或同源问题：确认外层代理传递了原始 `Host`，并把 `X-Forwarded-Proto` 设置为实际协议。
- 修改 `.env` 后没有生效：用 `docker compose up -d --force-recreate` 重建容器。

## 停止或卸载

临时停止并保留数据：

```bash
docker compose stop
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
