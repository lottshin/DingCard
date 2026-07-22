# README Vercel 一键部署按钮设计

## 目标

让访问 GitHub 仓库的用户可以从 README 直接创建自己的 Vercel 部署。

## 展示位置

按钮放在 README 顶部的“在线体验”链接下方，与现有项目介绍保持在同一个居中区域。按钮使用 Vercel 官方提供的 `https://vercel.com/button` SVG，不新增仓库内图片资源。

## 目标链接

按钮链接指向：

`https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Flottshin%2FDingCard`

该链接只指定公开 GitHub 仓库，不预填第三方服务、环境变量或收费资源。

## 部署口径

- 一键部署默认构建 Vite 前端，构建命令和输出目录由 Vercel 自动识别。
- 默认使用项目的 `LocalStore` 模式，不要求配置 `VITE_API_BASE`。
- 草稿和账号数据保存在部署访问者当前使用的浏览器中。
- 仓库中的 Fastify + SQLite 服务端不属于这条一键部署链路；需要远端数据模式的用户继续参考 README 的服务器模式说明。

## 验证条件

- Vercel 官方按钮 SVG 返回 HTTP 200，内容类型为 SVG。
- 一键部署链接返回 HTTP 200，并保留 DingCard 仓库地址参数。
- README 中原有在线 Demo 地址和本地数据提示保持不变。
- 文档修改通过 `git diff --check` 和现有发布检查。
