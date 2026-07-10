# Freeform Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, independent PPT-like freeform editing workspace while preserving the existing Markdown card workflow.

**Architecture:** Split the current monolithic `App.tsx` into an app shell with two workspaces: `MarkdownWorkspace` for the existing flow and `FreeformWorkspace` for the new slide/canvas editor. Build the freeform editor with React DOM/SVG rendering, a typed document model, reducer-driven state changes, versioned drafts, structured image assets, and a snapshot-based export service.

**Tech Stack:** React 18, TypeScript strict mode, Vite 5, CodeMirror 6, `html-to-image`, JSZip, Playwright, Vitest for new unit tests.

---

## Required implementation skills

- Use @superpowers:subagent-driven-development for task-by-task execution, or @superpowers:executing-plans if doing the work inline.
- Use @superpowers:test-driven-development for every feature or bugfix task.
- Use @superpowers:systematic-debugging for any unexpected test failure.
- Use @superpowers:verification-before-completion before claiming the branch is complete.
- Use @superpowers:requesting-code-review before final integration.

## Working directory and safety rules

Work only in:

```powershell
D:\New_god\rednote\.worktrees\freeform-editor
```

Do not edit the main worktree at `D:\New_god\rednote` except through normal Git integration after the feature is complete. Do not close, attach to, or reuse the user's existing Chrome. Playwright will launch its own Chrome context through the existing config.

After each task:

```powershell
git status --short
npm run build
```

Run the narrower test command named in the task first. Run full E2E at major checkpoints.

## Spec reference

Primary spec:

```text
docs/superpowers/specs/2026-07-10-freeform-editor-design.md
```

The spec is authoritative for product behavior. This plan describes one implementation path.

## Scope check

The spec is large, but it is one coherent feature: a second local editing workspace. It should stay as one plan because the tasks share data model, asset storage, export, and app-shell boundaries. The plan is split into independently verifiable milestones so implementation can stop safely after each checkpoint.

## File structure to create or modify

### Existing files to modify

- `package.json`  
  Add unit-test scripts and later bump version to `0.2.0`.

- `package-lock.json`  
  Sync test dependencies and final version bump.

- `src/App.tsx`  
  Convert to a thin app shell that selects the workspace and owns cross-workspace modals only if needed.

- `src/styles.css`  
  Keep existing Markdown styles. Add app-shell and freeform editor sections, or import a new CSS file if the final implementation chooses a cleaner split.

- `src/main.tsx`  
  Keep the global CSS import. Add an extra CSS import only if freeform styles move to `src/freeform/freeform.css`.

- `src/drafts.ts`  
  Replace the single Markdown-only draft contract with a versioned envelope and migration helpers.

- `src/DraftsPanel.tsx`  
  Display both Markdown and freeform drafts, including mode labels and freeform page counts.

- `src/imageStore.ts`  
  Keep existing Markdown image helpers. Add generic asset helpers or delegate them to a new `assetStore`.

- `src/exportZip.ts`  
  Keep ZIP packaging but allow custom file-name prefixes if needed by freeform export.

- `e2e/ime.spec.ts`  
  Keep current Markdown regression tests unchanged unless selectors need to be adjusted after the app-shell split.

### New test/config files

- `vitest.config.ts`  
  Unit-test config for pure TypeScript modules.

- `src/test/setup.ts`  
  Shared unit-test setup if needed.

- `src/freeform/__tests__/document.test.ts`  
  Freeform document reducer and page-size tests.

- `src/freeform/__tests__/geometry.test.ts`  
  Transform, snapping, alignment, and distribution tests.

- `src/freeform/__tests__/history.test.ts`  
  Undo/redo batching tests.

- `src/freeform/__tests__/richText.test.ts`  
  Rich-text model tests.

- `src/freeform/__tests__/assetStore.test.ts`  
  Asset collection and size-estimation tests.

- `src/freeform/__tests__/draftMigration.test.ts`  
  v1 Markdown draft migration and v2 envelope tests.

- `e2e/freeform.spec.ts`  
  Freeform workflow tests.

### New app-shell files

- `src/workspaces/types.ts`  
  `WorkspaceMode` and shared shell types.

- `src/workspaces/AppShell.tsx`  
  Top-level shell and workspace switch.

- `src/workspaces/useDraftController.ts`  
  Shared auth, draft list, active draft, save/open/delete, and visible error state for both workspaces.

- `src/workspaces/markdown/MarkdownWorkspace.tsx`  
  Existing Markdown workflow moved out of `App.tsx`.

### New freeform domain files

- `src/freeform/types.ts`  
  Freeform document, slide, element, fill, stroke, rich-text, and asset types.

- `src/freeform/constants.ts`  
  Page-size presets, limits, defaults, tool constants.

- `src/freeform/document.ts`  
  Pure constructors and document reducer.

- `src/freeform/history.ts`  
  Undo/redo stack and batch helpers.

- `src/freeform/geometry.ts`  
  Coordinates, bounds, transforms, snapping, alignment, distribution.

- `src/freeform/richText.ts`  
  Rich-text helpers and plain-text paste conversion.

- `src/freeform/assetStore.ts`  
  Structured image asset helpers that wrap or reuse `imageStore.ts`.

- `src/freeform/exportFreeform.tsx`  
  Snapshot rendering and PNG export for freeform slides.

### New freeform UI files

- `src/freeform/FreeformWorkspace.tsx`  
  Main container and reducer provider.

- `src/freeform/FreeformToolbar.tsx`  
  Insert tools, undo/redo, export, page-size entry.

- `src/freeform/SlideList.tsx`  
  Page thumbnails and page operations.

- `src/freeform/CanvasViewport.tsx`  
  Scroll/zoom surface.

- `src/freeform/SlideCanvas.tsx`  
  Actual page surface and pointer event boundary.

- `src/freeform/ElementRenderer.tsx`  
  Dispatches to specific element renderers.

- `src/freeform/elements/TextElementView.tsx`  
  Text box rendering and editing.

- `src/freeform/elements/ImageElementView.tsx`  
  Image element rendering and crop mode.

- `src/freeform/elements/ShapeElementView.tsx`  
  Rectangle/ellipse rendering and image fill.

- `src/freeform/elements/LineElementView.tsx`  
  Line and arrow rendering.

- `src/freeform/SelectionLayer.tsx`  
  Selection boxes, multi-select box, snapping guides.

- `src/freeform/TransformHandles.tsx`  
  Resize and rotate handles.

- `src/freeform/PropertiesPanel.tsx`  
  Slide and element property editing.

- `src/freeform/SizeControls.tsx`  
  Presets and custom pixel width/height.

## Milestone 0: baseline and test infrastructure

### Task 0.1: Verify baseline

**Files:**
- Read only: `package.json`
- Read only: `playwright.config.ts`

- [ ] **Step 1: Confirm clean worktree**

Run:

```powershell
git status --short --branch
```

Expected: branch is `feature/freeform-editor`; no uncommitted source changes before implementation starts.

- [ ] **Step 2: Run build baseline**

Run:

```powershell
npm run build
```

Expected: PASS. Existing Vite chunk warnings are acceptable.

- [ ] **Step 3: Run Markdown E2E baseline**

Run:

```powershell
npm run test:e2e
```

Expected: PASS with the existing Markdown regression tests.

### Task 0.2: Add unit-test infrastructure

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Install Vitest**

Run:

```powershell
npm install -D vitest
```

Expected: `package.json` and `package-lock.json` update.

- [ ] **Step 2: Add scripts**

Modify `package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "npm run test:unit && npm run test:e2e",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed"
  }
}
```

