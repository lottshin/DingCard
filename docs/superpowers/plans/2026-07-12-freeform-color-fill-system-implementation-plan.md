# Freeform Color and Fill System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the freeform color/fill system so page backgrounds, shape fills, text fills, font selection, inspector controls, drafts, and export all support the same polished PPT-like editing behavior.

**Architecture:** Add a pure `paint.ts` module for shared color/fill normalization and CSS conversion. Migrate freeform documents to `documentVersion: 2`, replace text `color` with `textFill`, and reuse the same paint helpers in canvas, thumbnails, inspector, drafts, and export. Keep UI controls focused in small freeform components instead of growing `FreeformWorkspace.tsx` with duplicated color logic.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Playwright, html-to-image, existing custom `Select` component, existing freeform reducer/history model.

---

## File structure

- Create: `src/freeform/paint.ts`
  - Shared constants, type guards, normalizers, CSS style converters, and fill transition helpers.
- Create: `src/freeform/__tests__/paint.test.ts`
  - Unit tests for paint normalization, CSS output, and text gradient style.
- Create: `src/freeform/PaintField.tsx`
  - Reusable styled inspector control for solid/gradient/transparent/image fill modes.
- Create: `src/freeform/PlainTextEditable.tsx`
  - Plain-text `contentEditable` text box with IME-safe DOM syncing and paste sanitization.
- Modify: `src/freeform/types.ts`
  - Add `ColorPaint`, v2 document version, gradient-capable `SlideBackground`/`ShapeFill`, and `FreeformTextElement.textFill`.
- Modify: `src/freeform/document.ts`
  - Use v2 defaults and new fill fields.
- Modify: `src/drafts.ts`
  - Normalize/migrate v1 freeform drafts to v2.
- Modify: `src/freeform/__tests__/draftMigration.test.ts`
  - Cover v1→v2 migration and malformed gradient fallback.
- Modify: `src/freeform/__tests__/document.test.ts`
  - Cover v2 defaults.
- Modify: `src/freeform/FreeformWorkspace.tsx`
  - Wire paint helpers, `PaintField`, font selection, `PlainTextEditable`, and test ids.
- Modify: `src/styles.css`
  - Add styled paint controls, custom range controls, hidden native color/file inputs, and contentEditable text styling.
- Modify: `e2e/freeform.spec.ts`
  - Add automated tests for font, text gradient, page background gradient, shape gradient/image transitions, IME/contentEditable, and PNG gradient sampling.
- Modify: `package.json`, `package-lock.json`
  - Minor bump after implementation succeeds.

## Shared constants

Use these exact defaults to keep tests stable:

```ts
export const DEFAULT_TEXT_PAINT: ColorPaint = { type: 'solid', color: '#18181b' }
export const DEFAULT_PAGE_PAINT: ColorPaint = { type: 'solid', color: '#ffffff' }
export const DEFAULT_SHAPE_PAINT: ColorPaint = { type: 'solid', color: '#fed7aa' }
export const DEFAULT_GRADIENT_TO = '#f97316'
export const DEFAULT_GRADIENT_ANGLE = 135
```

When converting solid to gradient:

```ts
{ type: 'linear-gradient', from: currentSolidColor, to: DEFAULT_GRADIENT_TO, angle: DEFAULT_GRADIENT_ANGLE }
```

When converting gradient to solid:

```ts
{ type: 'solid', color: currentGradient.from }
```

---

### Task 1: Add shared paint model and helper tests

**Files:**
- Modify: `src/freeform/types.ts`
- Create: `src/freeform/paint.ts`
- Create: `src/freeform/__tests__/paint.test.ts`

- [ ] **Step 1: Write failing paint unit tests**

