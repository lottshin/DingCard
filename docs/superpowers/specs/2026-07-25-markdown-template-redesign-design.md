# Markdown 模板重做设计

- 日期：2026-07-25（2026-07-26 补充平台刊头）
- 分支：`feature/template-center`
- 状态：v15 模板与 v20 议题封面平台刊头均已确认
- 视觉基准：[三套模板预览](../../assets/markdown-template-redesign-v15.png)

## 1. 背景

当前 Markdown 模板只替换示例正文、颜色、字体和圆角。卡片仍使用同一套通用排版，因此“编辑部”“清单”“信号”“夜航”在模板中心里有区别，应用到编辑器后却很接近普通主题。

本次把已确认的三套 v15 方案接入 Markdown 工作区：

- 编辑档案
- 公共剧场
- 议题封面

三套模板都提供四页示例。自由画布现有四套模板不改。

## 2. 范围

本次包含：

- Markdown 模板中心改为三套新模板。
- 卡片根据模板主题和页面内容渲染对应版式。
- 模板缩略图、编辑区预览和 PNG 导出使用同一套渲染。
- 分页测量使用与卡片一致的模板样式。
- 增加一张本地建筑图片，供“编辑档案”和“议题封面”的示例使用。
- 更新测试、README、更新日志和前端版本号。

本次不包含：

- 不改自由画布模板。
- 不增加模板编辑器或模板导入功能。
- 不改后端接口、远端草稿格式、Docker 镜像地址和部署方式。
- 不把预览稿中的外部 Unsplash 地址带进生产代码。
- 不处理现有主包拆分。

## 3. 三套模板

### 3.1 编辑档案

默认设置：

- 小红书 3:4。
- 思源宋体。
- 4px 圆角。
- 米白、黑色和红色。

页面规则：

- 封面使用八栏细网格。标题在上半部，示例图片横跨下半部；图片带编号和时间标签。
- 正文页保留网格和左侧红色章节线，底部显示三个步骤。
- 引用页使用大引号、红色校样圈和三段短注释。
- 收尾页为黑底，右侧红栏显示页码，正文区带审批章。

装饰只使用 CSS 和渲染组件生成，不写进 Markdown 正文。用户改文字时不会在编辑器里看到 `APPROVED`、页码或网格代码。

### 3.2 公共剧场

默认设置：

- 小红书 3:4。
- 思源黑体。
- 0px 圆角。
- 黑色、米白、荧光黄和红色。

页面规则：

- 四页都有左侧竖栏。
- 封面使用黑底大标题，红线从左下方斜切进入。
- 正文页为米白底，标题和正文降低字号，保留淡灰大页码。
- 引用页为荧光黄底，只放一段引用和短注释。
- 列表页回到黑底，数字使用荧光黄；红线与前两页处于同一高度。

红线由模板装饰层绘制。它不能遮住正文，也不能参与分页高度计算。

### 3.3 议题封面

默认设置：

- 小红书 3:4。
- 思源宋体。
- 0px 圆角。
- 米白、粉色、蓝色和橙色。

页面规则：

- 封面以图片为底，显示大号期数和橙色栏目签。
- 正文页在顶部显示图片条，正文下方保留蓝色结论线。
- 引用页为粉色底，使用不规则圆线、页码和选择条。
- 收尾页为蓝底，右侧使用圆形图片裁切，底部保留橙色期号签。
- 橙色页签在第二至第四页逐页下移。

示例图片使用项目内的 WebP 文件。图片加载失败时仍显示模板底色，文字保持可读。

## 4. 模板注册

Markdown 和自由画布不再共用同一组系列 ID。

```ts
type MarkdownTemplateSeriesId =
  | 'editorial-archive'
  | 'public-theatre'
  | 'issue-cover'

type FreeformTemplateSeriesId =
  | 'editorial'
  | 'checklist'
  | 'signal'
  | 'night-flight'

type TemplateSeriesId = MarkdownTemplateSeriesId | FreeformTemplateSeriesId
```

注册表分别维护：