- [ ] **Step 3: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
  },
})
```

- [ ] **Step 4: Create empty test setup**

Create `src/test/setup.ts`:

```ts
export {}
```

- [ ] **Step 5: Run unit tests**

Run:

```powershell
npm run test:unit
```

Expected: PASS with no tests found or an empty passing run. If Vitest exits non-zero because no tests exist, add a tiny smoke test and remove it in Task 1 when real tests exist.

- [ ] **Step 6: Run build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add package.json package-lock.json vitest.config.ts src/test/setup.ts
git commit -m "test: add unit test infrastructure"
```

## Milestone 1: protect existing Markdown behavior while splitting the shell

### Task 1.1: Move existing app body into MarkdownWorkspace

**Files:**
- Create: `src/workspaces/types.ts`
- Create: `src/workspaces/markdown/MarkdownWorkspace.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css` only if class names need shell wrappers
- Test: `e2e/ime.spec.ts`

- [ ] **Step 1: Write E2E guard for Markdown mode visibility**

Add a test to `e2e/ime.spec.ts` or a new `e2e/markdown.spec.ts`:

```ts
test('Markdown workspace is the default workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Markdown')).toBeVisible()
  await expect(page.locator('.cm-content')).toBeVisible()
})
```

- [ ] **Step 2: Run the new E2E guard**

Run:

```powershell
npm run test:e2e -- --grep "Markdown workspace is the default workspace"
```

Expected: PASS before refactor. This is a guard, not a failing test.

- [ ] **Step 3: Create workspace type**

Create `src/workspaces/types.ts`:

```ts
export type WorkspaceMode = 'markdown-card' | 'freeform-slide'
```

- [ ] **Step 4: Move current `App` implementation**

Copy the current default export body from `src/App.tsx` into `src/workspaces/markdown/MarkdownWorkspace.tsx`.

Export:

```ts
export function MarkdownWorkspace() {
  // Existing App implementation, unchanged except component name.
}
```

Keep existing imports adjusted to relative paths.

- [ ] **Step 5: Replace App with a thin shell**

Modify `src/App.tsx`:

```tsx
import { useState } from 'react'
import type { WorkspaceMode } from './workspaces/types'
import { MarkdownWorkspace } from './workspaces/markdown/MarkdownWorkspace'

export default function App() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('markdown-card')

  return (
    <div className="app-shell" data-workspace={workspaceMode}>
      <MarkdownWorkspace />
    </div>
  )
}
```

Do not add freeform UI yet. `setWorkspaceMode` may be unused until Task 4; if strict TypeScript complains, defer the state or render a hidden placeholder only after Task 4. Do not disable `noUnusedLocals`.

- [ ] **Step 6: Run Markdown E2E**

Run:

```powershell
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 7: Run build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/App.tsx src/workspaces e2e
git commit -m "refactor: split markdown workspace from app shell"
```

## Milestone 2: versioned drafts and migration

### Task 2.1: Add draft envelope types and migration tests

**Files:**
- Modify: `src/drafts.ts`
- Create: `src/freeform/types.ts`
- Create: `src/freeform/__tests__/draftMigration.test.ts`

- [ ] **Step 1: Write failing migration tests**

Create `src/freeform/__tests__/draftMigration.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeDraftForRead } from '../../drafts'

describe('draft migration', () => {
  it('treats legacy drafts as markdown-card v2 envelopes', () => {
    const legacy = {
      id: 'old-1',
      title: 'Old',
      source: '# hello',
      platformId: 'rednote',
      themeId: 'light',
      fontFamily: 'system-ui, sans-serif',
      profile: {
        nickname: 'A',
        handle: 'a',
        location: '',
        avatarColor: '#000',
        avatarImage: null,
        verified: false,
        headerFirstPageOnly: false,
      },
      updatedAt: 1,
    }

    const migrated = normalizeDraftForRead(legacy)

    expect(migrated?.schemaVersion).toBe(2)
    expect(migrated?.mode).toBe('markdown-card')
    expect(migrated?.document.source).toBe('# hello')
    expect(migrated?.document.radius).toBe(18)
  })

  it('keeps freeform v2 drafts unchanged', () => {
    const draft = {
      id: 'free-1',
      title: 'Free',
      schemaVersion: 2,
      mode: 'freeform-slide',
      updatedAt: 2,
      document: {
        documentVersion: 1,
        activeSlideId: 's1',
        slides: [
          {
            id: 's1',
            name: 'Page 1',
            width: 1080,
            height: 1440,
            background: { type: 'solid', color: '#ffffff' },
            elements: [],
          },
        ],
      },
    }

    expect(normalizeDraftForRead(draft)).toEqual(draft)
  })
})
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/draftMigration.test.ts
```

Expected: FAIL because `normalizeDraftForRead` and freeform types do not exist.

- [ ] **Step 3: Add freeform base types**

Create `src/freeform/types.ts` with the minimum types needed by the test:

```ts
export interface FreeformDocument {
  documentVersion: 1
  slides: FreeformSlide[]
  activeSlideId: string
}

export interface FreeformSlide {
  id: string
  name: string
  width: number
  height: number
  background: SlideBackground
  elements: FreeformElement[]
}

export type SlideBackground =
  | { type: 'solid'; color: string }
  | { type: 'transparent' }

// Empty until Task 5.1 expands the union.
export type FreeformElement = never
```

Later tasks will expand `FreeformElement`.

- [ ] **Step 4: Implement draft envelope**

Modify `src/drafts.ts` to export:

```ts
export interface MarkdownCardDocument {
  source: string
  platformId: string
  themeId: string
  fontFamily: string
  profile: Profile
  radius: number
  images?: Record<string, string>
}

export interface DraftEnvelopeBase {
  id: string
  title: string
  schemaVersion: 2
  updatedAt: number
}

export type MarkdownDraft = DraftEnvelopeBase & {
  mode: 'markdown-card'
  document: MarkdownCardDocument
}

export type FreeformDraft = DraftEnvelopeBase & {
  mode: 'freeform-slide'
  document: FreeformDocument
}

export type Draft = MarkdownDraft | FreeformDraft
```

Add `normalizeDraftForRead(raw: unknown): Draft | null` that:

- returns valid v2 envelopes unchanged;
- migrates legacy objects that have `source`, `platformId`, `themeId`, `fontFamily`, and `profile`;
- fills `radius: 18` when missing;
- returns `null` for invalid objects.

- [ ] **Step 5: Run unit test**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/draftMigration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Fix MarkdownWorkspace save/open compile errors**

Update `MarkdownWorkspace` to call `saveDraft` with:

```ts
{
  id: draftId ?? undefined,
  mode: 'markdown-card',
  document: {
    source,
    platformId,
    themeId,
    fontFamily,
    profile,
    radius,
  },
}
```

When opening a Markdown draft, read fields from `draft.document`.

- [ ] **Step 7: Update image collection for Markdown documents**

Keep existing Markdown image persistence by collecting images from `document.source` for Markdown drafts.

- [ ] **Step 8: Run build and tests**

Run:

```powershell
npm run build
npm run test:unit
npm run test:e2e
```

Expected: all PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add src/drafts.ts src/freeform src/workspaces/markdown
git commit -m "feat: add versioned draft envelopes"
```

### Task 2.2: Update DraftsPanel for both modes

**Files:**
- Modify: `src/DraftsPanel.tsx`
- Modify: `src/workspaces/markdown/MarkdownWorkspace.tsx`
- Test: `src/freeform/__tests__/draftMigration.test.ts`

- [ ] **Step 1: Add display helper tests**

Add tests for helper functions if they live in `drafts.ts`:

```ts
import { draftSubtitle, draftTitle } from '../../drafts'

