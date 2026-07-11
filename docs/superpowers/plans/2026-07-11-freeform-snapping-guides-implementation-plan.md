# Freeform Snapping Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag snapping guides to the freeform editor so dragged elements and multi-selection groups snap to page and element references with visible temporary guides.

**Architecture:** Add a pure `src/freeform/snapping.ts` module for snap math and unit tests. Integrate it only in the existing pointer-drag path in `FreeformWorkspace`, render transient `freeform-ui-only` guide lines inside the artboard, and preserve the current history model where one drag creates one history entry.

**Tech Stack:** React, TypeScript, existing freeform reducer/history model, Vitest, Playwright E2E, DOM rendering with `html-to-image` export filtering.

---

## File Structure

- Create `src/freeform/snapping.ts`
  - Pure snapping calculations.
  - No React, no DOM, no state mutation.
  - Exports `SnapLine`, `SnapResult`, `SnapOptions`, and `snapDrag`.
- Create `src/freeform/__tests__/snapping.test.ts`
  - Unit tests for page snapping, element snapping, multi-select group snapping, threshold behavior, tie-breakers, invalid selection, and boundary clamping.
- Modify `src/freeform/FreeformWorkspace.tsx`
  - Import `snapDrag` and `SnapLine`.
  - Add `snapLines` state.
  - Use `snapDrag` in the existing element/group drag pointer-move path.
  - Clear guides on pointer up.
  - Render guide lines inside the artboard with `freeform-ui-only`.
  - Do not change keyboard nudge, marquee, resize, align/distribute, or inspector edits to use snapping.
- Modify `src/styles.css`
  - Add `freeform-snap-line`, `freeform-snap-line-x`, and `freeform-snap-line-y`.
- Modify `e2e/freeform.spec.ts`
  - Add E2E coverage for page-center snapping, element-edge snapping, guide visibility/lifetime, and multi-select group snapping.
- Modify `package.json` and `package-lock.json`
  - Bump version from `0.3.0` to `0.4.0` after feature implementation.

---

## Task 1: Pure snapping calculations

**Files:**
- Create: `src/freeform/snapping.ts`
- Test: `src/freeform/__tests__/snapping.test.ts`

- [ ] **Step 1: Write failing unit tests**

Create `src/freeform/__tests__/snapping.test.ts` with tests shaped like this:

```ts
import { expect, it } from 'vitest'
import { snapDrag } from '../snapping'
import type { FreeformElement } from '../types'

const rect = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 100,
): FreeformElement => ({
  id,
  type: 'shape',
  shape: 'rect',
  x,
  y,
  width,
  height,
  rotation: 0,
  fill: { type: 'solid', color: '#fff' },
  stroke: '#000',
  strokeWidth: 0,
})

it('snaps a dragged element to the page horizontal center', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100, 100, 100)]

  expect(snapDrag(slide, elements, ['a'], 345, 0)).toEqual({
    dx: 350,
    dy: 0,
    lines: [{ axis: 'x', position: 500, source: 'page' }],
  })
})

it('snaps a dragged element to the page left edge', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 20, 100, 100, 100)]

  expect(snapDrag(slide, elements, ['a'], -15, 0)).toEqual({
    dx: -20,
    dy: 0,
    lines: [{ axis: 'x', position: 0, source: 'page' }],
  })
})

it('snaps a dragged element to another element left edge', () => {
  const slide = { width: 1200, height: 800 }
  const elements = [rect('a', 100, 100), rect('b', 400, 120, 140, 100)]

  expect(snapDrag(slide, elements, ['a'], 294, 0)).toEqual({
    dx: 300,
    dy: 0,
    lines: [{ axis: 'x', position: 400, source: 'element' }],
  })
})

it('snaps vertical movement to another element top edge', () => {
  const slide = { width: 1000, height: 1200 }
  const elements = [rect('a', 100, 100), rect('b', 300, 400, 100, 140)]

  expect(snapDrag(slide, elements, ['a'], 0, 294)).toEqual({
    dx: 0,
    dy: 300,
    lines: [{ axis: 'y', position: 400, source: 'element' }],
  })
})

it('does not snap outside the threshold', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100, 100, 100)]

  expect(snapDrag(slide, elements, ['a'], 342, 0)).toEqual({
    dx: 342,
    dy: 0,
    lines: [],
  })
})

it('snaps a multi-selection group by its bounding box', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100), rect('b', 300, 100)]

  expect(snapDrag(slide, elements, ['a', 'b'], 245, 0)).toEqual({
    dx: 250,
    dy: 0,
    lines: [{ axis: 'x', position: 500, source: 'page' }],
  })
})

it('does not use selected elements as external snap references', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100), rect('b', 300, 100), rect('c', 700, 100)]

  expect(snapDrag(slide, elements, ['a', 'b'], 196, 0)).toEqual({
    dx: 196,
    dy: 0,
    lines: [],
  })
})

it('prefers page references over element references at the same distance', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100), rect('b', 500, 300)]

  expect(snapDrag(slide, elements, ['a'], 345, 0)).toEqual({
    dx: 350,
    dy: 0,
    lines: [{ axis: 'x', position: 500, source: 'page' }],
  })
})

it('uses stable dragged-anchor priority when candidates are tied', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100, 24, 100)]

  expect(snapDrag(slide, elements, ['a'], 394, 0)).toEqual({
    dx: 388,
    dy: 0,
    lines: [{ axis: 'x', position: 500, source: 'page' }],
  })
})

it('keeps snapped movement inside slide bounds', () => {
  const slide = { width: 500, height: 400 }
  const elements = [rect('a', 350, 100, 100, 100), rect('b', 494, 120, 100, 100)]

  expect(snapDrag(slide, elements, ['a'], 49, 0)).toEqual({
    dx: 50,
    dy: 0,
    lines: [{ axis: 'x', position: 500, source: 'page' }],
  })
})

it('returns original movement and no lines for invalid selection', () => {
  const slide = { width: 1000, height: 800 }
  const elements = [rect('a', 100, 100)]

  expect(snapDrag(slide, elements, ['missing'], 20, 30)).toEqual({
    dx: 20,
    dy: 30,
    lines: [],
  })
})
```

- [ ] **Step 2: Run unit test to verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/snapping.test.ts
```

Expected: FAIL because `../snapping` does not exist.

- [ ] **Step 3: Implement minimal `src/freeform/snapping.ts`**

Implement:

```ts
import { moveElementsWithinSlide } from './selection'
import type { FreeformElement, FreeformSlide } from './types'

export interface SnapLine {
  axis: 'x' | 'y'
  position: number
  source: 'page' | 'element'
}

export interface SnapResult {
  dx: number
  dy: number
  lines: SnapLine[]
}

export interface SnapOptions {
  threshold: number
}

const DEFAULT_THRESHOLD = 6
type Axis = SnapLine['axis']
type AnchorName = 'start' | 'center' | 'end'
type SnapSource = SnapLine['source']

interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

interface AxisAnchor {
  name: AnchorName
  position: number
}

interface AxisReference {
  position: number
  source: SnapSource
}

const ANCHOR_PRIORITY: Record<AnchorName, number> = { center: 0, start: 1, end: 2 }
const SOURCE_PRIORITY: Record<SnapSource, number> = { page: 0, element: 1 }

