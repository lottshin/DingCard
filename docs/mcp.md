# MCP 自动化接口

叮卡自带一个 MCP（Model Context Protocol）服务器 `dingcard-mcp`，让 AI 客户端（Claude Desktop、Cursor、ZCode 等任何支持 MCP 的工具）和其他程序可以不走浏览器 UI，直接完成“选模板 → 生成整套卡片 → 检查 → 无头渲染 PNG”的完整闭环，并且能看到自己做出来的样子：

```text
list_templates → create_document_from_content / create_document_from_outline（返回 documentId）
      → check_document（排版后列出问题，可自动缩字号）→ apply_actions 修改
      → render_document → PNG / JPG / PDF / 长图 + 每页缩略图（直接给模型看）
      → open_in_editor → 在叮卡编辑器里打开，人接着改
      → share_document → 分享链接 + 二维码（手机扫码看图，见下文「分享给人」）
list_server_projects → open_server_project（人在编辑器里存的作品载入，接着改 / 再渲染 / 再分享 / save_server_project 存回去）
```

服务端保存它创建和修改的文档：工具之间传 `documentId` 即可，不必每次把整份文档 JSON 传来传去（见下文「文档句柄」）。

渲染与编辑器导出走同一套管线：自由画布逐页 `pixelRatio: 1` 导出；Markdown 走工作台自己的管线（DOM 实测分页、平台头部与主题、`---` 手动分页、`pixelRatio: 3` 导出）；两者都做网页字体按字符子集嵌入与图片就绪等待。

## 工具一览

