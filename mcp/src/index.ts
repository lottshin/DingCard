// dingcard-mcp — MCP server exposing DingCard's freeform document model,
// template registry, reducer, and headless PNG rendering to AI clients.
//
// Protocol: stdio. All diagnostics go to stderr; stdout is JSON-RPC only.

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { composeDeck } from './core/compose'
import { applyActions, inspectDocument, validateDocument } from './core/document'
import { createDocumentFromOutline } from './core/outline'
import { instantiateTemplate, listTemplates } from './core/templates'
import { checkDocument } from './render/check'
import { renderDocument, renderMarkdownDocument, type RenderResult } from './render/renderer'

function jsonResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

/** Previews shown to the model, at most this many per call. */
const MAX_PREVIEWS = 12

/** A render result as text plus the pages as small images, so the model can look at what it made. */
function renderResult(result: RenderResult, previews: boolean) {
  if (!result.ok) return jsonResult(result)
  const { previews: pages, ...rest } = result
  if (!previews) return jsonResult(rest)
  const shown = pages.slice(0, MAX_PREVIEWS)
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          ...rest,
          previews: `下面附了 ${shown.length} 张缩略图（按页序）${pages.length > shown.length ? `，其余 ${pages.length - shown.length} 页没附` : ''}。`,
        }, null, 2),
      },
      ...shown.map((page) => ({
        type: 'image' as const,
        data: page.dataUrl.slice(page.dataUrl.indexOf(',') + 1),
        mimeType: 'image/jpeg',
      })),
    ],
  }
}