expect(draftSubtitle(markdownDraft)).toContain('Markdown')
expect(draftSubtitle(freeformDraft)).toContain('1 页')
```

- [ ] **Step 2: Run failing unit test**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/draftMigration.test.ts
```

Expected: FAIL until helpers exist.

- [ ] **Step 3: Implement helpers**

In `src/drafts.ts`, add:

```ts
export function draftTitle(draft: Draft): string {
  return draft.title
}

export function draftSubtitle(draft: Draft): string {
  if (draft.mode === 'markdown-card') {
    return `Markdown · ${draft.document.source.length} 字`
  }
  return `自由编辑 · ${draft.document.slides.length} 页`
}
```

- [ ] **Step 4: Update DraftsPanel rendering**

Use the helper outputs instead of directly reading `draft.source.length`.

- [ ] **Step 5: Run tests**

Run:

```powershell
npm run test:unit
npm run build
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/DraftsPanel.tsx src/drafts.ts src/freeform/__tests__/draftMigration.test.ts
git commit -m "feat: show draft modes in draft panel"
```

## Milestone 3: freeform document model, reducer, history

### Task 3.1: Implement page-size presets and document constructors

**Files:**
- Create: `src/freeform/constants.ts`
- Create/modify: `src/freeform/document.ts`
- Test: `src/freeform/__tests__/document.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/freeform/__tests__/document.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createFreeformDocument, createSlide, pageSizePresets, validatePageSize } from '../document'

describe('freeform document', () => {
  it('creates a default 3:4 document', () => {
    const doc = createFreeformDocument()
    expect(doc.slides).toHaveLength(1)
    expect(doc.slides[0].width).toBe(1080)
    expect(doc.slides[0].height).toBe(1440)
    expect(doc.activeSlideId).toBe(doc.slides[0].id)
  })

  it('creates new slides by inheriting current size', () => {
    const current = createSlide({ width: 1920, height: 1080 })
    const next = createSlide({ inheritFrom: current })
    expect(next.width).toBe(1920)
    expect(next.height).toBe(1080)
  })

  it('validates custom pixel sizes', () => {
    expect(validatePageSize(128, 128).ok).toBe(true)
    expect(validatePageSize(4096, 4096).ok).toBe(true)
    expect(validatePageSize(127, 1080).ok).toBe(false)
    expect(validatePageSize(5000, 1080).ok).toBe(false)
  })

  it('exposes required presets', () => {
    expect(pageSizePresets.map((p) => p.ratio)).toEqual(['1:1', '3:4', '4:3', '9:16', '16:9'])
  })
})
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/document.test.ts
```

Expected: FAIL because constructors do not exist.

- [ ] **Step 3: Implement constants**

Create `src/freeform/constants.ts`:

```ts
export const PAGE_SIZE_MIN = 128
export const PAGE_SIZE_MAX = 4096

export const pageSizePresets = [
  { ratio: '1:1', width: 1080, height: 1080 },
  { ratio: '3:4', width: 1080, height: 1440 },
  { ratio: '4:3', width: 1440, height: 1080 },
  { ratio: '9:16', width: 1080, height: 1920 },
  { ratio: '16:9', width: 1920, height: 1080 },
] as const
```

- [ ] **Step 4: Implement constructors**

Create `src/freeform/document.ts`:

```ts
import type { FreeformDocument, FreeformSlide } from './types'
import { PAGE_SIZE_MAX, PAGE_SIZE_MIN, pageSizePresets } from './constants'

export { pageSizePresets }

export function validatePageSize(width: number, height: number) {
  const ok =
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= PAGE_SIZE_MIN &&
    height >= PAGE_SIZE_MIN &&
    width <= PAGE_SIZE_MAX &&
    height <= PAGE_SIZE_MAX

  return ok ? { ok: true as const } : { ok: false as const, message: '页面尺寸必须在 128 到 4096 px 之间' }
}

export function createSlide(input: { width?: number; height?: number; inheritFrom?: FreeformSlide } = {}): FreeformSlide {
  const preset = pageSizePresets[1]
  const width = input.inheritFrom?.width ?? input.width ?? preset.width
  const height = input.inheritFrom?.height ?? input.height ?? preset.height

  return {
    id: crypto.randomUUID(),
    name: 'Page 1',
    width,
    height,
    background: { type: 'solid', color: '#ffffff' },
    elements: [],
  }
}

export function createFreeformDocument(): FreeformDocument {
  const slide = createSlide()
  return {
    documentVersion: 1,
    activeSlideId: slide.id,
    slides: [slide],
  }
}
```

If `crypto.randomUUID()` makes tests awkward, inject an ID factory in tests rather than using deterministic globals.

- [ ] **Step 5: Run unit test**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/document.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/freeform/constants.ts src/freeform/document.ts src/freeform/__tests__/document.test.ts
git commit -m "feat: add freeform document model"
```

### Task 3.2: Add reducer actions and history

**Files:**
- Modify: `src/freeform/types.ts`
- Modify: `src/freeform/document.ts`
- Create: `src/freeform/history.ts`
- Test: `src/freeform/__tests__/document.test.ts`
- Test: `src/freeform/__tests__/history.test.ts`

- [ ] **Step 1: Write failing reducer tests**

Add tests:

```ts
import { freeformReducer } from '../document'

it('adds a slide that inherits active slide size', () => {
  const doc = createFreeformDocument()
  const next = freeformReducer(doc, { type: 'slide/add-after-active' })
  expect(next.slides).toHaveLength(2)
  expect(next.slides[1].width).toBe(doc.slides[0].width)
  expect(next.activeSlideId).toBe(next.slides[1].id)
})

it('changes only the active slide size', () => {
  const doc = createFreeformDocument()
  const next = freeformReducer(doc, { type: 'slide/resize', slideId: doc.activeSlideId, width: 1080, height: 1920 })
  expect(next.slides[0].height).toBe(1920)
})
```

- [ ] **Step 2: Write failing history tests**

Create `src/freeform/__tests__/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createHistory, pushHistory, redo, undo } from '../history'

describe('freeform history', () => {
  it('undoes and redoes document snapshots', () => {
    const first = { value: 1 }
    const second = { value: 2 }
    let history = createHistory(first)
    history = pushHistory(history, second)
    const undone = undo(history)
    expect(undone.current).toEqual(first)
    const redone = redo(undone)
    expect(redone.current).toEqual(second)
  })
})
```

- [ ] **Step 3: Run failing tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/document.test.ts src/freeform/__tests__/history.test.ts
```

Expected: FAIL until reducer/history exist.

- [ ] **Step 4: Implement reducer action types**

In `src/freeform/types.ts`:

```ts
export type FreeformAction =
  | { type: 'slide/add-after-active' }
  | { type: 'slide/duplicate'; slideId: string }
  | { type: 'slide/delete'; slideId: string }
  | { type: 'slide/select'; slideId: string }
  | { type: 'slide/resize'; slideId: string; width: number; height: number }
  | { type: 'element/add'; slideId: string; element: FreeformElement }
  | { type: 'element/update'; slideId: string; elementId: string; patch: Partial<FreeformElement> }
  | { type: 'element/delete'; slideId: string; elementIds: string[] }
  | { type: 'element/reorder'; slideId: string; elementIds: string[]; direction: 'forward' | 'backward' | 'front' | 'back' }
```

Refine `element/update` if TypeScript rejects `Partial<FreeformElement>` for discriminated unions. Prefer a helper that updates known base fields and element-specific fields safely.