| 工具 | 作用 |
| --- | --- |
| `list_templates` | 列出内置模板（id、标题、描述、页数、标签、工作台），每个带 `kind`（`deck` 一整套卡片 / `poster` 单页海报）和 `format`（页面尺寸：小红书 3:4、竖版海报 9:16、方图 1:1、横版封面 16:9、公众号首图 2.35:1、A4 印刷、A4 横版、朋友圈九宫格 3240×3240，含宽高）。套图模板另有 `capacity`：内页最多几个要点、有没有正文和引文位、结尾页能放什么；海报模板另有 `posterCapacity`：副标题、正文、获得者（`recipient`）、按钮、角标、署名、主图位有没有，信息能放几行，有没有表格（`table`，最多几行几列）。按内容和尺寸挑模板。 |
| `create_document_from_template` | 按模板 id 实例化完整文档：自由画布文档保存在服务端，返回 `documentId` 和各页 id、名称；Markdown 返回源文信封。 |
| `add_template_pages` | 把任意自由画布模板的某几页（`pages`，从 1 起，可重复；不给就全部）加进已有文档：放在 `afterSlideId` 后面（默认最后），或换掉 `replaceSlideId` 那一页；页面保留模板的尺寸和示例文字，返回加进来的页并默认附缩略图（见下文「不同页用不同模板」）。 |
| `create_poster_from_content` | 按内容生成一张海报（`kind: 'poster'` 的模板）：`{ title, subtitle?, body?, recipient?, details?: ["时间：…"…], table?: [["节次", "周一"…]…], cta?, tag?, brand?, image? }`，尺寸跟模板走（规则见下文「生成海报」）；给 `documentId` 时海报加成那份文档的一页。 |
| `create_document_from_content` | 按结构化内容生成整套卡片：`{ title, subtitle?, pages: [{ title, body?, points?, quote?, templateId? }], ending? }`，封面 + 每个 page 一页 + 可选结尾页，风格沿用所选自由画布模板，某一页写了 `templateId` 就用那个套图模板的版式（规则见下文「生成整套卡片」）。 |
| `create_document_from_html` | 把你写的 HTML/CSS 网页转成能逐个修改的自由画布文档：每页一个 `<section>`，色块、文字、图片、SVG 图形读成形状、文字框、图片和图形节点，返回 `documentId`、每页尺寸和 `notes`（转不了、只能近似的地方），默认附缩略图（规则见下文「用网页写法出图」）。 |
| `create_document_from_outline` | 同上，内容写成 Markdown 大纲（写法见下文）。 |
| `check_document` | 在与导出相同的页面里排版后，逐页列出读者会注意到的问题（见下文「检查」），每条带图层名、节点路径和改法；`fix: true` 时把放不下的文字改成能放下的字号并返回改好的文档。 |
| `validate_document` | 严格校验 v20 文档（v1–v19 输入自动迁移；精确键匹配、几何范围、id 唯一性），合法时保存在服务端并返回 `documentId`（`includeDocument: true` 时附上规范化后的文档）。 |
| `inspect_document` | 输出页面摘要与递归节点树（id、name、type、几何、文本摘要；内置图标标出 `icon` id，装饰素材标出 `decoration` id（几部分组成的装饰标在组上），其他图形给出 `d` 开头），以及整套卡片的 `style`：用到的颜色（按面积排序，附占比 `share` 和用在哪：`background`/`fill`/`text`/`line`/`shadow`）、字体（几段文字用、最大字号）和正文字号 `bodySize`，为编辑提供目标。 |
| `list_icons` | 查内置图标（97 个线性图标）：不带参数列出全部图标的 id 和中英文名，`query` 用中文或英文关键词搜，`ids` 按 id 取；带上路径数据 `d`、统一画法 `style` 和一个可以直接插入的完整节点 `example`（见下文「图形与图标」）。 |
| `list_decorations` | 查内置装饰素材（48 个，和编辑器「元素」面板同一套）：手绘线条、贴纸、标签。不带参数列出全部，`query` 用中英文关键词搜，`category` 只看一类，`ids` 按 id 取；每个带宽高比 `aspect`、本来的 `color`、标签的示例 `text`、能否单独拉伸 `stretches` 和默认宽度（见下文「装饰素材」）。 |
| `add_decorations` | 把装饰素材放到一页上，一次可以放多个：每项给 `decoration`、`x`、`y`、`width`，可选 `color`、`text`、`rotation`、`below`（垫在某个顶层节点下面）；返回每个的 `nodeId`、`path` 和盒子。 |
| `list_text_styles` | 列出 16 套现成的花字：每套有 `id`、`name`、适合的底色 `backdrop` 和 `patch`，`patch` 直接作为 `node/update-style` 的补丁就能把文字变成这个样子（见下文「花字与文字效果」）。 |
| `list_collages` | 列出 6 套拼图版式（两张并排、一大两小、两小一大、三等分、四宫格、六宫格）：每套有 `id`、`name`、格子数 `cellCount`、宽高比 `aspect` 和 `example`——完整的拼图组节点（圆角矩形格子、留缝、灰色占位），用 `apply_actions` 的 `node/insert-children` 直接插入，再把格子 `fill` 换成图片填充；可选 `pageWidth`/`pageHeight`（默认 1080×1440）按页面尺寸铺格子。 |
| `list_filter_presets` | 列出 8 个现成的滤镜预设（黑白/复古/暖阳/冷调/胶片/褪色/高对比/柔焦）：每个有 `id`、`name` 和 `patch`，`patch` 直接作为 `node/update-style` 的补丁就能把图片、形状等元素一键变成这个风格（用到 v18 的 `hue`/`grayscale`/`sepia`；传 `null` 清除滤镜回到原图）。 |
| `list_styles` | 列出可一键套到整套卡片上的搭配（一组配色加上相配的字体组合）、配色（底色、文字色、强调色）和字体组合（标题字体、正文字体），配合 `document/restyle` 使用（见下文「整套换风格」）。 |
| `apply_actions` | 用与编辑器 UI 完全相同的 `FreeformAction` 归约器应用一串编辑，逐步报告是否生效；按 `documentId` 就地更新（`version` 加一）。 |
| `get_document` | 取回完整文档 JSON，或用 `path` 写成 `.json` 文件（之后可拖进「我的项目」，或用 `documentPath` 传回来）。 |
| `open_in_editor` | 在浏览器里的叮卡编辑器打开这份文档，存成一个新项目，人接着手改（见下文「在叮卡里打开」）。 |
| `render_document` | 无头渲染自由画布 v20 文档，默认输出 `<baseName>-01.png`、`-02.png`… 到指定目录；`format: 'jpeg'` 输出白底 `.jpg`，`format: 'pdf'` 输出一个 `<baseName>.pdf`（每页一张，页面和卡片一样大），`long: true`（png / jpeg）把所有页从上到下拼成一张 `<baseName>-long.png`（太长时自动降低倍率，`files[0].scale` 是实际倍率），`grid: true`（png / jpeg，只用于正方形页面）把每页切成九宫格 `<baseName>-01-1.png` … `-01-9.png`（`files[i].tile` 是 1–9，从左到右、从上到下，按这个顺序发朋友圈拼回一整张），`scale: 2` 输出两倍像素，`quality` 是 JPEG 质量；`slideIds` 只渲染这些页，PDF 和长图也只放这些页。默认附上每页的 JPEG 缩略图（432 px 宽，最多 12 张）作为图片内容返回，模型可以直接看效果；`previews: false` 关掉。 |
| `render_markdown` | 无头渲染 Markdown 文档信封为一套卡片 PNG：DOM 实测分页（`---` 为手动分页）、平台预设（`rednote`/`weibo`/`twitter`）、主题与个人资料头部、`pixelRatio: 3` 导出；页数由分页结果决定。同样附缩略图。 |
| `share_document` | 把文档渲染上传到部署的叮卡服务端，生成一个不用登录就能打开的分享链接，并附上二维码图片给用户扫（见下文「分享给人」）。需要环境变量 `DINGCARD_SERVER_URL` 加 `DINGCARD_SERVER_TOKEN`（API 令牌）或 `DINGCARD_SERVER_USERNAME` / `DINGCARD_SERVER_PASSWORD`。 |
| `list_shares` | 列出账号在服务端已有的分享（id、标题、链接、创建与过期时间、卡片数），按创建时间倒序。 |
| `revoke_share` | 撤销一个分享（`id` 从 `list_shares` 查）：链接立刻打不开，页面图片等图片回收清理。 |
| `list_server_projects` | 列出部署的叮卡服务端账号里存的作品（id、标题、类型 `markdown-card` / `freeform-slide`、最近更新时间），最新在前，`query` 按标题关键词过滤（不区分大小写）；id 给 `open_server_project` 载入（见下文「读账号里的作品」）。需要 `DINGCARD_SERVER_URL` 加 `DINGCARD_SERVER_TOKEN`（带 drafts 权限）或账号环境变量。 |
| `open_server_project` | 把服务端账号里的一个作品载入接着做：自由画布作品返回 `documentId`（之后 `inspect_document` / `apply_actions` / `render_document` / `share_document` 都能用），Markdown 作品返回 `markdownDocument` 信封（交给 `render_markdown`）；作品里的图片已换成服务端的绝对地址。 |
| `save_server_project` | 把一份自由画布文档存回部署的叮卡服务端账号：不给 `projectId` 存成新作品，给 `projectId`（`open_server_project` 返回的）覆盖那一份——人在编辑器里打开就是改过的版本（见下文「读账号里的作品」）。需要 `DINGCARD_SERVER_URL` 加 `DINGCARD_SERVER_TOKEN`（带 drafts 权限）或账号环境变量。 |

