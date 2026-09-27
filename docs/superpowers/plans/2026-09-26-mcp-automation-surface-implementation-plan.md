# MCP 自动化接口 Implementation Plan

依据:`docs/superpowers/specs/2026-09-26-mcp-automation-surface-design.md`

## 文件结构

```
render.html                      # 无 UI 渲染入口(第二 Vite 入口)
src/render/renderPage.tsx        # 渲染页:注入文档 → 逐页导出 PNG data URL
vite.config.ts                   # 多页面 input(index + render)
Dockerfile                       # 拷贝 render.html
mcp/
  package.json                   # dingcard-mcp;deps: @modelcontextprotocol/sdk, playwright
  tsconfig.json                  # 仅类型检查(noEmit),入口为 mcp/src 与 src 纯模块
  vitest.config.ts               # 单元测试(include: src/**/*.test.ts)
  src/
    index.ts                     # stdio MCP 服务器与工具注册
    core/templates.ts            # list_templates / create_document_from_template
    core/document.ts             # validate / inspect / apply_actions
    render/staticServer.ts       # 127.0.0.1 静态 dist 服务器
    render/renderer.ts           # 构建保障 + Playwright 驱动 + PNG 落盘
    core/templates.test.ts
    core/document.test.ts
    render/staticServer.test.ts
    render/render.test.ts        # 真实浏览器渲染管线(npm run test:render)
```

## Task 1: 渲染入口(render.html + renderPage)

- `render.html`:复用 `index.html` 的字体声明与 favicon,不含主题脚本;`<div id="root">` 挂 `/src/render/renderPage.tsx`。
- `src/render/renderPage.tsx`:
  - 读取 `window.__DINGCARD_RENDER__`(缺失 → 结果 `{ ok: false, error: 'missing payload' }`)。
  - `normalizeFreeformDocument` 校验;失败即写错误结果。
  - 状态机:`{ phase: 'rendering', index }` 逐页挂载;复刻画板标记与内联样式(width/height/background)。
  - 每页:`waitForFramedImages(artboardRef, { timeoutMs: 3500 })` → 双 rAF → `toBlob(node, { pixelRatio: 1, width, height, fontEmbedCSS })`;`fontEmbedCSS` 一次性对全部页用 `collectFreeformFontRequests` + `buildFreeformFontCSS`。
  - 汇总 `window.__DINGCARD_RENDER_RESULT__ = { ok: true, slides: [...] }`;异常捕获为 `{ ok: false, error }`。
- `vite.config.ts`:`build.rollupOptions.input = { main: 'index.html', render: 'render.html' }`。
- Dockerfile:`COPY` 行加入 `render.html`。

验证:`npm run build` 产出 `dist/render.html`;`npx vite preview` 下手工注入可渲染。

## Task 2: mcp 包骨架与文档工具

- `mcp/package.json`(type: module;`build` = tsc 类型检查 + esbuild 打包 `src/index.ts` → `dist/index.mjs`,SDK 与 playwright external;`test` = vitest run;`test:render` = vitest run `render/render.test.ts`;`start` = `node dist/index.mjs`)。
- `mcp/tsconfig.json`:strict、ES2022、types: node;include `src` + `../src` 纯模块入口(document/sceneDocument/registry/theme/templates types);noEmit。
- `core/templates.ts`:`listTemplates()`(id/title/description/pageCount/tags/workspace)、`instantiateTemplate(templateId)`(自由画布返回 v4 文档,Markdown 返回模板数据;未知 id 抛带候选清单的错误)。
- `core/document.ts`:
  - `validateDocument(value)`:`normalizeFreeformDocument` → 成功 `{ ok: true, document }`,失败 `{ ok: false, error: '...(v4)' }`。
  - `inspectDocument(value)`:页面摘要(id/name/width/height/背景类型/节点数)+ 递归节点树(相对父级 x/y/w/h、rotation、type、name、id、文本节点带 `text` 摘要与 fontFamily/fontSize)。
  - `applyActions(value, actions[])`:先校验;逐个 `reduceFreeformDocument`(默认 `nodeIdFactory` 为 `crypto.randomUUID`);逐步 JSON 对比记录 `changed`;任一步后再次校验失败则整体报错(归约器保证不产生非法文档,此为防御)。