- [ ] **Step 5: Implement reducer**

In `src/freeform/document.ts`, add `freeformReducer(document, action)`. It must:

- never mutate the input document;
- preserve at least one slide;
- select a sensible active slide after deletion;
- validate page sizes before applying resize;
- keep element order as the z-order.

- [ ] **Step 6: Implement generic history**

Create `src/freeform/history.ts`:

```ts
export interface HistoryState<T> {
  past: T[]
  current: T
  future: T[]
}

export function createHistory<T>(initial: T): HistoryState<T> {
  return { past: [], current: initial, future: [] }
}

export function pushHistory<T>(history: HistoryState<T>, next: T): HistoryState<T> {
  if (Object.is(history.current, next)) return history
  return { past: [...history.past, history.current], current: next, future: [] }
}

export function undo<T>(history: HistoryState<T>): HistoryState<T> {
  const previous = history.past.at(-1)
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    current: previous,
    future: [history.current, ...history.future],
  }
}

export function redo<T>(history: HistoryState<T>): HistoryState<T> {
  const next = history.future[0]
  if (!next) return history
  return {
    past: [...history.past, history.current],
    current: next,
    future: history.future.slice(1),
  }
}
```

- [ ] **Step 7: Run tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/document.test.ts src/freeform/__tests__/history.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/freeform
git commit -m "feat: add freeform reducer and history"
```

## Milestone 4: freeform shell and page-size UI

### Task 4.1: Add workspace switch and empty FreeformWorkspace

**Files:**
- Modify: `src/App.tsx`
- Create: `src/workspaces/AppShell.tsx`
- Create: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Test: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing E2E test**

Create `e2e/freeform.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('switches to the freeform workspace', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await expect(page.getByRole('heading', { name: '自由编辑' })).toBeVisible()
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()
})
```

- [ ] **Step 2: Run failing E2E**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts
```

Expected: FAIL because no workspace switch exists.

- [ ] **Step 3: Create AppShell**

Create `src/workspaces/AppShell.tsx`:

```tsx
import { useState } from 'react'
import type { WorkspaceMode } from './types'
import { MarkdownWorkspace } from './markdown/MarkdownWorkspace'
import { FreeformWorkspace } from '../freeform/FreeformWorkspace'

export function AppShell() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('markdown-card')

  return (
    <div className="app-shell" data-workspace={workspaceMode}>
      <div className="workspace-switch" role="tablist" aria-label="工作区">
        <button type="button" onClick={() => setWorkspaceMode('markdown-card')} aria-selected={workspaceMode === 'markdown-card'}>
          Markdown 卡片
        </button>
        <button type="button" onClick={() => setWorkspaceMode('freeform-slide')} aria-selected={workspaceMode === 'freeform-slide'}>
          自由编辑
        </button>
      </div>
      {workspaceMode === 'markdown-card' ? <MarkdownWorkspace /> : <FreeformWorkspace />}
    </div>
  )
}
```

Adjust markup once existing `MarkdownWorkspace` topbar is migrated; avoid double topbars if the visual result is poor.

- [ ] **Step 4: Replace App**

Modify `src/App.tsx`:

```tsx
import { AppShell } from './workspaces/AppShell'

export default function App() {
  return <AppShell />
}
```

- [ ] **Step 5: Create FreeformWorkspace placeholder**

Create `src/freeform/FreeformWorkspace.tsx`:

```tsx
import { createFreeformDocument } from './document'

export function FreeformWorkspace() {
  const document = createFreeformDocument()
  const slide = document.slides[0]

  return (
    <section className="freeform-workspace" aria-label="自由编辑工作区">
      <header className="freeform-topbar">
        <h1>自由编辑</h1>
      </header>
      <main className="freeform-main">
        <div className="freeform-canvas" data-testid="freeform-canvas" style={{ width: slide.width / 2, height: slide.height / 2 }} />
      </main>
    </section>
  )
}
```

Replace the non-stateful `createFreeformDocument()` with reducer state in later tasks.

- [ ] **Step 6: Add minimal CSS**

Add a clearly marked Freeform section to `src/styles.css`:

```css
/* =====================================================================
   Freeform workspace
   ===================================================================== */
.freeform-workspace {
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

.freeform-main {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  place-items: center;
  background: var(--bg-sink);
}

.freeform-canvas {
  background: #fff;
  box-shadow: var(--shadow-card);
}
```

- [ ] **Step 7: Run E2E and Markdown regression**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts
npm run test:e2e -- e2e/ime.spec.ts
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/App.tsx src/workspaces src/freeform src/styles.css e2e/freeform.spec.ts
git commit -m "feat: add freeform workspace entry"
```

### Task 4.2: Implement slide list and size controls

**Files:**
- Create: `src/freeform/SlideList.tsx`
- Create: `src/freeform/SizeControls.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Test: `e2e/freeform.spec.ts`
- Test: `src/freeform/__tests__/document.test.ts`

- [ ] **Step 1: Extend E2E test**

Add:

```ts
test('sets freeform page size by preset and custom pixels', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '9:16' }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/1080 × 1920/)

  await page.getByLabel('宽度 px').fill('1200')
  await page.getByLabel('高度 px').fill('1600')
  await page.getByRole('button', { name: '应用尺寸' }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/1200 × 1600/)
})
```

- [ ] **Step 2: Run failing E2E**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "sets freeform page size"
```

Expected: FAIL until controls exist.

- [ ] **Step 3: Implement reducer-backed workspace state**

In `FreeformWorkspace`, use:

```tsx
const [document, dispatchDocument] = useReducer(freeformReducer, undefined, createFreeformDocument)
```

Track selection and tool state separately:

```ts
const [selectedElementIds, setSelectedElementIds] = useState<string[]>([])
```

- [ ] **Step 4: Create SlideList**

`SlideList` should receive `document`, `activeSlideId`, and dispatch callbacks for add, duplicate, delete, and select. First version only needs select and add.

- [ ] **Step 5: Create SizeControls**

`SizeControls` should:

- render all presets from `pageSizePresets`;
- expose labeled width/height inputs;
- validate using `validatePageSize`;
- dispatch `slide/resize` on apply;
- show the current size in `data-testid="freeform-slide-size"`.

- [ ] **Step 6: Style layout**

Freeform layout should use:

```text
topbar
main grid: slide list | canvas viewport | properties panel
```

Do not attempt final polished UI yet; keep it usable and testable.

- [ ] **Step 7: Run tests**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts
npm run test:unit -- src/freeform/__tests__/document.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/freeform src/styles.css e2e/freeform.spec.ts
git commit -m "feat: add freeform slide size controls"
```

## Milestone 5: element model and rendering

### Task 5.1: Add element types and insertion actions

**Files:**
- Modify: `src/freeform/types.ts`
- Modify: `src/freeform/document.ts`
- Test: `src/freeform/__tests__/document.test.ts`

- [ ] **Step 1: Write failing tests**

Add:

```ts
import type { TextElement } from '../types'

it('adds an element to a slide', () => {
  const doc = createFreeformDocument()
  const element: TextElement = {
    id: 't1',
    type: 'text',
    x: 100,
    y: 100,
    width: 300,
    height: 120,
    rotation: 0,
    opacity: 1,
    text: { blocks: [{ type: 'paragraph', align: 'left', runs: [{ text: 'hello' }] }] },
    verticalAlign: 'top',
    padding: 12,
    fill: { type: 'none' },
  }

  const next = freeformReducer(doc, { type: 'element/add', slideId: doc.activeSlideId, element })
  expect(next.slides[0].elements).toEqual([element])
})
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/document.test.ts
```

