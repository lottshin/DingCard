# 0.10.1 本地发布验证

- 验证日期：2026-07-20
- Commit under test：NOT EXECUTED
- 环境：Windows 10 / PowerShell / Node.js 20；Docker、Compose 与 Bash 状态待检查

状态含义：`PASS` 表示命令在本次验证中以预期结果完成；`FAIL` 表示已经执行但未满足契约；`NOT EXECUTED` 表示尚未执行或当前环境不具备前置条件。

| Check | Status | Evidence |
|---|---|---|
| Release contract | NOT EXECUTED | 待运行。 |
| Frontend unit | NOT EXECUTED | 待运行。 |
| Backend tests | NOT EXECUTED | 待运行。 |
| Backend HTTP smoke | NOT EXECUTED | 待运行。 |
| Production build | NOT EXECUTED | 待运行。 |
| CI YAML | NOT EXECUTED | 待运行。 |
| Full E2E | NOT EXECUTED | 待运行。 |
| Compose config | NOT EXECUTED | 待检查 Docker CLI 与 Compose 插件。 |
| Container smoke | NOT EXECUTED | 待检查 Docker daemon 与 Bash。 |
| Compose cleanup | NOT EXECUTED | 仅在容器冒烟实际执行后记录。 |

## 构建产物

待记录生产构建的实际 JS/CSS 原始体积、gzip 体积和警告。

## Docker 验证

待分别记录 Docker CLI、Compose 插件、daemon、配置展开、HTTP 健康检查和资源清理结果。配置验证与容器冒烟是独立结果，daemon 不可用不应覆盖 Compose 配置解析结果。

