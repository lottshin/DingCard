# MCP 自动化接口

叮卡自带一个 MCP（Model Context Protocol）服务器 `dingcard-mcp`，让 AI 客户端（Claude Desktop、Cursor、ZCode 等任何支持 MCP 的工具）和其他程序可以不走浏览器 UI，直接完成“选模板 → 构造/编辑文档 → 校验 → 无头渲染 PNG”的完整闭环：

```text
list_templates → create_document_from_template → inspect_document
      → apply_actions（与编辑器同一动作归约器）→ render_document → PNG 文件
```

渲染与编辑器导出走同一套管线：自由画布逐页 `pixelRatio: 1` 导出；Markdown 走工作台自己的管线（DOM 实测分页、平台头部与主题、`---` 手动分页、`pixelRatio: 3` 导出）；两者都做网页字体按字符子集嵌入与图片就绪等待。

## 工具一览

| 工具 | 作用 |
| --- | --- |
| `list_templates` | 列出内置模板（id、标题、描述、页数、标签、工作台）。 |
| `create_document_from_template` | 按模板 id 实例化完整文档：自由画布返回 v4 文档，Markdown 返回源文信封。 |
| `validate_document` | 严格校验 v4 文档（精确键匹配、几何范围、id 唯一性），合法时返回规范化结果。 |
| `inspect_document` | 输出页面摘要与递归节点树（id、name、type、几何、文本摘要），为编辑提供目标。 |
| `apply_actions` | 用与编辑器 UI 完全相同的 `FreeformAction` 归约器应用一串编辑，逐步报告是否生效。 |
| `render_document` | 无头渲染自由画布 v4 文档为 PNG 文件，输出 `<baseName>-01.png`、`-02.png`… 到指定目录。 |
| `render_markdown` | 无头渲染 Markdown 文档信封为一套卡片 PNG：DOM 实测分页（`---` 为手动分页）、平台预设（`rednote`/`weibo`/`twitter`）、主题与个人资料头部、`pixelRatio: 3` 导出；页数由分页结果决定。 |

工具描述内嵌了 v4 文档模型、动作类型与 Markdown 信封的字段说明，AI 客户端无需额外文档即可正确构造参数。

## MCP 资源

除工具外，服务器还以只读资源（`resources/list` / `resources/read`）暴露说明与示例，客户端可以按需取用而不必从工具描述里拼凑：

| URI | 内容 |
| --- | --- |
| `dingcard://schema/freeform` | 自由画布 v4 文档模型与校验规则说明。 |
| `dingcard://schema/actions` | `FreeformAction` 动作联合类型说明（`apply_actions` 的入参结构）。 |
| `dingcard://templates` | 内置模板清单（与 `list_templates` 相同的数据）。 |
| `dingcard://examples/freeform` | 完整自由画布 v4 文档示例（编辑部模板实例）。 |
| `dingcard://examples/markdown` | 完整 Markdown 文档信封示例（编辑档案模板实例）。 |

## 回到编辑器精修

AI 生成的文档 JSON 可以直接回到叮卡里精修：打开「我的草稿」面板，点击「导入 JSON 文档」或把 `.json` 文件拖进面板。自由画布文档（v1–v4，旧版自动迁移）会存为草稿并直接在自由画布打开；Markdown 文档同样支持，与当前工作台模式不符时会保存并提示到对应工作台打开。非法文件会给出可读的错误提示。由此形成完整闭环：

```text
AI 生成文档 → 导入叮卡精修 → 编辑器导出 PNG
```

## 安装与启动

仓库内的 `mcp/` 是独立 npm 包（不进入前端依赖树和 Docker 镜像）：

```bash
npm --prefix mcp ci
npm --prefix mcp run build
npm run mcp          # 等价于 npm --prefix mcp start，以 stdio 启动服务器
```

## 客户端接入

任何支持 stdio MCP 的客户端都可以用如下命令接入（在仓库根目录执行）：

```json
{
  "mcpServers": {
    "dingcard": {
      "command": "npm",
      "args": ["--prefix", "mcp", "start"]
    }
  }
}
```

## 环境与配置

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DINGCARD_DIST_DIR` | `<仓库>/dist` | 渲染使用的构建产物目录。目录里没有 `render.html` 时，默认目录会自动执行一次 `npm run build`；自定义目录缺失则直接报错。 |

其他要求：

- **Node.js 20+**（与主项目一致）。
- **浏览器**：渲染优先使用系统安装的 Google Chrome（与 E2E 测试同一策略，零下载）。没有 Chrome 时会尝试默认 Chromium；两者都不可用会返回明确的错误信息。也可另行执行 `npx playwright install chromium`。
- 首次渲染前需要一次前端构建（自动触发，产物会被后续渲染复用）。

## 安全与边界

- 静态文件服务器只监听 `127.0.0.1` 的随机端口，带路径穿越防护，渲染结束即关闭。
- MCP 服务器只读写本地文件（PNG 输出目录由调用方指定）；不连接远程账号、草稿或图片存储。
- stdout 只承载 JSON-RPC 协议，构建日志与诊断一律走 stderr。

## 当前限制

- `render_document` 仅支持自由画布 v4 文档；`render_markdown` 仅支持 Markdown 文档信封。
- `list_templates` 与 `create_document_from_template` 只覆盖代码内置模板；编辑器「存为模板」保存的个人模板存在浏览器本地（按账号隔离），不进入 MCP。需要渲染自己的文档时，把文档直接传给 `render_document` / `render_markdown`。
- 文档中的图片 `src`（自由画布）必须是浏览器可加载的 URL 或 data URL；Markdown 文档的图片通过信封的 `images` 映射（`img:<id>` → data URL）提供，本地文件请先转为 data URL。
- 一次调用串行渲染全部所选页面，没有并发渲染池。
- Markdown 平台头部中的时间戳（微博/推特）按渲染时刻生成，与编辑器导出行为一致。
