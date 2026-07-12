# Freeform Export Pipeline Optimization Design

## Context

自由编辑当前导出路径使用 `html-to-image.toPng()` 对已挂载的 artboard DOM 做截图。这个方案能保持当前画布视觉一致，但有两个成本：

- 单页导出会生成完整 PNG base64 data URL，内存和字符串复制成本高。
- 多页导出逐页截图后再把 base64 写入 zip，等待期间只有“导出中…”反馈。

这次不重写为数据直出 `ExportRenderer`。目标是降低现有路径的内存/等待成本，并把代码边界整理到将来可替换。

## Goals

- 自由编辑单页导出改为 Blob 下载，避免 PNG base64 data URL。
- 自由编辑多页打包直接 zip Blob，避免 base64 转换。
- 多页导出展示页级进度，例如 `正在导出 2/5`。
- 自由编辑导出复用字体嵌入 CSS，避免每页重复扫描/内联字体。
- 保持 Markdown 卡片导出兼容；`downloadZip` 必须继续支持现有 data URL 输入。

## Non-goals

- 不实现数据直出 SVG/canvas renderer。
- 不改变导出文件名和 zip 内文件名。
- 不改变导出像素尺寸和视觉结果。
- 不优化图片压缩质量或改 PNG 为 JPEG/WebP。

## Proposed architecture

新增一个小的导出边界：

- `src/exportZip.ts` 支持 `Blob` 与 data URL 两种输入。
- 自由编辑 `FreeformWorkspace` 内部把 `renderSlideNode()` 改为 `renderSlideBlob()`，使用 `html-to-image.toBlob()`。
- 自由编辑保留 DOM 截图，但把 html-to-image 的 options 和字体缓存集中成清晰函数，后续可替换为数据直出。

## Data flow

### Single slide

```text
FreeformDocument active slide
  -> mounted artboard DOM
  -> html-to-image.toBlob({ pixelRatio: 1, fontEmbedCSS, filter ui-only })
  -> object URL download
```

### Zip export

```text
for each slide:
  select slide
  wait two animation frames
  render Blob
  push { name, blob }
downloadZip(entries)
```

## Export progress

Introduce a small progress state in `FreeformWorkspace`:

```ts
type ExportProgress = {
  current: number
  total: number
  label: string
} | null
```

The current-slide button can show `导出中…`. The all-slides button should show page progress during zip export, for example `导出 2/5`.

## Font embedding

Reuse the existing `buildFontEmbedCSS()` helper. For freeform slides, collect text from all text elements and collect primary font families used by those elements. For this low-risk phase, use a combined text string and the first relevant web font family as the explicit `fontEmbedCSS`.

If font CSS generation fails, fallback should be `undefined` so `html-to-image` can keep its existing behavior.

## Compatibility

`downloadZip()` must accept:

- `string[]` data URLs, preserving Markdown behavior.
- `{ name: string; blob: Blob }[]` entries for freeform.

No public API or CLI exists; no error/status codes are added.

## Testing

- Unit test `downloadZip` behavior for Blob entries and data URL entries.
- E2E test freeform zip export still downloads PNG files with correct names and sizes.
- E2E test freeform multi-page export shows progress text while exporting.
- Existing export tests for current page PNG and mixed-size zip must remain passing.

## Risks

- `toBlob()` can theoretically return `null`; handle it by skipping that page, same as current `toPng()` null handling.
- Progress text can be short-lived in fast exports; tests should create enough pages or observe button text during export carefully.
- Font embedding helper currently targets one family at a time. This phase should not overbuild multi-family embedding; the fallback path preserves correctness.
