# 贡献模板

叮卡的模板由社区共建：每套模板都是仓库里的一段代码，经 Pull Request 审阅合并后，所有人都能在模板中心使用，MCP 工具（`list_templates`、`create_document_from_template`）也会同时拿到它。

用户自己的作品不再存成「个人模板」。想复用一份排好的版式，在「我的项目」里把它「复制一份」再改即可；0.17–0.20 期间存过的个人模板，会在账号下次打开工作台时自动转成项目。

## 模板放在哪里

| 位置 | 内容 |
|---|---|
| `src/templates/types.ts` | 系列 id 的类型：`MarkdownTemplateSeriesId`、`FreeformTemplateSeriesId`。 |
| `src/templates/registry.ts` | 所有模板的内容与元数据，以及 `TEMPLATE_REGISTRY`。 |
| `src/templates/registry.test.ts` | 注册表的结构测试（数量、唯一 id、文档能通过校验、每次生成互不共享对象）。 |
| `src/i18n/en/data.ts` | 模板标题、简介和标签的英文。 |

模板 id 由系列 id 拼出：自由编辑是 `<series>-freeform`，Markdown 卡片是 `<series>-markdown`。id 一旦发布就不要再改，已有链接（`#/edit/canvas/template/<id>`）和 MCP 调用都靠它。

## 新增一套自由编辑模板

自由编辑模板分两种：一整套卡片（`FreeformDeckSeriesId`，封面、内页、结尾页三页，都是 3:4）和单页海报（`FreeformPosterSeriesId`，一页，尺寸取 `src/templates/formats.ts` 里的一种：小红书 3:4、竖版海报 9:16、方图 1:1、横版封面 16:9、公众号首图 2.35:1、A4 印刷、A4 横版、朋友圈九宫格 3240×3240）。页数是 1 的就是海报。海报按用得多少排：小红书封面（干货笔记、图片拼贴）、菜单、价目表、证书、朋友圈九宫格、课程表在前，讲座、促销等在后。

1. 在 `types.ts` 的 `FreeformDeckSeriesId` 或 `FreeformPosterSeriesId` 里加上新的系列 id（小写、连字符）。
2. 在 `registry.ts` 写一个 `createXxxDocument(): FreeformDocument`，用文件里现成的 `slide()`、`textNode()`、`shapeNode()`、`lineNode()` 和 `documentFromSlides()` 搭页面。它们每次调用都会生成新的 id，所以每次「使用模板」得到的都是一份独立的文档。
3. 在 `freeformSeriesMeta` 里写标题、一句话简介、页数和标签，在 `freeformFactories` 里登记工厂函数，再把 id 加进 `freeformSeriesIds`（这个数组的顺序就是模板中心里的顺序）。
4. 在 `src/templates/slots.ts` 里写槽位：套图在 `FREEFORM_TEMPLATE_SLOTS` 写每一页哪段文字是标题、导语、要点、引文和页码，哪些形状和线条只跟着某条要点出现（没有这条要点时一起删掉）；海报在 `FREEFORM_POSTER_SLOTS` 写标题、副标题、正文、获得者（证书上的姓名）、信息行（标签和内容；菜单、价目表一行是一道菜或一项服务，冒号前是名称、后面是价格）、按钮、角标、署名和主图位，照片位给一个没有图时用的色块 `fallback`，插画就是设计本身的写 `keep: true`（九宫格的插画没给图时留着）。整块信息共用的底板写在 `detailsExtras`，没有信息行时一起删掉；`spreadDetails` 让少于行数的信息行在原来的范围里拉开（最多拉到原间距的 1.6 倍），清单卡不会下半截空着；`titleFlow` 让标题比示例少几行时，标题下面的内容一起往上移（`pinned` 里的页脚不动）。课程表这类表格写 `table: { layout, sample }`：`src/templates/tables.ts` 的 `tableNodes()` 按版式画出一格一格的色块和字，模板用它画示例，MCP 按内容的行数列数重画（同一个词同一种颜色）。真实内容常常原样用到的示例词（「荣誉证书」「课程表」、价格）写进 `generic`，`check_document` 不把它们当成没换掉的示例。MCP 的 `create_document_from_content` / `create_poster_from_content` 按槽位把内容填进模板，示例文案一句都不会留下。海报的页面用 `slide(name, background, nodes, size)` 画成它的尺寸。装饰素材用 `decorationNode(id, x, y, width, options)` 放进模板（和元素面板同一份，见 `src/freeform/decorations.ts`），要让某一部分当槽位（爆炸贴上的字）就用 `decorationParts()` 把它拆开、逐个命名。
5. 在 `src/i18n/en/data.ts` 的模板元数据段落里补上标题、简介和新标签的英文。
6. 更新 `registry.test.ts` 里的模板数量。