function errorResult(error: unknown) {
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : typeof error === 'string' && error.trim()
      ? error
      : '未知错误'
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

const SHADOW_HINT = "shadow?({ color, blur(0–400), offsetX(-1000–1000), offsetY(-1000–1000) } 投影)"
const FILTER_HINT = "filter?({ brightness?(0–3), contrast?(0–3), saturation?(0–3), blur?(0–100 px) } 滤镜，至少一键)"
const BLEND_HINT = "blendMode?('normal'|'multiply'|'screen'|'overlay'|'darken'|'lighten'|'color-dodge'|'color-burn'|'hard-light'|'soft-light'|'difference'|'exclusion'|'hue'|'saturation'|'color'|'luminosity' 混合模式)"
const TEXT_STROKE_HINT = "stroke?(#RRGGBB 文字描边色，仅 v8；配 strokeWidth 使用), strokeWidth?(0.5–100 px 文字描边宽度，仅 v8), vertical?(true 竖排文字，仅 v9)"
const DOCUMENT_SCHEMA_HINT = `document：自由画布 v14 文档（JSON；v1–v13 输入会自动迁移为 v14）。
顶层 { documentVersion: 14, slides: [...], activeSlideId }；每页 { id, name, width(128–4096), height(128–4096), background, nodes, guides? }。
guides? 为该页编辑器参考线（仅 v10）：[{ id(非空且页内唯一), axis('x' 竖线 | 'y' 横线), position(页面内坐标，x ∈ [0, 页宽]，y ∈ [0, 页高]) }]，每页至多 64 条；仅用于编辑器显示与吸附，不参与渲染导出。
background 为 { type: 'solid', color } | { type: 'linear-gradient', from, to, angle } | { type: 'linear-gradient', stops: [{ offset(0–1 递增), color }×2–8], angle } (仅 v8) | { type: 'radial-gradient', stops: [{ offset(0–1 递增), color }×2–8] } (仅 v12，居中圆 radial-gradient，半径为最远角) | { type: 'transparent' }。
ColorPaint 渐变支持两段式 { from, to, angle }、多段式 { stops, angle }（stops 仅 v8）与径向 { type: 'radial-gradient', stops }（仅 v12）；可用于页面背景、文字填充与形状填充。
节点四选一，键必须精确匹配（不允许多余/缺失键；v6–v9 外观键均可选、缺省即默认样式），公共键：id, name, locked, hidden, type, x, y, rotation(度，绕节点盒中心顺时针旋转), scale(>0)：
- text：+ width, height, text, spans?(可选富文本片段数组 [{ start, end, bold?, color? }]：text 内字符区间 [start, end)，0≤start<end≤text 长度，按 start 排序且不重叠，至少含 bold/color 之一), fontSize, fontFamily, textFill(ColorPaint), align('left'|'center'|'right'), fontWeight('normal'|'bold'), lineHeight?(0.5–4 无单位行高倍数), letterSpacing?(-50–200 px 字距), italic?(true 斜体), ${TEXT_STROKE_HINT}, opacity?(0–1 不透明度), ${SHADOW_HINT}, ${FILTER_HINT}, ${BLEND_HINT}
- image：+ width, height, src(URL 或 data URL), alt, fit('cover'|'contain'), framing({ focusX, focusY, zoom(1–4) }), opacity?, ${SHADOW_HINT}, ${FILTER_HINT}, ${BLEND_HINT}
- shape：+ width, height, shape('rect'|'ellipse'|'triangle'|'star'|'hexagon'；star/hexagon 仅 v7), fill(ColorPaint 或 { type: 'image', src, fit, framing } 或 { type: 'transparent' } 无填充纯描边形状，仅 v11), stroke, strokeWidth, cornerRadius?(0–2000 px 圆角，作用于矩形), opacity?, ${SHADOW_HINT}, ${FILTER_HINT}, ${BLEND_HINT}
- line：+ width, height, lineKind('line'|'arrow'), stroke, strokeWidth, dash?(1–500 px 虚线长度，缺省实线), cap?('round'|'butt'|'square' 线帽，缺省圆头), startCap?/endCap?('none'|'arrow'|'dot' 端点装饰，仅 v13；缺省时终点装饰跟随 lineKind：'arrow' 即箭头、'line' 即无), points?([{ x, y }×2–64] 多段线顶点，仅 v14；坐标为节点盒内局部坐标，0≤x≤width、0≤y≤height，首末点即线段两端并承载端点装饰；盒子即顶点包围盒（建议留出描边宽度余量），node/update-geometry 改 width/height 时顶点按比例缩放), opacity?, ${SHADOW_HINT}, ${FILTER_HINT}, ${BLEND_HINT}
  线段几何：节点是「盒内水平线段」绕盒中心旋转。要画 A→B 的线段：L=|AB|，rotation=atan2(By-Ay, Bx-Ax)（度），width=L+2×strokeWidth，height=任意小正值（如 strokeWidth×2.2），x=(Ax+Bx)/2-width/2，y=(Ay+By)/2-height/2——圆头端点恰落在 A 与 B。要画折线/多段线：先算全部顶点的包围盒并加上描边余量得到节点盒（x,y,width,height），points 用相对盒左上角的局部坐标逐点列出。
- group：+ children（非空节点数组；组没有 width/height）
全文档节点 id 必须唯一。`

const COMPOSE_HINT = `生成规则：模板里每块示例文字都会换成你的内容，或者连同只为它画的色块、线条一起删掉，不会留下模板原话；页码按页序自动更新；文字放不下时先占用旁边的空位，再缩小字号（最小到原字号的 72%），仍放不下的会列在 summary.overflowing 里，请删短或换模板。要点优先放进模板的条目位（每页条目数见 list_templates 的 capacity），多出来的接在正文或最后一条后面。没有给结尾页就不出结尾页。返回 { ok, document, summary }：summary.pages 是每页的 slideId 与角色，summary.shrunk 是被缩小的文字。生成后建议先 check_document，再 render_document 看缩略图。`

const OUTLINE_SCHEMA_HINT = `outline：Markdown 大纲文本。
- "# 总标题"：封面标题；它下面、第一个 "##" 之前的文字是封面副标题。
- "## 小节标题"：每个小节一页。小节下 "- 要点" 或 "1. 要点" 是要点（"要点：说明" 冒号后面是这一条的第二行），"> 引文" 是引文（"引文 —— 出处"），其他行是正文。
- "## 结尾：标题"：可选的结尾页，内容写法同小节。
templateId：list_templates 返回的自由画布模板 id（如 "editorial-freeform"），整套卡片沿用该模板的版式与风格。${COMPOSE_HINT}`

const CONTENT_SCHEMA_HINT = `content：{ title: 封面标题, subtitle?: 封面副标题, pages: [{ title, body?: 正文段落, points?: [要点…]（"要点：说明" 冒号后面是这一条的第二行）, quote?: 引文（"引文 —— 出处"）}…], ending?: 结尾页（同 pages 的一项）}。templateId：list_templates 返回的自由画布模板 id。${COMPOSE_HINT}`

const ACTIONS_SCHEMA_HINT = `actions：FreeformAction 数组（与编辑器 UI 完全同一归约器）。常用动作：
- { type: 'slide/add-after-active', slideId? } 在当前页后新增空白页
- { type: 'slide/duplicate', slideId, duplicateSlideId? } 复制页
- { type: 'slide/delete', slideId } / { type: 'slide/select', slideId } / { type: 'slide/reorder', slideId, targetIndex }（把该页移动到 targetIndex，超出范围会收敛到末位）
- { type: 'slide/update', slideId, patch: { name?, background? } } / { type: 'slide/resize', slideId, width, height }
- { type: 'guides/set', slideId, guides: [{ id, axis('x'|'y'), position }] } 整体替换该页参考线（传 [] 清空；越界或重复 id 的整体提交会被忽略）
- { type: 'node/insert-children', slideId, parentPath: string[], nodes: FreeformSceneNode[], index? } 插入节点
- { type: 'node/update-content', slideId, updates: [{ path, patch: { text?, src?, alt? } }] }（改 text 时已有 spans 会按编辑位置自动保留/收缩）
- { type: 'node/update-style', slideId, updates: [{ path, patch: { fontSize?, fontFamily?, textFill?, align?, fontWeight?, spans?(整体替换文本片段，传 [] 清空), lineHeight?(传 null 恢复默认行高), letterSpacing?(传 null 恢复默认字距), italic?(true 开启斜体，false 取消), cornerRadius?(矩形圆角，传 null 恢复默认), opacity?(0–1 不透明度), shadow?(整体替换投影 { color, blur, offsetX, offsetY }，传 null 清除), filter?(整体替换滤镜 { brightness, contrast, saturation, blur } 至少一键，传 null 清除), blendMode?(混合模式，传 null 恢复正常), fit?, framing?, shape?, fill?, stroke?, strokeWidth?, lineKind?, dash?(虚线长度，传 null 恢复实线), cap?('round'|'butt'|'square' 线帽), startCap?/endCap?('none'|'arrow'|'dot' 线条端点装饰，仅 v13，传 null 恢复跟随 lineKind), points?(整体替换多段线顶点 [{ x, y }×2–64]，仅 v14，必须全部落在节点盒内), stroke?(文字描边色，仅 v8，传 null 清除), strokeWidth?(文字描边宽度，仅 v8，传 null 清除), vertical?(true 竖排文字，仅 v9，false 恢复横排) } }] }
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
    version: '0.20.0',
  })

  server.tool(
    'list_templates',
    '列出叮卡内置模板（id、标题、描述、页数、标签、所属工作台）。自由画布模板另有 capacity：内页最多几个要点（sectionPoints）、有没有引文位（sectionQuote）、结尾页能放几个要点（endingPoints）等，按内容挑模板。先用它拿到 templateId。',
    {},
    async () => jsonResult({ templates: listTemplates() }),
  )

  server.tool(
    'create_document_from_template',
    '按模板 id 实例化一份完整的可编辑文档数据：自由画布模板返回 v14 文档（可直接传给 apply_actions / render_document），Markdown 模板返回 { source, platformId, themeId, fontFamily, radius, profile, images? } 信封（可用 render_markdown 无头渲染）。',
    { templateId: z.string().describe('list_templates 返回的模板 id，如 "editorial-freeform"') },
    async ({ templateId }) => {
      try {
        return jsonResult(instantiateTemplate(templateId))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  const pageSchema = z.object({
    title: z.string().describe('这一页的标题'),
    body: z.string().optional().describe('正文段落'),
    points: z.array(z.string()).optional().describe('要点，一条一项；"要点：说明" 冒号后面是第二行'),
    quote: z.string().optional().describe('引文；"引文 —— 出处" 会把出处放在下面'),
  })

  server.tool(
    'create_document_from_content',
    `按结构化内容生成一整套自由画布卡片（v14）：封面 + 每个 page 一页 + 可选结尾页，风格沿用所选模板。适合已经整理好标题、正文、要点的内容。${CONTENT_SCHEMA_HINT}`,
    {
      templateId: z.string().describe('list_templates 返回的自由画布模板 id，如 "editorial-freeform"'),
      content: z.object({
        title: z.string().describe('封面标题'),
        subtitle: z.string().optional().describe('封面副标题'),
        pages: z.array(pageSchema).min(1).describe('内页，一项一页'),
        ending: pageSchema.optional().describe('结尾页；不给就没有结尾页'),
      }),
    },
    async ({ templateId, content }) => jsonResult(composeDeck(templateId, content)),
  )

  server.tool(
    'create_document_from_outline',
    `按 Markdown 大纲生成一整套自由画布卡片（v14）：封面 + 每个 "## 小节" 一页 + 可选结尾页，风格沿用所选模板。${OUTLINE_SCHEMA_HINT}`,
    {
      outline: z.string().describe('Markdown 大纲：# 总标题 + 若干 ## 小节（小节下正文行填入该页正文）'),
      templateId: z.string().describe('list_templates 返回的自由画布模板 id，如 "editorial-freeform"'),
    },
    async ({ outline, templateId }) => {
      try {
        return jsonResult(createDocumentFromOutline(outline, templateId))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.tool(
    'validate_document',
    `校验 JSON 是否为合法的自由画布 v14 文档（v1–v13 输入自动迁移）；合法时返回规范化后的文档，非法时返回原因。${DOCUMENT_SCHEMA_HINT}`,
    { document: z.unknown().describe('待校验的 v14（或 v1–v13 旧版）文档 JSON') },
    async ({ document }) => jsonResult(validateDocument(document)),
  )

  server.tool(
    'inspect_document',
    `检查文档结构：页面摘要（尺寸/背景/节点数）与递归节点树（id、name、type、几何、文本摘要）。改文档前先 inspect，拿到节点 id / 路径再发动作。${DOCUMENT_SCHEMA_HINT}`,
    { document: z.unknown().describe('v14（或 v1–v13 旧版）文档 JSON') },
    async ({ document }) => jsonResult(inspectDocument(document)),
  )

  server.tool(
    'apply_actions',
    `对文档应用一串编辑动作（与编辑器 UI 同一归约器，语义完全一致），返回应用后的新文档与每个动作是否生效。${DOCUMENT_SCHEMA_HINT}。${ACTIONS_SCHEMA_HINT}`,
    {
      document: z.unknown().describe('v14 文档 JSON'),
      actions: z.array(z.unknown()).describe('FreeformAction 数组'),
    },
    async ({ document, actions }) => jsonResult(applyActions(document, actions)),
  )

  server.tool(
    'check_document',
    `检查自由画布文档排出来的样子：在与导出相同的页面里排版后，逐页列出读者会注意到的问题——文字放不下被裁掉（附能放下的字号 fitFontSize）、文字互相叠住、文字被上层色块挡住、跑出页面、文字和底色对比太低、还留着模板示例文字、空文本框、图片没加载出来。每条带 page、slideId、node（图层名）、path（apply_actions 用的节点路径）和改法。fix: true 时把放不下的文字改成能放下的字号，返回改好的 document、改了哪些（fixed）和剩下的问题。${DOCUMENT_SCHEMA_HINT}`,
    {
      document: z.unknown().describe('v14 文档 JSON'),
      fix: z.boolean().optional().describe('把放不下的文字自动缩到能放下的字号'),
    },
    async ({ document, fix }) => jsonResult(await checkDocument(document, { fix })),
  )

  server.tool(
    'render_document',
    `把自由画布 v14 文档（v1–v13 输入自动迁移）无头渲染为 PNG 文件（与编辑器导出同一管线：网页字体按字符子集嵌入、图片就绪等待、逐页导出）。输出 <baseName>-01.png、<baseName>-02.png… 到 outputDir，并默认附上每页的小缩略图（JPEG，最多 ${MAX_PREVIEWS} 张）供你直接查看效果。仅支持自由画布文档；文档中的图片 src 必须是浏览器可加载的 URL 或 data URL。${DOCUMENT_SCHEMA_HINT}`,
    {
      document: z.unknown().describe('v14 文档 JSON'),
      outputDir: z.string().describe('PNG 输出目录（不存在会创建）'),
      baseName: z.string().optional().describe('输出文件名前缀，默认 "dingcard"'),
      slideIds: z.array(z.string()).optional().describe('只渲染这些页（默认全部）'),
      previews: z.boolean().optional().describe('是否附上缩略图，默认 true'),
    },
    async ({ document, outputDir, baseName, slideIds, previews }) =>
      renderResult(await renderDocument(document, { outputDir, baseName, slideIds }), previews !== false),
  )

  server.tool(
    'render_markdown',
    `把 Markdown 文档信封无头渲染为一套卡片 PNG（与 Markdown 工作台导出同一管线：DOM 实测分页、平台头部与主题、网页字体按字符子集嵌入、逐页 pixelRatio 3 导出）。输出 <baseName>-01.png、<baseName>-02.png… 到 outputDir；页数由分页决定。
document 为 Markdown 文档信封：{ source: Markdown 文本（--- 为手动分页）, platformId: 'rednote'|'weibo'|'twitter', themeId: 主题 id（如 'light'）, fontFamily, radius: 数字圆角, profile: { nickname, handle, location, avatarColor, avatarImage: dataURL 或 null, verified, headerFirstPageOnly }, images?: { "img:<id>": dataURL } }。`,
    {
      document: z.unknown().describe('Markdown 文档信封 JSON'),
      outputDir: z.string().describe('PNG 输出目录（不存在会创建）'),
      baseName: z.string().optional().describe('输出文件名前缀，默认 "dingcard"'),
      previews: z.boolean().optional().describe('是否附上缩略图，默认 true'),
    },
    async ({ document, outputDir, baseName, previews }) =>
      renderResult(await renderMarkdownDocument(document, { outputDir, baseName }), previews !== false),
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
    { description: '自由画布 v14 文档模型与校验规则说明' },
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
    { description: '完整自由画布 v14 文档示例（编辑部模板实例）', mimeType: 'application/json' },
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
