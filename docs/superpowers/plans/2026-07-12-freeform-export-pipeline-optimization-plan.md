# Freeform Export Pipeline Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce freeform export wait/memory cost by using Blob-based export and visible multi-page progress while preserving existing Markdown export behavior.

**Architecture:** Keep the current DOM snapshot renderer for this phase, but change the data path from PNG data URLs to PNG Blobs for freeform. Extend `downloadZip` to accept both legacy data URLs and named Blob entries, then update `FreeformWorkspace` to use `toBlob()`, cached font CSS, and progress state.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Playwright, html-to-image, JSZip.

---

## File structure

- Modify: `src/exportZip.ts`
  - Add typed zip entry support for Blob inputs.
  - Preserve current `string[]` data URL behavior for Markdown.
- Create: `src/__tests__/exportZip.test.ts`
  - Unit tests for data URL compatibility and Blob entries.
- Modify: `src/freeform/FreeformWorkspace.tsx`
  - Replace freeform `toPng()` path with `toBlob()`.
  - Add `downloadBlob()` helper.
  - Add freeform font embed helper.
  - Add export progress state and button text.
- Modify: `e2e/freeform.spec.ts`
  - Assert freeform zip export still contains correct PNG files.
  - Assert multi-page export exposes progress text.
- Modify: `package.json`, `package-lock.json`
  - Patch bump after implementation.

## Task 1: Extend zip helper to accept Blob entries

**Files:**
- Modify: `src/exportZip.ts`
- Create: `src/__tests__/exportZip.test.ts`

- [ ] **Step 1: Write failing unit tests**

Create `src/__tests__/exportZip.test.ts`.

Vitest runs in Node, so do not depend on `document` or `HTMLAnchorElement`. Test through an injected downloader:

```ts
import { describe, expect, it, vi } from 'vitest'
import { downloadZip, type ZipDownloader } from '../exportZip'

async function readZipEntries(blob: Blob) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return Object.fromEntries(
    await Promise.all(
      Object.keys(zip.files)
        .filter((name) => !zip.files[name].dir)
        .map(async (name) => [name, await zip.file(name)!.async('string')]),
    ),
  )
}

describe('downloadZip', () => {
  it('keeps data URL inputs compatible with card file names', async () => {
    const downloader = vi.fn<ZipDownloader>()

    await downloadZip(['data:image/png;base64,YQ=='], 'cards.zip', { downloader })

    const [blob, zipName] = downloader.mock.calls[0]
    expect(zipName).toBe('cards.zip')
    await expect(readZipEntries(blob)).resolves.toEqual({ 'card-1.png': 'a' })
  })

  it('preserves custom fileNameForIndex for data URL inputs', async () => {
    const downloader = vi.fn<ZipDownloader>()

    await downloadZip(['data:image/png;base64,YQ=='], 'custom.zip', {
      downloader,
      fileNameForIndex: (index) => `slide-${index + 1}.png`,
    })

    const [blob] = downloader.mock.calls[0]
    await expect(readZipEntries(blob)).resolves.toEqual({ 'slide-1.png': 'a' })
  })

  it('writes named Blob entries without base64 conversion', async () => {
    const downloader = vi.fn<ZipDownloader>()

    await downloadZip([{ name: 'slide-01.png', blob: new Blob(['png-bytes'], { type: 'image/png' }) }], 'slides.zip')

    const [blob, zipName] = downloader.mock.calls[0]
    expect(zipName).toBe('slides.zip')
    await expect(readZipEntries(blob)).resolves.toEqual({ 'slide-01.png': 'png-bytes' })
  })
})
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm run test:unit -- src/__tests__/exportZip.test.ts
```

Expected: FAIL because `downloadZip` does not accept injected downloader or `{ name, blob }[]`.

- [ ] **Step 3: Implement Blob-compatible zip entries**

In `src/exportZip.ts`:

```ts
export type ZipInput =
  | string
  | { name: string; blob: Blob }
```

Change `downloadZip(dataUrls: string[], ...)` to `downloadZip(inputs: ZipInput[], ...)`.

Implementation rules:

- If input is string, preserve existing behavior: derive `card-XX.png` or `fileNameForIndex`, strip data URL prefix, use `{ base64: true }`.
- If input is object, use `zip.file(input.name, input.blob)`.
- Preserve `zipName`, `fileNameForIndex`, object URL download, and revoke delay.

- [ ] **Step 4: Run test and verify GREEN**

Run:

```bash
npm run test:unit -- src/__tests__/exportZip.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/exportZip.ts src/__tests__/exportZip.test.ts
git commit -m "feat: support blob zip entries"
```

## Task 2: Change freeform current-slide export to Blob

**Files:**
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write/adjust E2E expectation**

Keep existing test `exports the current slide as a PNG at slide dimensions`; it must continue passing with Blob export.