模板放不下的版式，可以写成网页交给 `create_document_from_html`，转出来同样接 `check_document` → `render_document`。

工具描述内嵌了 v20 文档模型（含多段渐变、径向渐变、文字描边与竖排文字、图形节点、高亮与下划线片段、图片背景、文字效果、滤镜的色调/灰度/复古黄、图形的图片填充、两端对齐、文字在框里的垂直位置、段间距、列表、删除线和片段字号）、动作类型与 Markdown 信封的字段说明，AI 客户端无需额外文档即可正确构造参数。批量场景推荐链路：`list_templates` 按 `capacity` 选风格 → `create_document_from_content`（或大纲）一次生成整套 → `check_document` 看有没有问题 → 需要时 `apply_actions` 修改（整套换配色、字体用 `document/restyle`）→ `render_document` 出全套 PNG（或一个 PDF、一张长图）并看缩略图。

## 文档句柄

- 创建或修改自由画布文档的工具（`create_document_from_*`、`validate_document`、`apply_actions`、`check_document` 的 `fix`）把结果保存在服务端，返回 `documentId`（形如 `doc_1a2b3c4d5e6f`）和 `version`；默认不再附上整份文档，要的话传 `includeDocument: true`，或用 `get_document` 取。
- 需要文档的工具都接受三种写法之一：`documentId`（推荐）、`document`（整份 JSON）、`documentPath`（JSON 文件路径，`~` 会展开）。用 `documentId` 修改时就地更新这份文档；传 `document` / `documentPath` 时另存为一份新文档。
- 服务端最多保留 32 份文档（最久没用的先清掉），重启后清空。要长期保存，用 `get_document` 的 `path` 写成文件。

## 本机图片

文档里图片的 `src`（图片节点、形状的图片填充、页面背景图）可以直接写本机文件路径：`/Users/me/photo.jpg`、`~/Pictures/a.png`、`./cover.webp`（相对 `documentPath` 所在目录，其他情况相对服务器的工作目录）或 `file://` 地址。保存、检查、渲染之前服务端会把文件读进来，嵌成 data URL，文档因此可以单独拿到编辑器和别的机器上用。支持 PNG、JPEG、GIF、WebP、AVIF 和 SVG，单张最大 20 MB。写成 `file://`、`~/`、`./`、`../` 的路径读不到会直接报错；以 `/` 开头但本机没有这个文件的，当作网址原样保留（比如 `/uploads/…`）。

## 在叮卡里打开

`open_in_editor` 把文档交给叮卡编辑器：服务端把文档放在本机的一个地址上，在默认浏览器里打开 `#/edit/canvas/import?url=…` 链接，编辑器读进来存成一个新项目（`title` 是项目名），不登录也行，存在这台设备的浏览器里。

- 默认打开服务端自带的编辑器：`http://127.0.0.1:5390`（同一份构建产物，离线可用；端口用 `DINGCARD_APP_PORT` 改，被占用时换一个空闲端口）。项目存在这个地址的浏览器存储里。
- 平时用的是别的叮卡（本地开发的 `http://127.0.0.1:5173`，或部署好的网站），设环境变量 `DINGCARD_APP_URL`，或调用时传 `appUrl`，就在那里打开；编辑器跨域读取本机地址上的文档。
- `open: false` 只返回链接（`url`）不打开浏览器。编辑器只接受本机（`127.0.0.1`、`localhost`）或同源地址上的文档，别的网站的链接会被拒绝。

## 分享给人

`share_document` 把文档变成一个不用登录就能打开的网页链接：每一页无头渲染成图片、上传到部署的叮卡服务端，挂在一个不可猜的链接后面——手机扫码或在任何浏览器点开都能看整套卡片，长按图片保存到相册。这是「电脑上让 AI 做图、手机上发小红书」的最后一公里：不再导出文件、传文件。

- **配置一次**（环境变量，重启 MCP 生效）：`DINGCARD_SERVER_URL`（部署的叮卡地址，如 `https://cards.example.com`）加 `DINGCARD_SERVER_TOKEN`（一个 API 令牌；带 images、shares 权限，见后端方案的「API 令牌」），或 `DINGCARD_SERVER_USERNAME` / `DINGCARD_SERVER_PASSWORD`（一个叮卡账号）。没配置时工具会返回怎么配的提示。
- `expiresInHours` 是有效期（小时）：1–720（最长一个月），默认 24。过期后链接打不开（410），页面图片仍留在账号里，和编辑器里「分享链接」的规则一致。
- 返回 `{ ok, share: { id, url, expiresAt, imageCount } }`，并附上二维码 PNG 图片（`qr: false` 关掉）——直接给用户扫即可。
- `list_shares` 列出已有分享，`revoke_share` 撤销一个（链接立刻 404）。分享出去的图片与素材库同样受图片回收保护，不会被误清。

## 读账号里的作品

`list_server_projects` 和 `open_server_project` 把方向反过来：人在编辑器里存好的作品，AI 也能接着做——改几个字、换个配色、再渲染、再分享，不用从零重做；`save_server_project` 再把改完的存回去。