Create `src/freeform/__tests__/paint.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRADIENT_ANGLE,
  DEFAULT_PAGE_PAINT,
  DEFAULT_TEXT_PAINT,
  normalizeAngle,
  normalizeColorPaint,
  paintFallbackColor,
  paintToCssBackground,
  shapeFillToStyle,
  slideBackgroundToCss,
  textFillToStyle,
  toGradientPaint,
  toSolidPaint,
} from '../paint'

describe('paint helpers', () => {
  it('renders solid and linear-gradient paints as CSS backgrounds', () => {
    expect(paintToCssBackground({ type: 'solid', color: '#18181b' })).toBe('#18181b')
    expect(
      paintToCssBackground({ type: 'linear-gradient', from: '#ffffff', to: '#f97316', angle: 135 }),
    ).toBe('linear-gradient(135deg, #ffffff, #f97316)')
  })

  it('normalizes angles into stable integer degrees', () => {
    expect(normalizeAngle(-45)).toBe(315)
    expect(normalizeAngle(765.7)).toBe(46)
    expect(normalizeAngle(Number.NaN)).toBe(DEFAULT_GRADIENT_ANGLE)
  })

  it('falls back for malformed paint objects', () => {
    expect(normalizeColorPaint(null, DEFAULT_TEXT_PAINT)).toEqual(DEFAULT_TEXT_PAINT)
    expect(normalizeColorPaint({ type: 'solid', color: 'red' }, DEFAULT_TEXT_PAINT)).toEqual(DEFAULT_TEXT_PAINT)
    expect(
      normalizeColorPaint(
        { type: 'linear-gradient', from: '#fff', to: '#f97316', angle: 'bad' },
        DEFAULT_TEXT_PAINT,
      ),
    ).toEqual(DEFAULT_TEXT_PAINT)
  })

  it('renders slide backgrounds and shape fills consistently', () => {
    expect(slideBackgroundToCss({ type: 'transparent' })).toBe('transparent')
    expect(slideBackgroundToCss(DEFAULT_PAGE_PAINT)).toBe('#ffffff')
    expect(shapeFillToStyle({ type: 'image', src: 'data:image/png;base64,abc', fit: 'contain' })).toMatchObject({
      backgroundImage: 'url("data:image/png;base64,abc")',
      backgroundSize: 'contain',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    })
  })

  it('renders gradient text with a caret fallback color', () => {
    const style = textFillToStyle({ type: 'linear-gradient', from: '#18181b', to: '#f97316', angle: 90 })
    expect(style.backgroundImage).toBe('linear-gradient(90deg, #18181b, #f97316)')
    expect(style.backgroundClip).toBe('text')
    expect(style.color).toBe('transparent')
    expect(style.caretColor).toBe('#18181b')
    expect(paintFallbackColor({ type: 'linear-gradient', from: '#18181b', to: '#f97316', angle: 90 })).toBe('#18181b')
  })

  it('converts between solid and gradient fills with deterministic defaults', () => {
    expect(toGradientPaint({ type: 'solid', color: '#111111' })).toEqual({
      type: 'linear-gradient',
      from: '#111111',
      to: '#f97316',
      angle: 135,
    })
    expect(toSolidPaint({ type: 'linear-gradient', from: '#222222', to: '#f97316', angle: 90 })).toEqual({
      type: 'solid',
      color: '#222222',
    })
  })
})
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm run test:unit -- src/freeform/__tests__/paint.test.ts
```

Expected: FAIL because `src/freeform/paint.ts` does not exist.

- [ ] **Step 3: Implement minimal paint model**

In `src/freeform/types.ts`, add:

```ts
export type ColorPaint =
  | { type: 'solid'; color: string }
  | { type: 'linear-gradient'; from: string; to: string; angle: number }
```

Create `src/freeform/paint.ts` with:

```ts
import type { CSSProperties } from 'react'
import type { ColorPaint, ShapeFill, SlideBackground } from './types'

export const DEFAULT_TEXT_PAINT: ColorPaint = { type: 'solid', color: '#18181b' }
export const DEFAULT_PAGE_PAINT: ColorPaint = { type: 'solid', color: '#ffffff' }
export const DEFAULT_SHAPE_PAINT: ColorPaint = { type: 'solid', color: '#fed7aa' }
export const DEFAULT_GRADIENT_TO = '#f97316'
export const DEFAULT_GRADIENT_ANGLE = 135

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value)
}

export function normalizeAngle(angle: unknown): number {
  if (!Number.isFinite(angle)) return DEFAULT_GRADIENT_ANGLE
  return ((Math.round(Number(angle)) % 360) + 360) % 360
}

export function normalizeColorPaint(value: unknown, fallback: ColorPaint): ColorPaint {
  if (!value || typeof value !== 'object') return fallback
  const record = value as Record<string, unknown>
  if (record.type === 'solid' && isHexColor(record.color)) return { type: 'solid', color: record.color }
  if (
    record.type === 'linear-gradient' &&
    isHexColor(record.from) &&
    isHexColor(record.to) &&
    Number.isFinite(record.angle)
  ) {
    return { type: 'linear-gradient', from: record.from, to: record.to, angle: normalizeAngle(record.angle) }
  }
  return fallback
}

export function paintToCssBackground(paint: ColorPaint): string {
  return paint.type === 'solid'
    ? paint.color
    : `linear-gradient(${normalizeAngle(paint.angle)}deg, ${paint.from}, ${paint.to})`
}

export function slideBackgroundToCss(background: SlideBackground): string {
  return background.type === 'transparent' ? 'transparent' : paintToCssBackground(background)
}

export function shapeFillToStyle(fill: ShapeFill): CSSProperties {
  if (fill.type === 'image') {
    return {
      backgroundImage: `url("${fill.src}")`,
      backgroundSize: fill.fit,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
  }
  return { background: paintToCssBackground(fill) }
}

export function paintFallbackColor(fill: ColorPaint): string {
  return fill.type === 'solid' ? fill.color : fill.from
}

export function textFillToStyle(fill: ColorPaint): CSSProperties {
  if (fill.type === 'solid') return { color: fill.color }
  return {
    backgroundImage: paintToCssBackground(fill),
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
    caretColor: paintFallbackColor(fill),
  }
}

export function toGradientPaint(fill: ColorPaint): ColorPaint {
  return fill.type === 'linear-gradient'
    ? fill
    : { type: 'linear-gradient', from: fill.color, to: DEFAULT_GRADIENT_TO, angle: DEFAULT_GRADIENT_ANGLE }
}

export function toSolidPaint(fill: ColorPaint): ColorPaint {
  return fill.type === 'solid' ? fill : { type: 'solid', color: fill.from }
}
```

- [ ] **Step 4: Run test and verify GREEN**

Run:

```bash
npm run test:unit -- src/freeform/__tests__/paint.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/freeform/types.ts src/freeform/paint.ts src/freeform/__tests__/paint.test.ts
git commit -m "test: cover freeform paint helpers"
```

---

### Task 2: Migrate freeform documents to v2

**Files:**
- Modify: `src/freeform/types.ts`
- Modify: `src/freeform/document.ts`
- Modify: `src/drafts.ts`
- Modify: `src/freeform/__tests__/document.test.ts`
- Modify: `src/freeform/__tests__/draftMigration.test.ts`
- Modify as needed for compile: `src/freeform/FreeformWorkspace.tsx`

- [ ] **Step 1: Write failing migration/default tests**

Extend `src/freeform/__tests__/document.test.ts`:

```ts
it('creates v2 documents with shared paint defaults', () => {
  const doc = createFreeformDocument()
  expect(doc.documentVersion).toBe(2)
  expect(doc.slides[0].background).toEqual({ type: 'solid', color: '#ffffff' })
  const text = createTextElement(doc.slides[0])
  expect(text.textFill).toEqual({ type: 'solid', color: '#18181b' })
  expect('color' in text).toBe(false)
})
```

Extend `src/freeform/__tests__/draftMigration.test.ts`:

```ts
it('migrates v1 freeform text color to v2 textFill', () => {
  const draft = normalizeDraftForRead({
    id: 'freeform-v1',
    title: 'old',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: 1,
    document: {
      documentVersion: 1,
      activeSlideId: 's1',
      slides: [{
        id: 's1',
        name: 'Page 1',
        width: 1024,
        height: 768,
        background: { type: 'solid', color: '#ffffff' },
        elements: [{
          id: 't1',
          type: 'text',
          x: 10,
          y: 20,
          width: 300,
          height: 120,
          rotation: 0,
          text: '旧文本',
          fontSize: 32,
          fontFamily: 'system-ui, sans-serif',
          color: '#123456',
          align: 'left',
          fontWeight: 'bold',
        }],
      }],
    },
  })
  expect(draft?.mode).toBe('freeform-slide')
  if (draft?.mode !== 'freeform-slide') throw new Error('expected freeform draft')
  expect(draft.document.documentVersion).toBe(2)
  expect(draft.document.slides[0].elements[0]).toMatchObject({
    type: 'text',
    textFill: { type: 'solid', color: '#123456' },
  })
  expect('color' in draft.document.slides[0].elements[0]).toBe(false)
})

it('normalizes v2 gradients and falls back for malformed paint', () => {
  const draft = normalizeDraftForRead({
    id: 'freeform-v2',
    title: 'gradient',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: 1,
    document: {
      documentVersion: 2,
      activeSlideId: 's1',
      slides: [{
        id: 's1',
        name: 'Page 1',
        width: 1024,
        height: 768,
        background: { type: 'linear-gradient', from: '#ffffff', to: '#f97316', angle: 765 },
        elements: [{
          id: 'shape1',
          type: 'shape',
          x: 10,
          y: 20,
          width: 300,
          height: 120,
          rotation: 0,
          shape: 'rect',
          fill: { type: 'linear-gradient', from: '#fed7aa', to: '#f97316', angle: 90 },
          stroke: '#c2410c',
          strokeWidth: 0,
        }, {
          id: 'text1',
          type: 'text',
          x: 10,
          y: 160,
          width: 300,
          height: 120,
          rotation: 0,
          text: 'bad paint',
          fontSize: 32,
          fontFamily: 'system-ui, sans-serif',
          textFill: { type: 'solid', color: 'red' },
          align: 'left',
          fontWeight: 'bold',
        }],
      }],
    },
  })
  expect(draft?.mode).toBe('freeform-slide')
  if (draft?.mode !== 'freeform-slide') throw new Error('expected freeform draft')
  expect(draft.document.slides[0].background).toEqual({
    type: 'linear-gradient',
    from: '#ffffff',
    to: '#f97316',
    angle: 46,
  })
  expect(draft.document.slides[0].elements[1]).toMatchObject({
    type: 'text',
    textFill: { type: 'solid', color: '#18181b' },
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm run test:unit -- src/freeform/__tests__/document.test.ts src/freeform/__tests__/draftMigration.test.ts
```

Expected: FAIL because current documents are v1 and text elements still use `color`.

- [ ] **Step 3: Implement v2 types/defaults/migration**

In `src/freeform/types.ts`:

- Change `documentVersion: 1` to `documentVersion: 2`.
- Change `SlideBackground` to `ColorPaint | { type: 'transparent' }`.
- Change `ShapeFill` to `ColorPaint | { type: 'image'; src: string; fit: 'cover' | 'contain' }`.
- Replace `FreeformTextElement.color` with `FreeformTextElement.textFill: ColorPaint`.

In `src/freeform/document.ts`:

- Import `DEFAULT_PAGE_PAINT`, `DEFAULT_TEXT_PAINT`, `DEFAULT_SHAPE_PAINT`.
- `createFreeformDocument()` returns `documentVersion: 2`.
- `createTextElement()` uses `textFill: DEFAULT_TEXT_PAINT`.
- `createShapeElement()` uses `fill: DEFAULT_SHAPE_PAINT`.

In `src/drafts.ts`:

- Import paint defaults and normalizers.
- Add `normalizeFreeformDocument(raw): FreeformDocument | null`.
- Support `documentVersion === 1` and `documentVersion === 2`.
- For v1 text elements, migrate `color` to `textFill`.
- For malformed v2 paint, normalize to defaults.
- Skip unknown element types; do not reject the whole document unless no valid slides remain.

