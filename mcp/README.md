# dingcard-mcp

叮卡（DingCard）的 MCP 服务器：让 AI 客户端直接生成、检查、修改和导出叮卡的自由画布卡片，再一步交给编辑器让人接着改。

- 生成：`create_document_from_template`、`create_document_from_content`、`create_document_from_outline`
- 查看与修改：`inspect_document`、`apply_actions`（与编辑器同一个归约器）、`list_icons`、`list_styles`
- 检查：`check_document`（按导出的样子排版后列出看得见的问题）
- 导出：`render_document`（逐页 PNG / JPG、一个 PDF 或一张长图）、`render_markdown`
- 交给人：`open_in_editor`（在浏览器里的叮卡编辑器打开）、`get_document`

服务端保存它创建和修改的文档，工具之间传 `documentId` 即可，不必来回传整份 JSON；图片可以直接写本机文件路径，会自动嵌入。

## 接入

```json
{
  "mcpServers": {
    "dingcard": { "command": "npx", "args": ["-y", "dingcard-mcp"] }
  }
}
```

需要 Node.js 20 以上和本机安装的 Chrome（渲染、检查用）。完整说明见 [docs/mcp.md](https://github.com/lottshin/DingCard/blob/master/docs/mcp.md)。
