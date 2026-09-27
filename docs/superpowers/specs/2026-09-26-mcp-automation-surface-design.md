# MCP 自动化接口设计

## 1. 背景与目标

叮卡的文档模型已经是严格校验的纯 JSON(`FreeformDocument` v4:精确键校验、范围检查、确定性迁移),模板是程序化工厂,所有编辑操作都流经类型化的 `FreeformAction` 归约器。但这些能力目前只有浏览器 UI 一个入口:没有 CLI、没有无头渲染、没有可供外部程序(尤其是 AI 客户端)调用的接口。

本次为项目补上自动化操作面,交付一个 MCP(Model Context Protocol)服务器,让 AI 客户端和其他程序可以完整走通"选模板 → 构造/编辑文档 → 校验 → 渲染 PNG"的闭环:

- 列出内置模板并实例化为完整文档数据。
- 校验任意 JSON 是否为合法 v4 文档,并返回规范化结果。
- 检查文档结构(页面、节点树、几何、文本摘要),为后续编辑提供目标坐标。
- 用与 UI 完全相同的 `FreeformAction` 归约器对文档应用一串编辑。
- 无头渲染任意 v4 文档为 PNG 文件(复用编辑器同款导出管线:字体嵌入、图片就绪等待、逐页导出)。

## 2. 依据与范围

依据是现有代码事实:

- `src/freeform/sceneDocument.ts`、`src/freeform/document.ts`、`src/freeform/sceneTree.ts`、`src/freeform/paint.ts`、`src/freeform/imageFraming.ts`、`src/freeform/sceneTransform.ts`、`src/freeform/selection.ts`、`src/freeform/sceneSelection.ts`、`src/freeform/snapping.ts`、`src/theme.ts`、`src/templates/registry.ts` 均为无 DOM 依赖的纯 TypeScript,可直接在 Node 20 中运行(仅使用 `crypto.randomUUID()`)。
- 编辑器导出路径(`renderSlideBlob`):等待取景图片解码 → 双 `requestAnimationFrame` → `html-to-image` 的 `toBlob`(`pixelRatio: 1`、按页宽高、`fontEmbedCSS`)。渲染页逐页循环导出(与 ZIP 导出一致)。
- e2e 与集成测试均以系统 Chrome(`channel: 'chrome'`)无头驱动,无需下载浏览器。

本次包括:

- 新增 `render.html` 渲染入口与 `src/render/` 渲染页:接收注入的文档,逐页渲染并导出 PNG data URL,把结果写回 `window` 供外部驱动读取。
- 新增 `mcp/` 独立包(`dingcard-mcp`):stdio MCP 服务器、文档工具、模板工具、无头渲染器、`dist/` 静态服务器。
- MCP 工具:`list_templates`、`create_document_from_template`、`validate_document`、`inspect_document`、`apply_actions`、`render_document`。
- 单元测试(模板/校验/检查/动作/静态服务器)与真实浏览器渲染管线测试。
- 仓库合同同步:根 `package.json` 脚本、README、CHANGELOG、`docs/release-verification.md`、CI、Dockerfile(拷贝 `render.html`)。

本次不包括:

- Markdown 长文卡片的无头渲染(其分页依赖 DOM 测量,需要独立的接入管线,留待后续版本;`create_document_from_template` 仍可返回 Markdown 模板数据)。
- 服务端远程草稿的 MCP 直连(鉴权 token、HTTP 工具),本次 MCP 只操作本地文件。
- 模板 JSON 数据化(继续复用 TS 工厂,产物本身就是数据)。
- PDF/SVG 导出、并发渲染池。

## 3. 数据与兼容性

不改变任何持久化格式:

- `FreeformDocument` 仍为 v4;`apply_actions` 每一步都先经过 `normalizeFreeformDocument` 校验,输入与输出均为合法 v4 或明确报错。
- `render.html` 成为 `dist/` 内的新静态页面,不影响 `index.html` 应用、Docker 镜像与 Vercel 部署。
- MCP 包不进入 Docker 镜像、不进入前端依赖树;根依赖清单不变(仅 devDep 级别的新包都在 `mcp/package.json` 内)。
- 前端版本升至 `0.16.0`,服务端保持 `0.3.0`。

## 4. 渲染入口协议

`render.html` 是无 UI 的第二入口,页面生命周期:

1. 驱动方(Playwright)在导航前用 `addInitScript` 注入 `window.__DINGCARD_RENDER__ = { document }`。
2. 页面用 `normalizeFreeformDocument` 严格校验;失败则写入 `window.__DINGCARD_RENDER_RESULT__ = { ok: false, error }`。
3. 逐页渲染:每次只挂载当前页,复刻编辑器画板标记(`.freeform-artboard` + `.freeform-artwork-clip` + `FreeformSceneNodeView` 的 `presentationOnly` 模式),页尺寸与背景用同样的内联样式。
4. 每页导出前等待 `waitForFramedImages`(超时 3500ms,与编辑器一致)、双 `requestAnimationFrame`,再以 `pixelRatio: 1`、页宽高、`collectFreeformFontRequests` + `buildFreeformFontCSS` 生成的 `fontEmbedCSS` 调 `toBlob`。
5. 完成后写入 `window.__DINGCARD_RENDER_RESULT__ = { ok: true, slides: [{ slideId, name, width, height, dataUrl }] }`;任何一步失败写入 `{ ok: false, error }`。

