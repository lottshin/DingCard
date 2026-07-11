# Freeform Selection Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the freeform editor selection model with marquee selection, multi-element dragging, keyboard nudging, and regression coverage for batch clipboard/delete.

**Architecture:** Keep the existing DOM-based freeform canvas. Add small pure helpers for selection geometry and movement clamping, then wire them into `FreeformWorkspace` so live pointer interactions still commit one history entry on pointer up.

**Tech Stack:** React, TypeScript, Playwright E2E, Vitest, existing freeform reducer/history model.

---

## File Structure

- Create `src/freeform/selection.ts`
  - Pure geometry helpers:
    - rectangle intersection for marquee selection
    - batch move patch calculation with slide-bound clamping
- Create `src/freeform/__tests__/selection.test.ts`
  - Unit tests for geometry and batch move clamping.
- Modify `src/freeform/FreeformWorkspace.tsx`
  - Add marquee selection state and pointer handling on the artboard.
  - Change element drag to move the whole active selection when the dragged element is already selected.
  - Add keyboard arrow nudging for all selected elements.
  - Keep text inputs and inspector inputs exempt from canvas shortcuts.
- Modify `src/styles.css`
  - Add a visual marquee rectangle style.
- Modify `e2e/freeform.spec.ts`
  - Add E2E coverage for marquee selection, multi-element dragging, keyboard nudging, and batch clipboard/delete.

---

### Task 1: Pure selection geometry helpers

**Files:**
- Create: `src/freeform/selection.ts`
- Test: `src/freeform/__tests__/selection.test.ts`

- [ ] **Step 1: Write failing unit tests**

Add tests for:

```ts
import { expect, it } from 'vitest'
import { getElementsInMarquee, moveElementsWithinSlide } from '../selection'
import type { FreeformElement, FreeformSlide } from '../types'

const element = (id: string, x: number, y: number, width = 100, height = 100): FreeformElement => ({
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

it('selects elements intersecting the marquee rectangle', () => {
  const elements = [
    element('a', 100, 100),
    element('b', 260, 100),
    element('c', 520, 100),
  ]

  expect(getElementsInMarquee(elements, { x: 90, y: 90, width: 300, height: 160 })).toEqual([
    'a',
    'b',
  ])
})

it('normalizes marquee rectangles dragged in reverse', () => {
  const elements = [element('a', 100, 100), element('b', 420, 100)]

  expect(getElementsInMarquee(elements, { x: 390, y: 240, width: -320, height: -180 })).toEqual([
    'a',
  ])
})

it('moves selected elements together while keeping the group inside the slide', () => {
  const slide = { width: 500, height: 400 } as FreeformSlide
  const elements = [element('a', 40, 80), element('b', 340, 120)]

  expect(moveElementsWithinSlide(slide, elements, ['a', 'b'], 120, 0)).toEqual([
    { elementId: 'a', patch: { x: 60, y: 80 } },
    { elementId: 'b', patch: { x: 360, y: 120 } },
  ])
})
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/selection.test.ts
```

Expected: fails because `src/freeform/selection.ts` does not exist.

- [ ] **Step 3: Implement minimal helpers**

Implement:

- `Rect` type
- `getElementsInMarquee(elements, rect): string[]`
- `moveElementsWithinSlide(slide, elements, selectedIds, dx, dy): Array<{ elementId; patch }>`

Movement must clamp by the selected group bounds, not each element independently, so relative spacing is preserved.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/selection.test.ts
```

Expected: selection helper tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/freeform/selection.ts src/freeform/__tests__/selection.test.ts
git commit -m "test: cover freeform selection geometry"
```

---

### Task 2: Marquee selection

**Files:**
- Modify: `e2e/freeform.spec.ts`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing E2E test**

Add a test that:

1. opens freeform workspace
2. creates three rectangles
3. positions two inside a drag selection area and one outside
4. drags on empty artboard space
5. expects the two inside elements to show selected outlines
6. clicks `左对齐` and verifies only those two elements changed

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "marquee"
```

Expected: fails because dragging empty canvas currently only clears selection.

- [ ] **Step 3: Implement marquee selection**

In `FreeformWorkspace.tsx`:

- add `marquee` state with start/current artboard coordinates
- change artboard `onPointerDown` to start marquee only when the target is the artboard itself
- convert pointer `clientX/clientY` to slide coordinates with `artboard.getBoundingClientRect()` and `previewScale`, because the artboard is rendered through CSS `transform: scale(...)`
- render `.freeform-marquee.freeform-ui-only` while dragging
- on pointer up, use `getElementsInMarquee` to set selected IDs
- preserve existing empty click behavior when pointer does not move enough to create a selection rectangle

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "marquee"
```

Expected: marquee E2E passes.

- [ ] **Step 5: Commit**

```powershell
git add e2e/freeform.spec.ts src/freeform/FreeformWorkspace.tsx src/styles.css
git commit -m "feat: add freeform marquee selection"
```

---

### Task 3: Multi-element dragging

**Files:**
- Modify: `e2e/freeform.spec.ts`
- Modify: `src/freeform/FreeformWorkspace.tsx`

- [ ] **Step 1: Write failing E2E test**

Add a test that:

1. creates two selected elements
2. drags one selected element by 100 px horizontally and 40 px vertically
3. verifies both selected elements moved by the same delta

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "drags selected elements together"
```

Expected: fails because only the dragged element currently moves.

- [ ] **Step 3: Implement grouped drag**

In `onElementPointerDown`:

- if the dragged element is already in `selection`, drag all selected elements
- otherwise select and drag only that element
- use `moveElementsWithinSlide` for live updates
- apply returned patches inside a single `replaceCurrent` state update by reducing over `freeformReducer`, rather than calling `applyAction` per element
- keep committing one history entry on pointer up

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "drags selected elements together"
```

Expected: grouped drag E2E passes.

- [ ] **Step 5: Commit**

```powershell
git add e2e/freeform.spec.ts src/freeform/FreeformWorkspace.tsx
git commit -m "feat: drag freeform selections together"
```

---

### Task 4: Keyboard nudging and batch operation regression

**Files:**
- Modify: `e2e/freeform.spec.ts`
- Modify: `src/freeform/FreeformWorkspace.tsx`

- [ ] **Step 1: Write failing E2E tests**

Add tests for:

- `keyboard nudges all selected elements by arrow key`
- `keyboard nudges all selected elements by 10 px with shift arrow`
- `batch copies two selected elements and keeps pasted elements selected`
- `batch deletes all selected elements`

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "keyboard|batch"
```

Expected: arrow-key tests fail because keyboard nudging does not exist. Batch copy/delete should either pass or expose a regression.

- [ ] **Step 3: Implement keyboard nudging**

In the existing keydown effect:

- handle `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`
- use `event.shiftKey ? 10 : 1`
- use `moveElementsWithinSlide`
- apply returned patches inside a single `setHistory` update by reducing over `freeformReducer` and pushing one history entry for the whole key press
- ignore shortcuts when the event target is an input, textarea, select, or contenteditable node
- push one history entry per key press

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "keyboard|batch"
```

Expected: keyboard and batch operation tests pass.

- [ ] **Step 5: Full verification and commit**

Run:

```powershell
npm run build
npm run test:unit
npm run test:e2e
git diff --check
```

Then commit:

```powershell
git add e2e/freeform.spec.ts src/freeform/FreeformWorkspace.tsx
git commit -m "feat: add freeform keyboard selection controls"
```
