# MCP 自动化接口

叮卡自带一个 MCP（Model Context Protocol）服务器 `dingcard-mcp`，让 AI 客户端（Claude Desktop、Cursor、ZCode 等任何支持 MCP 的工具）和其他程序可以不走浏览器 UI，直接完成“选模板 → 生成整套卡片 → 检查 → 无头渲染 PNG”的完整闭环，并且能看到自己做出来的样子：

```text
list_templates → create_document_from_content / create_document_from_outline
      → check_document（排版后列出问题，可自动缩字号）→ apply_actions 修改
      → render_document → PNG 文件 + 每页缩略图（直接给模型看）
```

渲染与编辑器导出走同一套管线：自由画布逐页 `pixelRatio: 1` 导出；Markdown 走工作台自己的管线（DOM 实测分页、平台头部与主题、`---` 手动分页、`pixelRatio: 3` 导出）；两者都做网页字体按字符子集嵌入与图片就绪等待。

## 工具一览

| 工具 | 作用 |
| --- | --- |
| `list_templates` | 列出内置模板（id、标题、描述、页数、标签、工作台）。自由画布模板另有 `capacity`：内页最多几个要点、有没有正文和引文位、结尾页能放什么，按内容挑模板。 |
| `create_document_from_template` | 按模板 id 实例化完整文档：自由画布返回 v16 文档，Markdown 返回源文信封。 |
| `create_document_from_content` | 按结构化内容生成整套卡片：`{ title, subtitle?, pages: [{ title, body?, points?, quote? }], ending? }`，封面 + 每个 page 一页 + 可选结尾页，风格沿用所选自由画布模板（规则见下文「生成整套卡片」）。 |
| `create_document_from_outline` | 同上，内容写成 Markdown 大纲（写法见下文）。 |
| `check_document` | 在与导出相同的页面里排版后，逐页列出读者会注意到的问题（见下文「检查」），每条带图层名、节点路径和改法；`fix: true` 时把放不下的文字改成能放下的字号并返回改好的文档。 |
| `validate_document` | 严格校验 v16 文档（v1–v15 输入自动迁移；精确键匹配、几何范围、id 唯一性），合法时返回规范化结果。 |
| `inspect_document` | 输出页面摘要与递归节点树（id、name、type、几何、文本摘要；内置图标标出 `icon` id，其他图形给出 `d` 开头），以及整套卡片的 `style`：用到的颜色（按面积排序，附占比 `share` 和用在哪：`background`/`fill`/`text`/`line`/`shadow`）、字体（几段文字用、最大字号）和正文字号 `bodySize`，为编辑提供目标。 |
| `list_icons` | 查内置图标（97 个线性图标）：不带参数列出全部图标的 id 和中英文名，`query` 用中文或英文关键词搜，`ids` 按 id 取；带上路径数据 `d`、统一画法 `style` 和一个可以直接插入的完整节点 `example`（见下文「图形与图标」）。 |
| `list_styles` | 列出可一键套到整套卡片上的配色（底色、文字色、强调色）和字体组合（标题字体、正文字体），配合 `document/restyle` 使用（见下文「整套换风格」）。 |
| `apply_actions` | 用与编辑器 UI 完全相同的 `FreeformAction` 归约器应用一串编辑，逐步报告是否生效。 |
| `render_document` | 无头渲染自由画布 v16 文档为 PNG 文件，输出 `<baseName>-01.png`、`-02.png`… 到指定目录，并默认附上每页的 JPEG 缩略图（432 px 宽，最多 12 张）作为图片内容返回，模型可以直接看效果；`previews: false` 关掉。 |
| `render_markdown` | 无头渲染 Markdown 文档信封为一套卡片 PNG：DOM 实测分页（`---` 为手动分页）、平台预设（`rednote`/`weibo`/`twitter`）、主题与个人资料头部、`pixelRatio: 3` 导出；页数由分页结果决定。同样附缩略图。 |