In `src/freeform/FreeformWorkspace.tsx`, make temporary compile updates:

- Replace `element.color` with `element.textFill`.
- Use `slideBackgroundToCss`, `shapeFillToStyle`, and `textFillToStyle` where existing render paths use solid colors.

- [ ] **Step 4: Run targeted tests and full unit tests**

Run:

```bash
npm run test:unit -- src/freeform/__tests__/document.test.ts src/freeform/__tests__/draftMigration.test.ts src/freeform/__tests__/paint.test.ts
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/freeform/types.ts src/freeform/document.ts src/drafts.ts src/freeform/FreeformWorkspace.tsx src/freeform/__tests__/document.test.ts src/freeform/__tests__/draftMigration.test.ts
git commit -m "feat: migrate freeform documents to paint v2"
```

---

### Task 3: Add reusable inspector paint controls and styles

**Files:**
- Create: `src/freeform/PaintField.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write E2E tests that require visible styled controls**

Add the following tests to `e2e/freeform.spec.ts` before implementation:

```ts
test('freeform inspector exposes styled paint controls instead of visible native color inputs', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /自由编辑|自由|Freeform/i }).click()
  await expect(page.getByTestId('freeform-paint-field').first()).toBeVisible()
  await expect(page.locator('.freeform-inspector input[type="color"]:visible')).toHaveCount(0)
  await expect(page.getByTestId('paint-color-button').first()).toBeVisible()
})
```

If the existing tab text is hard to match, use the existing e2e helper pattern from `freeform.spec.ts`.

- [ ] **Step 2: Run E2E and verify RED**

Run:

```bash
npm run test:e2e -- e2e/freeform.spec.ts --grep "styled paint controls"
```

Expected: FAIL because `PaintField` and test ids do not exist.

- [ ] **Step 3: Implement `PaintField`**

Create `src/freeform/PaintField.tsx`:

```tsx
import type { ShapeFill, ColorPaint, SlideBackground } from './types'
import { DEFAULT_GRADIENT_TO, DEFAULT_GRADIENT_ANGLE, paintFallbackColor, toGradientPaint, toSolidPaint } from './paint'

type PaintMode = 'solid' | 'linear-gradient' | 'transparent' | 'image'

interface PaintFieldProps {
  label: string
  value: SlideBackground | ShapeFill | ColorPaint
  modes: PaintMode[]
  onChange: (value: SlideBackground | ShapeFill | ColorPaint) => void
  onChooseImage?: () => void
  onClearImage?: () => void
  onImageFitChange?: (fit: 'cover' | 'contain') => void
}
```

Required behavior:

- Render root with `data-testid="freeform-paint-field"`.
- Render visible color swatches as buttons with `data-testid="paint-color-button"`.
- Render hidden native color inputs with class `paint-native-input`.
- Render gradient angle range with `data-testid="paint-gradient-angle"`.
- Mode buttons use existing `seg`/`seg-btn` classes.
- `solid` mode changes `color`.
- `linear-gradient` mode changes `from`, `to`, and `angle`.
- `transparent` mode emits `{ type: 'transparent' }`.
- `image` mode calls `onChooseImage` and does not overwrite current fill until an image exists.

- [ ] **Step 4: Add styles**

In `src/styles.css` add:

```css
.paint-field { display: grid; gap: 10px; }
.paint-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.paint-color-button { width: 34px; height: 34px; border: 1px solid var(--line-2); border-radius: var(--radius-xs); background: var(--surface); box-shadow: var(--shadow-sm); cursor: pointer; }
.paint-native-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.paint-hex { flex: 1 1 auto; min-width: 0; height: 34px; border: 1px solid var(--line-2); border-radius: var(--radius-xs); background: var(--surface); color: var(--text); font-family: var(--mono); font-size: 12px; padding: 0 8px; }
.paint-range { width: 100%; accent-color: var(--accent); }
.paint-range::-webkit-slider-thumb { cursor: pointer; }
.field-grid input[type='number']::-webkit-outer-spin-button,
.field-grid input[type='number']::-webkit-inner-spin-button,
.paint-hex::-webkit-outer-spin-button,
.paint-hex::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
```

Refine as needed to match existing radius/focus/disabled patterns.

- [ ] **Step 5: Run E2E and verify GREEN**

Run:

```bash
npm run test:e2e -- e2e/freeform.spec.ts --grep "styled paint controls"
```

Expected: PASS after integration in Task 4. If `PaintField` is not wired yet, keep this test in place and commit with Task 4 instead.

- [ ] **Step 6: Commit**

If Task 3 is wired enough to pass:

```bash
git add src/freeform/PaintField.tsx src/styles.css e2e/freeform.spec.ts
git commit -m "feat: add freeform paint controls"
```

If not wired yet, defer commit until Task 4.

---

### Task 4: Wire font selection and paint controls into the inspector

**Files:**
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/freeform/PaintField.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing E2E tests for font and gradient controls**

Add tests:

```ts
test('changes a selected text element font family', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /自由编辑|自由|Freeform/i }).click()
  await page.getByRole('button', { name: /文本|Text/i }).click()
  await page.getByTestId('freeform-element').first().click()
  await page.getByTestId('freeform-font-select').click()
  await page.getByRole('option', { name: /思源宋体|Noto Serif/i }).click()
  await expect(page.getByTestId('freeform-textbox').first()).toHaveCSS('font-family', /Noto Serif|serif/i)
})

