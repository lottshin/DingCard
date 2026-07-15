# Freeform Fit-Relative Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 100% in the freeform editor mean “fit the current page completely inside the stage,” while preserving accurate editing coordinates, scroll access above 100%, and original-pixel exports.

**Architecture:** Add a focused pure module for fit/zoom math, then let `FreeformWorkspace` own DOM measurement through a stage ref, `useLayoutEffect`, and `ResizeObserver`. Keep `zoomPercent` (user-facing), `fitScale` (viewport-derived), and `renderScale` (actual CSS/coordinate scale) separate; all canvas layout and pointer math consume only `renderScale`.

**Tech Stack:** React 18, TypeScript, CSS, Vitest, Playwright with system Chrome, `html-to-image`

**Design spec:** `docs/superpowers/specs/2026-07-15-freeform-fit-zoom-design.md`

---

## File map and responsibility boundaries

- Create `src/freeform/viewportScale.ts`: pure constants and functions for fit scale, render scale, and zoom clamping. No DOM or React dependencies.
- Create `src/freeform/__tests__/viewportScale.test.ts`: exhaustive unit contracts for valid/invalid math and 10%–400% bounds.
- Modify `src/freeform/FreeformWorkspace.tsx`: measure the stage content box, own lifecycle/state, render only after a valid scale, and route layout/pointer/export readiness through `renderScale`.
- Modify `src/styles.css`: use overflow-safe centering so a page is centered while it fits and top/left aligned in an overflowing direction.
- Modify `e2e/freeform.spec.ts`: remove fixed-50% assumptions and prove viewport fitting, zoom controls, scroll reachability, lifecycle, coordinate accuracy, and export isolation.
- Modify `package.json` and `package-lock.json`: minor bump from 0.7.0 to 0.8.0 after implementation and review.

Do not modify Markdown workspace zoom behavior, freeform document types, draft serialization, or export dimensions.

### Task 1: Add pure viewport-scale contracts

**Files:**
- Create: `src/freeform/viewportScale.ts`
- Create: `src/freeform/__tests__/viewportScale.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `src/freeform/__tests__/viewportScale.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ZOOM_PERCENT,
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  ZOOM_STEP,
  calculateFitScale,
  calculateRenderScale,
  clampZoomPercent,
} from '../viewportScale'