Expected: FAIL until element union exists.

- [ ] **Step 3: Expand element types**

In `src/freeform/types.ts`, define:

```ts
export type FreeformElement = TextElement | ImageElement | ShapeElement | LineElement

export interface BaseElement<TType extends string> {
  id: string
  type: TType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  name?: string
}

export interface TextElement extends BaseElement<'text'> {
  text: RichTextDocument
  verticalAlign: 'top' | 'middle' | 'bottom'
  padding: number
  fill: Fill
  stroke?: Stroke
}

export interface ImageElement extends BaseElement<'image'> {
  assetRef: string
  alt?: string
  fit: 'cover' | 'contain' | 'stretch'
  crop: ImageCrop
}

export interface ShapeElement extends BaseElement<'shape'> {
  shape: 'rect' | 'ellipse'
  fill: Fill
  stroke?: Stroke
  cornerRadius?: number
}

export interface LineElement extends BaseElement<'line'> {
  start: Point
  end: Point
  stroke: Stroke
  arrowStart?: ArrowHead
  arrowEnd?: ArrowHead
}
```

Also define `Fill`, `Stroke`, `ImageCrop`, `RichTextDocument`, `RichTextBlock`, `RichTextRun`, `Point`, and `ArrowHead`.

- [ ] **Step 4: Implement element reducer branches**

Add `element/add`, `element/update`, `element/delete`, and `element/reorder` support in `freeformReducer`.

- [ ] **Step 5: Run tests and build**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/document.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/freeform/types.ts src/freeform/document.ts src/freeform/__tests__/document.test.ts
git commit -m "feat: add freeform element model"
```

### Task 5.2: Render elements on the canvas

**Files:**
- Create: `src/freeform/CanvasViewport.tsx`
- Create: `src/freeform/SlideCanvas.tsx`
- Create: `src/freeform/ElementRenderer.tsx`
- Create: `src/freeform/elements/TextElementView.tsx`
- Create: `src/freeform/elements/ImageElementView.tsx`
- Create: `src/freeform/elements/ShapeElementView.tsx`
- Create: `src/freeform/elements/LineElementView.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Test: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing E2E**

Add:

```ts
test('inserts and renders basic freeform elements', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '文本' }).click()
  await expect(page.getByText('双击编辑文本')).toBeVisible()

  await page.getByRole('button', { name: '矩形' }).click()
  await expect(page.getByTestId('freeform-element-shape')).toBeVisible()

  await page.getByRole('button', { name: '圆形' }).click()
  await expect(page.getByTestId('freeform-element-ellipse')).toBeVisible()
})
```

- [ ] **Step 2: Run failing E2E**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "inserts and renders"
```

Expected: FAIL until buttons and renderers exist.

- [ ] **Step 3: Create CanvasViewport**

Responsibilities:

- render scrollable stage;
- apply zoom transform to slide;
- keep document coordinates independent of zoom.

- [ ] **Step 4: Create SlideCanvas**

Responsibilities:

- render one slide with width/height from `FreeformSlide`;
- render background;
- render `ElementRenderer` for each element in array order.

- [ ] **Step 5: Create ElementRenderer and views**

Each element view should:

- position itself with `left`, `top`, `width`, `height`;
- apply `transform: rotate(...)`;
- set `opacity`;
- not render edit handles inside the element view.

For line/arrow, use SVG inside the element bounding box.

- [ ] **Step 6: Add toolbar insert buttons**

In `FreeformToolbar`, add buttons:

- 文本
- 图片
- 矩形
- 圆形
- 直线
- 箭头

For this task, image button may be disabled or show a file input shell; full image insertion comes later.

- [ ] **Step 7: Wire insert actions**

Insert default elements at a visible default position near the center of the active slide.

- [ ] **Step 8: Run E2E, unit, build**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts
npm run test:unit
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add src/freeform src/styles.css e2e/freeform.spec.ts
git commit -m "feat: render freeform elements"
```

## Milestone 6: selection, transforms, and keyboard editing

### Task 6.1: Geometry helpers

**Files:**
- Create: `src/freeform/geometry.ts`
- Test: `src/freeform/__tests__/geometry.test.ts`

- [ ] **Step 1: Write failing geometry tests**

Create tests for:

- moving by delta;
- resizing from a corner;
- keeping aspect ratio with Shift;
- rotating by angle;
- computing unrotated bounds;
- clamping minimum size.

Example:

```ts
import { describe, expect, it } from 'vitest'
import { moveBounds, resizeBounds } from '../geometry'

describe('geometry', () => {
  it('moves bounds by delta', () => {
    expect(moveBounds({ x: 10, y: 20, width: 100, height: 50 }, 5, -10)).toEqual({
      x: 15,
      y: 10,
      width: 100,
      height: 50,
    })
  })

  it('keeps aspect ratio during shift resize', () => {
    const next = resizeBounds(
      { x: 0, y: 0, width: 100, height: 50 },
      { handle: 'se', dx: 100, dy: 0, keepAspect: true },
    )
    expect(next.width / next.height).toBeCloseTo(2)
  })
})
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/geometry.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement geometry helpers**

Implement pure helpers with no React imports:

```ts
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}
```

Functions:

- `moveBounds(bounds, dx, dy)`
- `resizeBounds(bounds, input)`
- `rotatePoint(point, center, degrees)`
- `elementBounds(element)`
- `multiSelectionBounds(elements)`

- [ ] **Step 4: Run tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/geometry.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/freeform/geometry.ts src/freeform/__tests__/geometry.test.ts
git commit -m "feat: add freeform geometry helpers"
```

### Task 6.2: Selection layer and pointer transforms

**Files:**
- Create: `src/freeform/SelectionLayer.tsx`
- Create: `src/freeform/TransformHandles.tsx`
- Modify: `src/freeform/SlideCanvas.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Test: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing E2E**

Add:

```ts
test('selects and moves an element', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '文本' }).click()
  const element = page.getByTestId('freeform-element-text').first()
  await element.click()
  await expect(page.getByTestId('freeform-selection-box')).toBeVisible()

  const before = await element.boundingBox()
  await element.dragTo(page.getByTestId('freeform-canvas'), { targetPosition: { x: 300, y: 300 } })
  const after = await element.boundingBox()
  expect(after!.x).not.toBe(before!.x)
})
```

Adjust the drag code if Playwright's `dragTo` is unreliable; use `mouse.move/down/up` with element bounding boxes.

- [ ] **Step 2: Run failing E2E**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "selects and moves"
```

Expected: FAIL.

- [ ] **Step 3: Implement selection state**

In `FreeformWorkspace`, maintain:

```ts
const [selectedElementIds, setSelectedElementIds] = useState<string[]>([])
```

Selection rules:

- click selects one;
- Shift-click toggles;
- empty canvas click clears.

- [ ] **Step 4: Implement SelectionLayer**

Render selection boxes based on selected elements. Use data-testid:

- `freeform-selection-box`
- `freeform-transform-handle-nw`, etc.
- `freeform-rotate-handle`

- [ ] **Step 5: Implement pointer move**

During pointer move:

- record initial pointer and element bounds;
- update a transient preview or dispatch final patch on pointer up;
- commit only once to history on pointer up in Task 6.3.

- [ ] **Step 6: Implement resize and rotate handles**

Use `geometry.ts` helpers. Support:

- eight resize handles;
- Shift aspect ratio;
- rotate handle.

- [ ] **Step 7: Add keyboard nudge and delete**

Keyboard rules:

- arrow = move 1 px;
- Shift + arrow = move 10 px;
- Delete/Backspace = delete selected;
- do not delete canvas elements when focus is inside a text editor.