test('applies page, shape, and text gradients from the inspector', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /自由编辑|自由|Freeform/i }).click()

  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-canvas')).toHaveCSS('background-image', /linear-gradient/)

  await page.getByRole('button', { name: /矩形|rect/i }).click()
  await page.getByTestId('freeform-element').last().click()
  await page.getByTestId('shape-fill-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-shape').last()).toHaveCSS('background-image', /linear-gradient/)

  await page.getByRole('button', { name: /文本|Text/i }).click()
  await page.getByTestId('freeform-element').last().click()
  await page.getByTestId('text-fill-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-textbox').last()).toHaveCSS('background-image', /linear-gradient/)
})
```

Adjust role names to match existing Chinese labels or add stable `data-testid` to toolbar buttons if needed.

- [ ] **Step 2: Run E2E and verify RED**

Run:

```bash
npm run test:e2e -- e2e/freeform.spec.ts --grep "font family|page, shape, and text gradients"
```

Expected: FAIL because inspector controls are not wired.

- [ ] **Step 3: Import and wire controls**

In `src/freeform/FreeformWorkspace.tsx`:

- Import `Select` from `../Select`.
- Import `FONTS` from `../theme`.
- Import `PaintField`.
- Import paint helpers.
- Page background section:
  - Replace visible color input with `PaintField`.
  - Wrap with `data-testid="page-background-paint"`.
  - Modes: `solid`, `linear-gradient`, `transparent`.
- Text section:
  - Add font `Select` with `data-testid="freeform-font-select"` or wrap the trigger.
  - Replace text color input with `PaintField`.
  - Modes: `solid`, `linear-gradient`.
- Shape section:
  - Replace fill color input with `PaintField`.
  - Modes: `solid`, `linear-gradient`, `image`.
  - Preserve existing image fill file input and `cover`/`contain`.
- Line section:
  - Keep pure color but hide native color input behind styled swatch.

- [ ] **Step 4: Preserve current image fill behavior**

Rules:

- Existing `fillSelectedShapeFromFile(file)` still produces `{ type: 'image', src, fit: 'cover' }`.
- Changing image fill fit only applies when `selectedElement.fill.type === 'image'`.
- Switching image → solid/gradient replaces fill.
- Choosing image and canceling the file dialog keeps existing solid/gradient fill.

- [ ] **Step 5: Run targeted E2E**

Run:

```bash
npm run test:e2e -- e2e/freeform.spec.ts --grep "styled paint controls|font family|page, shape, and text gradients"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/freeform/FreeformWorkspace.tsx src/freeform/PaintField.tsx src/styles.css e2e/freeform.spec.ts
git commit -m "feat: wire freeform paint inspector"
```

---

### Task 5: Replace textarea canvas text with IME-safe contentEditable

**Files:**
- Create: `src/freeform/PlainTextEditable.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing E2E tests for contentEditable and Chinese input**