export function snapDrag(
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  elements: FreeformElement[],
  selectedIds: string[],
  dx: number,
  dy: number,
  options: Partial<SnapOptions> = {},
): SnapResult {
  const selectedIdSet = new Set(selectedIds)
  const selectedElements = elements.filter((element) => selectedIdSet.has(element.id))
  const bounds = getGroupBounds(selectedElements)

  if (!bounds) {
    return { dx, dy, lines: [] }
  }

  const threshold = Math.max(0, options.threshold ?? DEFAULT_THRESHOLD)
  const clamped = clampMovement(slide, elements, selectedIds, dx, dy)
  const xSnap = snapAxis('x', slide, elements, selectedIdSet, bounds, clamped.dx, threshold)
  const ySnap = snapAxis('y', slide, elements, selectedIdSet, bounds, clamped.dy, threshold)
  const final = clampMovement(slide, elements, selectedIds, xSnap.delta, ySnap.delta)
  const lines: SnapLine[] = []

  if (xSnap.line && final.dx === xSnap.delta) lines.push(xSnap.line)
  if (ySnap.line && final.dy === ySnap.delta) lines.push(ySnap.line)

  return { dx: final.dx, dy: final.dy, lines }
}

function clampMovement(
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  elements: FreeformElement[],
  selectedIds: string[],
  dx: number,
  dy: number,
) {
  const patches = moveElementsWithinSlide(slide, elements, selectedIds, dx, dy)
  const firstPatch = patches[0]
  if (!firstPatch) return { dx, dy }

  const original = elements.find((element) => element.id === firstPatch.elementId)
  if (!original) return { dx, dy }

  return {
    dx: firstPatch.patch.x - original.x,
    dy: firstPatch.patch.y - original.y,
  }
}

function snapAxis(
  axis: Axis,
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  elements: FreeformElement[],
  selectedIds: Set<string>,
  bounds: Bounds,
  delta: number,
  threshold: number,
): { delta: number; line?: SnapLine } {
  const anchors = getAxisAnchors(bounds, axis).map((anchor) => ({
    ...anchor,
    position: anchor.position + delta,
  }))
  const references = getAxisReferences(axis, slide, elements, selectedIds)
  const candidates = references.flatMap((reference) =>
    anchors
      .map((anchor) => ({
        reference,
        anchor,
        distance: Math.abs(reference.position - anchor.position),
        adjustment: reference.position - anchor.position,
      }))
      .filter((candidate) => candidate.distance <= threshold),
  )

  candidates.sort((a, b) => {
    const distanceDelta = a.distance - b.distance
    if (distanceDelta !== 0) return distanceDelta

    const sourceDelta = SOURCE_PRIORITY[a.reference.source] - SOURCE_PRIORITY[b.reference.source]
    if (sourceDelta !== 0) return sourceDelta

    const anchorDelta = ANCHOR_PRIORITY[a.anchor.name] - ANCHOR_PRIORITY[b.anchor.name]
    if (anchorDelta !== 0) return anchorDelta

    return a.reference.position - b.reference.position
  })

  const best = candidates[0]
  if (!best) return { delta }

  return {
    delta: delta + best.adjustment,
    line: { axis, position: best.reference.position, source: best.reference.source },
  }
}

function getAxisReferences(
  axis: Axis,
  slide: Pick<FreeformSlide, 'width' | 'height'>,
  elements: FreeformElement[],
  selectedIds: Set<string>,
): AxisReference[] {
  const pageSize = axis === 'x' ? slide.width : slide.height
  const pageReferences: AxisReference[] = [0, pageSize / 2, pageSize].map((position) => ({
    position,
    source: 'page',
  }))
  const elementReferences = elements
    .filter((element) => !selectedIds.has(element.id))
    .flatMap((element) =>
      getAxisAnchors(elementBounds(element), axis).map((anchor) => ({
        position: anchor.position,
        source: 'element' as const,
      })),
    )

  return [...pageReferences, ...elementReferences]
}

function getAxisAnchors(bounds: Bounds, axis: Axis): AxisAnchor[] {
  const start = axis === 'x' ? bounds.left : bounds.top
  const end = axis === 'x' ? bounds.right : bounds.bottom

  return [
    { name: 'start', position: start },
    { name: 'center', position: (start + end) / 2 },
    { name: 'end', position: end },
  ]
}

function elementBounds(element: FreeformElement): Bounds {
  return {
    left: element.x,
    top: element.y,
    right: element.x + element.width,
    bottom: element.y + element.height,
  }
}