- [ ] **Step 8: Run E2E and unit tests**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts
npm run test:unit
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add src/freeform src/styles.css e2e/freeform.spec.ts
git commit -m "feat: add freeform selection and transforms"
```

### Task 6.3: Connect transforms to history

**Files:**
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/freeform/history.ts`
- Test: `src/freeform/__tests__/history.test.ts`

- [ ] **Step 1: Write failing history batching test**

Add:

```ts
it('stores one history entry for a committed drag', () => {
  const initial = { value: 1 }
  const dragged = { value: 2 }
  let history = createHistory(initial)
  history = pushHistory(history, dragged, { label: 'drag' })
  expect(history.past).toHaveLength(1)
})
```

If labels are not needed, keep the API simple and test that workspace code only calls `pushHistory` on pointer up.

- [ ] **Step 2: Implement workspace history integration**

`FreeformWorkspace` should hold:

```ts
const [history, setHistory] = useState(() => createHistory(createFreeformDocument()))
const document = history.current
```

Use helper:

```ts
function commit(action: FreeformAction) {
  setHistory((current) => pushHistory(current, freeformReducer(current.current, action)))
}
```

Use transient state for in-progress drags to avoid adding every pointer move to history.

- [ ] **Step 3: Wire undo/redo buttons and shortcuts**

Support:

- Ctrl/Cmd + Z
- Ctrl/Cmd + Shift + Z
- Ctrl/Cmd + Y

- [ ] **Step 4: Run tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/history.test.ts
npm run test:e2e -- e2e/freeform.spec.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/freeform
git commit -m "feat: wire freeform undo redo history"
```

## Milestone 7: rich text, images, shape fills

### Task 7.1: Rich text model and text editing

**Files:**
- Create: `src/freeform/richText.ts`
- Modify: `src/freeform/elements/TextElementView.tsx`
- Modify: `src/freeform/PropertiesPanel.tsx`
- Test: `src/freeform/__tests__/richText.test.ts`
- Test: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write rich-text unit tests**

Create `src/freeform/__tests__/richText.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { plainTextToRichText, richTextToPlainText, updateRunStyle } from '../richText'

describe('rich text', () => {
  it('converts pasted plain text into paragraphs', () => {
    const doc = plainTextToRichText('第一行\n第二行')
    expect(doc.blocks).toHaveLength(2)
    expect(richTextToPlainText(doc)).toBe('第一行\n第二行')
  })

  it('updates a run style', () => {
    const doc = plainTextToRichText('hello')
    const next = updateRunStyle(doc, { bold: true })
    expect(next.blocks[0].runs[0].bold).toBe(true)
  })
})
```

- [ ] **Step 2: Add E2E for Chinese text edit**

Add:

```ts
test('edits Chinese text inside a freeform text box', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '文本' }).click()
  await page.getByTestId('freeform-element-text').dblclick()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('自由排版')
  await expect(page.getByText('自由排版')).toBeVisible()
})
```

- [ ] **Step 2b: Add local style E2E**

Add a test that proves styling can apply to only part of a text box:

```ts
test('applies style to selected text inside one text box', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '文本' }).click()
  await page.getByTestId('freeform-element-text').dblclick()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('局部样式测试')
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.up('Shift')
  await page.getByRole('button', { name: '加粗' }).click()
  await expect(page.getByTestId('freeform-text-run-bold')).toContainText('局部')
})
```

- [ ] **Step 3: Run failing tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/richText.test.ts
npm run test:e2e -- e2e/freeform.spec.ts --grep "Chinese text"
```

Expected: FAIL.

- [ ] **Step 4: Implement richText helpers**

Implement pure helpers:

- `plainTextToRichText(text)`
- `richTextToPlainText(doc)`
- `updateRunStyle(doc, stylePatch)`
- `normalizeRichText(doc)`

- [ ] **Step 5: Implement TextElementView editing**

Use `contentEditable` for the first shippable version:

- double-click enters editing;
- paste handler inserts plain text only;
- blur commits `RichTextDocument`;
- Escape exits editing without crashing;
- IME composition should not be interrupted by React re-render loops.

The implementation must track the browser selection range while editing and map it back to rich-text offsets. Do not finish this task with a whole-textbox-only styling fallback.

- [ ] **Step 6: Add text style controls**

In `PropertiesPanel`, when text selected, support:

- bold;
- italic;
- underline;
- color;
- font size;
- font family;
- left/center/right align.

When text is selected inside the active text box, style buttons must split runs and apply the style only to the selected text. When there is no selection, style buttons may update the current typing style for subsequent input.

- [ ] **Step 7: Run tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/richText.test.ts
npm run test:e2e -- e2e/freeform.spec.ts
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/freeform e2e/freeform.spec.ts
git commit -m "feat: add freeform text editing"
```

### Task 7.2: Structured assets and image insertion

**Files:**
- Create: `src/freeform/assetStore.ts`
- Modify: `src/imageStore.ts` if shared helpers need export
- Modify: `src/freeform/elements/ImageElementView.tsx`
- Modify: `src/freeform/FreeformToolbar.tsx`
- Test: `src/freeform/__tests__/assetStore.test.ts`
- Test: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write asset tests**

Create tests for:

- creating an asset record from data URL metadata;
- collecting asset refs from image elements and image fills;
- estimating JSON byte size.

Example:

```ts
import { describe, expect, it } from 'vitest'
import { collectAssetRefsFromDocument, estimateJsonBytes } from '../assetStore'