- **配置**与分享相同（`DINGCARD_SERVER_URL` 加 `DINGCARD_SERVER_TOKEN` 或账号环境变量）；API 令牌需要带 `drafts` 权限（读和写都是这个作用域）。
- `list_server_projects` 返回作品的 `id`、`title`、`mode`（`markdown-card` / `freeform-slide`）和 `updatedAt`，最新在前；作品多时用 `query` 按标题关键词过滤（不区分大小写，返回里带 `matched` / `total` 计数）。
- `open_server_project` 按 `id` 载入：自由画布作品存进服务端并返回 `documentId` 和 `projectId`（服务端那份作品的 id），之后 `inspect_document` / `apply_actions` / `check_document` / `render_document` / `share_document` / `open_in_editor` 都能用；Markdown 作品返回 `markdownDocument` 信封（`source`、`platformId`、`themeId` 等都在里面），交给 `render_markdown` 渲染。
- `save_server_project` 把文档存回服务端账号：不给 `projectId` 存成新作品（`title` 可选，不给时按第一页名称自动起）；给 `open_server_project` 返回的 `projectId` 时覆盖那一份——人在编辑器里打开看到的就是改过的版本。Markdown 作品不能从 MCP 存回（编辑器里的 Markdown 工作台没有对应的文档工具）。
- 作品里的图片地址换成服务端的绝对地址（`/uploads/…` 指向部署的叮卡），渲染时能直接取到；不覆盖时（只载入、只渲染、另存新作品）服务端存的原作品不变。

## 用网页写法出图

模板排不出来的版式，可以直接写网页：`create_document_from_html` 在无头浏览器里按叮卡的字体把网页排好，再把排出来的样子读回来，每个元素变成能在编辑器里单独修改的节点，位置、字号、行高、字距、颜色、圆角、边框、阴影、渐变、透明度、混合模式、滤镜和旋转都照网页来，层叠顺序按 CSS 的绘制顺序（含 `z-index`）。网页给 `html`（源码）或 `htmlPath`（文件），里面的相对路径按 `htmlPath` 所在目录找，没有 `htmlPath` 时按服务器的工作目录。

- **页面**：每页一个 `<section>`，放在 `<body>` 下面，用 CSS 写死宽高（px），如 1080×1440（小红书 3:4）、1080×1920、1080×1080；没有 `<section>` 时整个 `<body>` 是一页，尺寸是 `width` × `height`（默认 1080×1440），`100vw` / `100vh` 也按这个算。`data-name` 给页面起名。页面的底色、渐变或铺满的背景图成为页面背景，其他背景层成为最底下的节点。
- **字体**：用内置的苹方 `"PingFang SC"`、思源黑体 `"Noto Sans SC"`、思源宋体 `"Noto Serif SC"`、霞鹜文楷 `"LXGW WenKai TC"`、站酷小薇 `"ZCOOL XiaoWei"`、系统宋体 `"Songti SC"`。别的字体按字体栈里的类别换成内置字体：衬线换思源宋体，手写换霞鹜文楷，其余换苹方。换好之后才排版，所以转出来的换行和位置跟排好的网页一致；`notes` 里列出换掉的字体。字重只有常规和粗体，600 及以上算粗体。
- **文字**：一个块里的文字是一个文字框，按原来的宽度换行，`text-align: justify` 照样两端对齐；行内的加粗、换色、底色（行内元素的 `background-color`）、下划线和删除线（`<s>`、`<del>`、`line-through`）变成文字片段。一个块里只有这段文字、几种字号的行高倍数又一样时（价格里放大的数字），不同字号成为带字号的片段，仍是一个文字框；否则同一行里的不同字号、和 `inline-block` 小标签在同一行的文字会拆成几个文字框，多栏排版（`columns`）的文字每行一个文字框，每行都留在原来的位置。行内元素带圆角、内边距、边框或渐变背景（荧光笔效果）时，底色画成文字下面的色块。`::before` / `::after` 照常生效，`text-transform` 已经换好。
- **列表**：`<ul>` / `<ol>` 的每一项只有文字、字号字体颜色一样、圆点或编号在外侧（`disc` / `circle` / `square` / `decimal`）、项与项间距一样时，整个列表转成一个列表文字（`list`，项间距成为 `paragraphSpacing`），圆点和编号由叮卡画，在编辑器里加一项只要按回车。其他列表逐项转，圆点和编号单独成字。
- **图片**：`<img>` 和 CSS `background-image` 都行，`object-fit`、`object-position`、`background-size`、`background-position` 换成取景；带圆角或圆形裁切（自己的 `border-radius`，或 `overflow: hidden` 的圆角容器）时成为带图片填充的形状。`src` 写本机路径、http(s) URL 或 data URL；本机图片和本机样式表（`<link rel="stylesheet">`）会嵌进来，读不到的图片列在 `notes` 里。
- **SVG**：内联 `<svg>` 的 `path`、`rect`、`circle`、`ellipse`、`line`、`polyline`、`polygon` 每个变成一个图形节点，一个 `<svg>` 里有几个就成一个组合；`transform`、`viewBox`、描边宽度、线帽和拐角都换算好。长短不一的虚线（比如环形进度条的 `stroke-dasharray`）按画出来的样子描成线段，SVG 里的 `<text>` 变成单行文字框；`<use>` 引用和 `<foreignObject>` 不转。
- **旋转和组合**：`rotate` 和 `scale`（`transform` 里的，或单独的 `rotate`、`scale` 属性）换成节点或组合的旋转缩放，只有一个节点的就转节点本身；`data-group` 让一个元素连同里面的东西成为一个组合，`data-name` 给图层起名。
- **近似处理**（写进 `notes`）：透明度不一的渐变（照片上的渐隐遮罩）、平铺背景和锥形渐变画成一张图；半透明的阴影按背后的颜色换成不透明的；只有一边的边框画成细长色块；内阴影、第二层以后的阴影、阴影的扩展、`backdrop-filter`、`clip-path`、`mask` 去掉，斜切按等比缩放。脚本和动画不运行。
- 转出来的文档和别的一样：`check_document` 检查，`apply_actions` 修改，`render_document` 出图，`open_in_editor` 在编辑器里接着改。