describe('viewport scale', () => {
  it('fits portrait, landscape, and square pages by the limiting axis', () => {
    expect(calculateFitScale(976, 682, 1080, 1920)).toBeCloseTo(682 / 1920)
    expect(calculateFitScale(616, 566, 1920, 1080)).toBeCloseTo(616 / 1920)
    expect(calculateFitScale(976, 682, 1080, 1080)).toBeCloseTo(682 / 1080)
  })

  it('supports both smallest and largest legal custom pages without a fit floor', () => {
    expect(calculateFitScale(976, 682, 128, 128)).toBeCloseTo(682 / 128)
    expect(calculateFitScale(976, 682, 4096, 4096)).toBeCloseTo(682 / 4096)
    expect(calculateFitScale(976, 682, 4096, 4096)).toBeLessThan(0.2)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'returns null for an invalid dimension %s',
    (invalid) => {
      expect(calculateFitScale(invalid, 682, 1080, 1920)).toBeNull()
      expect(calculateFitScale(976, invalid, 1080, 1920)).toBeNull()
      expect(calculateFitScale(976, 682, invalid, 1920)).toBeNull()
      expect(calculateFitScale(976, 682, 1080, invalid)).toBeNull()
    },
  )

  it('combines fit scale with the user-facing percentage', () => {
    expect(calculateRenderScale(0.4, 50)).toBeCloseTo(0.2)
    expect(calculateRenderScale(0.4, 100)).toBeCloseTo(0.4)
    expect(calculateRenderScale(0.4, 150)).toBeCloseTo(0.6)
    expect(calculateRenderScale(null, 100)).toBeNull()
    expect(calculateRenderScale(0.4, Number.NaN)).toBeNull()
  })

  it('exposes and enforces the approved zoom bounds', () => {
    expect({ DEFAULT_ZOOM_PERCENT, MIN_ZOOM_PERCENT, MAX_ZOOM_PERCENT, ZOOM_STEP }).toEqual({
      DEFAULT_ZOOM_PERCENT: 100,
      MIN_ZOOM_PERCENT: 10,
      MAX_ZOOM_PERCENT: 400,
      ZOOM_STEP: 10,
    })
    expect(clampZoomPercent(-10)).toBe(10)
    expect(clampZoomPercent(105)).toBe(105)
    expect(clampZoomPercent(500)).toBe(400)
    expect(clampZoomPercent(Number.NaN)).toBe(100)
  })
})
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/viewportScale.test.ts
```

Expected: FAIL because `../viewportScale` does not exist.

- [ ] **Step 3: Implement the minimal pure module**

Create `src/freeform/viewportScale.ts`:

```ts
export const DEFAULT_ZOOM_PERCENT = 100
export const MIN_ZOOM_PERCENT = 10
export const MAX_ZOOM_PERCENT = 400
export const ZOOM_STEP = 10

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

export function calculateFitScale(
  stageContentWidth: number,
  stageContentHeight: number,
  slideWidth: number,
  slideHeight: number,
): number | null {
  if (![stageContentWidth, stageContentHeight, slideWidth, slideHeight].every(isPositiveFinite)) {
    return null
  }
  return Math.min(stageContentWidth / slideWidth, stageContentHeight / slideHeight)
}

export function calculateRenderScale(
  fitScale: number | null,
  zoomPercent: number,
): number | null {
  if (fitScale === null || !isPositiveFinite(fitScale) || !isPositiveFinite(zoomPercent)) {
    return null
  }
  return fitScale * (zoomPercent / 100)
}

export function clampZoomPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ZOOM_PERCENT
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, value))
}
```

- [ ] **Step 4: Run focused and full unit tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/viewportScale.test.ts
npm run test:unit
```

Expected: new tests PASS; existing unit suite remains green.

- [ ] **Step 5: Commit the pure contract**

```powershell
git add src/freeform/viewportScale.ts src/freeform/__tests__/viewportScale.test.ts
git commit -m "feat: add fit-relative zoom math"
```

### Task 2: Make existing pointer E2E tests scale-independent

**Files:**
- Modify: `e2e/freeform.spec.ts:80-230`
- Modify: `e2e/freeform.spec.ts:2010-2140`
- Modify: `e2e/freeform.spec.ts:2209-2255`

This is a green refactor before changing the default scale. It must preserve current behavior while removing both explicit and implicit 50% assumptions.

- [ ] **Step 1: Add one shared runtime scale helper**

Near the existing E2E helpers, add:

```ts
async function freeformCanvasScale(page: import('@playwright/test').Page) {
  return page.getByTestId('freeform-canvas').evaluate((canvas) => {
    const element = canvas as HTMLElement
    const logicalWidth = Number.parseFloat(element.style.width)
    const renderedWidth = element.getBoundingClientRect().width
    if (!Number.isFinite(logicalWidth) || logicalWidth <= 0 || renderedWidth <= 0) {
      throw new Error('freeform canvas scale is not measurable')
    }
    return renderedWidth / logicalWidth
  })
}
```

- [ ] **Step 2: Replace every pointer-distance assumption**

Use the helper in all pointer tests that currently assume 0.5, including implicit screen deltas:

```ts
const scale = await freeformCanvasScale(page)

// A 100×40 logical move, replacing +50/+20 screen pixels.
await page.mouse.move(start.x + 100 * scale, start.y + 40 * scale)

// Move within the existing six-document-pixel snapping threshold.
await page.mouse.move(start.x + (390 - 5) * scale, start.y)
await page.mouse.move(start.x + (600 - 5) * scale, start.y)
await page.mouse.move(start.x + (280 - 5) * scale, start.y)

// Marquee points remain expressed in document coordinates.
const marqueeStart = { x: box!.x + 70 * scale, y: box!.y + 70 * scale }
const marqueeEnd = { x: box!.x + 500 * scale, y: box!.y + 290 * scale }
```

