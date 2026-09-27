// dingcard-mcp — MCP server exposing DingCard's freeform document model,
// template registry, reducer, and headless PNG rendering to AI clients.
//
// Protocol: stdio. All diagnostics go to stderr; stdout is JSON-RPC only.

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { applyActions, inspectDocument, validateDocument } from './core/document'
import { instantiateTemplate, listTemplates } from './core/templates'
import { renderDocument, renderMarkdownDocument } from './render/renderer'

function jsonResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

function errorResult(error: unknown) {
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : typeof error === 'string' && error.trim()
      ? error
      : '未知错误'
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

const DOCUMENT_SCHEMA_HINT = `document：自由画布 v4 文档（JSON）。
顶层 { documentVersion: 4, slides: [...], activeSlideId }；每页 { id, name, width(128–4096), height(128–4096), background, nodes }。
background 为 { type: 'solid', color } | { type: 'linear-gradient', from, to, angle } | { type: 'transparent' }。
节点四选一，键必须精确匹配（不允许多余/缺失键），公共键：id, name, locked, hidden, type, x, y, rotation, scale(>0)：
- text：+ width, height, text, fontSize, fontFamily, textFill(ColorPaint), align('left'|'center'|'right'), fontWeight('normal'|'bold')
- image：+ width, height, src(URL 或 data URL), alt, fit('cover'|'contain'), framing({ focusX, focusY, zoom(1–4) })
- shape：+ width, height, shape('rect'|'ellipse'|'triangle'), fill(ColorPaint 或 { type: 'image', src, fit, framing }), stroke, strokeWidth
- line：+ width, height, lineKind('line'|'arrow'), stroke, strokeWidth
- group：+ children（非空节点数组；组没有 width/height）
全文档节点 id 必须唯一。`

const ACTIONS_SCHEMA_HINT = `actions：FreeformAction 数组（与编辑器 UI 完全同一归约器）。常用动作：
- { type: 'slide/add-after-active', slideId? } 在当前页后新增空白页
- { type: 'slide/duplicate', slideId, duplicateSlideId? } 复制页
- { type: 'slide/delete', slideId } / { type: 'slide/select', slideId }
- { type: 'slide/update', slideId, patch: { name?, background? } } / { type: 'slide/resize', slideId, width, height }
- { type: 'node/insert-children', slideId, parentPath: string[], nodes: FreeformSceneNode[], index? } 插入节点
- { type: 'node/update-content', slideId, updates: [{ path, patch: { text?, src?, alt? } }] }
- { type: 'node/update-style', slideId, updates: [{ path, patch: { fontSize?, fontFamily?, textFill?, align?, fontWeight?, fit?, framing?, shape?, fill?, stroke?, strokeWidth?, lineKind? } }] }
- { type: 'node/update-geometry', slideId, updates: [{ path, patch: { x?, y?, width?, height?, rotation?, scale? } }] }
- { type: 'node/rename' | 'node/set-locked' | 'node/set-hidden', slideId, path, ... }
- { type: 'node/delete', slideId, parentPath, nodeIds } / { type: 'node/clone', slideId, parentPath, nodeIds }
- { type: 'node/reorder', slideId, parentPath, nodeIds, direction: 'forward'|'backward'|'front'|'back' }
- { type: 'group/create', slideId, parentPath, nodeIds, name? } / { type: 'group/ungroup', slideId, parentPath, groupIds, mode: 'one-level'|'all-level' }
path 是从页面根到目标节点的节点 id 数组（[] 表示页面根）。无效动作会被静默忽略（changes 里对应 false），不会报错。`

/** Build a dingcard MCP server with all tools registered. */
export function createDingcardServer(): McpServer {
  const server = new McpServer({
    name: 'dingcard-mcp',
    version: '0.16.0',
  })

  server.tool(
    'list_templates',
    '列出叮卡内置模板（id、标题、描述、页数、标签、所属工作台）。先用它拿到 templateId。',
    {},
    async () => jsonResult({ templates: listTemplates() }),
  )

  server.tool(
    'create_document_from_template',
    '按模板 id 实例化一份完整的可编辑文档数据：自由画布模板返回 v4 文档（可直接传给 apply_actions / render_document），Markdown 模板返回 { source, platformId, themeId, fontFamily, radius, profile, images? } 信封（可用 render_markdown 无头渲染）。',
    { templateId: z.string().describe('list_templates 返回的模板 id，如 "editorial-freeform"') },
    async ({ templateId }) => {
      try {
        return jsonResult(instantiateTemplate(templateId))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.tool(
    'validate_document',
    `校验 JSON 是否为合法的自由画布 v4 文档；合法时返回规范化后的文档，非法时返回原因。${DOCUMENT_SCHEMA_HINT}`,
    { document: z.unknown().describe('待校验的 v4 文档 JSON') },
    async ({ document }) => jsonResult(validateDocument(document)),
  )

  server.tool(
    'inspect_document',
    `检查文档结构：页面摘要（尺寸/背景/节点数）与递归节点树（id、name、type、几何、文本摘要）。改文档前先 inspect，拿到节点 id / 路径再发动作。${DOCUMENT_SCHEMA_HINT}`,
    { document: z.unknown().describe('v4 文档 JSON') },
    async ({ document }) => jsonResult(inspectDocument(document)),
  )

  server.tool(
    'apply_actions',
    `对文档应用一串编辑动作（与编辑器 UI 同一归约器，语义完全一致），返回应用后的新文档与每个动作是否生效。${DOCUMENT_SCHEMA_HINT}。${ACTIONS_SCHEMA_HINT}`,
    {
      document: z.unknown().describe('v4 文档 JSON'),
      actions: z.array(z.unknown()).describe('FreeformAction 数组'),
    },
    async ({ document, actions }) => jsonResult(applyActions(document, actions)),
  )

  server.tool(
    'render_document',
    `把自由画布 v4 文档无头渲染为 PNG 文件（与编辑器导出同一管线：网页字体按字符子集嵌入、图片就绪等待、逐页导出）。输出 <baseName>-01.png、<baseName>-02.png… 到 outputDir。仅支持自由画布文档；文档中的图片 src 必须是浏览器可加载的 URL 或 data URL。${DOCUMENT_SCHEMA_HINT}`,
    {
      document: z.unknown().describe('v4 文档 JSON'),
      outputDir: z.string().describe('PNG 输出目录（不存在会创建）'),
      baseName: z.string().optional().describe('输出文件名前缀，默认 "dingcard"'),
      slideIds: z.array(z.string()).optional().describe('只渲染这些页（默认全部）'),
    },
    async ({ document, outputDir, baseName, slideIds }) =>
      jsonResult(await renderDocument(document, { outputDir, baseName, slideIds })),
  )

  server.tool(
    'render_markdown',
    `把 Markdown 文档信封无头渲染为一套卡片 PNG（与 Markdown 工作台导出同一管线：DOM 实测分页、平台头部与主题、网页字体按字符子集嵌入、逐页 pixelRatio 3 导出）。输出 <baseName>-01.png、<baseName>-02.png… 到 outputDir；页数由分页决定。
document 为 Markdown 文档信封：{ source: Markdown 文本（--- 为手动分页）, platformId: 'rednote'|'weibo'|'twitter', themeId: 主题 id（如 'light'）, fontFamily, radius: 数字圆角, profile: { nickname, handle, location, avatarColor, avatarImage: dataURL 或 null, verified, headerFirstPageOnly }, images?: { "img:<id>": dataURL } }。`,
    {
      document: z.unknown().describe('Markdown 文档信封 JSON'),
      outputDir: z.string().describe('PNG 输出目录（不存在会创建）'),
      baseName: z.string().optional().describe('输出文件名前缀，默认 "dingcard"'),
    },
    async ({ document, outputDir, baseName }) =>
      jsonResult(await renderMarkdownDocument(document, { outputDir, baseName })),
  )

  // ---- Resources: let clients discover the document schema, action union,
  // template list, and full example documents without guessing from tool
  // descriptions. Static URIs, read-only, same data the tools return. ----
  const textResource = (text: string) => async (uri: URL) => ({
    contents: [{ uri: uri.href, mimeType: 'text/markdown', text }],
  })

  server.registerResource(
    'freeform-schema',
    'dingcard://schema/freeform',
    { description: '自由画布 v4 文档模型与校验规则说明' },
    textResource(DOCUMENT_SCHEMA_HINT),
  )
  server.registerResource(
    'actions-schema',
    'dingcard://schema/actions',
    { description: 'FreeformAction 动作联合类型说明（apply_actions 的入参结构）' },
    textResource(ACTIONS_SCHEMA_HINT),
  )
  server.registerResource(
    'templates',
    'dingcard://templates',
    { description: '内置模板清单（与 list_templates 相同的数据）', mimeType: 'application/json' },
    async (uri: URL) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify({ templates: listTemplates() }, null, 2),
      }],
    }),
  )
  server.registerResource(
    'freeform-example',
    'dingcard://examples/freeform',
    { description: '完整自由画布 v4 文档示例（编辑部模板实例）', mimeType: 'application/json' },
    async (uri: URL) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(instantiateTemplate('editorial-freeform').document, null, 2),
      }],
    }),
  )
  server.registerResource(
    'markdown-example',
    'dingcard://examples/markdown',
    { description: '完整 Markdown 文档信封示例（编辑档案模板实例）', mimeType: 'application/json' },
    async (uri: URL) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(instantiateTemplate('editorial-archive-markdown').document, null, 2),
      }],
    }),
  )

  return server
}

async function main() {
  const server = createDingcardServer()
  await server.connect(new StdioServerTransport())
}

// Run as a server only when executed directly (import.meta.main equivalent);
// tests import this module without opening stdio.
const entryPath = process.argv[1]
if (entryPath && import.meta.url === pathToFileURL(path.resolve(entryPath)).href) {
  main().catch((error) => {
    console.error('[dingcard-mcp] 启动失败：', error)
    process.exit(1)
  })
}