## 生成海报

`create_poster_from_content` 把内容填进单页模板（小红书封面的干货笔记和图片拼贴、菜单、价目表、证书、朋友圈九宫格、课程表、讲座、促销、招聘、节日、邀请函、金句、商品主图、视频封面、公众号首图、宣传单；内容位置写在 `src/templates/slots.ts` 的 `FREEFORM_POSTER_SLOTS`）：

- `title` 必填，其余可选：`subtitle` 副标题，`body` 一段正文，`details` 信息行（`"时间：10 月 18 日 14:00"`，冒号前放进这一行的标签，没写冒号就整句放进内容、标签去掉），`cta` 按钮文字，`tag` 角标（活动类型、价格、期数），`brand` 主办或落款，`image` 主图（本机路径、http(s) URL 或 data URL，本机路径读进来嵌成 data URL）。
- 模板里每一块示例文字都会换成内容，没给的连同它的底板、按钮一起删掉；没给 `image` 时，照片位变成一块和版面相配的色块，插画位直接删掉（朋友圈九宫格的插画是版面本身，留着）。
- 菜单、价目表一项写成 `details` 的一行，`"拿铁：28"` 冒号前是名称、后面是价格；比模板行数少时各行在原来的范围里拉开，清单不会下半截空着。证书上的姓名放 `recipient`。课程表放 `table`：第一行是表头（`["节次", "周一", …]`），之后每行第一格是节次（可以写两行，如 `"第 1 节\n8:00"`），表格按给的行数列数重画、铺满原来的位置，同一个科目同一种颜色，最多 12 行 8 列，画不下的格子列在 `summary.unplaced`。
- 标题比模板示例少几行时，标题下面的内容一起往上移，不在标题下面留一块空。
- 文字放不下时缩小字号（最小 72%），列在 `summary.shrunk`，还放不下的在 `summary.overflowing`；信息行比模板多出来的列在 `summary.unplaced`，模板没有位置的字段列在 `summary.unused`。两三行的标题断得一样长。
- 套图模板传给它会提示改用 `create_document_from_content`，反过来也一样。

## 生成整套卡片

`create_document_from_content` 和 `create_document_from_outline` 把内容放进模板画好的位置（`src/templates/slots.ts` 为每个自由画布模板的封面、内页、结尾页标明了标题、正文、要点、引文、页码和目录的位置）：

- 模板里每一块示例文字都会换成你的内容，或者连同只为它画的色块、线条一起删掉，生成的卡片里不会留下模板原话；英文刊头、编号这类装饰照原样保留。
- 页码按页序更新（`02`、`03`…；「完成进度 03 / 03」这类写法同时更新总页数）。
- 要点先放进模板的条目位：`"要点：说明"` 冒号后面放到这一条的第二行，太长又没写冒号时在第一个逗号处分成两行。条目占用旁边的空位、缩到 72% 还放不下时，要点改放进清单或正文。要点比条目多时，多出来的接在下方的正文里；正文在条目上方的模板，接到最后一条后面，保持阅读顺序。
- 封面的目录位（清单、柔光模板）列出各页标题。
- 模板里个别文本框画得盖住了旁边的条目或下面的说明（示例字短，碰不到）。填内容时这种框先收到那段文字为止，长文字在自己那一栏里换行，不会压上去。
- 文字放不下时先占用下方或上方的空位（不越过它所在的卡片、不压到别的元素），再缩小字号，最小到原字号的 72%；仍放不下的列在 `summary.overflowing`，请删短或换一个容量大的模板。被缩小的文字列在 `summary.shrunk`。
- 排成两三行的标题、要点和引文在词的边界上断得一样长（「先把睡眠时间 / 固定下来」，而不是一整行下面挂一个「下来」），不让标点打头，有逗号顿号时优先在它后面断；自己写了换行的照原样。信号模板封面的标题分成上下两段大字，也按两段排出来一样宽来分。
- 没有给结尾页（`ending`，或大纲里的 `## 结尾：标题`）就不出结尾页。
- 不同页可以用不同的套图模板：`pages` 里某一项写了 `templateId`，这一页就用那个模板的内页版式；`ending.templateId` 换用那个模板的结尾页。封面和没写的页用整套的 `templateId`，`summary.pages[].templateId` 标出每页的版式来自哪个模板。混用后可以用 `document/restyle` 统一配色和字体。

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

## 不同页用不同模板

模板可以一页一页加进已有文档，和编辑器模板面板里点一页一样，所以一份文档里每页可以来自不同的模板：

- `add_template_pages`：任意自由画布模板的某几页，`pages` 从 1 起（套图是 1 封面、2 内页、3 结尾，可以重复，比如 `[2, 2]` 加两张内页），不给就整套。默认加在最后，`afterSlideId` 加在某页后面，`replaceSlideId` 换掉某一页（比如一张空白页）。页面保留模板自己的尺寸和示例文字：用 `inspect_document` 找到图层、`apply_actions` 改字，`check_document` 会把没改的示例文字报出来。返回 `added`（每页的 `slideId`、`name`、在文档里是第几页、宽高），默认附上这几页的缩略图。
- 要按内容直接填好：套图的页用 `create_document_from_content` 每页的 `templateId`（见上文），海报用 `create_poster_from_content` 加上 `documentId`（和 `afterSlideId`），海报保留自己的尺寸，成为那份文档的一页。
- 底层动作是 `{ type: 'slide/insert', slides, afterSlideId?, replaceSlideId? }`，`apply_actions` 也能直接用来插入自己画好的整页：每页按读取文档的规则校验，页 id 不能和文档里已有的重复，第一页成为当前页。