- `markdownSeriesIds`：三项。
- `freeformSeriesIds`：四项。
- `markdownDocuments`：只接受 `MarkdownTemplateSeriesId`。
- `freeformFactories`：只接受 `FreeformTemplateSeriesId`。

模板 ID 仍使用 `${series}-${workspace}`。两类模板继续由 `templatesForWorkspace()` 查询，调用方不需要知道注册表内部拆分方式。

每套新模板的 Markdown 源码包含四个手动分页段。示例正文采用 v15 中已经确认的文字，不使用宣传句或占位拉丁文。

## 5. 主题与旧草稿

新增三个主题 ID：

```text
template-editorial-archive
template-public-theatre
template-issue-cover
```

`CardConfig` 增加 `themeId`，`buildConfig()` 原样写入当前主题 ID。普通主题仍走现有卡片样式；只有上述三个 ID 会启用模板布局。

旧模板主题可能已经写进本地或远端草稿，不能直接删除。原来的四个主题继续保留解析能力，但从主题下拉框隐藏：

```ts
interface Theme {
  id: string
  label: string
  background: string
  color: string
  accent: string
  hidden?: boolean
}
```

- `buildConfig()` 和草稿加载仍能找到隐藏主题。
- 主题下拉框通常只列出 `hidden !== true` 的主题。
- 当前草稿正在使用隐藏主题时，下拉框额外保留这一项并显示旧主题名称；用户切换走以后，该旧主题不再出现在可选列表中。这样旧草稿不会出现空白选中值。
- 加载旧草稿时保持旧颜色和通用卡片布局。
- 未知主题仍使用现有默认主题回退，不抛异常。

这次不增加草稿字段，也不需要数据迁移。

主题选项由纯函数生成。传入未知或空的当前主题 ID 时只返回非隐藏主题；返回值不修改 `THEMES` 原数组。

打开草稿时先归一化主题 ID：已知主题原样保留，未知、空字符串或非字符串值统一改为默认主题 ID。工作区不能继续依赖 `THEMES.find(...)!`。这一回退在 LocalStore、RemoteStore 读出的草稿上保持一致。

## 6. 页面角色

`Block` 先增加稳定的块类型，解析器在生成块时写入：

```ts
type MarkdownBlockKind =
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'list'
  | 'code'
  | 'image'
  | 'other'

interface Block {
  html: string
  raw: string
  kind: MarkdownBlockKind
  isBreak?: boolean
}
```

分页判断只读 `kind`，不从 HTML 字符串或中文正文猜测结构。分页标记使用 `other`，并继续由 `isBreak` 区分。

解析规则保持固定：标题为 `heading`，引用为 `blockquote`，有序和无序列表均为 `list`，代码块为 `code`；只含图片的段落为 `image`，图文混排段落仍为 `paragraph`。无法识别的 Marked token 使用 `other`，不能返回空类型。

新增以下页面角色：

```ts
type MarkdownPageRole = 'cover' | 'article' | 'quote' | 'list' | 'close'
```

分页开始前先找到最后一个非分页标记块。每次测量候选页面时，角色按固定顺序判断：

1. 当前主题不是三套新模板之一时，使用 `article`。
2. 空页面使用 `article`。
3. 候选页面既是第一页又包含最后一个内容块时，使用 `article`。这覆盖只有一页的文档。
4. 第一页使用 `cover`。
5. 含 `blockquote` 块的页面使用 `quote`。
6. 含 `list` 块的页面使用 `list`。
7. 候选页面包含最后一个内容块时，使用 `close`。
8. 其他页面使用 `article`。

列表和引用的优先级高于末页判断，因此“公共剧场”的第四页仍为列表页。判断函数只读取块类型、当前页序号和“是否包含最后一个内容块”，不读取中文内容，也不依赖尚未得到的总页数。

超出四页时继续使用这套规则：中间新增页为正文、引用或列表，最后一页为收尾。模板不能依赖写死的 `01/04`。

## 7. 分页与渲染

### 7.1 分页结果

`Page` 增加 `role`：

```ts
interface Page {
  blocks: Block[]
  role: MarkdownPageRole
}
```