Update these tests as one set:

- `drags selected elements together`
- all four pointer snapping/cancel tests
- `keyboard shortcuts work after marquee from an inspector input`
- `marquee selects elements by dragging empty canvas`

Then run `rg -n "const scale = 0\.5|start\.x \+ (50|137|192|297)" e2e/freeform.spec.ts` and expect no zoom-dependent matches.

- [ ] **Step 3: Run the affected E2E tests before changing production behavior**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "drags selected|snapping|marquee"
```

Expected: PASS against the old fixed-50% implementation.

- [ ] **Step 4: Commit the protective refactor**

```powershell
git add e2e/freeform.spec.ts
git commit -m "test: make freeform pointer tests zoom-aware"
```

### Task 3: Fit the freeform canvas to the measured stage

**Files:**
- Modify: `src/freeform/FreeformWorkspace.tsx:1-230`
- Modify: `src/freeform/FreeformWorkspace.tsx:590-740`
- Modify: `src/freeform/FreeformWorkspace.tsx:760-1065`
- Modify: `src/styles.css:1004-1016`
- Test: `e2e/freeform.spec.ts:200-260`
- Test: `e2e/freeform.spec.ts:650-900`
- Test: `e2e/freeform.spec.ts:1598-1785`

- [ ] **Step 1: Add failing lifecycle and fit E2E tests**

Add helpers that read, rather than assume, stage geometry:

```ts
async function freeformStageMetrics(page: import('@playwright/test').Page) {
  return page.locator('.freeform-stage-scroll').evaluate((stage) => {
    const canvas = stage.querySelector<HTMLElement>('[data-testid="freeform-canvas"]')
    if (!canvas) throw new Error('freeform canvas is not ready')
    const stageRect = stage.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    const style = getComputedStyle(stage)
    const px = (value: string) => Number.parseFloat(value) || 0
    const contentWidth = stageRect.width - px(style.borderLeftWidth) - px(style.borderRightWidth)
      - px(style.paddingLeft) - px(style.paddingRight)
    const contentHeight = stageRect.height - px(style.borderTopWidth) - px(style.borderBottomWidth)
      - px(style.paddingTop) - px(style.paddingBottom)
    const logicalWidth = Number.parseFloat(canvas.style.width)
    const logicalHeight = Number.parseFloat(canvas.style.height)
    return {
      contentWidth,
      contentHeight,
      logicalWidth,
      logicalHeight,
      renderedWidth: canvasRect.width,
      renderedHeight: canvasRect.height,
      paddingLeft: px(style.paddingLeft),
      overflowX: stage.scrollWidth - stage.clientWidth,
      overflowY: stage.scrollHeight - stage.clientHeight,
    }
  })
}
```

Add tests that fail on the old implementation:

```ts
test('freeform canvas is withheld until its first active fit measurement', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('freeform-canvas')).toHaveCount(0)
  await page.getByTestId('workspace-tab-freeform').click()
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()
  await expect(page.locator('.freeform-stage-scroll')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByTestId('freeform-primary-export')).toBeEnabled()
})
```

For both 1440×900 and 1024×768, open freeform, choose 9:16, then assert:

```ts
await expect(page.locator('.zoom-value')).toHaveText('100%')
const metrics = await freeformStageMetrics(page)
const expectedScale = Math.min(
  metrics.contentWidth / metrics.logicalWidth,
  metrics.contentHeight / metrics.logicalHeight,
)
expect(metrics.renderedWidth / metrics.logicalWidth).toBeCloseTo(expectedScale, 3)
expect(metrics.overflowX).toBeLessThanOrEqual(1)
expect(metrics.overflowY).toBeLessThanOrEqual(1)
```

Add the public control helper before any production change:

```ts
async function setFreeformZoom(page: import('@playwright/test').Page, target: number) {
  const value = page.locator('.zoom-value')
  const current = Number.parseInt((await value.textContent()) ?? '', 10)
  if (!Number.isFinite(current) || target % 10 !== 0) throw new Error('invalid zoom target')
  const direction = target > current ? 10 : -10
  const button = page.getByRole('button', {
    name: direction > 0 ? '放大画布' : '缩小画布',
  })
  for (let zoom = current; zoom !== target; zoom += direction) await button.click()
  await expect(value).toHaveText(`${target}%`)
}
```

In the same RED phase, add tests for every behavior that Task 3 will enable:

1. 50% is smaller than 100% and has no stage overflow.
2. 9:16 at 110% has reachable top and bottom edges.
3. 16:9 at 110% has reachable left and right edges.
4. Setting 150%, resizing the viewport, changing the page preset, switching to Markdown, and returning preserves `150%` while recomputing actual scale.
5. 10% disables minus and cannot go lower; 400% disables plus and cannot go higher; clicking the middle value resets to 100%.
6. 1:1, 9:16, 16:9, 128×128, and 4096×4096 fit at 100% in both 1440×900 and 1024×768 where applicable.
7. `freeformStageMetrics` reports computed 32px wide padding and 24px compact padding, and the fit formula uses those measured values.
8. At 150%, dragging a selected shape by `120 * scale` and `80 * scale`, then resizing via `.element-resize` by `60 * scale` and `40 * scale`, changes logical x/y/width/height by exactly 120/80/60/40.

For scroll reachability, set `scrollTop/scrollLeft` to 0 and then to `scrollHeight/scrollWidth`; compare canvas/stage rectangles with a 1px tolerance. Do not merely assert that a scrollbar exists.

- [ ] **Step 2: Run the focused E2E tests and verify RED**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "first active fit|fits 9:16|50%|110%|zoom bounds|preserves 150%|custom page fits|dynamic coordinate"
```