## 检查

`check_document` 用无头浏览器把每一页按导出的样子排出来（嵌入与导出相同的字体），再结合文档本身列出问题：

| kind | 说明 |
| --- | --- |
| `text-overflow` | 字被文本框裁掉了笔画，附 `fitFontSize`（实测不再裁字的最大字号）。只看字形本身：行高超出文本框、但笔画都还在框里的不算。 |
| `text-overlap` | 两段文字叠在一起。 |
| `covered-text` | 文字被上层不透明的色块或图片挡住三成以上。图形按它真正画到的地方算（渲染时在图形的框上取 32×32 个点，看哪些落在填充或描边上）：圈住文字的手绘圈只有圈边压到字，不算挡住；正片叠底的荧光笔也不算。图形本身旋转了时按它的框算。 |
| `off-page` | 文字跑出页面。 |
| `low-contrast` | 纯色文字和身后的纯色底板、页面背景或背景图（取文字身后那块图片的平均颜色）对比度低于 4.5:1（48 号以上或 40 号以上粗体放宽到 3:1）；高亮片段的字色和它的高亮色之间同样按这个标准算。圈在环形图形里的字和页面比，不和圈的颜色比。 |
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
| `dingcard://schema/freeform` | 自由画布 v20 文档模型与校验规则说明。 |
| `dingcard://schema/actions` | `FreeformAction` 动作联合类型说明（`apply_actions` 的入参结构）。 |
| `dingcard://templates` | 内置模板清单（与 `list_templates` 相同的数据）。 |
| `dingcard://examples/freeform` | 完整自由画布 v20 文档示例（编辑部模板实例）。 |
| `dingcard://icons` | 内置图标全集：每个图标的 id、中英文名、关键词与 24×24 路径数据 `d`。 |
| `dingcard://decorations` | 内置装饰素材全集（与 `list_decorations` 不带参数时相同）。 |
| `dingcard://examples/markdown` | 完整 Markdown 文档信封示例（编辑档案模板实例）。 |

## 图形与图标

`path` 节点（v15）画任意矢量图：图标、徽章、对话气泡、波浪分隔线、曲线箭头、折线图、不规则色块。

- `d` 是 SVG 路径数据（`M/L/H/V/C/S/Q/T/A/Z` 及小写相对命令，必须以 `M`/`m` 开头，最长 20000 字符），写在 `viewBox` 坐标系里；渲染时图形拉伸铺满节点盒。节点盒与 `viewBox` 宽高比相同就不变形，不同就跟着盒子拉伸，描边始终粗细均匀。
- `fill` 是 ColorPaint（纯色、线性渐变、径向渐变）、`{ type: 'transparent' }`，或（v19 起）`{ type: 'image', src, fit, framing }` 图片填充——任意轮廓（手绘线、图标、贴纸）变成图片框，取景与形状图片填充同一套（`node/update-style` 改 `framing`）；v18 及更早的输入带图片填充会被拒绝。`stroke` 是 `#RRGGBB`；`strokeWidth` 用 `viewBox` 单位，随图形一起缩放，`0` 即不描边。可选 `dash`（`viewBox` 单位）、`cap`、`join`（`round`/`miter`/`bevel`）、`fillRule`（`nonzero`/`evenodd`，画圆环这类镂空图形用 `evenodd`），以及通用的 `opacity`、`shadow`、`filter`、`blendMode`。
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

## 装饰素材

手绘圈、下划线、箭头、贴纸、标签这些不用自己写 `d`：`list_decorations` 查到 id，`add_decorations` 一次放好。

```json
{
  "documentId": "…",
  "items": [
    { "decoration": "circle-scribble", "x": 70, "y": 230, "width": 520 },
    { "decoration": "marker-band", "x": 80, "y": 600, "width": 640, "below": "标题" },
    { "decoration": "burst-badge", "x": 820, "y": 90, "width": 200, "text": "限时", "rotation": 8 },
    { "decoration": "sparkles", "x": 900, "y": 1220, "width": 120, "color": "#ffb000" }
  ]
}
```

- 盒子就是画出来的范围：`x`、`y` 是左上角，`width` 是宽，高度按 `aspect` 算；`stretches` 为 `true` 的单笔画（下划线、波浪线、荧光笔等）可以用 `height` 拉伸。不给 `width` 就按页面短边的默认比例。
- `color` 换掉装饰本来的主色：手绘线条和贴纸整体换色，标签换底色、字自动取白或黑（大字白字要有 3:1 的对比度）。`text` 换标签上的字，给不是标签的装饰会在 `notes` 里说没用上。
- 默认放在最上层；`below` 填同一页一个顶层节点的 id 或图层名，就放在它下面一层（荧光笔、胶带垫在字下面）。荧光笔是正片叠底，压在字上也看得清，`check_document` 不算它挡住文字。
- 一笔画成的放进去是一个 `path` 节点，由几部分组成的（多色贴纸、带字的标签）是一个组，组里的字是 `文本` 图层，用 `inspect_document` 找到路径后可以用 `node/update-content` 改。放完用 `check_document` 看有没有压住文字、对比度够不够。