describe('freeform assets', () => {
  it('collects asset refs from image elements and fills', () => {
    const refs = collectAssetRefsFromDocument({
      documentVersion: 1,
      activeSlideId: 's1',
      slides: [
        {
          id: 's1',
          name: 'Page 1',
          width: 1080,
          height: 1440,
          background: { type: 'solid', color: '#fff' },
          elements: [{ id: 'i1', type: 'image', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, assetRef: 'img:a', fit: 'cover', crop: { scale: 1, offsetX: 0, offsetY: 0 } }],
        },
      ],
    })
    expect(refs).toEqual(['img:a'])
  })

  it('estimates JSON bytes', () => {
    expect(estimateJsonBytes({ a: '中' })).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/assetStore.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement assetStore**

`src/freeform/assetStore.ts` should export:

- `AssetRecord`;
- `collectAssetRefsFromDocument(document)`;
- `estimateJsonBytes(value)`;
- `fileToAsset(file)`;
- `assetToImageElement(asset, position)`.

Reuse `downscaleDataUrl` and `putImage` when possible.

- [ ] **Step 4: Wire image insertion**

Toolbar image button opens a file input. On file selection:

- read file;
- downscale;
- store asset;
- create `ImageElement`;
- insert into active slide.

- [ ] **Step 5: Render image element**

Use CSS object-fit for first version:

```css
.freeform-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

Crop controls are added in the next task.

- [ ] **Step 6: Add E2E with a fixture**

Create a tiny test image fixture if needed under `e2e/fixtures/`. Use Playwright `setInputFiles`.

- [ ] **Step 7: Run tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/assetStore.test.ts
npm run test:e2e -- e2e/freeform.spec.ts
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/freeform src/imageStore.ts e2e
git commit -m "feat: add freeform image assets"
```

### Task 7.3: Shape image fill and crop controls

**Files:**
- Modify: `src/freeform/elements/ShapeElementView.tsx`
- Modify: `src/freeform/elements/ImageElementView.tsx`
- Modify: `src/freeform/PropertiesPanel.tsx`
- Modify: `src/freeform/assetStore.ts`
- Test: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write E2E for shape image fill**

Add:

```ts
test('fills a rectangle shape with an image', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '矩形' }).click()
  await page.getByTestId('freeform-element-shape').click()
  await page.getByRole('button', { name: '图片填充' }).click()
  await page.getByLabel('选择填充图片').setInputFiles('e2e/fixtures/tiny.png')
  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
})
```

- [ ] **Step 2: Run failing E2E**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "fills a rectangle"
```

Expected: FAIL.

- [ ] **Step 3: Implement fill controls**

In `PropertiesPanel`, for selected shape:

- fill none;
- solid color;
- image fill;
- replace image;
- remove image.

- [ ] **Step 4: Render image fill**

For rectangle, use a child `<img>` clipped by overflow hidden. For ellipse, use border-radius `50%` and overflow hidden.

- [ ] **Step 5: Implement crop edit mode**

First version:

- double-click image or image-filled shape enters crop mode;
- mouse wheel or slider changes `crop.scale`;
- dragging changes `crop.offsetX`/`crop.offsetY`;
- Enter or blur commits.

- [ ] **Step 6: Run tests and build**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts
npm run test:unit
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/freeform e2e/freeform.spec.ts
git commit -m "feat: add shape image fills"
```

## Milestone 8: alignment, snapping, layers, clipboard

### Task 8.1: Alignment, distribution, and snapping helpers

**Files:**
- Modify: `src/freeform/geometry.ts`
- Test: `src/freeform/__tests__/geometry.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for:

- left/center/right align;
- top/middle/bottom align;
- horizontal distribution;
- vertical distribution;
- snapping to slide center;
- snapping to another element edge.

- [ ] **Step 2: Run failing tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/geometry.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement helpers**

Add:

- `alignElements(elements, alignment)`;
- `distributeElements(elements, axis)`;
- `computeSnapGuides(movingBounds, otherBounds, slideBounds)`.

Snap threshold should start at 6 px in document coordinates.

- [ ] **Step 4: Run tests**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/geometry.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/freeform/geometry.ts src/freeform/__tests__/geometry.test.ts
git commit -m "feat: add freeform alignment geometry"
```

### Task 8.2: UI for layers, alignment, distribution, copy/paste

**Files:**
- Modify: `src/freeform/FreeformToolbar.tsx`
- Modify: `src/freeform/PropertiesPanel.tsx`
- Modify: `src/freeform/SelectionLayer.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Test: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write E2E**

Add tests for:

- select two elements and align left;
- copy/paste selected element with 16 px offset;
- bring element to front;
- delete selected element.

- [ ] **Step 2: Run failing E2E**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "align|copy|front|delete"
```

Expected: FAIL.

- [ ] **Step 3: Add toolbar actions**

Buttons:

- 左对齐;
- 水平居中;
- 右对齐;
- 顶对齐;
- 垂直居中;
- 底对齐;
- 水平均分;
- 垂直均分;
- 上移一层;
- 下移一层;
- 置于顶层;
- 置于底层.

Disable actions that require multiple selection when fewer than two elements are selected.

- [ ] **Step 4: Implement clipboard**

In-memory app clipboard is acceptable for first version:

```ts
const [clipboard, setClipboard] = useState<FreeformElement[]>([])
```

Ctrl/Cmd+C stores selected elements. Ctrl/Cmd+V clones them with new IDs and `x + 16`, `y + 16`.

- [ ] **Step 5: Render snapping guides**

During drag/resize, compute guides and render them in `SelectionLayer`. Do not export these guides.

- [ ] **Step 6: Run tests**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts
npm run test:unit
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/freeform e2e/freeform.spec.ts
git commit -m "feat: add freeform alignment and clipboard"
```

## Milestone 9: persistence and export

### Task 9.0: Lift draft and auth state into the app shell

**Files:**
- Create: `src/workspaces/useDraftController.ts`
- Modify: `src/workspaces/AppShell.tsx`
- Modify: `src/workspaces/markdown/MarkdownWorkspace.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/DraftsPanel.tsx`
- Test: `e2e/ime.spec.ts`
- Test: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write cross-workspace draft controller notes as tests**

Add E2E coverage that proves opening the draft drawer from the app shell still works in Markdown mode:

```ts
test('opens the shared draft drawer from markdown mode', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /草稿/ }).click()
  await expect(page.getByText(/草稿/)).toBeVisible()
})
```

If the app requires login before the drawer opens, assert the existing auth modal instead and keep the behavior unchanged.

- [ ] **Step 2: Create shared controller hook**

Create `src/workspaces/useDraftController.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { current as currentUser, logout as authLogout, type User } from '../auth'
import { deleteDraft, listDrafts, saveDraft, type Draft } from '../drafts'

export function useDraftController() {
  const [user, setUser] = useState<User | null>(() => currentUser())
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshDrafts = useCallback(() => {
    setDrafts(user ? listDrafts(user.id) : [])
  }, [user])

  useEffect(() => {
    refreshDrafts()
  }, [refreshDrafts])

  return {
    user,
    setUser,
    logout: () => {
      authLogout()
      setUser(null)
      setActiveDraftId(null)
      setDrafts([])
    },
    drafts,
    activeDraftId,
    setActiveDraftId,
    savedAt,
    setSavedAt,
    error,
    setError,
    refreshDrafts,
    deleteDraft: (id: string) => {
      if (!user) return
      deleteDraft(user.id, id)
      if (id === activeDraftId) setActiveDraftId(null)
      refreshDrafts()
    },
    save: (data: Parameters<typeof saveDraft>[1]) => {
      if (!user) return null
      const saved = saveDraft(user.id, data)
      setActiveDraftId(saved.id)
      setSavedAt(saved.updatedAt)
      refreshDrafts()
      return saved
    },
  }
}
```

Adjust the code to match the final `saveDraft` signature from Task 2.1.

- [ ] **Step 3: Move AuthModal and DraftsPanel ownership**

`AppShell` should own:

- `showAuth`;
- `showDrafts`;
- the `useDraftController()` result;
- `AuthModal`;
- `DraftsPanel`;
- `openDraft(draft)`, which switches `WorkspaceMode` based on `draft.mode`.

- [ ] **Step 4: Pass draft controller props into workspaces**

`MarkdownWorkspace` receives only the pieces it needs:

- current user;
- active draft id;
- savedAt;
- `requestAuth()`;
- `requestDrafts()`;
- `saveMarkdownDraft(document)`;
- `onDirty()`.

`FreeformWorkspace` receives equivalent props in Task 9.1.

- [ ] **Step 5: Preserve Markdown behavior**

Remove duplicated auth/draft state from `MarkdownWorkspace` only after AppShell props are wired. The Markdown topbar should still show save, drafts, login/logout controls as before.

- [ ] **Step 6: Run regression tests**

Run:

```powershell
npm run test:e2e -- e2e/ime.spec.ts
npm run test:e2e -- e2e/freeform.spec.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/workspaces src/freeform src/DraftsPanel.tsx e2e
git commit -m "refactor: share draft state across workspaces"
```

### Task 9.1: Save and restore freeform drafts

**Files:**
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/workspaces/AppShell.tsx`
- Modify: `src/workspaces/useDraftController.ts`
- Modify: `src/drafts.ts`
- Modify: `src/DraftsPanel.tsx`
- Test: `e2e/freeform.spec.ts`
- Test: `src/freeform/__tests__/draftMigration.test.ts`

- [ ] **Step 1: Write E2E**

Add:

```ts
test('saves and restores a freeform draft after reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '文本' }).click()
  await page.getByRole('button', { name: '保存草稿' }).click()
  await page.reload()
  await page.getByRole('button', { name: /草稿/ }).click()
  await page.getByText(/自由编辑/).click()
  await expect(page.getByText('双击编辑文本')).toBeVisible()
})
```

If auth currently blocks saving, drive the existing auth modal in the test. Do not add a production bypass and do not weaken auth behavior.

- [ ] **Step 2: Run failing E2E**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "saves and restores"
```

Expected: FAIL until freeform save exists.

- [ ] **Step 3: Implement freeform save**

Save envelope:

```ts
{
  mode: 'freeform-slide',
  document,
}
```

Title:

- first non-empty text element if present;
- else `自由编辑作品`;
- include page count in subtitle, not title.

- [ ] **Step 4: Implement save errors**

When localStorage quota or JSON serialization fails:

- show visible error;
- keep the current in-memory document;
- do not claim saved.

- [ ] **Step 5: Implement open freeform draft**

Opening a freeform draft switches to `freeform-slide` workspace and restores the document.

- [ ] **Step 6: Run tests**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts
npm run test:unit
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/freeform src/drafts.ts src/DraftsPanel.tsx e2e/freeform.spec.ts
git commit -m "feat: save freeform drafts"
```

### Task 9.2: Export service and single-page PNG

**Files:**
- Create: `src/freeform/exportFreeform.tsx`
- Modify: `src/freeform/FreeformToolbar.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/exportZip.ts` if naming helper is needed
- Test: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write E2E download test**

Add:

```ts
test('exports the current freeform slide as PNG', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前页 PNG' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/slide-01\.png/)
})
```

- [ ] **Step 2: Run failing E2E**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "exports the current"
```

Expected: FAIL.

- [ ] **Step 3: Implement export renderer**

`exportFreeform.tsx` should:

- create an offscreen DOM node;
- render a slide using the same element renderers or export-safe equivalents;
- call `toPng` with `width: slide.width`, `height: slide.height`, `pixelRatio: 1`;
- remove export node in `finally`;
- exclude selection UI by not rendering it in export tree.

- [ ] **Step 4: Add export button**

Button label: `导出当前页 PNG`.

On error, show visible message.

- [ ] **Step 5: Run E2E and build**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "exports the current"
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/freeform src/exportZip.ts e2e/freeform.spec.ts
git commit -m "feat: export freeform slide png"
```

### Task 9.3: Multi-page ZIP and mixed-size warning

**Files:**
- Modify: `src/freeform/exportFreeform.tsx`
- Modify: `src/freeform/FreeformToolbar.tsx`
- Modify: `src/exportZip.ts`
- Test: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write E2E**

Add:

```ts
test('exports mixed-size freeform slides as a zip after warning', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '9:16' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await page.getByRole('button', { name: '16:9' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '打包导出全部' }).click()
  await expect(page.getByText(/不同尺寸页面/)).toBeVisible()
  await page.getByRole('button', { name: '继续导出' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/freeform-slides-.*\.zip/)
})
```

- [ ] **Step 2: Run failing E2E**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "mixed-size"
```

Expected: FAIL.

- [ ] **Step 3: Implement mixed-size detection**

Helper:

```ts
export function hasMixedSlideSizes(slides: FreeformSlide[]): boolean {
  const first = slides[0]
  return slides.some((slide) => slide.width !== first.width || slide.height !== first.height)
}
```

- [ ] **Step 4: Implement ZIP export**

Render slides in order and call `downloadZip`. ZIP file names should be:

```text
slide-01.png
slide-02.png
```

Use a zip name like:

```text
freeform-slides-YYYY-MM-DD.zip
```

- [ ] **Step 5: Run E2E, unit, build**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts
npm run test:unit
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/freeform src/exportZip.ts e2e/freeform.spec.ts
git commit -m "feat: export freeform slides zip"
```

## Milestone 10: docs, version, final verification

### Task 10.1: Update docs and version

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create or modify: `README.md`
- Create or modify: `CHANGELOG.md`
- Create: `docs/freeform-draft-schema.md`

- [ ] **Step 1: Bump package version**

Change `0.1.0` to `0.2.0` in:

- `package.json`
- top-level `package-lock.json` version
- root package entry in `package-lock.json`

- [ ] **Step 2: Add README**

README must include:

- install: `npm ci`;
- dev: `npm run dev`;
- build: `npm run build`;
- test: `npm run test`;
- Markdown 卡片模式说明;
- 自由编辑模式说明;
- 本地账号/本地草稿限制;
- 图片容量限制;
- 不跨设备同步.

- [ ] **Step 3: Add draft schema doc**

`docs/freeform-draft-schema.md` must describe:

- v1 legacy Markdown draft shape;
- v2 `DraftEnvelope`;
- `mode: 'markdown-card' | 'freeform-slide'`;
- freeform document coordinate system;
- migration behavior.

- [ ] **Step 4: Add CHANGELOG**

`CHANGELOG.md` entry:

```md
## 0.2.0 - 2026-07-10

- Added independent freeform editing workspace.
- Added per-slide size presets and custom pixel sizes.
- Added text, image, shape, line, arrow elements.
- Added freeform draft persistence and PNG/ZIP export.
- Preserved existing Markdown card workflow.
```

- [ ] **Step 5: Run build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add package.json package-lock.json README.md CHANGELOG.md docs/freeform-draft-schema.md
git commit -m "docs: document freeform editor release"
```

### Task 10.2: Final verification and code review request

**Files:**
- Read only: all changed files

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm run build
npm run test:unit
npm run test:e2e
```

Expected: all PASS.

- [ ] **Step 2: Inspect git status**

Run:

```powershell
git status --short --branch
```

Expected: clean worktree on `feature/freeform-editor`.

- [ ] **Step 3: Inspect commit history**

Run:

```powershell
git log --oneline --decorate -12
```

Expected: recent commits correspond to the task sequence.

- [ ] **Step 4: Request code review**

Use @superpowers:requesting-code-review. Provide:

- spec path;
- plan path;
- changed file summary;
- verification commands and outputs.

- [ ] **Step 5: Address review**

If review returns issues, use @superpowers:receiving-code-review before making changes.

- [ ] **Step 6: Finish branch**

After review approval and verification, use @superpowers:finishing-a-development-branch to decide whether to merge, create PR, or keep the branch for manual review.

## Acceptance checklist

- [ ] Existing Markdown card workflow still works.
- [ ] Existing Markdown E2E tests pass.
- [ ] User can switch to Freeform workspace.
- [ ] User can create multiple slides.
- [ ] Each slide can have independent size.
- [ ] New slides inherit the current slide size.
- [ ] Presets `1:1`, `3:4`, `4:3`, `9:16`, `16:9` exist.
- [ ] Custom pixel width/height works from 128 to 4096 px.
- [ ] User can insert text, image, rectangle, ellipse, line, arrow.
- [ ] User can select, multi-select, move, resize, rotate, copy, paste, delete.
- [ ] User can align and distribute selected elements.
- [ ] Snapping guides show during drag/resize and do not export.
- [ ] Shape image fill works for rectangle and ellipse.
- [ ] Text editing supports Chinese input.
- [ ] Freeform drafts save and restore.
- [ ] Legacy Markdown drafts migrate and remain readable.
- [ ] Current slide exports as PNG at exact slide dimensions.
- [ ] Multi-slide ZIP export works.
- [ ] Mixed-size ZIP export warns but does not block after confirmation.
- [ ] Save/export/image errors are visible to the user.
- [ ] Version is `0.2.0`.
- [ ] README, changelog, and draft schema docs are present.
