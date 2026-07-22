# Repository Discovery Metadata

## Goal

让 GitHub 仓库首页在不打开 README 的情况下说明 DingCard 是什么，并让自托管用户能快速找到 Docker 入口。

## Scope

- 设置 GitHub About 描述：`小红书长文排版与轻设计出图工具，支持 Markdown 自动分页、自由画布和 Docker 自托管。`
- 设置主页为现有 Demo `https://dingcard.vercel.app`。
- 添加少量准确 Topics：`xiaohongshu`、`markdown`、`design-tool`、`canvas`、`docker`、`react`、`typescript`。
- 在 README 的“使用与部署”下增加独立的“Docker 部署”小节，明确 GHCR 镜像版本和 Compose 启动命令；保留现有 Vercel 部署说明。

## Out Of Scope

- 不改应用代码、版本号、Dockerfile 或 Compose 行为。
- 不新增 `docker run` 入口，不重复维护一套绕过 Compose 卷和密钥配置的命令。
- 不修改 README 的产品介绍、截图或其他部署章节。

## Acceptance Criteria

1. GitHub About 显示描述、Demo 主页和上述 Topics。
2. README 在首次查看部署部分时能看到 Docker 小节、固定 `0.11.0` 镜像版本和 `docker compose pull` / `docker compose up -d --no-build`。
3. README 中的 Docker 命令与 `docker-compose.yml`、`docs/deployment.md` 保持一致。
4. 文案简洁直接，不使用宣传式套话或重复说明。