## 强调词与背景图

- 文字片段 `spans` 除了 `bold`、`color`，v16 起还有 `highlight`（荧光笔式高亮底色，`#RRGGBB`）和 `underline`（`true`）。几种样式可以叠在同一段上，片段之间按 `start` 排序、不能重叠：

```json
{ "text": "三步做出好看的封面", "spans": [{ "start": 0, "end": 2, "bold": true, "highlight": "#fef08a" }] }
```

- v20 起片段还有 `strike`（`true`，删除线）和 `fontSize`（1–4096 px，这几个字自己的字号）。价签不用再拆成几个文字框：划掉的原价和放大的现价写在一段里，一行的行高按最大的字撑开。改整段的 `fontSize` 时片段字号按比例跟着变：

```json
{ "text": "原价 ¥129 现价 ¥59", "fontSize": 40, "spans": [{ "start": 3, "end": 7, "strike": true, "color": "#9ca3af" }, { "start": 12, "end": 14, "fontSize": 96, "bold": true }] }
```

## 段落、列表和文字位置

v20 起 `text` 里的每个换行分出一段：

- `list: 'bullet' | 'number'` 每段一个列表项，圆点或编号由叮卡画，换行的第二行和第一行的字对齐，空段不算一项。圆点和编号不要写进 `text`（写了会出现两个）。`paragraphSpacing`（px）是段与段之间多出的距离，代替空行。
- `align: 'justify'` 两端对齐，中文正文用它，每段最后一行照常靠左。
- `verticalAlign: 'middle' | 'bottom'` 让文字在比它高的框里垂直居中或靠下——按钮、色块上的字和框一样大即可，不用再算 `y`。

```json
{ "type": "text", "text": "准备好咖啡豆\n水温 92 度，先闷蒸 30 秒\n两分半钟内完成", "list": "number", "paragraphSpacing": 12, "lineHeight": 1.4 }
```

- `node/update-style` 里 `verticalAlign: 'top'`、`paragraphSpacing: 0`、`list: null` 都是清除；`check_document` 量的是加上圆点缩进和段间距之后的样子。

- 页面背景 v16 起可以是图片：`{ type: 'image', src, fit: 'cover' | 'contain', framing: { focusX, focusY, zoom } }`，画在所有节点下面。图片地址要能被浏览器加载（URL 或 data URL），加载失败时 `check_document` 报 `image-failed`。文字直接压在背景图上时，`check_document` 取文字所在那块图片的平均颜色来算对比度，看不清就报 `low-contrast`（改法提示换一个和照片反差大的颜色，或在文字下面垫一块半透明色块）；跨站且没有 CORS 的图片读不出像素，这时不报，请看 `render_document` 的缩略图确认。

## 整套换风格

`apply_actions` 的 `{ type: 'document/restyle', palette?, fontSet?, colors?, fonts? }` 一次改所有页面，和编辑器「风格」面板是同一个动作：

```json
{ "type": "document/restyle", "palette": "night-flight", "fontSet": "editorial", "colors": { "#d94836": "#ff5a36" } }
```

- `palette` / `fontSet` 取 `list_styles` 的 id；`looks` 里每套搭配给出一对 `palette` 和 `fontSet`，两个一起传就是这套搭配。配色把页面底色换成新底色、正文色换成新文字色，深浅灰按原来在两者之间的位置取色，其余颜色依次换成强调色，再把因此看不清的字调深或调浅（按 `check_document` 的对比度门槛）；字体组合把不小于正文字号 1.4 倍（`headingScale`）的文字换成标题字体，其余换成正文字体。
- `colors`（`{ "#原色": "#新色" }`）和 `fonts`（`{ "原字体": "新字体" }`）精确替换，键是文档里现有的颜色和字体，可以从 `inspect_document` 的 `style` 里取；颜色在文字、片段标色和高亮、填充、描边、投影、渐变色标和文字效果里一起换。同时给时先套 `palette` / `fontSet`，再按 `colors` / `fonts` 覆盖（键仍指原来的颜色和字体）。精确替换不会自动调对比度，换完用 `check_document` 看一遍。
- 和其他动作一样，不认识的 id、不合法的颜色或什么都没换时，这一步被忽略（`changes` 里是 `false`）。

## 花字与文字效果

- 文字节点 v17 起可以带一个 `effect`：`neon` 发光、`outline` 字外描边、`hollow` 镂空、`splice` 错位、`offset` 硬投影、`echo` 回声、`glitch` 故障、`extrude` 立体、`background` 每行后面的底色块、`marker` 荧光笔；`amount`（0–100）按字号比例算大小，所以同一个效果放在什么字号上都合适。写法见工具描述里的文档模型，`node/update-style` 的 `effect: null` 去掉。
- 想直接用现成的样子，`list_text_styles` 给出 16 套花字，把其中的 `patch` 交给 `node/update-style`：

```json
{ "type": "node/update-style", "slideId": "cover", "updates": [{ "path": ["title"], "patch": { "textFill": { "type": "solid", "color": "#ffffff" }, "effect": { "type": "background", "color": "#18181b", "amount": 40, "radius": 30 }, "fontWeight": "bold", "stroke": null, "strokeWidth": null, "shadow": null } }] }
```

- 深色 `backdrop` 的花字（霓虹、故障、立体、极光、金色）放在深色页面上才好看。`check_document` 会把带底色块的文字和底色块比对比度，带字外描边的文字只要描边和字反差够就不报看不清。

## 字体