- 单元测试覆盖上述全部行为。

## Task 3: 静态服务器与无头渲染器

- `render/staticServer.ts`:`createStaticServer(rootDir)` → `node:http` 服务器;`listen(127.0.0.1, 0)`;MIME 表(html/js/mjs/css/svg/png/webp/woff2/json/ico);`..` 与绝对路径拒绝;`close()`;返回 `{ server, port }`。
- `render/renderer.ts`:`renderDocument(document, { outputDir, baseName, slideIds })`:
  1. `resolveDistDir()`:env `DINGCARD_DIST_DIR` || `<repo>/dist`;`render.html` 缺失 → `spawn('npm', ['run', 'build'])`(cwd 仓库根,stdio ignore,等待退出码)。
  2. 启动静态服务器;`chromium.launch({ channel: 'chrome', headless: true })`,失败回退无 channel。
  3. `addInitScript` 注入 payload;`goto('/render.html')`;`waitForFunction` 结果;超时 120s。
  4. 逐张 data URL → Buffer 写 `<baseName>-<n>.png`(或按 slideIds 过滤);`close()` 资源(finally)。
  5. 返回 `{ files: [{ path, slideId, name, width, height, bytes }], distDir }`。
- `staticServer.test.ts`:MIME、穿越防护、端口为随机回环。
- `render.test.ts`(真实浏览器):实例化 editorial 模板 → render → 3 个 PNG 存在、字节 > 0、PNG IHDR 宽高 1080×1440。

## Task 4: MCP 服务器

- `src/index.ts`:`McpServer` + `StdioServerTransport`;注册 6 个工具(zod 入参:`document`/`actions` 为 `z.unknown()` 放行,真实校验在 core;`templateId`/`outputDir`/`baseName`/`slideIds` 为强类型)。
- 工具描述用中文+字段表,向调用方(MCP 客户端)传授 v4 模型与 action 联合类型;`render_document` 描述明确"仅自由画布 v4 文档"。
- 成功返回 `{ content: [{ type: 'json', ... }] }`(按 SDK 支持的形式返回结构化 JSON);失败 `{ isError: true, content: [text] }`;诊断一律 stderr。
- 入口 guard:`import.meta.main` 等价判断(Node 下检查 `process.argv[1]`)。

## Task 5: 仓库合同同步

- 根 `package.json`:版本 `0.16.0`;新增脚本 `"mcp": "npm --prefix mcp start"`、`"test:mcp": "npm --prefix mcp test"`、`"test:mcp:render": "npm --prefix mcp run test:render"`;`test` 链加入 `test:mcp`。
- `package-lock.json` 两处版本号同步 0.16.0。
- README:新增 MCP 章节;记录全部新脚本;徽章与版本号改 0.16.0。
- CHANGELOG:`[0.16.0] - 2026-09-26`(Added: MCP 工具与无头渲染;Changed: 版本)。
- `scripts/release-readiness.test.mjs`:pin `0.16.0`(frontend/lock/README/CHANGELOG 章节),新增 mcp 相关合同(README 记录 `npm --prefix mcp` 用法、CI 执行 mcp 步骤)。
- `.github/workflows/ci.yml`:static 作业加 `npm --prefix mcp ci` + `npm --prefix mcp run build` + `npm --prefix mcp test`;browser 作业在 e2e 后加 `npm run build` + `npm --prefix mcp run test:render`。
- `docs/release-verification.md`:按实测更新。
- `docs/mcp.md`:完整使用文档。

## Task 6: 完整验证

- `npm run test:unit`(根,全绿)
- `npm run build`(产出含 render.html)
- `npm --prefix mcp test` + `npm --prefix mcp run test:render`
- `npm run test:server`、`node server/smoke-test.mjs`
- `node --test scripts/release-readiness.test.mjs`
- `npm run test:e2e`(全量)
- 端到端手验:临时脚本经 core API 完成 模板 → inspect → 改文本 → 渲染 PNG,确认像素尺寸与文件有效性。