Expected: FAIL because the inactive canvas exists, the label is 50%, 9:16 overflows, zoom stops at 120%, and overflowing grid centering does not satisfy edge reachability.

- [ ] **Step 3: Replace `previewScale` with the three-state model**

In `FreeformWorkspace.tsx`:

```ts
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_ZOOM_PERCENT,
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  ZOOM_STEP,
  calculateFitScale,
  calculateRenderScale,
  clampZoomPercent,
} from './viewportScale'

const FIT_SCALE_EPSILON = 0.0001

function cssPixels(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}
```

Replace the old state and add the stage ref:

```ts
const [zoomPercent, setZoomPercent] = useState(DEFAULT_ZOOM_PERCENT)
const [fitScale, setFitScale] = useState<number | null>(null)
const renderScale = calculateRenderScale(fitScale, zoomPercent)

const stageScrollRef = useRef<HTMLDivElement>(null)
const artboardRef = useRef<HTMLDivElement>(null)
```

Add one shared measurement callback and one lifecycle effect:

```ts
const measureFitScale = useCallback(() => {
  const stage = stageScrollRef.current
  if (!stage) return
  const rect = stage.getBoundingClientRect()
  const style = getComputedStyle(stage)
  const contentWidth = rect.width
    - cssPixels(style.borderLeftWidth)
    - cssPixels(style.borderRightWidth)
    - cssPixels(style.paddingLeft)
    - cssPixels(style.paddingRight)
  const contentHeight = rect.height
    - cssPixels(style.borderTopWidth)
    - cssPixels(style.borderBottomWidth)
    - cssPixels(style.paddingTop)
    - cssPixels(style.paddingBottom)
  const next = calculateFitScale(
    contentWidth,
    contentHeight,
    activeSlide.width,
    activeSlide.height,
  )
  if (next === null) return
  setFitScale((current) =>
    current !== null && Math.abs(current - next) < FIT_SCALE_EPSILON ? current : next,
  )
}, [activeSlide.height, activeSlide.width])

useLayoutEffect(() => {
  if (!isActive) return
  measureFitScale()
  const stage = stageScrollRef.current
  if (!stage) return
  const observer = new ResizeObserver(measureFitScale)
  observer.observe(stage)
  return () => observer.disconnect()
}, [isActive, measureFitScale])
```

