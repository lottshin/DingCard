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

1. 在 `types.ts` 的 `FreeformTemplateSeriesId` 里加上新的系列 id（小写、连字符）。
2. 在 `registry.ts` 写一个 `createXxxDocument(): FreeformDocument`，用文件里现成的 `slide()`、`textNode()`、`shapeNode()`、`lineNode()` 和 `documentFromSlides()` 搭页面。它们每次调用都会生成新的 id，所以每次「使用模板」得到的都是一份独立的文档。
3. 在 `freeformSeriesMeta` 里写标题、一句话简介、页数和标签，在 `freeformFactories` 里登记工厂函数，再把 id 加进 `freeformSeriesIds`（这个数组的顺序就是模板中心里的顺序）。
4. 在 `src/i18n/en/data.ts` 的模板元数据段落里补上标题、简介和新标签的英文。
5. 更新 `registry.test.ts` 里的模板数量。

## 新增一套 Markdown 卡片模板

1. 在 `MarkdownTemplateSeriesId` 里加系列 id。
2. 在 `markdownDocuments` 里写一份 `MarkdownTemplateDocument`：正文 `source` 用单独一行 `---` 分页，另选 `platformId`、`themeId`、`fontFamily`、`radius` 和示例 `profile`。平台、主题、字体必须是 `src/theme.ts` 里已有的 id。
3. 在 `markdownSeriesMeta` 写元数据（`pageCount` 要和 `---` 分出的页数一致），把 id 加进 `markdownSeriesIds`。
4. 补英文，改测试里的数量。

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