Add tests:

```ts
test('edits Chinese text in the freeform contenteditable textbox without losing composition text', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /自由编辑|自由|Freeform/i }).click()
  await page.getByRole('button', { name: /文本|Text/i }).click()
  const textbox = page.getByTestId('freeform-textbox').last()
  await expect(textbox).toHaveAttribute('contenteditable', 'true')
  await textbox.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('中文渐变测试')
  await expect(textbox).toContainText('中文渐变测试')
})

test('pastes plain text into the freeform contenteditable textbox', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /自由编辑|自由|Freeform/i }).click()
  await page.getByRole('button', { name: /文本|Text/i }).click()
  const textbox = page.getByTestId('freeform-textbox').last()
  await textbox.evaluate((node) => {
    const data = new DataTransfer()
    data.setData('text/html', '<b>粗体</b>')
    data.setData('text/plain', '纯文本')
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })
  await expect(textbox).toContainText('纯文本')
  await expect(textbox.locator('b')).toHaveCount(0)
})
```

- [ ] **Step 2: Run E2E and verify RED**

Run:

```bash
npm run test:e2e -- e2e/freeform.spec.ts --grep "contenteditable|pastes plain text"
```

Expected: FAIL because text canvas is still a `textarea`.

- [ ] **Step 3: Implement `PlainTextEditable`**

Create `src/freeform/PlainTextEditable.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

interface PlainTextEditableProps {
  value: string
  className?: string
  style?: CSSProperties
  ariaLabel: string
  onFocus: () => void
  onChange: (value: string) => void
}

export function PlainTextEditable({ value, className, style, ariaLabel, onFocus, onChange }: PlainTextEditableProps) {
  const ref = useRef<HTMLDivElement>(null)
  const composingRef = useRef(false)
  const focusedRef = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (!node || composingRef.current || focusedRef.current) return
    if (node.textContent !== value) node.textContent = value
  }, [value])

  function publish() {
    onChange(ref.current?.textContent ?? '')
  }

  function insertPlainText(text: string) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      ref.current?.append(document.createTextNode(text))
      return
    }
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.setEndAfter(node)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  return (
    <div
      ref={ref}
      className={className}
      data-testid="freeform-textbox"
      role="textbox"
      aria-label={ariaLabel}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={style}
      onFocus={() => {
        focusedRef.current = true
        onFocus()
      }}
      onBlur={() => {
        focusedRef.current = false
        publish()
      }}
      onInput={publish}
      onCompositionStart={() => {
        composingRef.current = true
      }}
      onCompositionEnd={() => {
        composingRef.current = false
        publish()
      }}
      onPaste={(event) => {
        event.preventDefault()
        insertPlainText(event.clipboardData.getData('text/plain'))
        publish()
      }}
    >
      {value}
    </div>
  )
}
```

If React child text causes cursor jumps during focused typing, switch to setting `textContent` in an initial `useEffect` and render no children.

- [ ] **Step 4: Wire text rendering**

In `FreeformElementContent`:

- Replace `<textarea>` with `<PlainTextEditable>`.
- Use `textFillToStyle(element.textFill)`.
- Preserve `fontFamily`, `fontSize`, `textAlign`, `fontWeight`.
- Add `data-testid="freeform-textbox"` only inside `PlainTextEditable`.

In `src/styles.css`:

- Update `.freeform-textbox` from textarea-specific CSS to contentEditable-safe CSS:
  - `white-space: pre-wrap`
  - `word-break: break-word`
  - `cursor: text`
  - `user-select: text`
  - `outline: none`

- [ ] **Step 5: Run targeted E2E**

Run:

```bash
npm run test:e2e -- e2e/freeform.spec.ts --grep "contenteditable|pastes plain text|text gradients"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/freeform/PlainTextEditable.tsx src/freeform/FreeformWorkspace.tsx src/styles.css e2e/freeform.spec.ts
git commit -m "feat: add ime-safe freeform text editing"
```

---

### Task 6: Add export automation for gradients and UI exclusion

**Files:**
- Modify: `e2e/freeform.spec.ts`
- Modify as needed: `src/freeform/FreeformWorkspace.tsx`

- [ ] **Step 1: Write failing export E2E**

Add helper to `e2e/freeform.spec.ts`:

```ts
async function sampleDownloadedPng(page: import('@playwright/test').Page, filePath: string, x: number, y: number) {
  const fs = await import('node:fs/promises')
  const buffer = await fs.readFile(filePath)
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
  return await page.evaluate(
    async ({ dataUrl, x, y }) => {
      const img = new Image()
      img.src = dataUrl
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no canvas context')
      ctx.drawImage(img, 0, 0)
      return Array.from(ctx.getImageData(x, y, 1, 1).data)
    },
    { dataUrl, x, y },
  )
}
```

Add test:

```ts
test('exports current freeform slide with gradient pixels and without editor ui', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /自由编辑|自由|Freeform/i }).click()
  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /导出当前页|导出|Export/i }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('download path missing')
  const topLeft = await sampleDownloadedPng(page, path, 10, 10)
  const bottomRight = await sampleDownloadedPng(page, path, 1000, 740)
  expect(topLeft.slice(0, 3)).not.toEqual(bottomRight.slice(0, 3))
})
```

- [ ] **Step 2: Run E2E and verify RED if export/gradient not complete**

Run:

```bash
npm run test:e2e -- e2e/freeform.spec.ts --grep "exports current freeform slide with gradient pixels"
```

Expected before full implementation: FAIL. After previous tasks it may already PASS; if it passes immediately, inspect whether it is testing the new gradient path and not a false positive.

- [ ] **Step 3: Fix export if needed**

Rules:

- Ensure `freeform-ui-only` remains on selection/handles/guides.
- Ensure hidden native inputs are outside artboard or `freeform-ui-only`.
- Ensure `slideBackgroundToCss` and `textFillToStyle` are applied in artboard DOM before `toPng`.

- [ ] **Step 4: Run targeted export E2E**

Run:

```bash
npm run test:e2e -- e2e/freeform.spec.ts --grep "exports current freeform slide with gradient pixels"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/freeform.spec.ts src/freeform/FreeformWorkspace.tsx
git commit -m "test: cover freeform gradient export"
```

---

### Task 7: Version bump and final regression

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump version**

Current version is `0.4.0`. This is a new feature, so bump to `0.5.0`.

Use npm version without creating a git tag:

```bash
npm version 0.5.0 --no-git-tag-version
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run build
npm run test:unit
npm run test:e2e
git diff --check
```

Expected:

- Build exit 0. Existing Vite chunk-size warning is acceptable if unchanged.
- Unit tests exit 0.
- E2E tests exit 0.
- `git diff --check` exit 0.

- [ ] **Step 3: AGENTS.md checklist**

Verify explicitly:

- 函数契约：paint normalizers handle null/empty/malformed input with stable fallbacks.
- 命名一致性：grep `textFill`, `ColorPaint`, `linear-gradient`, `documentVersion`.
- 错误码/状态码：no new error/status codes.
- 文档同步：spec and plan are present; no new public CLI/API docs needed.
- 版本号：package and lockfile both `0.5.0`.
- 多环境测试：unit + E2E cover data migration, UI controls, IME/contentEditable, export.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: bump version for freeform color fills"
```

---

## Final review

After all tasks:

- Run a final `git status --short`.
- Run a final `git log --oneline -10`.
- Request final code review focused on:
  - v1/v2 draft compatibility.
  - `contentEditable` IME and paste handling.
  - Paint helper contracts and fallback behavior.
  - Export output and UI exclusion.
  - Inspector UI not exposing visible native controls.

Only report completion after fresh verification output is available.