Do not introduce a partial `window.resize` fallback. Supported desktop Chrome provides `ResizeObserver`.

- [ ] **Step 4: Route controls, layout, pointer math, and readiness through the new state**

Update controls:

```tsx
<button
  className="zoom-btn"
  type="button"
  aria-label="缩小画布"
  title="缩小画布"
  disabled={zoomPercent <= MIN_ZOOM_PERCENT}
  onClick={() => setZoomPercent((value) => clampZoomPercent(value - ZOOM_STEP))}
>
  ...
</button>
<button
  className="zoom-value"
  type="button"
  title="适应画布（恢复 100%）"
  onClick={() => setZoomPercent(DEFAULT_ZOOM_PERCENT)}
>
  {zoomPercent}%
</button>
<button
  className="zoom-btn"
  type="button"
  aria-label="放大画布"
  title="放大画布"
  disabled={zoomPercent >= MAX_ZOOM_PERCENT}
  onClick={() => setZoomPercent((value) => clampZoomPercent(value + ZOOM_STEP))}
>
  ...
</button>
```

Attach the ref/readiness state and render the canvas only with a valid scale:

```tsx
<div
  ref={stageScrollRef}
  className="freeform-stage-scroll"
  aria-busy={renderScale === null}
>
  {renderScale !== null && (
    <div
      className="freeform-stage-box"
      style={{
        width: activeSlide.width * renderScale,
        height: activeSlide.height * renderScale,
      }}
    >
      <div
        ref={artboardRef}
        className="freeform-artboard"
        data-testid="freeform-canvas"
        style={{
          width: activeSlide.width,
          height: activeSlide.height,
          transform: `scale(${renderScale})`,
          background: slideBackgroundToCss(activeSlide.background),
        }}
      >
        ...
      </div>
    </div>
  )}
</div>
```

Disable both export buttons while `renderScale === null`, and guard `exportCurrentSlide`, `requestExportAllSlides`, and `continueMixedSizeExport` against an unready artboard.

For each pointer entry point, guard and snapshot the actual scale before registering window listeners:

```ts
if (renderScale === null) return
const interactionScale = renderScale
```

Use `interactionScale` for drag and resize deltas. `artboardPointFromClient` returns `null` when `renderScale` is null and otherwise divides by `renderScale`. After the edit, run:

```powershell
rg -n "previewScale" src/freeform/FreeformWorkspace.tsx
```

Expected: no matches. Do not change `src/workspaces/markdown/MarkdownWorkspace.tsx`.

- [ ] **Step 5: Implement overflow-safe centering before enabling the new range**

Update the scoped CSS in the same GREEN phase:

```css
.freeform-stage-pane .freeform-stage-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 32px;
  background: var(--freeform-stage-sink);
}

.freeform-stage-pane .freeform-stage-box {
  flex: 0 0 auto;
  margin: auto;
  box-shadow: 0 12px 30px rgba(24, 24, 27, 0.14), 0 2px 8px rgba(24, 24, 27, 0.08);
}
```

Auto margins center the page while free space is positive and resolve to zero in an overflowing axis, keeping top/left reachable. Preserve the existing 24px compact media rule.

- [ ] **Step 6: Run focused tests, build, and the protected pointer group**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/viewportScale.test.ts
npm run test:e2e -- e2e/freeform.spec.ts --grep "first active fit|fits 9:16|50%|110%|zoom bounds|preserves 150%|custom page fits|dynamic coordinate|freeform chrome fits|drags selected|snapping|marquee"
npm run build
```

Expected: all PASS at 1440×900 and 1024×768, document-level overflow remains zero, every enlarged edge is reachable, and TypeScript reports no nullable-scale errors.

- [ ] **Step 7: Commit the fit engine**

```powershell
git add src/freeform/FreeformWorkspace.tsx src/styles.css e2e/freeform.spec.ts
git commit -m "feat: add fit-relative freeform zoom"
```

### Task 4: Prove exports ignore preview zoom

**Files:**
- Modify: `e2e/freeform.spec.ts:1821-1865`

- [ ] **Step 1: Strengthen the existing two-export isolation test without adding extra exports**

Reuse `exports identical artwork pixels in light and dark app themes`, which already exports the same populated document twice:

```ts
await setFreeformZoom(page, 50)
const lightPath = await downloadCurrent()