function getGroupBounds(elements: FreeformElement[]): Bounds | undefined {
  if (elements.length === 0) return undefined

  return elements.reduce<Bounds>(
    (bounds, element) => {
      const current = elementBounds(element)

      return {
        left: Math.min(bounds.left, current.left),
        top: Math.min(bounds.top, current.top),
        right: Math.max(bounds.right, current.right),
        bottom: Math.max(bounds.bottom, current.bottom),
      }
    },
    elementBounds(elements[0]),
  )
}
```

Implementation requirements:

- Reuse `moveElementsWithinSlide(...)` to clamp the starting delta and the final snapped delta.
- Use layout boxes: `x/y/width/height`, ignoring rotation.
- For selected group bounds, use document-order selected elements.
- Page references:
  - x axis: `0`, `slide.width / 2`, `slide.width`
  - y axis: `0`, `slide.height / 2`, `slide.height`
- Element references exclude selected IDs.
- Dragged anchors:
  - `start`, `center`, `end`
- Candidate distance is `Math.abs(reference.position - movedDraggedAnchor.position)`.
- Candidate is valid only when distance `<= threshold`.
- Sort candidates by:
  1. distance ascending
  2. source priority: page before element
  3. dragged anchor priority: center, start, end
  4. reference position ascending
- Return at most one x line and one y line.
- If the post-snap boundary clamp changes an axis delta, omit that axis line so guides always describe the final rendered position.
- If selection is empty or all selected IDs are invalid, return `{ dx, dy, lines: [] }`.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/snapping.test.ts
```

Expected: all snapping tests pass.

- [ ] **Step 5: Run focused unit regression**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/selection.test.ts src/freeform/__tests__/snapping.test.ts
```

Expected: selection and snapping tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/freeform/snapping.ts src/freeform/__tests__/snapping.test.ts
git commit -m "test: cover freeform snapping calculations"
```

---

## Task 2: Drag integration and guide rendering

**Files:**
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing E2E tests**

Add E2E tests to `e2e/freeform.spec.ts`. Make all new test titles include `snapping` so they can be run without a shell pipe:

```ts
test('snapping aligns a dragged element to the page center and hides guides after release', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()

  const insertTools = page.getByLabel('插入工具')
  await insertTools.getByRole('button', { name: '矩形' }).click()
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const element = page.getByTestId('freeform-element').first()
  const box = await element.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 192, start.y)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(1)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([{ x: 490, y: 100 }])
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
})

test('snapping aligns a dragged element to another element left edge', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()

  const insertTools = page.getByLabel('插入工具')
  await insertTools.getByRole('button', { name: '矩形' }).click()
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await insertTools.getByRole('button', { name: '矩形' }).click()
  await setSelectedElementBox(page, 700, 120, 140, 100)

  const first = page.getByTestId('freeform-element').first()
  const box = await first.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 297, start.y)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 700, y: 100 },
    { x: 700, y: 120 },
  ])
})

test('snapping aligns a selected group by its bounding box', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  const first = page.getByTestId('freeform-element').first()
  const box = await first.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 137, start.y)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 380, y: 100 },
    { x: 600, y: 120 },
  ])
})

test('snapping does not apply to keyboard nudges', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 101, y: 100 },
    { x: 321, y: 120 },
  ])
})
```

Notes:

- Current preview scale is `0.5`, so a page delta of `384` px is a screen delta of `192` px.
- The page-center case starts at x=100, element width=100. A raw page dx of 384 puts center at 534, within threshold 6 of page center 540, so it should snap to x=490.
- The element-left case starts first element at x=100. Raw page dx of 594 puts left at 694, within threshold 6 of second element left x=700, so it should snap to x=700 without page-center interference.
- The group case starts group bounds x=100..420, center 260. A raw page dx of 274 puts group center at 534, within threshold 6 of page center 540, so it should snap to dx=280 and final positions x=380 / x=600.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep snapping
```

Expected: snapping E2E fails because no guide lines render and drag currently uses raw `moveElementsWithinSlide` only.

- [ ] **Step 3: Integrate snapping in `FreeformWorkspace`**

Modify `src/freeform/FreeformWorkspace.tsx`:

- Import:

```ts
import { snapDrag, type SnapLine } from './snapping'
```

- Add state:

```ts
const [snapLines, setSnapLines] = useState<SnapLine[]>([])
```

- In `onElementPointerDown` pointer move:

```ts
const rawDx = Math.round((moveEvent.clientX - startX) / previewScale)
const rawDy = Math.round((moveEvent.clientY - startY) / previewScale)
const snap = snapDrag(activeSlide, startElements, draggingIds, rawDx, rawDy)
const patches = moveElementsWithinSlide(activeSlide, startElements, draggingIds, snap.dx, snap.dy)
setSnapLines(snap.lines)
```

- On pointer up:

```ts
setSnapLines([])
commitLiveEdit(startDocument)
```

- Do not call `snapDrag` from:
  - `nudgeSelection`
  - `onResizePointerDown`
  - `onArtboardPointerDown`
  - align/distribute handlers

- Render guide lines inside the artboard near the existing marquee render:

```tsx
{snapLines.map((line) => (
  <div
    key={`${line.axis}-${line.position}-${line.source}`}
    className={`freeform-ui-only freeform-snap-line freeform-snap-line-${line.axis}`}
    data-testid="freeform-snap-line"
    style={line.axis === 'x' ? { left: line.position } : { top: line.position }}
  />
))}
```

- [ ] **Step 4: Add snap line CSS**

Modify `src/styles.css`:

```css
.freeform-snap-line {
  position: absolute;
  z-index: 19;
  pointer-events: none;
  background: var(--accent);
  opacity: 0.82;
}

.freeform-snap-line-x {
  top: 0;
  bottom: 0;
  width: 2px;
  transform: translateX(-1px);
}

.freeform-snap-line-y {
  left: 0;
  right: 0;
  height: 2px;
  transform: translateY(-1px);
}
```

The class includes `freeform-ui-only`, so export filtering must exclude it.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep snapping
```

Expected: snapping E2E tests pass.

- [ ] **Step 6: Run integration regression**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "drags selected elements together"
npm run test:e2e -- e2e/freeform.spec.ts --grep "keyboard nudges"
npm run test:e2e -- e2e/freeform.spec.ts --grep "marquee"
```

Expected:

- Group dragging still passes.
- Keyboard nudge tests still pass and do not snap.
- Marquee tests still pass and do not snap.

- [ ] **Step 7: Commit**

```powershell
git add e2e/freeform.spec.ts src/freeform/FreeformWorkspace.tsx src/styles.css
git commit -m "feat: add freeform snapping guides"
```

---

## Task 3: Version bump and full verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump package version**

Change:

- `package.json` version: `0.3.0` → `0.4.0`
- `package-lock.json` top-level version: `0.3.0` → `0.4.0`
- `package-lock.json` root package version: `0.3.0` → `0.4.0`

- [ ] **Step 2: Verify version consistency**

Run:

```powershell
rg '"version": "0\\.4\\.0"|"version": "0\\.3\\.0"' package.json package-lock.json
```

Expected:

- `0.4.0` appears in the three expected version positions.
- No `0.3.0` remains in `package.json` or `package-lock.json`.

- [ ] **Step 3: Full verification**

Run:

```powershell
npm run build
npm run test:unit
npm run test:e2e
git diff --check
git status --short
```

Expected:

- Build exits 0.
- Unit tests pass.
- Full E2E passes.
- `git diff --check` exits 0; CRLF warnings are acceptable, whitespace errors are not.
- `git status --short` shows only the expected version files before commit.

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json
git commit -m "chore: bump version for snapping guides"
```

- [ ] **Step 5: Final review readiness**

Run:

```powershell
git status --short
git log --oneline -8
```

Expected:

- Worktree clean.
- Recent commits include snapping calculation tests, snapping guide implementation, and version bump.
