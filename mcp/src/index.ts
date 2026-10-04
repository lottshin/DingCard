// dingcard-mcp — MCP server exposing DingCard's freeform document model,
// template registry, reducer, and headless PNG rendering to AI clients.
//
// Protocol: stdio. All diagnostics go to stderr; stdout is JSON-RPC only.

import path from 'node:path'
import { realpathSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { MAX_FREEFORM_SLIDES } from '../../src/freeform/constants'
import type { FreeformDocument, FreeformSlide } from '../../src/freeform/types'
import { composeDeck } from './core/compose'
import { applyActions, inspectDocument, validateDocument } from './core/document'
import { DocumentStore, expandPath, resolveDocumentInput, writeDocumentFile, type DocumentInput, type StoredDocument } from './core/documents'
import { embedLocalHtmlImages, embedLocalImages } from './core/localImages'
import { listDecorations, placeDecorations } from './core/decorations'
import { iconCatalogue, listIcons } from './core/icons'
import { createDocumentFromOutline } from './core/outline'
import { composePoster } from './core/poster'
import { listCollages } from './core/collages'
import { serverClientFromEnv } from './core/serverClient'
import { listFilterPresets, listStyles, listTextStyles } from './core/styles'
import { instantiateTemplate, listTemplates, templatePages } from './core/templates'
import { checkDocument } from './render/check'
import { handOff, openInBrowser } from './render/handoff'
import { importHtml, renderDocument, renderMarkdownDocument, renderPreviews, type RenderPreview, type RenderResult } from './render/renderer'

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
  return withPreviews(rest, pages)
}