await page.getByTestId('theme-toggle').click()
await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
await setFreeformZoom(page, 400)
const darkPath = await downloadCurrent()
```

Keep the existing full RGBA digest comparison, sample comparisons, and size equality. Rename the test to state both contracts, for example `exports identical artwork pixels across app themes and preview zooms`.

- [ ] **Step 2: Run export and mixed-size regressions**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "preview zooms|exports current 9:16|mixed-size slides"
```

Expected: PASS; 50% and 400% exports have identical original-size pixels, and mixed slide sizes remain correct.

- [ ] **Step 3: Commit the export contract test**

```powershell
git add e2e/freeform.spec.ts
git commit -m "test: protect zoom-independent freeform exports"
```

### Task 5: Review, version, and run full verification

**Files:**
- Modify if review finds issues: files above only
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Run the AGENTS.md change checklist before review**

Verify each item explicitly:

```powershell
rg -n "previewScale" src/freeform src/workspaces/markdown
rg -n "fitScale|zoomPercent|renderScale" src/freeform e2e
rg -n "0\.7\.0|0\.8\.0" package.json package-lock.json docs
git diff --check
git status --short
```

Expected:

- No `previewScale` remains in `src/freeform`; Markdown references remain unchanged.
- New names are consistent and limited to the freeform viewport concern.
- No new API, CLI, persisted field, error code, or draft version exists.
- Only expected files are modified and no whitespace errors exist.

- [ ] **Step 2: Request code review**

Use `@superpowers:requesting-code-review`. Ask the reviewer to inspect:

- invalid/0×0 measurement fallback and first activation;
- observer cleanup and update-loop resistance;
- 100% no-overflow math with computed padding;
- top/left reachability above 100%;
- every pointer path using actual `renderScale`;
- export dimensions/pixels independent of zoom;
- Markdown workspace isolation.

Address verified findings with focused tests and a separate fix commit. Re-run the affected tests after every fix.

- [ ] **Step 3: Run pre-version verification**

Run:

```powershell
npm run test:unit
npm run build
npm run test:e2e
```

Expected: all unit tests, TypeScript/Vite build, and the complete Playwright suite PASS.

- [ ] **Step 4: Bump the minor version without creating a tag**

Run:

```powershell
npm version 0.8.0 --no-git-tag-version
rg -n '"version": "0\.(7\.0|8\.0)"' package.json package-lock.json
```

Expected: exactly the three application-version positions show 0.8.0 (`package.json`, lockfile top level, lockfile root package), with no application-level 0.7.0 remaining. Dependency versions are not application versions.

- [ ] **Step 5: Run post-version verification from a clean dependency state**

Run:

```powershell
npm run test:unit
npm run build
npm run test:e2e
git diff --check
git status --short
```

Expected: all checks PASS; status contains only `package.json` and `package-lock.json` before the version commit.

- [ ] **Step 6: Commit the version bump**

```powershell
git add package.json package-lock.json
git commit -m "chore: bump version for fit-relative zoom"
```

- [ ] **Step 7: Perform final completion verification**

Use `@superpowers:verification-before-completion`, then run:

```powershell
git status --short --branch
git log --oneline -8
```

Expected: clean `feature/freeform-editor` worktree with readable commits for math, scale-aware tests, the complete fit/scroll engine, export protection, review fixes if any, and version 0.8.0. Do not merge, push, delete the worktree, or stop the user's existing Chrome.