页面标题与 `head` 复用 `index.html` 的 Google Fonts 声明(模板使用 Noto 系网页字体,字体嵌入管线按字符子集抓取)。

## 5. MCP 工具契约

所有工具的 `document`/`actions` 入参以真实校验器为准(`zod` 层放行为 `unknown`,由 `normalizeFreeformDocument` / 归约器判定),工具描述中携带 v4 模型的字段说明:

| 工具 | 入参 | 出参 |
| --- | --- | --- |
| `list_templates` | 无 | 模板元数据数组(id/title/description/pageCount/tags/workspace) |
| `create_document_from_template` | `templateId` | 完整文档 JSON(自由画布为 v4 文档,Markdown 为信封数据) |
| `validate_document` | `document` | `{ ok, document? }`(成功返回规范化后的 v4 文档)或 `{ ok: false, error }` |
| `inspect_document` | `document` | 页面摘要 + 递归节点树(id/name/type/几何/文本摘要) |
| `apply_actions` | `document`, `actions` | 每个动作应用后的新文档 + 每步是否生效 |
| `render_document` | `document`, `outputDir`, `baseName?`, `slideIds?` | 写入的 PNG 文件清单(路径/页信息/字节数) |

`apply_actions` 逐个动作走 `reduceFreeformDocument`(与 UI 完全同一实现,含无效动作静默不变语义),逐步对比 JSON 判断该动作是否生效,便于调用方发现"动作没起作用"。

## 6. 无头渲染器与静态服务器

- 渲染器:定位 `dist/`(可用 `DINGCARD_DIST_DIR` 覆盖);`render.html` 缺失时在仓库根执行一次 `npm run build`(输出不进入 stdout,避免污染 MCP 的 stdio 协议)。构建产物存在后直接复用。
- 静态服务器:`node:http` 实现的 127.0.0.1 回环服务器,随机端口,仅服务 `dist/` 目录,带路径穿越防护与常见 MIME 类型,渲染完成即关闭。
- 浏览器:`playwright` 的 `chromium.launch()`,优先 `channel: 'chrome'`(与 e2e 一致,零下载),失败回退默认 Chromium;无头;渲染结束关闭页面与浏览器。

## 7. 错误与边界处理

- 非法文档:`validate_document` 返回结构化错误;`render_document` 在注入前同样校验,不会渲染半成品。
- 构建缺失:`render.html` 不存在时自动构建一次;构建失败返回带原因的错误。
- 浏览器缺失:Chrome 与默认 Chromium 都不可用时,错误信息指引 `npx playwright install chromium`。
- 图片:文档中的 `src` 必须是浏览器可加载的 URL 或 data URL;加载失败按渲染页错误返回(与编辑器导出一致,不产出缺图文件)。
- MCP 服务器一切诊断输出走 stderr,stdout 仅承载 JSON-RPC。

## 8. 测试与验收

单元测试(`mcp/` 包内,vitest):

- 模板列举与实例化:全部模板可实例化且通过 v4 校验;未知模板报错。
- 校验:合法文档规范化往返;非法输入(多余键、坏几何、未知版本)被拒。
- 检查:节点树摘要包含 id/name/type/文本摘要与几何。
- 动作:追加页面、更新文本、移动、复制(默认 id 工厂)生效;非法动作不影响文档且 `changed=false`。
- 静态服务器:MIME、穿越防护、仅回环监听。

渲染管线测试(真实浏览器,CI browser 作业执行):实例化"编辑部"模板 → 渲染 → 三个 PNG 存在、字节非零、PNG IHDR 宽高与页面一致。

仓库级:根 `npm run test:unit`、`npm run build`、`npm --prefix mcp test`、`node --test scripts/release-readiness.test.mjs`、e2e 全量保持绿色。

## 9. 文档与版本

- `docs/mcp.md`:安装、客户端接入(Claude Desktop / 通用 MCP 客户端)、工具说明、`DINGCARD_DIST_DIR` 配置、安全边界。
- README 新增"MCP 自动化"章节,并记录新增根脚本。
- CHANGELOG 记入 `[0.16.0] - 2026-09-26`;`docs/release-verification.md` 更新实测数据。
- 发布合同测试同步 pin `0.16.0`。

## 10. 验收标准

- `npm --prefix mcp test` 与渲染管线测试全绿;根单元、构建、e2e、发布合同全绿。
- 用 MCP 工具(或等价 Node 调用)完成:实例化模板 → `inspect_document` → `apply_actions` 改一处文本 → `render_document` 产出与编辑器导出同规范的 PNG。
- `dist/render.html` 在 Docker 镜像与 Vercel 部署中不破坏现有应用。
