# 0.15.0 发布验证

- 验证日期：2026-08-05
- 版本标签：`v0.15.0`
- Commit under test：`a98fe3878a9fc6a94d8aa21fcb3e18406beca84a`
- GitHub CI：[run 30978061561](https://github.com/lottshin/DingCard/actions/runs/30978061561)
- 镜像发布：[run 30980123506](https://github.com/lottshin/DingCard/actions/runs/30980123506)

`PASS` 表示对应命令或 GitHub Actions job 已按预期完成。本报告只记录实际执行结果。

| Check | Status | Evidence |
|---|---|---|
| Release contract | PASS | `node --test scripts/release-readiness.test.mjs`：11/11；GitHub CI 同步执行。 |
| Frontend unit | PASS | `npm run test:unit`：32 个测试文件，639/639。 |
| Backend tests | PASS | `npm run test:server`：72/72。 |
| Backend HTTP smoke | PASS | `node server/smoke-test.mjs` 覆盖认证、所有权、413/415/429、租约回收和并发配额。 |
| Production build | PASS | `npm run build` 完成 TypeScript 与 Vite 构建；保留已知的单 chunk 体积警告。 |
| CI YAML | PASS | GitHub CI 解析 `ci.yml` 与 `publish-image.yml`，static、browser、container 三个 job 全部通过。 |
| Full E2E | PASS | `npm run test:e2e`：242/242。 |
| Compose config | PASS | container job 运行 `deploy/compose-smoke.sh`；展开后的服务只有 `app`。 |
| Container smoke | PASS | 迁移账号、草稿和图片由新 `app` 继续读取；Fastify 提供首页、`/api/health`、注册、上传和 `/assets/`。 |
| Compose cleanup | PASS | smoke 结束后，临时容器、网络、卷和镜像标签均不存在。 |
| Image manifest | PASS | `ghcr.io/lottshin/dingcard:0.15.0` digest 为 `sha256:0e16fa6a08cc19b63bde83a49232a4556bebf0758246bd4f4ba6b7b3699a7a93`，包含 `linux/amd64` 与 `linux/arm64`。 |
| Anonymous pull | PASS | publish job 登出 GHCR 后，通过公开 token 请求取得 `0.15.0` manifest。 |
| amd64 image smoke | PASS | run 30980123506 匿名拉取 `linux/amd64`，首页、健康接口和静态资源检查通过。 |
| arm64 image smoke | PASS | run 30980123506 通过 QEMU 匿名拉取 `linux/arm64`，首页、健康接口和静态资源检查通过。 |

## 构建产物

- `dist/index.html`：2.35 kB，gzip 1.12 kB。
- `dist/assets/index-CVfg75Wi.css`：102.39 kB，gzip 16.38 kB。
- `dist/assets/index-Dl1aACLe.js`：1,195.47 kB，gzip 396.90 kB。
- Vite 仍提示单 chunk 超过 500 kB。本次发布保留现有包体积，构建退出码为 0。

## 镜像

```bash
docker pull ghcr.io/lottshin/dingcard:0.15.0
```

镜像同时发布了 `0.15`、`latest` 和提交 SHA 标签，并带有 SBOM、provenance 与 OCI 元数据。Compose 默认固定 `0.15.0`，生产部署不依赖浮动的 `latest`。

## 数据边界

Compose 迁移 smoke：PASS。从旧镜像升级时会继续使用 `db` 和 `uploads` 命名卷。浏览器 LocalStore 与服务端 RemoteStore 仍是两套独立数据，不会因为切换部署方式自动迁移草稿、账号或图片。