Add a lightweight assertion that the button returns from exporting state:

```ts
await expect(page.getByRole('button', { name: '导出当前页' })).toBeEnabled()
```

- [ ] **Step 2: Run targeted E2E before implementation**

Run:

```bash
npx playwright test e2e/freeform.spec.ts --grep "exports the current slide as a PNG" --reporter=line --timeout=30000
```

Expected: PASS before implementation; this is a compatibility guard, not RED.

- [ ] **Step 3: Implement freeform Blob render path**

In `src/freeform/FreeformWorkspace.tsx`:

- Change import `toPng` to `toBlob`.
- Add helper:

```ts
function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
```

- Rename `renderSlideNode(slide)` to `renderSlideBlob(slide, fontEmbedCSS?)`.
- Use `toBlob(node, { pixelRatio: 1, width, height, style, filter, fontEmbedCSS })`.
- In `exportCurrentSlide`, call `downloadBlob(blob, slidePngName(activeIndex))`.
- If `toBlob()` returns `null`, do not call `downloadBlob()` and do not throw.
- Wrap font embed CSS generation in `try/catch`; on error return `undefined`.

- [ ] **Step 4: Run targeted E2E**

Run:

```bash
npx playwright test e2e/freeform.spec.ts --grep "exports the current slide as a PNG" --reporter=line --timeout=30000
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/freeform/FreeformWorkspace.tsx e2e/freeform.spec.ts
git commit -m "feat: export freeform slide as blob"
```

## Task 3: Add freeform zip Blob export and progress

**Files:**
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing E2E progress test**

Add to `e2e/freeform.spec.ts`.

To avoid flake from fast exports, make this test observe deterministic UI state by creating several slides and asserting that the zip button reaches a progress label before the download completes:

```ts
test('shows progress while exporting multiple freeform slides', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '打包导出' }).click()
  await expect(page.getByRole('button', { name: /导出 \d+\/4/ })).toBeVisible()
  await downloadPromise
})
```

If this is still too fast, add a small test-only delay through an internal `waitForExportPaint()` helper that awaits two animation frames; do not use arbitrary sleeps in production.

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npx playwright test e2e/freeform.spec.ts --grep "shows progress while exporting" --reporter=line --timeout=30000
```

Expected: FAIL because no `导出 x/y` progress is shown.

- [ ] **Step 3: Implement progress and Blob zip**

In `FreeformWorkspace.tsx`:

- Add state:

```ts
const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null)
```

- Add helper to gather all freeform text:

```ts
function freeformTextForFonts(slides: FreeformSlide[]): string {
  return slides.flatMap((slide) =>
    slide.elements.filter((element) => element.type === 'text').map((element) => element.text),
  ).join('\n')
}
```

- Import `buildFontEmbedCSS` and use the first text element font found across all freeform slides as the family for this phase; do not depend on current selection.
- In `exportAllSlides()`, build `entries: { name: string; blob: Blob }[]`.
- Before rendering each page, set `exportProgress({ current: index + 1, total: slides.length })`.
- Pass entries to `downloadZip(entries, zipName)`.
- If `renderSlideBlob()` returns `null`, skip that slide without throwing, matching the current data URL behavior.
- Wrap freeform font CSS generation in `try/catch`; failure returns `undefined` and export continues.
- Clear progress in `finally`.
- Button text:

```tsx
{exportProgress ? `导出 ${exportProgress.current}/${exportProgress.total}` : '打包导出'}
```

- [ ] **Step 4: Run targeted E2E**

Run:

```bash
npx playwright test e2e/freeform.spec.ts --grep "shows progress while exporting|exports mixed-size slides as a zip" --reporter=line --timeout=30000
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/freeform/FreeformWorkspace.tsx e2e/freeform.spec.ts
git commit -m "feat: show freeform export progress"
```

## Task 4: Version bump and full verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Patch bump**

Run:

```bash
npm version 0.6.0 --no-git-tag-version
```

- [ ] **Step 2: Full verification**

Run:

```bash
npm run build
npm run test:unit
npx playwright test --reporter=line --timeout=30000
git diff --check
```

Expected:

- Build exit 0, existing Vite chunk warning acceptable.
- Unit tests exit 0.
- E2E exits 0.
- Diff check exits 0.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: bump version for export optimization"
```

## AGENTS checklist

- Function contracts: `downloadZip` accepts both legacy data URLs and Blob entries; `toBlob()` null is skipped safely; font embed failure falls back.
- Naming: grep `ZipInput`, `exportProgress`, `renderSlideBlob`, `downloadBlob`.
- Error/status codes: none added.
- Docs: this spec and plan document the export behavior.
- Version: minor bump to `0.6.0`, because this adds user-visible export progress and extends the export pipeline capability.
- Multi-environment tests: unit plus E2E current slide, zip, progress, and existing export tests.