/** An answer as text with the pages after it as small JPEGs. */
function withPreviews(value: Record<string, unknown>, pages: readonly RenderPreview[]) {
  const shown = pages.slice(0, MAX_PREVIEWS)
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          ...value,
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
const FILTER_HINT = "filter?({ brightness?(0–3), contrast?(0–3), saturation?(0–3), blur?(0–100 px), hue?(0–360 色相环旋转，仅 v18), grayscale?(0–1 灰度，仅 v18), sepia?(0–1 复古黄，仅 v18) } 滤镜，至少一键；现成的滤镜预设见 list_filter_presets)"
const BLEND_HINT = "blendMode?('normal'|'multiply'|'screen'|'overlay'|'darken'|'lighten'|'color-dodge'|'color-burn'|'hard-light'|'soft-light'|'difference'|'exclusion'|'hue'|'saturation'|'color'|'luminosity' 混合模式)"
const TEXT_STROKE_HINT = "stroke?(#RRGGBB 文字描边色，仅 v8；配 strokeWidth 使用), strokeWidth?(0.5–100 px 文字描边宽度，仅 v8), vertical?(true 竖排文字，仅 v9)"
const TEXT_EFFECT_HINT = `文字效果，仅 v17，一段文字一种：{ type: 'neon', color, amount } 发光 | { type: 'outline', color, amount } 字外描边（贴纸字） | { type: 'hollow', amount } 镂空（只留文字颜色的轮廓） | { type: 'splice', color, amount, angle } 镂空字叠在错开的实心字上 | { type: 'offset', color, amount, angle } 硬投影 | { type: 'echo', color, amount, angle } 两层渐淡的重影 | { type: 'glitch', color, color2, amount } 左右错开的双色故障 | { type: 'extrude', color, amount, angle } 立体 | { type: 'background', color, amount, radius } 每行文字后面一块底色（标签） | { type: 'marker', color, amount } 每行下半截的荧光笔；color/color2 为 #RRGGBB，amount 0–100（按字号比例的强度或大小，50 为默认），angle 0–360（0 向右、90 向下），radius 0–100（底色圆角）；node/update-style 的 effect 传 null 去掉。现成的花字见 list_text_styles`

const DOCUMENT_SCHEMA_HINT = `document：自由画布 v20 文档（JSON；v1–v19 输入会自动迁移为 v20）。
顶层 { documentVersion: 20, slides: [...], activeSlideId }；每页 { id, name, width(128–4096), height(128–4096), background, nodes, guides? }。
guides? 为该页编辑器参考线（仅 v10）：[{ id(非空且页内唯一), axis('x' 竖线 | 'y' 横线), position(页面内坐标，x ∈ [0, 页宽]，y ∈ [0, 页高]) }]，每页至多 64 条；仅用于编辑器显示与吸附，不参与渲染导出。
background 为 { type: 'solid', color } | { type: 'linear-gradient', from, to, angle } | { type: 'linear-gradient', stops: [{ offset(0–1 递增), color }×2–8], angle } (仅 v8) | { type: 'radial-gradient', stops: [{ offset(0–1 递增), color }×2–8] } (仅 v12，居中圆 radial-gradient，半径为最远角) | { type: 'transparent' } | { type: 'image', src(URL 或 data URL), fit('cover' 铺满裁切 | 'contain' 完整显示，留空处透明), framing({ focusX(0–1), focusY(0–1), zoom(1–4) } 取景，默认 { focusX: 0.5, focusY: 0.5, zoom: 1 }) } (仅 v16，整页背景图，画在所有节点下面；混合模式会和它混合)。
ColorPaint 渐变支持两段式 { from, to, angle }、多段式 { stops, angle }（stops 仅 v8）与径向 { type: 'radial-gradient', stops }（仅 v12）；可用于页面背景、文字填充、形状填充与图形填充。
节点六选一，键必须精确匹配（不允许多余/缺失键；v6–v9 外观键均可选、缺省即默认样式），公共键：id, name, locked, hidden, type, x, y, rotation(度，绕节点盒中心顺时针旋转), scale(>0)：
- text：+ width, height, text, spans?(可选富文本片段数组 [{ start, end, bold?(true), color?(#RRGGBB 文字色), highlight?(#RRGGBB 高亮底色，仅 v16), underline?(true 下划线，仅 v16), strike?(true 删除线，仅 v20), fontSize?(1–4096 这几个字自己的字号 px，仅 v20；整段的 fontSize 改变时按比例跟着变) }]：text 内字符区间 [start, end)，0≤start<end≤text 长度，按 start 排序且不重叠，至少含一种样式；用来强调关键词：加粗、换色、荧光笔式高亮、下划线、删除线（划掉的原价）、放大（价格里的数字）), fontSize, fontFamily, textFill(ColorPaint), align('left'|'center'|'right'|'justify'；justify 两端对齐仅 v20，中文正文常用，每段最后一行靠左), fontWeight('normal'|'bold'), verticalAlign?('middle'|'bottom' 框比文字高时文字垂直居中或靠下，仅 v20，缺省靠上), paragraphSpacing?(>0–1000 px 段间距：text 里每个换行分出一段，段与段之间多出这么多，仅 v20), list?('bullet'|'number' 每段一个列表项，前面自动加圆点或编号、换行悬挂缩进，空段不算，仅 v20；圆点和编号不要写进 text), lineHeight?(0.5–4 无单位行高倍数), letterSpacing?(-50–200 px 字距), italic?(true 斜体), ${TEXT_STROKE_HINT}, effect?(${TEXT_EFFECT_HINT}), opacity?(0–1 不透明度), ${SHADOW_HINT}, ${FILTER_HINT}, ${BLEND_HINT}
- image：+ width, height, src(URL 或 data URL), alt, fit('cover'|'contain'), framing({ focusX, focusY, zoom(1–4) }), opacity?, ${SHADOW_HINT}, ${FILTER_HINT}, ${BLEND_HINT}
- shape：+ width, height, shape('rect'|'ellipse'|'triangle'|'star'|'hexagon'；star/hexagon 仅 v7), fill(ColorPaint 或 { type: 'image', src, fit, framing } 或 { type: 'transparent' } 无填充纯描边形状，仅 v11), stroke, strokeWidth, cornerRadius?(0–2000 px 圆角，作用于矩形), opacity?, ${SHADOW_HINT}, ${FILTER_HINT}, ${BLEND_HINT}
- line：+ width, height, lineKind('line'|'arrow'), stroke, strokeWidth, dash?(1–500 px 虚线长度，缺省实线), cap?('round'|'butt'|'square' 线帽，缺省圆头), startCap?/endCap?('none'|'arrow'|'dot' 端点装饰，仅 v13；缺省时终点装饰跟随 lineKind：'arrow' 即箭头、'line' 即无), points?([{ x, y }×2–64] 多段线顶点，仅 v14；坐标为节点盒内局部坐标，0≤x≤width、0≤y≤height，首末点即线段两端并承载端点装饰；盒子即顶点包围盒（建议留出描边宽度余量），node/update-geometry 改 width/height 时顶点按比例缩放), opacity?, ${SHADOW_HINT}, ${FILTER_HINT}, ${BLEND_HINT}
  线段几何：节点是「盒内水平线段」绕盒中心旋转。要画 A→B 的线段：L=|AB|，rotation=atan2(By-Ay, Bx-Ax)（度），width=L+2×strokeWidth，height=任意小正值（如 strokeWidth×2.2），x=(Ax+Bx)/2-width/2，y=(Ay+By)/2-height/2——圆头端点恰落在 A 与 B。要画折线/多段线：先算全部顶点的包围盒并加上描边余量得到节点盒（x,y,width,height），points 用相对盒左上角的局部坐标逐点列出。
- path：+ width, height, d(SVG 路径数据，仅 v15；M/L/H/V/C/S/Q/T/A/Z 及小写相对命令，必须以 M/m 开头，最长 20000 字符), viewBox({ x, y, width(>0), height(>0) }：d 所在的坐标系，渲染时拉伸铺满节点盒), fill(ColorPaint 或 { type: 'transparent' } 不填充，或 { type: 'image', src, fit, framing } 图片填充（仅 v19，任意轮廓变成图片框，取景与形状图片填充同一套）), stroke(#RRGGBB), strokeWidth(0–10000，viewBox 单位，随图形缩放；0 即不描边), dash?(>0 的 viewBox 单位虚线长度，缺省实线), cap?('round'|'butt'|'square'，缺省圆头), join?('round'|'miter'|'bevel' 拐角，缺省圆滑), fillRule?('nonzero'|'evenodd'，缺省 nonzero), opacity?, ${SHADOW_HINT}, ${FILTER_HINT}, ${BLEND_HINT}
  图形用法：图标、徽章、对话气泡、波浪分隔线、曲线箭头、折线图等任意矢量图。viewBox 要正好包住 d 用到的坐标（画到框外时 check_document 报 path-overflow）；节点盒与 viewBox 宽高比相同则不变形，不同则图形随盒子拉伸，描边粗细仍保持均匀。内置图标用 list_icons 查：viewBox 0 0 24 24、strokeWidth 2、fill { type: 'transparent' }、圆头圆角，盒子取正方形（如 96×96）即可，换色只改 stroke。手绘圈、下划线、箭头、贴纸、标签等装饰用 list_decorations 查、add_decorations 一次放好，不必手写 d。
- group：+ children（非空节点数组；组没有 width/height）
全文档节点 id 必须唯一。`

const COMPOSE_HINT = `生成规则：模板里每块示例文字都会换成你的内容，或者连同只为它画的色块、线条一起删掉，不会留下模板原话；页码按页序自动更新；文字放不下时先占用旁边的空位，再缩小字号（最小到原字号的 72%），仍放不下的会列在 summary.overflowing 里，请删短或换模板。要点优先放进模板的条目位（每页条目数见 list_templates 的 capacity），多出来的接在正文或最后一条后面。没有给结尾页就不出结尾页。返回 { ok, document, summary }：summary.pages 是每页的 slideId 与角色，summary.shrunk 是被缩小的文字。生成后建议先 check_document，再 render_document 看缩略图。`

const OUTLINE_SCHEMA_HINT = `outline：Markdown 大纲文本。
- "# 总标题"：封面标题；它下面、第一个 "##" 之前的文字是封面副标题。
- "## 小节标题"：每个小节一页。小节下 "- 要点" 或 "1. 要点" 是要点（"要点：说明" 冒号后面是这一条的第二行），"> 引文" 是引文（"引文 —— 出处"），其他行是正文。
- "## 结尾：标题"：可选的结尾页，内容写法同小节。
templateId：list_templates 返回的自由画布模板 id（如 "editorial-freeform"），整套卡片沿用该模板的版式与风格。${COMPOSE_HINT}`

const CONTENT_SCHEMA_HINT = `content：{ title: 封面标题, subtitle?: 封面副标题, pages: [{ title, body?: 正文段落, points?: [要点…]（"要点：说明" 冒号后面是这一条的第二行）, quote?: 引文（"引文 —— 出处"）, templateId?: 这一页换用另一个套图模板的内页版式 }…], ending?: 结尾页（同 pages 的一项，templateId 换用那个模板的结尾页）}。templateId：list_templates 返回的自由画布模板 id，封面和没写 templateId 的页都用它；不同页可以用不同的套图模板（kind 为 deck），最后用 document/restyle 把配色、字体统一起来。${COMPOSE_HINT}`

const ACTIONS_SCHEMA_HINT = `actions：FreeformAction 数组（与编辑器 UI 完全同一归约器）。常用动作：
- { type: 'slide/add-after-active', slideId? } 在当前页后新增空白页
- { type: 'slide/duplicate', slideId, duplicateSlideId? } 复制页
- { type: 'slide/insert', slides: FreeformSlide[], afterSlideId?, replaceSlideId? } 把整页（含 id、name、width、height、background、nodes）插在 afterSlideId 后面（都不给就是当前页后面），或换掉 replaceSlideId 那一页；页 id 不能和文档里的重复，第一页成为当前页。加模板的页用 add_template_pages 更省事
- { type: 'slide/delete', slideId } / { type: 'slide/select', slideId } / { type: 'slide/reorder', slideId, targetIndex }（把该页移动到 targetIndex，超出范围会收敛到末位）
- { type: 'slide/update', slideId, patch: { name?, background? } } / { type: 'slide/resize', slideId, width, height }
- { type: 'guides/set', slideId, guides: [{ id, axis('x'|'y'), position }] } 整体替换该页参考线（传 [] 清空；越界或重复 id 的整体提交会被忽略）
- { type: 'document/restyle', palette?, fontSet?, colors?, fonts? } 整套卡片一起换风格（所有页面，一步撤销）。palette / fontSet 用 list_styles 返回的 id：配色把页面底色换成新底色、正文色换成新文字色，深浅灰按原来在两者之间的位置取色，其余颜色依次换成强调色，再把因此看不清的字调深或调浅；字体组合按字号分配，不小于正文字号 1.4 倍的文字用标题字体，其余用正文字体。colors: { "#原色": "#新色" } 精确替换颜色（文字、填充、描边、投影、渐变色标、高亮一起换），fonts: { "原字体": "新字体" } 精确替换字体，键是文档现有的颜色和字体（见 inspect_document 的 style）；同时给时先套 palette / fontSet，再按 colors / fonts 覆盖
- { type: 'node/insert-children', slideId, parentPath: string[], nodes: FreeformSceneNode[], index? } 插入节点
- { type: 'node/update-content', slideId, updates: [{ path, patch: { text?, src?, alt?, d?, viewBox? } }] }（改 text 时已有 spans 会按编辑位置自动保留/收缩；d / viewBox 只用于 path，仅 v15）
- { type: 'node/update-style', slideId, updates: [{ path, patch: { fontSize?(片段自己的字号按比例跟着变), fontFamily?, textFill?, align?, fontWeight?, verticalAlign?('top'|'middle'|'bottom'，仅 v20), paragraphSpacing?(px，传 null 或 0 清除，仅 v20), list?('bullet'|'number'，传 null 变回普通段落，仅 v20), spans?(整体替换文本片段，传 [] 清空), lineHeight?(传 null 恢复默认行高), letterSpacing?(传 null 恢复默认字距), italic?(true 开启斜体，false 取消), cornerRadius?(矩形圆角，传 null 恢复默认), opacity?(0–1 不透明度), shadow?(整体替换投影 { color, blur, offsetX, offsetY }，传 null 清除), filter?(整体替换滤镜 { brightness, contrast, saturation, blur, hue, grayscale, sepia } 至少一键，后三个仅 v18，传 null 清除), blendMode?(混合模式，传 null 恢复正常), fit?, framing?, shape?, fill?(path 接受 ColorPaint、{ type: 'transparent' } 或 { type: 'image', src, fit, framing }，仅 v19), stroke?, strokeWidth?(path 为 viewBox 单位), lineKind?, dash?(虚线长度，path 为 viewBox 单位，传 null 恢复实线), cap?('round'|'butt'|'square' 线帽), join?('round'|'miter'|'bevel' path 拐角，仅 v15), fillRule?('nonzero'|'evenodd' path 填充规则，仅 v15), startCap?/endCap?('none'|'arrow'|'dot' 线条端点装饰，仅 v13，传 null 恢复跟随 lineKind), points?(整体替换多段线顶点 [{ x, y }×2–64]，仅 v14，必须全部落在节点盒内), stroke?(文字描边色，仅 v8，传 null 清除), strokeWidth?(文字描边宽度，仅 v8，传 null 清除), vertical?(true 竖排文字，仅 v9，false 恢复横排) } }] }
- { type: 'node/update-geometry', slideId, updates: [{ path, patch: { x?, y?, width?, height?, rotation?, scale? } }] }
- { type: 'node/rename' | 'node/set-locked' | 'node/set-hidden', slideId, path, ... }
- { type: 'node/delete', slideId, parentPath, nodeIds } / { type: 'node/clone', slideId, parentPath, nodeIds }
- { type: 'node/reorder', slideId, parentPath, nodeIds, direction: 'forward'|'backward'|'front'|'back' }
- { type: 'group/create', slideId, parentPath, nodeIds, name? } / { type: 'group/ungroup', slideId, parentPath, groupIds, mode: 'one-level'|'all-level' }
path 是从页面根到目标节点的节点 id 数组（[] 表示页面根）。无效动作会被静默忽略（changes 里对应 false），不会报错。`

/**
 * Pages into a document with slide/insert: after a page (the last one when
 * none is named) or in place of one. Says where they went, or why not.
 */
function insertPages(
  document: FreeformDocument,
  slides: FreeformSlide[],
  where: { afterSlideId?: string; replaceSlideId?: string },
): { ok: true; document: FreeformDocument; added: Array<{ slideId: string; name: string; page: number; width: number; height: number }> } | { ok: false; error: string } {
  const anchor = where.replaceSlideId ?? where.afterSlideId
  if (anchor !== undefined && !document.slides.some((slide) => slide.id === anchor)) {
    return { ok: false, error: `文档里没有 id 为 ${anchor} 的页（inspect_document 列出每页的 id）` }
  }
  const applied = applyActions(document, [{
    type: 'slide/insert',
    slides,
    ...(where.replaceSlideId !== undefined
      ? { replaceSlideId: where.replaceSlideId }
      : { afterSlideId: where.afterSlideId ?? document.slides[document.slides.length - 1].id }),
  }])
  if (!applied.ok) return applied
  if (!applied.changes[0]) return { ok: false, error: `加不进去：一份文档最多 ${MAX_FREEFORM_SLIDES} 页` }
  const ids = new Set(slides.map((slide) => slide.id))
  return {
    ok: true,
    document: applied.document,
    added: applied.document.slides.flatMap((slide, index) => (
      ids.has(slide.id) ? [{ slideId: slide.id, name: slide.name, page: index + 1, width: slide.width, height: slide.height }] : []
    )),
  }
}

/** Build a dingcard MCP server with all tools registered. */
export function createDingcardServer(): McpServer {
  const server = new McpServer({
    name: 'dingcard-mcp',
    version: '0.21.0',
  })
  const documents = new DocumentStore()

  const documentInput = {
    documentId: z.string().optional().describe('创建或修改文档的工具返回的 documentId（推荐：不必来回传整份文档）'),
    document: z.unknown().optional().describe('完整的 v20（或 v1–v19 旧版）文档 JSON，可替代 documentId'),
    documentPath: z.string().optional().describe('文档 JSON 文件的路径，可替代 documentId'),
  }
  const includeDocument = z.boolean().optional().describe('同时返回完整文档 JSON（默认只返回 documentId 和 version）')

  /** A tool's document, validated, with its pictures on disk embedded; or why not. */
  const documentFor = async (input: DocumentInput) => {
    const resolved = await resolveDocumentInput(input, documents)
    if (!resolved.ok) return resolved
    const validated = validateDocument(resolved.value)
    if (!validated.ok) return validated
    const embedded = await embedLocalImages(validated.document, resolved.baseDir)
    if (!embedded.ok) return embedded
    return { ok: true as const, document: embedded.document, documentId: resolved.documentId, baseDir: resolved.baseDir }
  }
  /** Keep what a tool made or changed: in place when it came by id, else under a new id. */
  const keep = (document: FreeformDocument, documentId: string | null): StoredDocument =>
    documentId ? documents.update(documentId, document) : documents.add(document)
  /** The part of an answer naming the kept document, with the whole document if asked for. */
  const handleOf = (stored: StoredDocument, withDocument: boolean | undefined) => ({
    documentId: stored.documentId,
    version: stored.version,
    ...(withDocument ? { document: stored.document } : {}),
  })

  server.tool(
    'list_templates',
    '列出叮卡内置模板（id、标题、描述、页数、标签、所属工作台、kind、format）。kind 是 deck（一整套：封面、内页、结尾页，用 create_document_from_content / create_document_from_outline 生成）或 poster（单页：小红书封面、菜单、价目表、证书、朋友圈九宫格、课程表、海报、卡片、宣传单等，用 create_poster_from_content 生成）；format 是页面尺寸（id、name、ratio、width、height：小红书 3:4、竖版海报 9:16、方图 1:1、横版封面 16:9、公众号首图 2.35:1、A4 印刷、A4 横版、朋友圈九宫格 3240×3240——这一种用 render_document 的 grid: true 切成九张）。套图模板另有 capacity：内页最多几个要点（sectionPoints）、有没有引文位（sectionQuote）、结尾页能放几个要点（endingPoints）等；海报模板另有 posterCapacity：有没有副标题、正文、获得者（recipient）、按钮、角标、署名、主图位，能放几行信息（details），有没有表格（table：最多几行几列）。按内容和尺寸挑模板。先用它拿到 templateId。不同页可以用不同模板：create_document_from_content 的每页可以写自己的 templateId，create_poster_from_content 给 documentId 时把海报加成那份文档的一页，add_template_pages 把任何模板的某几页加进已有文档。',
    {},
    async () => jsonResult({ templates: listTemplates() }),
  )

  server.tool(
    'create_document_from_template',
    '按模板 id 实例化一份完整的可编辑文档：自由画布模板保存在服务端，返回 documentId（之后传给 inspect_document / apply_actions / check_document / render_document 等）和各页 id、名称；Markdown 模板返回 { source, platformId, themeId, fontFamily, radius, profile, images? } 信封（可用 render_markdown 无头渲染）。',
    {
      templateId: z.string().describe('list_templates 返回的模板 id，如 "editorial-freeform"'),
      includeDocument,
    },
    async ({ templateId, includeDocument: withDocument }) => {
      try {
        const instance = instantiateTemplate(templateId)
        if (instance.workspace !== 'freeform') return jsonResult(instance)
        const stored = documents.add(instance.document)
        return jsonResult({
          workspace: 'freeform',
          ...handleOf(stored, withDocument),
          slides: stored.document.slides.map((slide) => ({ id: slide.id, name: slide.name })),
        })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.tool(
    'add_template_pages',
    '把模板的页面加进一份自由画布文档，和编辑器模板面板里点一页一样：套图模板可以只加某几页（再来一张内页、换个结尾页），单页海报加进来就是新的一页。页面保留模板自己的尺寸和示例文字，之后用 inspect_document 找到图层、apply_actions 改字，check_document 会把没改的示例文字报出来。要直接按内容填好：套图的页用 create_document_from_content 每页的 templateId，海报用 create_poster_from_content 的 documentId。返回加进来的页（slideId、名称、在文档里是第几页），默认附上这些页的缩略图。',
    {
      ...documentInput,
      templateId: z.string().describe('list_templates 返回的自由画布模板 id'),
      pages: z.array(z.number().int().min(1)).optional().describe('加模板的第几页，从 1 起（套图是 1 封面、2 内页、3 结尾），可以重复；不给就加全部'),
      afterSlideId: z.string().optional().describe('加在这一页后面；不给就加在最后'),
      replaceSlideId: z.string().optional().describe('换掉这一页（比如一张空白页），不能和 afterSlideId 同时给'),
      previews: z.boolean().optional().describe('是否附上加进来的页的缩略图，默认 true'),
      includeDocument,
    },
    async ({ templateId, pages, afterSlideId, replaceSlideId, previews, includeDocument: withDocument, ...input }) => {
      try {
        if (afterSlideId && replaceSlideId) return jsonResult({ ok: false, error: 'afterSlideId 和 replaceSlideId 只能给一个' })
        const resolved = await documentFor(input)
        if (!resolved.ok) return jsonResult(resolved)
        const picked = templatePages(templateId, pages)
        if (!picked.ok) return jsonResult(picked)
        const placed = insertPages(resolved.document, picked.slides, { afterSlideId, replaceSlideId })
        if (!placed.ok) return jsonResult(placed)
        const stored = keep(placed.document, resolved.documentId)
        const answer = { ok: true, ...handleOf(stored, withDocument), added: placed.added, slideCount: stored.document.slides.length }
        if (previews === false) return jsonResult(answer)
        const shown = stored.document.slides.filter((slide) => placed.added.some((entry) => entry.slideId === slide.id))
        return withPreviews(answer, await renderPreviews({ ...stored.document, activeSlideId: shown[0].id, slides: shown }).catch(() => []))
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
    templateId: z.string().optional().describe('这一页换用另一个套图模板（kind 为 deck）的版式；不给就用整套的 templateId'),
  })

  server.tool(
    'create_document_from_html',
    `把你写的 HTML/CSS 网页转成在叮卡里能逐个修改的自由画布文档（v20）。适合模板排不出来的版式：直接用网页写法排版，叮卡在浏览器里排好后，把每个色块、文字、图片和 SVG 图形读成形状、文字框、图片和图形节点，位置、字号、行高、字距、颜色、圆角、边框、阴影、渐变、透明度、混合模式、滤镜和旋转都照网页来，层叠顺序按 CSS（含 z-index）。
写法：
- 每页一个 <section>，放在 <body> 下面，用 CSS 写死宽高（px），如 1080×1440（小红书 3:4）、1080×1920（9:16）、1080×1080；没有 section 时整个 body 是一页，尺寸用 width / height。100vw、100vh 就是 width × height。
- 字体用内置的：苹方 "PingFang SC"、思源黑体 "Noto Sans SC"、思源宋体 "Noto Serif SC"、霞鹜文楷 "LXGW WenKai TC"、站酷小薇 "ZCOOL XiaoWei"、系统宋体 "Songti SC"；别的字体换成同类的内置字体（notes 里会写）。字重只有常规和粗体，600 及以上算粗体。
- 图片用 <img> 或 CSS background-image，object-fit、object-position、圆角和圆形裁切都照着来；src 写本机路径（相对路径按 htmlPath 所在目录或当前目录找）、http(s) URL 或 data URL，本机图片和本机样式表会嵌进来。
- 图标和图形写成内联 <svg>（path、rect、circle、ellipse、line、polyline、polygon），每个变成一个图形节点，一个 svg 里有几个就成一个组合；长短不一的虚线（环形进度条）照画出来的样子描成线段，SVG 里的 <text> 变成单行文字框，<use> 引用不转。
- 一段文字里的加粗、换色、行内底色（行内元素的 background）、下划线和删除线会变成文字片段，text-align: justify 照样两端对齐。一个块里只有这段文字、几种字号的行高倍数又一样时（价格里放大的数字），不同字号成为带字号的片段；否则同一行里的不同字号、和行内块（inline-block 标签）同一行的文字会拆成几个文字框，保证位置不变。整齐的 <ul> / <ol>（每项只有文字、样式一样、圆点或编号在外侧、间距一样）转成一个列表文字，其他列表的圆点和编号单独成字；::before / ::after 照常生效。
- data-name="主标题" 给图层起名，data-group 让一个元素连同里面的东西成为一个组合。
- 不支持的会写进 notes 并尽量近似：脚本和动画、clip-path、mask、backdrop-filter、内阴影、多层阴影（只留第一层）。透明度不一的渐变（比如照片上的渐隐遮罩）、平铺和锥形渐变会画成一张图。
返回 documentId、每页的 id 和尺寸，以及 notes（page 为 0 的是整份文档的）；默认附上转换结果的缩略图，对照你的设计看一眼。之后用 check_document 检查、apply_actions 修改、render_document 出图、open_in_editor 在编辑器里接着改。`,
    {
      html: z.string().optional().describe('网页源码（可以只写 <style> 和若干 <section>）'),
      htmlPath: z.string().optional().describe('网页文件路径，可替代 html；里面的相对路径按这个文件所在的目录找'),
      width: z.number().int().min(128).max(4096).optional().describe('没写尺寸的页面的宽度，也是 100vw，默认 1080'),
      height: z.number().int().min(128).max(4096).optional().describe('没写尺寸的页面的高度，也是 100vh，默认 1440'),
      previews: z.boolean().optional().describe('是否附上缩略图，默认 true'),
      includeDocument,
    },
    async ({ html, htmlPath, width, height, previews, includeDocument: withDocument }) => {
      try {
        if (!html && !htmlPath) return jsonResult({ ok: false, error: '给 html 或 htmlPath 其中一个' })
        let source = html ?? ''
        let baseDir = process.cwd()
        if (htmlPath) {
          const file = expandPath(htmlPath, process.cwd())
          source = await readFile(file, 'utf8')
          baseDir = path.dirname(file)
        }
        const embedded = await embedLocalHtmlImages(source, baseDir)
        const imported = await importHtml(embedded.html, { width, height })
        if (!imported.ok) return jsonResult(imported)
        const stored = documents.add(imported.document)
        const answer = {
          ok: true,
          ...handleOf(stored, withDocument),
          slides: stored.document.slides.map((slide) => ({ id: slide.id, name: slide.name, width: slide.width, height: slide.height })),
          notes: [
            ...embedded.missing.map((missing) => ({ page: 0, target: missing, message: '这张本机图片读不了，没有放进来' })),
            ...imported.notes,
          ],
        }
        if (previews === false) return jsonResult(answer)
        return withPreviews(answer, await renderPreviews(stored.document).catch(() => []))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.tool(
    'create_document_from_content',
    `按结构化内容生成一整套自由画布卡片（v20）：封面 + 每个 page 一页 + 可选结尾页，风格沿用所选模板。适合已经整理好标题、正文、要点的内容。${CONTENT_SCHEMA_HINT}`,
    {
      templateId: z.string().describe('list_templates 返回的自由画布模板 id，如 "editorial-freeform"'),
      content: z.object({
        title: z.string().describe('封面标题'),
        subtitle: z.string().optional().describe('封面副标题'),
        pages: z.array(pageSchema).min(1).describe('内页，一项一页'),
        ending: pageSchema.optional().describe('结尾页；不给就没有结尾页'),
      }),
      includeDocument,
    },
    async ({ templateId, content, includeDocument: withDocument }) => {
      const composed = composeDeck(templateId, content)
      if (!composed.ok) return jsonResult(composed)
      const { document, ...rest } = composed
      return jsonResult({ ...rest, ...handleOf(documents.add(document), withDocument) })
    },
  )

  server.tool(
    'create_poster_from_content',
    '按内容生成一张海报（单页模板：list_templates 里 kind 为 poster 的小红书封面、菜单、价目表、证书、朋友圈九宫格、课程表、讲座、促销、招聘、节日、邀请函、金句、商品主图、视频封面、公众号首图、宣传单），尺寸跟模板走。模板里的示例文字全部换成内容，没给的连同它的底板、按钮一起删掉；主图位放 image，没给图时照片位变成一块色块、插画位删掉（九宫格的插画是设计本身，会留着）。菜单、价目表的每一项写成 details 的一行 "名称：价格"；证书的姓名放 recipient；课程表放 table（第一行是表头，每行第一格是节次），按给的行数列数重画表格、同一科目同一个颜色。超出模板行数的信息、画不下的表格格子列在 summary.unplaced，模板没有位置的内容列在 summary.unused，缩小的文字在 summary.shrunk，缩到 72% 还放不下的在 summary.overflowing。给 documentId 时海报加成那份文档的一页（放在 afterSlideId 后面或最后），返回的 added 是这一页的 slideId。',
    {
      templateId: z.string().describe('list_templates 里 kind 为 poster 的模板 id，如 "talk-poster-freeform"'),
      content: z.object({
        title: z.string().describe('海报标题；两行时可以自己写换行'),
        subtitle: z.string().optional().describe('副标题或一句导语'),
        body: z.string().optional().describe('一段正文（模板有正文位时）'),
        recipient: z.string().optional().describe('证书上的姓名（模板有获得者位时）'),
        details: z.array(z.string()).optional().describe('信息行，一条一行，如 "时间：10 月 18 日 14:00"、"地点：…"，冒号前是标签；菜单、价目表写 "拿铁：28"'),
        table: z.array(z.array(z.string())).optional().describe('表格（课程表）：第一行是表头，如 ["节次", "周一", …]，之后每行第一格是节次，如 ["第 1 节\\n8:00", "语文", …]'),
        cta: z.string().optional().describe('按钮文字，如 "扫码报名"'),
        tag: z.string().optional().describe('角标：活动类型、价格、期数等短词'),
        brand: z.string().optional().describe('主办方、品牌或落款'),
        image: z.string().optional().describe('主图：本机文件路径（/、~/、./、file://）、http(s) URL 或 data URL'),
      }),
      ...documentInput,
      documentId: z.string().optional().describe('给了就把海报加成这份文档的一页（就地更新，海报保留自己的尺寸）；documentId、document、documentPath 都不给就新建一份文档'),
      afterSlideId: z.string().optional().describe('加进已有文档时放在这一页后面；不给就加在最后'),
      includeDocument,
    },
    async ({ templateId, content, afterSlideId, includeDocument: withDocument, ...input }) => {
      try {
        const composed = composePoster(templateId, content)
        if (!composed.ok) return jsonResult(composed)
        const embedded = await embedLocalImages(composed.document, process.cwd())
        if (!embedded.ok) return jsonResult(embedded)
        if (input.documentId === undefined && input.document === undefined && input.documentPath === undefined) {
          return jsonResult({ ok: true, summary: composed.summary, ...handleOf(documents.add(embedded.document), withDocument) })
        }
        const resolved = await documentFor(input)
        if (!resolved.ok) return jsonResult(resolved)
        const placed = insertPages(resolved.document, embedded.document.slides, { afterSlideId })
        if (!placed.ok) return jsonResult(placed)
        return jsonResult({ ok: true, summary: composed.summary, ...handleOf(keep(placed.document, resolved.documentId), withDocument), added: placed.added })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.tool(
    'create_document_from_outline',
    `按 Markdown 大纲生成一整套自由画布卡片（v20）：封面 + 每个 "## 小节" 一页 + 可选结尾页，风格沿用所选模板。${OUTLINE_SCHEMA_HINT}`,
    {
      outline: z.string().describe('Markdown 大纲：# 总标题 + 若干 ## 小节（小节下正文行填入该页正文）'),
      templateId: z.string().describe('list_templates 返回的自由画布模板 id，如 "editorial-freeform"'),
      includeDocument,
    },
    async ({ outline, templateId, includeDocument: withDocument }) => {
      try {
        const composed = createDocumentFromOutline(outline, templateId)
        if (!composed.ok) return jsonResult(composed)
        const { document, ...rest } = composed
        return jsonResult({ ...rest, ...handleOf(documents.add(document), withDocument) })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.tool(
    'list_icons',
    '查内置图标（线性图标，含对勾、叉、箭头、星星、爱心、闪电、灯泡、奖杯、日历、时钟、定位、地球、购物车、礼物、图表、锁、搜索、分享、交通工具等常用图标）。不带参数返回全部图标的 id 与中英文名；query 用中文或英文关键词搜索（如 "勾"、"arrow"、"购物"），返回最匹配的图标连同路径数据 d；ids 按 id 精确取。每个图标插入为一个 path 节点：d 来自这里，viewBox/fill/stroke/strokeWidth 用返回的 style，example 是一个可直接放进 node/insert-children 的完整节点。',
    {
      query: z.string().optional().describe('中文或英文关键词，空格分隔的多个词需同时命中'),
      ids: z.array(z.string()).optional().describe('图标 id 列表，如 ["check", "star"]'),
    },
    async ({ query, ids }) => jsonResult(listIcons({ query, ids })),
  )

  server.tool(
    'list_decorations',
    '查内置装饰素材（和编辑器「元素」面板同一套）：手绘线条（手绘圈、手绘下划线、波浪线、弧形/绕圈箭头、强调线、手绘对勾/叉、荧光笔、取景框等）、贴纸（闪光、星星、爱心、小花、太阳、云朵、对话气泡、皇冠、奖章、火苗、闪电、笑脸、彩虹、气球、礼物、胶带、回形针、点阵等）和标签（胶囊标签、描边标签、爆炸贴、价签、飘带、分节标题、印章、序号、对话框、便利贴、吊牌、票券，字可以换）。不带参数返回全部；query 用中文或英文关键词搜索，category 只看一类（hand-drawn | sticker | label），ids 按 id 取。每项有 aspect（宽高比）、本来的 color、标签的示例 text、stretches（能否单独拉伸高度）和 defaultWidth。用 add_decorations 放到页面上。',
    {
      query: z.string().optional().describe('中文或英文关键词，空格分隔的多个词需同时命中，如 "圈"、"underline"、"促销"'),
      category: z.enum(['hand-drawn', 'sticker', 'label']).optional().describe('只看一类：hand-drawn 手绘线条、sticker 贴纸、label 标签'),
      ids: z.array(z.string()).optional().describe('装饰 id 列表，如 ["circle-scribble", "sparkles"]'),
    },
    async ({ query, category, ids }) => jsonResult(listDecorations({ query, category, ids })),
  )

  server.tool(
    'add_decorations',
    '把装饰素材放到一页上（一次可放多个，按顺序叠放；list_decorations 查 id）：每项给 decoration、x、y（盒子左上角的页面坐标）、width（不给按页面短边的默认比例），高度按装饰的宽高比算。color（#RRGGBB）换掉装饰本来的主色（手绘线条和贴纸换整体颜色，标签换底色，字色自动取黑或白）；text 换标签上的字；rotation 旋转（度）；below 填同页一个顶层节点的 id 或图层名，装饰就放在它下面一层（荧光笔、胶带、色块垫在文字下面时用），不给则放在最上层。用 documentId 时就地更新这份文档，返回每个装饰的 nodeId、path 和盒子；之后可以用 apply_actions 改，用 check_document 检查有没有压住文字。',
    {
      ...documentInput,
      slideId: z.string().optional().describe('放在哪一页，默认文档当前页（activeSlideId）'),
      items: z.array(z.object({
        decoration: z.string().describe('list_decorations 返回的装饰 id'),
        x: z.number().describe('盒子左边，页面坐标'),
        y: z.number().describe('盒子上边，页面坐标'),
        width: z.number().positive().optional().describe('盒子宽度（px）；不给按默认比例'),
        height: z.number().positive().optional().describe('只对 stretches 为 true 的单笔画有效：拉伸到这个高度'),
        color: z.string().optional().describe('主色 #RRGGBB'),
        text: z.string().optional().describe('标签上的字'),
        rotation: z.number().optional().describe('旋转角度（度，顺时针）'),
        below: z.string().optional().describe('放在这个顶层节点（id 或图层名）下面一层'),
      })).min(1).describe('要放的装饰，按顺序叠放'),
      includeDocument,
    },
    async ({ slideId, items, includeDocument: withDocument, ...input }) => {
      const resolved = await documentFor(input)
      if (!resolved.ok) return jsonResult(resolved)
      const placed = placeDecorations(resolved.document, slideId, items)
      if (!placed.ok) return jsonResult(placed)
      const { document, ...rest } = placed
      return jsonResult({ ...rest, ...handleOf(keep(document, resolved.documentId), withDocument) })
    },
  )

  server.tool(
    'list_styles',
    '列出可一键套到整套卡片上的搭配（looks：id、name 和它的 palette、fontSet，两个一起套就是这套搭配）、配色（palettes：id、name、底色 background、文字色 text、强调色 accents）和字体组合（fontSets：id、name、标题字体 heading、正文字体 body），用 apply_actions 的 { type: "document/restyle", palette, fontSet } 套用；headingScale 是用标题字体的字号门槛（正文字号的倍数）。要换成指定的颜色或字体，用 document/restyle 的 colors / fonts，键取自 inspect_document 的 style。',
    {},
    async () => jsonResult(listStyles()),
  )

  server.tool(
    'list_text_styles',
    '列出现成的花字（文字效果组合）：每个有 id、name、适合放在什么底色上（backdrop），以及 patch——直接作为 apply_actions 里 node/update-style 的 patch，就能把一段文字变成这个样子（填充、效果和加粗一起设好，同时去掉原来的描边和阴影）。效果的大小按字号比例算，大标题和小字都能用；深色 backdrop 的（霓虹、故障、极光等）放在深色页面上才好看。',
    {},
    async () => jsonResult(listTextStyles()),
  )

  server.tool(
    'list_collages',
    `列出 6 套拼图版式（两张并排、一大两小、两小一大、三等分、四宫格、六宫格）：每套有 id、name、格子数 cellCount、宽高比 aspect，以及 example——一个完整的拼图组节点（圆角矩形格子、留缝隙、灰色占位），用 apply_actions 的 node/insert-children 直接插入页面，再把每个格子的 fill 换成 { type: 'image', src, fit, framing } 图片填充（node/update-style，取景同形状图片填充）。可选 pageWidth / pageHeight（默认 1080×1440）让格子按你的页面尺寸铺。`,
    {
      pageWidth: z.number().optional().describe('页面宽 px（默认 1080）'),
      pageHeight: z.number().optional().describe('页面高 px（默认 1440）'),
    },
    async ({ pageWidth, pageHeight }) => jsonResult(listCollages(pageWidth, pageHeight)),
  )

  server.tool(
    'list_filter_presets',
    '列出现成的滤镜预设（照片风格）：每个有 id、name，以及 patch——直接作为 apply_actions 里 node/update-style 的 patch，就能把图片、形状等元素一键变成这个风格（整体替换滤镜，黑白/复古/暖阳/冷调/胶片/褪色/高对比/柔焦；用到 v18 的 hue/grayscale/sepia）。传 null 清除滤镜回到原图。',
    {},
    async () => jsonResult(listFilterPresets()),
  )

  server.tool(
    'validate_document',
    `校验文档是否为合法的自由画布 v20 文档（v1–v19 输入自动迁移，图片 src 写成本机文件路径的会读进来嵌入）；合法时保存在服务端并返回 documentId（已有 documentId 的照旧），非法时返回原因。${DOCUMENT_SCHEMA_HINT}`,
    { ...documentInput, includeDocument },
    async ({ includeDocument: withDocument, ...input }) => {
      const resolved = await documentFor(input)
      if (!resolved.ok) return jsonResult(resolved)
      const stored = resolved.documentId ? documents.get(resolved.documentId)! : documents.add(resolved.document)
      return jsonResult({ ok: true, ...handleOf(stored, withDocument) })
    },
  )

  server.tool(
    'inspect_document',
    `检查文档结构：页面摘要（尺寸/背景/节点数）与递归节点树（id、name、type、几何、文本摘要；内置图标标出 icon id，装饰素材标出 decoration id，组成装饰的组也标在组上），以及整套卡片的 style：用到的颜色（按占的面积排序，附 share 和用在 background/fill/text/line/shadow 哪些地方）、字体（texts 用了几段文字、largest 最大字号）和正文字号 bodySize。改文档前先 inspect，拿到节点 id / 路径再发动作。${DOCUMENT_SCHEMA_HINT}`,
    documentInput,
    async (input) => {
      const resolved = await documentFor(input)
      if (!resolved.ok) return jsonResult(resolved)
      return jsonResult({ ...inspectDocument(resolved.document), ...(resolved.documentId ? { documentId: resolved.documentId } : {}) })
    },
  )

  server.tool(
    'apply_actions',
    `对文档应用一串编辑动作（与编辑器 UI 同一归约器，语义完全一致），返回每个动作是否生效（changes）。用 documentId 时就地更新这份文档（version 加一），传 document / documentPath 时另存为一份新文档并返回它的 documentId；动作里图片 src 写成本机文件路径的会读进来嵌入。${DOCUMENT_SCHEMA_HINT}。${ACTIONS_SCHEMA_HINT}`,
    {
      ...documentInput,
      actions: z.array(z.unknown()).describe('FreeformAction 数组'),
      includeDocument,
    },
    async ({ actions, includeDocument: withDocument, ...input }) => {
      const resolved = await documentFor(input)
      if (!resolved.ok) return jsonResult(resolved)
      const applied = applyActions(resolved.document, actions)
      if (!applied.ok) return jsonResult(applied)
      const embedded = await embedLocalImages(applied.document, resolved.baseDir)
      if (!embedded.ok) return jsonResult(embedded)
      return jsonResult({ ok: true, ...handleOf(keep(embedded.document, resolved.documentId), withDocument), changes: applied.changes })
    },
  )

  server.tool(
    'check_document',
    `检查自由画布文档排出来的样子：在与导出相同的页面里排版后，逐页列出读者会注意到的问题——文字放不下被裁掉（附能放下的字号 fitFontSize）、文字互相叠住、文字被上层色块挡住、跑出页面、文字和底色对比太低、还留着模板示例文字、空文本框、图片没加载出来、图形画到了自己的框外（viewBox 没包住 d）、图形既无填充也无描边而看不见。每条带 page、slideId、node（图层名）、path（apply_actions 用的节点路径）和改法。fix: true 时把放不下的文字改成能放下的字号并保存（用 documentId 时就地更新，返回 documentId 和 version），附改了哪些（fixed）和剩下的问题。${DOCUMENT_SCHEMA_HINT}`,
    {
      ...documentInput,
      fix: z.boolean().optional().describe('把放不下的文字自动缩到能放下的字号（改动保存回这份文档，返回 documentId 和 version）'),
      includeDocument,
    },
    async ({ fix, includeDocument: withDocument, ...input }) => {
      const resolved = await documentFor(input)
      if (!resolved.ok) return jsonResult(resolved)
      const checked = await checkDocument(resolved.document, { fix })
      if (!checked.ok || !checked.document || !checked.fixed?.length) {
        const { document: _unchanged, ...rest } = checked as typeof checked & { document?: unknown }
        return jsonResult(rest)
      }
      const { document, ...rest } = checked
      return jsonResult({ ...rest, ...handleOf(keep(document, resolved.documentId), withDocument) })
    },
  )

  server.tool(
    'render_document',
    `把自由画布 v20 文档（v1–v19 输入自动迁移）无头渲染为图片或 PDF（与编辑器导出同一管线：网页字体按字符子集嵌入、图片就绪等待、逐页导出）。默认输出 <baseName>-01.png、<baseName>-02.png… 到 outputDir；format: 'jpeg' 输出 .jpg（白底）；format: 'pdf' 输出一个 <baseName>.pdf，每页一张、页面和卡片一样大；long: true（png / jpeg）把所有页从上到下拼成一张长图 <baseName>-long.png（太长时自动降低倍率，返回实际 scale）；grid: true（png / jpeg，只用于正方形页面）把每页切成九宫格 <baseName>-01-1.png … -01-9.png，从左到右、从上到下，按这个顺序发朋友圈就拼回一整张（朋友圈九宫格模板 3240×3240 切出九张 1080×1080）；scale: 2 输出两倍像素。默认附上每页的小缩略图（JPEG，最多 ${MAX_PREVIEWS} 张）供你直接查看效果。仅支持自由画布文档；文档中的图片 src 必须是浏览器可加载的 URL 或 data URL。${DOCUMENT_SCHEMA_HINT}`,
    {
      ...documentInput,
      outputDir: z.string().describe('输出目录（不存在会创建）'),
      baseName: z.string().optional().describe('输出文件名前缀，默认 "dingcard"'),
      slideIds: z.array(z.string()).optional().describe('只渲染这些页（默认全部，按文档页序）；长图和 PDF 也只包含这些页'),
      format: z.enum(['png', 'jpeg', 'pdf']).optional().describe('png（默认，保留透明）、jpeg（白底）或 pdf（所有页在一个文件里）'),
      scale: z.union([z.literal(1), z.literal(2)]).optional().describe('像素倍率，默认 1'),
      quality: z.number().min(0.5).max(1).optional().describe('jpeg 和 pdf 的 JPEG 质量，默认 0.92'),
      long: z.boolean().optional().describe('png / jpeg：所有页拼成一张长图，代替逐页文件'),
      grid: z.boolean().optional().describe('png / jpeg：每个正方形页面切成九宫格（九个文件），代替逐页文件'),
      previews: z.boolean().optional().describe('是否附上缩略图，默认 true'),
    },
    async ({ outputDir, baseName, slideIds, format, scale, quality, long, grid, previews, ...input }) => {
      const resolved = await documentFor(input)
      if (!resolved.ok) return jsonResult(resolved)
      return renderResult(await renderDocument(resolved.document, { outputDir, baseName, slideIds, format, scale, quality, long, grid }), previews !== false)
    },
  )

  server.tool(
    'get_document',
    '取回一份文档的完整 JSON：给 path 时写成 JSON 文件（目录不存在会创建）并返回路径，不给时直接返回文档。写成文件的文档可以拖进叮卡「我的项目」，或之后用 documentPath 传回来。',
    {
      ...documentInput,
      path: z.string().optional().describe('写到这个 .json 文件，而不是直接返回文档'),
    },
    async ({ path: filePath, ...input }) => {
      const resolved = await documentFor(input)
      if (!resolved.ok) return jsonResult(resolved)
      const named = resolved.documentId ? { documentId: resolved.documentId } : {}
      if (filePath) return jsonResult({ ok: true, ...named, ...(await writeDocumentFile(resolved.document, filePath)) })
      return jsonResult({ ok: true, ...named, document: resolved.document })
    },
  )

  server.tool(
    'open_in_editor',
    '在叮卡编辑器里打开这份自由画布文档，方便人接着手改：服务端把文档放在本机地址上，在浏览器里打开编辑器的导入链接，编辑器读进来存成一个新项目（不登录也行，存在这台设备的浏览器里）。默认打开服务端自带的编辑器 http://127.0.0.1:5390（DINGCARD_APP_PORT 可改端口，被占用时换一个空闲端口）；设了环境变量 DINGCARD_APP_URL 或传 appUrl，就在那个叮卡里打开。open: false 只返回链接（url）不打开浏览器。',
    {
      ...documentInput,
      title: z.string().optional().describe('项目名，默认「导入的设计」'),
      appUrl: z.string().optional().describe('在这个叮卡编辑器里打开，如 http://127.0.0.1:5173'),
      open: z.boolean().optional().describe('是否打开浏览器，默认 true'),
    },
    async ({ title, appUrl, open, ...input }) => {
      const resolved = await documentFor(input)
      if (!resolved.ok) return jsonResult(resolved)
      try {
        const handed = await handOff(resolved.document, { title, appUrl })
        const opened = open === false ? false : openInBrowser(handed.url)
        return jsonResult({ ok: true, ...handed, opened, ...(resolved.documentId ? { documentId: resolved.documentId } : {}) })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  // ---- Delivery to a human anywhere: put the deck behind a share link on
  // the deployed server. Configure once with environment variables; the
  // link (or its QR code) then opens on any device, no account needed. ----

  const SHARE_SERVER_UNCONFIGURED = {
    ok: false as const,
    error: '未配置服务端：设置环境变量 DINGCARD_SERVER_URL（部署的叮卡地址，如 https://cards.example.com）、DINGCARD_SERVER_USERNAME 和 DINGCARD_SERVER_PASSWORD（一个叮卡账号），重启 MCP 后再分享。',
  }

  server.tool(
    'share_document',
    '把文档渲染成图片、上传到部署的叮卡服务端，生成一个不用登录就能打开的分享链接：手机扫码或点链接就能看整套卡片、长按存图——「电脑做图、手机发图」的最后一公里。需要先设环境变量 DINGCARD_SERVER_URL（部署的服务端地址）、DINGCARD_SERVER_USERNAME / DINGCARD_SERVER_PASSWORD（一个叮卡账号）。返回 { ok, share: { id, url, expiresAt, imageCount } } 并附上二维码图片，给用户扫即可。expiresInHours 是有效期（小时，1–720，默认 24，最长一个月），过期后链接打不开、图片仍留在账号里；list_shares 查已有分享，revoke_share 随时撤销（撤销后立刻打不开）。',
    {
      ...documentInput,
      title: z.string().optional().describe('分享页标题，默认「叮卡分享」'),
      expiresInHours: z.number().int().min(1).max(720).optional().describe('链接有效期（小时），1–720，默认 24，最长一个月'),
      qr: z.boolean().optional().describe('是否附上二维码图片，默认 true'),
    },
    async ({ title, expiresInHours, qr, ...input }) => {
      const client = serverClientFromEnv()
      if (!client) return jsonResult(SHARE_SERVER_UNCONFIGURED)
      const resolved = await documentFor(input)
      if (!resolved.ok) return jsonResult(resolved)
      // The pages only need to exist until they are uploaded.
      let tempDir: string | null = null
      try {
        tempDir = await mkdtemp(path.join(tmpdir(), 'dingcard-share-'))
        const rendered = await renderDocument(resolved.document, { outputDir: tempDir, format: 'png' })
        if (!rendered.ok) return jsonResult(rendered)
        const urls: string[] = []
        for (const [index, file] of rendered.files.entries()) {
          const bytes = await readFile(file.path)
          urls.push(await client.uploadImage(bytes, `page-${String(index + 1).padStart(2, '0')}.png`))
        }
        if (urls.length === 0) throw new Error('渲染没有产出任何页面，无法分享')
        const share = await client.createShare(title ?? '叮卡分享', urls, expiresInHours)
        const value = {
          ok: true as const,
          share: { id: share.id, url: share.url, expiresAt: share.expiresAt, imageCount: share.imageCount },
          note: '链接不用登录就能打开；给用户扫下面的二维码，或在任何浏览器点开。随时可用 revoke_share 撤销。',
          ...(resolved.documentId ? { documentId: resolved.documentId } : {}),
        }
        if (qr === false) return jsonResult(value)
        const QRCode = await import('qrcode')
        const dataUrl = await QRCode.toDataURL(share.url, { margin: 1, width: 480 })
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(value, null, 2) },
            { type: 'image' as const, data: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/png' },
          ],
        }
      } catch (error) {
        return errorResult(error)
      } finally {
        if (tempDir !== null) await rm(tempDir, { recursive: true, force: true })
      }
    },
  )

  server.tool(
    'list_shares',
    '列出账号在服务端已有的分享（id、标题、链接、创建与过期时间、卡片数），按创建时间倒序。需要环境变量 DINGCARD_SERVER_URL / DINGCARD_SERVER_USERNAME / DINGCARD_SERVER_PASSWORD。',
    {},
    async () => {
      const client = serverClientFromEnv()
      if (!client) return jsonResult(SHARE_SERVER_UNCONFIGURED)
      try {
        return jsonResult({ ok: true, shares: await client.listShares() })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.tool(
    'revoke_share',
    '撤销一个分享：链接立刻打不开（404），它的页面图片不再被引用、等图片回收清理。需要环境变量 DINGCARD_SERVER_URL / DINGCARD_SERVER_USERNAME / DINGCARD_SERVER_PASSWORD。',
    {
      id: z.string().describe('要撤销的分享 id（list_shares 里查）'),
    },
    async ({ id }) => {
      const client = serverClientFromEnv()
      if (!client) return jsonResult(SHARE_SERVER_UNCONFIGURED)
      try {
        await client.revokeShare(id)
        return jsonResult({ ok: true, id })
      } catch (error) {
        return errorResult(error)
      }
    },
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
    { description: '自由画布 v20 文档模型与校验规则说明' },
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
    'icons',
    'dingcard://icons',
    { description: '内置图标全集（每个图标的 id、中英文名、关键词与 24×24 路径数据 d）', mimeType: 'application/json' },
    async (uri: URL) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(iconCatalogue(), null, 2),
      }],
    }),
  )
  server.registerResource(
    'decorations',
    'dingcard://decorations',
    { description: '内置装饰素材全集（手绘线条、贴纸、标签：id、中英文名、分类、宽高比、主色、示例文字）', mimeType: 'application/json' },
    async (uri: URL) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(listDecorations(), null, 2),
      }],
    }),
  )
  server.registerResource(
    'freeform-example',
    'dingcard://examples/freeform',
    { description: '完整自由画布 v20 文档示例（编辑部模板实例）', mimeType: 'application/json' },
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

/** Whether this module is the program being run (through any symlink, like npx's bin); tests import it instead. */
function runDirectly(): boolean {
  const entryPath = process.argv[1]
  if (!entryPath) return false
  try {
    return realpathSync(path.resolve(entryPath)) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (runDirectly()) {
  main().catch((error) => {
    console.error('[dingcard-mcp] 启动失败：', error)
    process.exit(1)
  })
}
