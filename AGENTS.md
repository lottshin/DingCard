# DingCard 仓库常设指令

这些规则对本仓库的任何 agent 会话生效。它们不是建议——违反其中任何一条都算事故。

## 测试与机器纪律（最重要）

这台机器是用户日常工作的电脑，不是 CI 机器。

1. **本地只跑轻量验证**：`npm run build`、`npx tsc --noEmit`、`npm run test:unit`、`npm --prefix mcp run test`、`npm --prefix mcp run build`、`npm --prefix server test`、`node server/smoke-test.mjs`、`node --test scripts/release-readiness.test.mjs`。全套加起来约两分钟。
2. **浏览器测试（Playwright）只能通过闸门**：`npm run test:e2e -- <spec 文件> -g "用例名"`。闸门（`scripts/e2e-guard.mjs`）会拒绝全量运行、拒绝负载 ≥ 10 时的任何运行、并把每次决定记入 `scripts/.e2e-audit.log`。**不要绕过闸门直接调 `npx playwright test`。**
3. **全量 e2e 属于 CI**：push 之后看 GitHub Actions 的 browser job（那里显式设了 `DINGCARD_FULL_E2E=1`）。本地永远不跑 437 条全套——哪怕"看起来很快"、"只是确认一下"、"机器现在很闲"。这一条没有例外，约定过一次违反它属于严重事故。
4. 跑任何浏览器测试前，闸门已经替你查了负载；如果你发现自己在想"先跑起来再说"，停。
5. 用户可能同时在这台机器上跑其他项目（游戏开发、浏览器自动化等）。负载高时先等，不要和用户抢 CPU。

## 交付协议

- 每个功能一个分支（`feat/…`），只允许 ff 合入 master；在分支上提交前，先在分支起点创建分支（不要直接在 master 上提交）。
- 每个分支的验证阶梯 = 上面的轻量验证集；全量 e2e 由发版后的 CI 承担。
- 发版（0.X.0）流程：版本级联（root + mcp 的 `npm version`、README 徽章与 GHCR 固定镜像、`.env.example`、`docker-compose.yml`、`docs/deployment.md`、`docs/backend-plan.md`、`CHANGELOG`、`scripts/release-readiness.test.mjs` 的全部版本断言，含转义正则字面量）→ 轻量阶梯全绿 → push → CI 绿 → `git tag v0.X.0` 并推送 → 镜像工作流绿 → demo 检查 → 重启 5373。
- 推送用 `git -c http.proxy=http://127.0.0.1:7897 push`，GitHub CLI 走 `HTTPS_PROXY=http://127.0.0.1:7897`。
- `.zcodeignore` 不是本仓库的文件，永远不要提交它。

## 文档版本纪律

文档版本号和节点类型列表从代码常量生成（`FREEFORM_DOCUMENT_VERSION`、`FREEFORM_NODE_TYPES`），有漂移测试盯着——改文档结构前先看 `mcp/src/docs.test.ts` 和体积守卫上限。