工具描述内嵌了 v16 文档模型（含多段渐变、径向渐变、文字描边与竖排文字、图形节点、高亮与下划线片段、图片背景）、动作类型与 Markdown 信封的字段说明，AI 客户端无需额外文档即可正确构造参数。批量场景推荐链路：`list_templates` 按 `capacity` 选风格 → `create_document_from_content`（或大纲）一次生成整套 → `check_document` 看有没有问题 → 需要时 `apply_actions` 修改（整套换配色、字体用 `document/restyle`）→ `render_document` 出全套 PNG 并看缩略图。

## 生成整套卡片

`create_document_from_content` 和 `create_document_from_outline` 把内容放进模板画好的位置（`src/templates/slots.ts` 为每个自由画布模板的封面、内页、结尾页标明了标题、正文、要点、引文、页码和目录的位置）：

- 模板里每一块示例文字都会换成你的内容，或者连同只为它画的色块、线条一起删掉，生成的卡片里不会留下模板原话；英文刊头、编号这类装饰照原样保留。
- 页码按页序更新（`02`、`03`…；「完成进度 03 / 03」这类写法同时更新总页数）。
- 要点先放进模板的条目位：`"要点：说明"` 冒号后面放到这一条的第二行，太长又没写冒号时在第一个逗号处分成两行。条目占用旁边的空位、缩到 72% 还放不下时，要点改放进清单或正文。要点比条目多时，多出来的接在下方的正文里；正文在条目上方的模板，接到最后一条后面，保持阅读顺序。
- 封面的目录位（清单、柔光模板）列出各页标题。
- 模板里个别文本框画得盖住了旁边的条目或下面的说明（示例字短，碰不到）。填内容时这种框先收到那段文字为止，长文字在自己那一栏里换行，不会压上去。
- 文字放不下时先占用下方或上方的空位（不越过它所在的卡片、不压到别的元素），再缩小字号，最小到原字号的 72%；仍放不下的列在 `summary.overflowing`，请删短或换一个容量大的模板。被缩小的文字列在 `summary.shrunk`。
- 没有给结尾页（`ending`，或大纲里的 `## 结尾：标题`）就不出结尾页。

大纲写法：

```markdown
# 总标题
封面副标题（# 下面、第一个 ## 之前的文字）

## 小节标题
- 要点
- 要点：这一条的说明
正文段落（不带列表标记的行）
> 引文 —— 出处

## 结尾：结尾页标题
- 结尾页的要点
```

## 检查

`check_document` 用无头浏览器把每一页按导出的样子排出来（嵌入与导出相同的字体），再结合文档本身列出问题：

| kind | 说明 |
| --- | --- |
| `text-overflow` | 字被文本框裁掉了笔画，附 `fitFontSize`（实测不再裁字的最大字号）。只看字形本身：行高超出文本框、但笔画都还在框里的不算。 |
| `text-overlap` | 两段文字叠在一起。 |
| `covered-text` | 文字被上层不透明的色块或图片挡住三成以上。 |
| `off-page` | 文字跑出页面。 |
| `low-contrast` | 纯色文字和身后的纯色底板、页面背景或背景图（取文字身后那块图片的平均颜色）对比度低于 4.5:1（48 号以上或 40 号以上粗体放宽到 3:1）；高亮片段的字色和它的高亮色之间同样按这个标准算。 |
| `sample-text` | 还是模板里的示例文字。 |
| `empty-text` | 空文本框。 |
| `image-failed` | 这一页有图片没加载出来。 |
| `path-overflow` | 图形画到了自己的框外：`viewBox` 没有包住 `d` 用到的坐标。改法里直接给出正好包住图形的 `viewBox`。 |
| `empty-path` | 图形既没有填充也没有描边，看不见。 |

每条问题带 `page`、`slideId`、`node`（图层名）、`path`（`apply_actions` 用的节点路径）和中文改法。内置模板原样保留的装饰文字、模板自己采用的配色不算问题，所以报告里只有内容带来的问题。`fix: true` 只自动处理 `text-overflow`（改成 `fitFontSize`），改完再检查一遍，返回 `document`、`fixed` 和剩下的问题；颜色、位置交给客户端用 `apply_actions` 改。