## 新增一套 Markdown 卡片模板

1. 在 `MarkdownTemplateSeriesId` 里加系列 id。
2. 在 `markdownDocuments` 里写一份 `MarkdownTemplateDocument`：正文 `source` 用单独一行 `---` 分页，另选 `platformId`、`themeId`、`fontFamily`、`radius` 和示例 `profile`。平台、主题、字体必须是 `src/theme.ts` 里已有的 id。
3. 在 `markdownSeriesMeta` 写元数据（`pageCount` 要和 `---` 分出的页数一致），把 id 加进 `markdownSeriesIds`。
4. 补英文，改测试里的数量。

## 版式要求

内置的八套自由编辑模板按这几条画（1080×1440）：

- 一页一个焦点：封面标题 120–150px、内页标题 100–112px，正文不小于 34px，页眉页脚这类小字不小于 22px；行高标题 1.15–1.25、正文 1.5–1.6。
- 左右边距 88px 上下对齐，色块贴边时留出血；装饰都有用处（页码、刊头、分隔线、编号块、印章），不放和内容无关的几何图形。
- 一套两种字体以内，颜色一个底色、一个文字色、一到两个强调色；文字和它背后颜色的对比度大字不低于 3:1、其余不低于 4.5:1（`check_document` 的门槛），中文不用斜体。
- 文本框按要填的内容留够地方：标题至少能放两行，要点框能放下一行半；MCP 填内容时会在框里缩字、往下面的空处长，并把两三行的标题和要点在词的边界上断得一样长。
- 需要强调时用文字效果（底色块、荧光笔、霓虹、镂空数字），不要叠一层形状再压一段字。
- 海报按尺寸放大字号（9:16 的标题 120–180px），信息行一行一条；照片放进图片填充的形状（`pictureShape`），透明底的插画用图片节点（`illustrationNode`）。示例图只用仓库里的图或自己画的原创 SVG（放在 `public/templates/`）。
- 朋友圈九宫格画在 3240×3240 上，在 1080 和 2160 处放参考线（切线），导出时「切成九宫格」得到九张 1080×1080；大字横跨中间一排，四角的格子各自也要好看。

## 内容要求

- 只用仓库里已有的素材，或者能随仓库以 MIT 许可发布的原创素材；不要引用外链图片。
- 模板里的文字就是示例文案，写得像一份真实作品，别用「标题」「正文」这样的占位符。
- 画面元素的坐标要落在页面内；贴边的色块按 `TEMPLATE_EDGE_BLEED` 留出血，缩略图和导出图才不会露出底色。
- 字体只用 `FONTS` 里登记过的，导出时才能正确嵌入。
- 所有页面尺寸一致，除非这套模板本来就是混合尺寸的设计。

## 提交前自查

```bash
npm run test:unit        # 注册表结构、文档校验、i18n 覆盖
npm run test:mcp         # MCP 的 list_templates / create_document_from_template
npm run dev              # 打开「模板中心」看缩略图，再用它新建一个项目，改几处、导出一次
```

PR 描述里附上每一页的截图（可以直接用编辑器导出的 PNG），并说明这套模板适合什么内容。