- `fontFamily` 写字体名或字体栈；内置字体（苹方、思源黑体、思源宋体、霞鹜文楷、站酷小薇、系统宋体、系统默认）在编辑器和渲染里都有。渲染在本机的无头浏览器里进行，本机装了的字体也能用名字直接写。
- 编辑器里「导入字体」的字体只存在导入它的那个浏览器里，MCP 渲染时没有，会退回默认无衬线字体；要交给别人的卡片用内置字体。

## 线段与旋转几何

所有节点的 `rotation` 都绕**节点盒中心**顺时针旋转（编辑器画布与导出渲染一致）。线段节点本身是「盒内的一条水平线段」：要画 A→B 的线段，设 `L=|AB|`、`rotation=atan2(By−Ay, Bx−Ax)`（度）、`width=L+2×strokeWidth`、`height` 取一个小正值（如 `strokeWidth×2.2`），再把盒子居中放到线段中点——`x=(Ax+Bx)/2−width/2`、`y=(Ay+By)/2−height/2`——圆头端点就恰好落在 A 与 B。把 `x/y` 当作端点、或按绕左上角旋转来推几何，都会让斜线整条错位。

## 回到编辑器精修

最省事的是 `open_in_editor`（见上文）。也可以把 `get_document` 写出的 `.json` 文件导入：在工作台「我的项目」点击「导入 JSON」，或把文件拖进页面。自由画布文档（v1–v20，旧版自动迁移为 v20）和 Markdown 文档都会存为项目，并在对应的编辑器里打开；非法文件会给出可读的错误提示。由此形成完整闭环：

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

`mcp/` 也可以打成独立 npm 包（`npm --prefix mcp pack`，打包前会构建前端并放进包里的 `dist/app`，装好后不依赖仓库）。发布到 npm 之后，客户端配置是：

```json
{
  "mcpServers": {
    "dingcard": { "command": "npx", "args": ["-y", "dingcard-mcp"] }
  }
}
```

在仓库里直接用的话，任何支持 stdio MCP 的客户端都可以用如下命令接入（在仓库根目录执行）：

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
| `DINGCARD_DIST_DIR` | `<仓库>/dist` | 渲染使用的构建产物目录。在仓库里、目录里没有 `render.html` 时会自动执行一次 `npm run build`；不在仓库里时用 npm 包自带的 `dist/app`；自定义目录缺失则直接报错。 |
| `DINGCARD_APP_URL` | （空） | `open_in_editor` 在这个叮卡编辑器里打开文档；不设时用服务端自带的编辑器。 |
| `DINGCARD_APP_PORT` | `5390` | 服务端自带编辑器的端口（被占用时换一个空闲端口）。 |

其他要求：

- **Node.js 22+**（与主项目一致）。
- **浏览器**：渲染优先使用系统安装的 Google Chrome（与 E2E 测试同一策略，零下载）。没有 Chrome 时会尝试默认 Chromium；两者都不可用会返回明确的错误信息。也可另行执行 `npx playwright install chromium`。
- 首次渲染前需要一次前端构建（自动触发，产物会被后续渲染复用）。

## 安全与边界

- 静态文件服务器只监听 `127.0.0.1` 的随机端口，带路径穿越防护，渲染结束即关闭。`open_in_editor` 的服务器也只监听 `127.0.0.1`，交出去的文档地址带随机 id，只保留最近 16 份。
- MCP 服务器只读写本地文件（输出目录、`documentPath`、图片路径由调用方指定）；不连接远程账号、草稿或图片存储。
- `create_document_from_html` 把网页放在没有脚本权限的沙箱框架里排版：网页里的脚本、事件处理器和 `<noscript>` 都去掉，只读它排出来的样子；网页引用的网络图片和字体照常加载。本机文件只读网页里写到的图片和样式表。
- stdout 只承载 JSON-RPC 协议，构建日志与诊断一律走 stderr。

## 当前限制

- `render_document` 仅支持自由画布文档（v20；v1–v19 输入自动迁移）；`render_markdown` 仅支持 Markdown 文档信封。
- 自由画布文本节点的可选 `spans` 富文本片段（局部加粗、标色、高亮、下划线、删除线、字号）和段落排版（两端对齐、垂直位置、段间距、列表）在渲染与校验中与编辑器一致支持；编辑器内改动文字时片段会按编辑位置自动保留或收缩。
- 模板只有仓库里内置的这几套（社区通过 PR 共建，见 docs/templates.md）。需要渲染自己的文档时，把文档直接传给 `render_document` / `render_markdown`。
- 文档中的图片 `src`（自由画布）可以是浏览器可加载的 URL、data URL 或本机文件路径（自动嵌入）；Markdown 文档的图片通过信封的 `images` 映射（`img:<id>` → data URL）提供，本地文件请先转为 data URL。
- 文档句柄只存在服务器进程里，重启后清空；`open_in_editor` 目前只交自由画布文档。
- 一次调用串行渲染全部所选页面，没有并发渲染池；`check_document` 同样要启动一次浏览器（一套 4–6 页的卡片约几秒）。
- 生成整套卡片只按模板画好的位置排版，不会改版式：内容明显超过模板容量时，换一个 `capacity` 更大的模板，或把内容拆成更多页。
- `create_document_from_html` 读的是浏览器排好的样子，不是网页的布局规则：转出来的文字框按原来的宽度换行，之后改字只在框里重新换行，不会像网页那样推动下面的元素；需要整体重排的改动，改网页再转一次更省事。
- Markdown 平台头部中的时间戳（微博/推特）按渲染时刻生成，与编辑器导出行为一致。