## MCP 资源

除工具外，服务器还以只读资源（`resources/list` / `resources/read`）暴露说明与示例，客户端可以按需取用而不必从工具描述里拼凑：

| URI | 内容 |
| --- | --- |
| `dingcard://schema/freeform` | 自由画布 v16 文档模型与校验规则说明。 |
| `dingcard://schema/actions` | `FreeformAction` 动作联合类型说明（`apply_actions` 的入参结构）。 |
| `dingcard://templates` | 内置模板清单（与 `list_templates` 相同的数据）。 |
| `dingcard://examples/freeform` | 完整自由画布 v16 文档示例（编辑部模板实例）。 |
| `dingcard://icons` | 内置图标全集：每个图标的 id、中英文名、关键词与 24×24 路径数据 `d`。 |
| `dingcard://examples/markdown` | 完整 Markdown 文档信封示例（编辑档案模板实例）。 |

## 图形与图标

`path` 节点（v15）画任意矢量图：图标、徽章、对话气泡、波浪分隔线、曲线箭头、折线图、不规则色块。

- `d` 是 SVG 路径数据（`M/L/H/V/C/S/Q/T/A/Z` 及小写相对命令，必须以 `M`/`m` 开头，最长 20000 字符），写在 `viewBox` 坐标系里；渲染时图形拉伸铺满节点盒。节点盒与 `viewBox` 宽高比相同就不变形，不同就跟着盒子拉伸，描边始终粗细均匀。
- `fill` 是 ColorPaint（纯色、线性渐变、径向渐变）或 `{ type: 'transparent' }`；`stroke` 是 `#RRGGBB`；`strokeWidth` 用 `viewBox` 单位，随图形一起缩放，`0` 即不描边。可选 `dash`（`viewBox` 单位）、`cap`、`join`（`round`/`miter`/`bevel`）、`fillRule`（`nonzero`/`evenodd`，画圆环这类镂空图形用 `evenodd`），以及通用的 `opacity`、`shadow`、`filter`、`blendMode`。
- `viewBox` 要正好包住 `d` 用到的坐标，画到框外 `check_document` 会报 `path-overflow` 并给出合适的 `viewBox`。
- 换图形用 `node/update-content` 的 `{ d, viewBox }`，改样式用 `node/update-style`。

内置图标先用 `list_icons` 查，再把返回的 `example` 改好 `id`、位置和颜色，用 `node/insert-children` 插进去：

```json
{
  "id": "icon-check", "name": "对勾", "locked": false, "hidden": false,
  "type": "path", "x": 120, "y": 120, "width": 96, "height": 96, "rotation": 0, "scale": 1,
  "d": "M20 6 9 17l-5-5",
  "viewBox": { "x": 0, "y": 0, "width": 24, "height": 24 },
  "fill": { "type": "transparent" }, "stroke": "#18181b", "strokeWidth": 2
}
```