分页测量探针需要带上当前 `themeId` 和候选页面角色。探针与真实 `.card-content` 使用相同的 class、data 属性和 CSS 变量。每次向候选页加入块后都重新计算角色并测量；如果加入末块使角色从正文变成收尾，也必须按收尾样式测量。`flush()` 保存最后一次测量得到的角色，渲染阶段不再重新猜测。

手动分页仍然只负责断页，不向最终 HTML 输出标记。单个块高于可用区域时沿用现有契约：独占一页，不尝试切开任意 HTML。

### 7.2 卡片结构

`Card` 增加：

```ts
interface CardProps {
  pageIndex: number
  pageCount: number
  pageRole: MarkdownPageRole
  // 现有属性保持不变
}
```

卡片根节点写入：

```text
data-card-theme
data-page-role
data-page-index
data-page-count
```

`.card-content` 同样写入 `data-card-theme` 和 `data-page-role`。正文排版 CSS 直接匹配内容节点，分页探针可以复用同一选择器；只存在于卡片根节点上的装饰选择器不得参与分页测量。

模板网格、页码、竖栏、印章和页签由一个 `MarkdownCardChrome` 组件渲染。该组件：

- 只接收主题 ID、页面角色、页序号和总页数。
- 输出 `aria-hidden="true"` 的装饰节点。
- 不读取或修改 Markdown HTML。
- 节点位于导出的 `.card` 内，因此预览与 PNG 一致。
- 对普通主题和旧模板主题返回 `null`。

页码根据 `pageIndex + 1` 和 `pageCount` 生成并补零。

### 7.3 社交平台页头

三套模板默认使用小红书尺寸，没有社交页头。用户切换微博或推特时仍需正常显示：

- 卡片根节点标记当前是否显示页头。
- 装饰层的顶部定位使用页头高度变量，不覆盖头像和昵称。
- 分页继续扣除 `HEADER_HEIGHT`。
- `headerFirstPageOnly` 开启后，后续页面按无页头高度测量和渲染。

“议题封面”在微博和推特下不沿用通用的 40px 社交页头外观，而是把同一份资料排成刊物署名：

- 头像和账号资料固定在左上角；头像为 22px，资料区最多占 150px，昵称、账号、时间和地点过长时保持单行省略。
- 封面右上角显示 `ISSUE`，其余三页右上角显示 `DING / ISSUE 07`；账号与期号之间不得相撞。
- 账号和期号下方共用一条横向刊头线，不增加底板、遮罩或渐变，不切断满版照片。
- 封面、正文页和引语页使用深色刊头；蓝色收尾页使用米白色刊头。微博昵称不再强制使用平台橙色，认证标识仍保留平台样式。
- 刊头可见高度为 24px，下方留白为 30px，总占位仍为 54px。分页继续使用现有 `HEADER_HEIGHT` 契约，不增加平台或草稿字段。
- 未显示社交页头时保持原模板构图；`headerFirstPageOnly` 开启后，后续页面恢复无页头的装饰位置。

## 8. CSS 边界

模板样式统一放在 `src/styles.css` 的 Markdown 卡片区域，并以 `data-card-theme` 限定作用域。

- 不覆盖应用外壳、自由画布或模板中心布局。
- 正文使用用户当前选择的 `--card-font`。
- 小号英文编号使用项目已有的 `Instrument Sans`。
- 不新增运行时字体请求。
- 圆角继续读取 `--card-radius`，用户拖动圆角后立即生效。
- 装饰层使用 `pointer-events: none`，不能挡住图片缩放手柄和右键菜单。
- 所有装饰都在卡片边界内，导出时不依赖 `overflow: visible`。

模板内容区不能靠固定高度裁字。桌面预览、模板中心缩略图和导出节点都使用同一套 CSS。

## 9. 图片资源

新增一张项目自有的建筑图片：

```text
public/templates/editorial-building.webp
```

要求：

- WebP。
- 长边不超过 1600px。
- 文件不超过 180KB。
- 不需要运行时网络请求。
- 同一资源可被两套模板复用，不能为了不同裁切重复存图。
- `alt` 使用具体中文描述。

该图片进入前端构建产物。`docs/assets/markdown-template-redesign-v15.png` 只用于规格说明，不进入 Vite 的 `dist`。

## 10. 回退行为

- 模板图片缺失：显示底色和文字，不显示破图图标。
- 页面为空：使用普通正文页，不显示封面或收尾装饰。
- 文档只有一页：使用正文页，避免封面和收尾规则冲突。
- 页面多于四页：页码按实际数量生成，中间页按内容分类。
- 主题切换为普通主题：立即移除模板装饰和页面角色样式，正文不变。
- 再切回模板主题：根据现有页面重新分类，不依赖模板初始正文。
- 旧草稿主题：继续使用旧颜色和通用排版。
- 未识别的主题或角色：回到现有通用卡片样式。

卡片内容区统一监听图片加载错误。失败图片所在的 `.img-wrap` 增加 `image-load-error`，隐藏失败的 `<img>` 和缩放手柄；三套模板用 CSS 底色补位。普通主题沿用同一隐藏破图行为，不弹出新的全局错误提示。

## 11. 测试

### 11.1 单元测试

- Markdown 注册表为三套，自由画布仍为四套；所有模板 ID 唯一。
- 三套 Markdown 模板各生成四页，profile 对象互不共享。
- 新主题、默认平台和字体均能在注册表中找到。
- 页面角色覆盖空页面、单页、封面、正文、引用、列表、收尾和五页以上文档。
- 未知主题固定返回普通正文角色。
- `buildConfig()` 保留主题 ID；无效参数的现有回退不变。
- 隐藏主题可以加载，但不会进入主题下拉选项。
- 旧草稿正在使用隐藏主题时，下拉框仍显示当前旧主题；切换后旧主题消失。
- 页码格式覆盖 1、4、10 页。

### 11.2 端到端测试

- Markdown 模板中心显示三套新模板；自由画布仍显示四套。
- 三个缩略图都使用真实卡片渲染，并能看到各自的模板装饰。
- 分别应用三套模板，编辑区显示四页，主题和字体与定义一致。
- 逐页检查 `data-page-role`、页码和关键装饰。
- 每一页的 `scrollWidth/clientWidth` 与 `scrollHeight/clientHeight` 差值不超过 1px。
- 在 390×844、1024×768、1440×900 下检查模板中心和编辑预览。
- 切换小红书、微博和推特，分别测试所有页显示页头和仅首页显示页头。
- 把标题改成长标题、删除图片、增加正文、增加第五页后不裁字、不遮挡页头。
- 切换到普通主题后模板装饰消失；切回后恢复。
- 单页和空文档使用正文回退。
- PNG 导出包含网格、页码和装饰，不访问外部图片地址。

### 11.3 回归

运行：

- `npm run test:unit`
- `npm run build`
- `npm run test:e2e`
- `node --test scripts/release-readiness.test.mjs`

重点检查分页、图片宽度拖动、单页导出、ZIP 导出、草稿保存和模板确认对话框。

## 12. 文档与版本

这是 Markdown 模板的新功能，前端版本从 `0.12.0` 升到 `0.13.0`。服务端仍为 `0.3.0`。

版本同步位置：

- `package.json`
- `package-lock.json` 顶层和根包
- `README.md` 版本徽章
- `CHANGELOG.md`
- `docs/backend-plan.md` 当前源码版本
- `scripts/release-readiness.test.mjs` 的版本断言和更新日志章节

README 的模板说明改为三套新 Markdown 模板和四套自由画布模板。部署文档和 Docker Compose 继续指向当前已发布镜像，不提前写入 `0.13.0` 镜像标签。

实现验收后重新截取 `docs/assets/markdown-workspace.png`，画面使用其中一套新模板，并保持 README 现有图片尺寸和双图开头布局。

## 13. 验收标准

打开 Markdown 模板中心时可以看到“编辑档案”“公共剧场”“议题封面”。选择任意一套后，四页卡片与视觉基准中的颜色、字体层级、页码和装饰一致；修改正文后仍可自动分页，长内容不被装饰遮挡。模板中心、编辑预览和导出图片保持一致，普通主题、旧草稿和自由画布行为不变。