图标是 [Lucide](https://lucide.dev) 的线性图标（ISC 许可，来自 Feather 的部分为 MIT 许可），每个合并成一条路径，存放在 `src/freeform/iconLibrary.ts`，由 `scripts/icons/build-icon-library.mjs` 生成。

## 强调词与背景图

- 文字片段 `spans` 除了 `bold`、`color`，v16 起还有 `highlight`（荧光笔式高亮底色，`#RRGGBB`）和 `underline`（`true`）。几种样式可以叠在同一段上，片段之间按 `start` 排序、不能重叠：

```json
{ "text": "三步做出好看的封面", "spans": [{ "start": 0, "end": 2, "bold": true, "highlight": "#fef08a" }] }
```

- 页面背景 v16 起可以是图片：`{ type: 'image', src, fit: 'cover' | 'contain', framing: { focusX, focusY, zoom } }`，画在所有节点下面。图片地址要能被浏览器加载（URL 或 data URL），加载失败时 `check_document` 报 `image-failed`。文字直接压在背景图上时，`check_document` 取文字所在那块图片的平均颜色来算对比度，看不清就报 `low-contrast`（改法提示换一个和照片反差大的颜色，或在文字下面垫一块半透明色块）；跨站且没有 CORS 的图片读不出像素，这时不报，请看 `render_document` 的缩略图确认。

## 整套换风格

`apply_actions` 的 `{ type: 'document/restyle', palette?, fontSet?, colors?, fonts? }` 一次改所有页面，和编辑器「风格」面板是同一个动作：

```json
{ "type": "document/restyle", "palette": "night-flight", "fontSet": "editorial", "colors": { "#d94836": "#ff5a36" } }
```

- `palette` / `fontSet` 取 `list_styles` 的 id。配色把页面底色换成新底色、正文色换成新文字色，深浅灰按原来在两者之间的位置取色，其余颜色依次换成强调色，再把因此看不清的字调深或调浅（按 `check_document` 的对比度门槛）；字体组合把不小于正文字号 1.4 倍（`headingScale`）的文字换成标题字体，其余换成正文字体。
- `colors`（`{ "#原色": "#新色" }`）和 `fonts`（`{ "原字体": "新字体" }`）精确替换，键是文档里现有的颜色和字体，可以从 `inspect_document` 的 `style` 里取；颜色在文字、片段标色和高亮、填充、描边、投影、渐变色标里一起换。同时给时先套 `palette` / `fontSet`，再按 `colors` / `fonts` 覆盖（键仍指原来的颜色和字体）。精确替换不会自动调对比度，换完用 `check_document` 看一遍。
- 和其他动作一样，不认识的 id、不合法的颜色或什么都没换时，这一步被忽略（`changes` 里是 `false`）。

## 线段与旋转几何

所有节点的 `rotation` 都绕**节点盒中心**顺时针旋转（编辑器画布与导出渲染一致）。线段节点本身是「盒内的一条水平线段」：要画 A→B 的线段，设 `L=|AB|`、`rotation=atan2(By−Ay, Bx−Ax)`（度）、`width=L+2×strokeWidth`、`height` 取一个小正值（如 `strokeWidth×2.2`），再把盒子居中放到线段中点——`x=(Ax+Bx)/2−width/2`、`y=(Ay+By)/2−height/2`——圆头端点就恰好落在 A 与 B。把 `x/y` 当作端点、或按绕左上角旋转来推几何，都会让斜线整条错位。

## 回到编辑器精修

AI 生成的文档 JSON 可以直接回到叮卡里精修：在工作台「我的项目」点击「导入 JSON」，或把 `.json` 文件拖进页面。自由画布文档（v1–v16，旧版自动迁移为 v16）和 Markdown 文档都会存为项目，并在对应的编辑器里打开；非法文件会给出可读的错误提示。由此形成完整闭环：

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

- `render_document` 仅支持自由画布文档（v16；v1–v15 输入自动迁移）；`render_markdown` 仅支持 Markdown 文档信封。
- 自由画布文本节点的可选 `spans` 富文本片段（局部加粗/标色）在渲染与校验中与编辑器一致支持；编辑器内改动文字时片段会按编辑位置自动保留或收缩。
- 模板只有仓库里内置的这几套（社区通过 PR 共建，见 docs/templates.md）。需要渲染自己的文档时，把文档直接传给 `render_document` / `render_markdown`。
- 文档中的图片 `src`（自由画布）必须是浏览器可加载的 URL 或 data URL；Markdown 文档的图片通过信封的 `images` 映射（`img:<id>` → data URL）提供，本地文件请先转为 data URL。
- 一次调用串行渲染全部所选页面，没有并发渲染池；`check_document` 同样要启动一次浏览器（一套 4–6 页的卡片约几秒）。
- 生成整套卡片只按模板画好的位置排版，不会改版式：内容明显超过模板容量时，换一个 `capacity` 更大的模板，或把内容拆成更多页。
- Markdown 平台头部中的时间戳（微博/推特）按渲染时刻生成，与编辑器导出行为一致。
