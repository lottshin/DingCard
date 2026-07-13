# App Header and Freeform UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved A-style two-level app header and a polished, consistent freeform editor UI without changing Markdown content behavior, freeform document data, draft format, or exported artwork.

**Architecture:** Move app-wide theme and account state into `AppShell`, render one shared `AppHeader`, and keep save/draft/export state inside each continuously mounted workspace. Add focused components for workspace toolbar layout, page-size editing, insert menus, and inspector sections while preserving the existing reducer/history/export contracts. Gate global keyboard behavior with `isActive`, use stable accessible selectors, and keep all app chrome CSS outside the exported artboard.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Playwright with system Chrome, existing localStorage auth/drafts, existing freeform reducer/history, html-to-image, CSS custom properties.

---

## Required skills during execution

- Use `@superpowers:test-driven-development` for every behavior change: add the failing test, confirm RED, implement minimally, confirm GREEN.
- Use `@frontend-design` for Tasks 3, 6, and 7 so the final UI follows the approved prototype instead of becoming a generic toolbar reskin.
- Use `@superpowers:systematic-debugging` before changing code in response to any unexpected test or browser failure.
- Use `@superpowers:verification-before-completion` before each completion claim and before the final handoff.
- Use `@superpowers:requesting-code-review` after Task 8 and before the version bump.

## File structure

### Create

- `src/workspaces/AppHeader.tsx`
  - Shared product brand, workspace tabs, app theme control, and account control.
- `src/workspaces/WorkspaceToolbar.tsx`
  - Structural toolbar primitives: root, left/right groups, divider, icon-label handling.
- `src/freeform/FreeformPageSizePopover.tsx`
  - Current size trigger, ratio presets, custom width/height drafts, validation, focus/escape/outside-click behavior.
- `src/freeform/FreeformInsertMenu.tsx`
  - Accessible shape and line/arrow menus that call existing insertion handlers.
- `src/freeform/InspectorSection.tsx`
  - Shared inspector section title, spacing, separator, optional danger tone.

### Modify

- `src/workspaces/AppShell.tsx`
  - Own global mode/theme/account/auth-modal state, render `AppHeader`, pass `user`, `requestAuth`, and `isActive` into workspaces.
- `src/workspaces/types.ts`
  - Keep `WorkspaceMode` and add the shared shell-to-workspace prop contract.
- `src/workspaces/markdown/MarkdownWorkspace.tsx`
  - Accept shell props, remove duplicate brand/theme/auth UI, reset user-scoped draft identity on account change, render contextual toolbar.
- `src/freeform/FreeformWorkspace.tsx`
  - Accept shell props, gate keyboard listeners, reset user-scoped draft identity, use new toolbar/popover/menu/section components, preserve reducer and export code.
- `src/styles.css`
  - Add A-layout chrome, shared toolbar tokens, responsive rules, polished three-column freeform layout, custom control states, dark/reduced-motion handling.
- `e2e/freeform.spec.ts`
  - Replace positional selectors, add header/account/keyboard/menu/size/responsive/dark/export regression coverage.
- `e2e/ime.spec.ts`
  - Keep the default-workspace assertion aligned with real tab semantics.
- `package.json`, `package-lock.json`
  - Minor version bump from `0.6.3` to `0.7.0` after all behavior and visual tests pass.
- `docs/superpowers/specs/2026-07-13-app-header-freeform-ui-refresh-design.md`
  - Only update status if implementation discoveries change a documented contract; do not rewrite the approved design during coding.

## Stable public UI contracts

Use these names consistently in components and tests:

```ts
import type { User } from '../auth'

export interface WorkspaceShellProps {
  isActive: boolean
  user: User | null
  requestAuth: () => void
}
```

Stable test IDs:

```text
app-header
workspace-tab-markdown
workspace-tab-freeform
theme-toggle
account-login
account-logout
markdown-toolbar
freeform-toolbar
page-size-trigger
page-size-popover
insert-text
insert-image
insert-shape
insert-line
freeform-primary-export
```

Do not preserve `.freeform-toolbar .bar-btn:nth(...)` behavior. Update tests to accessible names or the IDs above.

---

### Task 1: Isolate hidden workspace keyboard behavior

**Files:**
- Modify: `e2e/freeform.spec.ts`
- Modify: `src/workspaces/AppShell.tsx`
- Modify: `src/workspaces/markdown/MarkdownWorkspace.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`

- [ ] **Step 1: Write the failing hidden-workspace keyboard regression**

Add these independent tests near the existing keyboard tests in `e2e/freeform.spec.ts`. Keep Delete and undo in separate tests so one hidden shortcut cannot cancel the other and produce a false GREEN:

```ts
test('hidden freeform workspace does not handle Delete', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '矩形' }).click()

  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(1)
  await elements.first().click()

  await page.getByRole('button', { name: 'Markdown 卡片' }).click()
  await page.keyboard.press('Delete')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await expect(elements).toHaveCount(1)
})

test('hidden freeform workspace does not handle undo', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await page.getByRole('button', { name: '矩形' }).click()
  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(1)

  await page.getByRole('button', { name: 'Markdown 卡片' }).click()
  await page.keyboard.press('Control+z')
  await page.getByRole('button', { name: '自由编辑' }).click()
  await expect(elements).toHaveCount(1)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm run test:e2e -- --grep "hidden freeform workspace" --reporter=line
```

Expected: FAIL because the always-mounted freeform window `keydown` listener deletes or mutates the hidden selection.

- [ ] **Step 3: Add the active-workspace contract**

In `AppShell.tsx`, pass explicit activity only; Task 2 will widen the props with user/auth state:

```tsx
<MarkdownWorkspace isActive={workspaceMode === 'markdown-card'} />
<FreeformWorkspace isActive={workspaceMode === 'freeform-slide'} />
```

For this task, define a local `{ isActive: boolean }` prop type in each workspace. Task 2 replaces it with the shared `WorkspaceShellProps`; do not introduce placeholder `user` variables before AppShell owns them.

In `FreeformWorkspace.tsx`, add `if (!isActive) return` as the first statement of the existing keyboard `useEffect`. Keep the current `onKey` body and the no-dependency effect shape unchanged so it still captures the latest document state:

```ts
useEffect(() => {
  if (!isActive) return

  const onKey = (event: KeyboardEvent) => {
    // Keep every current Ctrl/Cmd, arrow, Delete/Backspace, and Escape branch here unchanged.
  }

  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
})
```

In `MarkdownWorkspace.tsx`, close its right-click context menu when inactive:

```ts
useEffect(() => {
  if (!isActive) setCtx(null)
}, [isActive])
```

Do not clear freeform history, selection, clipboard, active slide, or unsaved content.

- [ ] **Step 4: Run targeted and keyboard regression tests**

```powershell
npm run test:e2e -- --grep "hidden freeform workspace|keyboard" --reporter=line
```

Expected: all matched tests PASS.

- [ ] **Step 5: Check naming and commit**

```powershell
rg -n "isActive" src\workspaces src\freeform
git diff --check
git add e2e/freeform.spec.ts src/workspaces/AppShell.tsx src/workspaces/markdown/MarkdownWorkspace.tsx src/freeform/FreeformWorkspace.tsx
git commit -m "fix: isolate inactive workspace shortcuts"
```

---

### Task 2: Add the global app header and lift theme/account state

**Files:**
- Create: `src/workspaces/AppHeader.tsx`
- Modify: `src/workspaces/AppShell.tsx`
- Modify: `src/workspaces/types.ts`
- Modify: `src/workspaces/markdown/MarkdownWorkspace.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`
- Modify: `e2e/ime.spec.ts`

- [ ] **Step 1: Write failing global-header tests**

Add tests covering one header, tab semantics, theme persistence, and account persistence:

```ts
test('global header owns workspace tabs, theme, and account state', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await expect(page.getByTestId('app-header')).toHaveCount(1)
  await expect(page.getByTestId('workspace-tab-markdown')).toHaveAttribute('aria-selected', 'true')

  await page.getByTestId('theme-toggle').click()
  const theme = await page.locator('html').getAttribute('data-theme')

  await page.getByTestId('workspace-tab-freeform').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme!)

  await page.getByTestId('account-login').click()
  await page.getByRole('button', { name: '注册' }).click()
  await page.getByLabel('用户名').fill(`header-${Date.now()}`)
  await page.getByLabel('密码').fill('1234')
  await page.getByRole('button', { name: '创建账号' }).click()

  await expect(page.getByTestId('account-logout')).toBeVisible()
  await page.getByTestId('workspace-tab-markdown').click()
  await expect(page.getByTestId('account-logout')).toBeVisible()
})
```

Update the default workspace test in `e2e/ime.spec.ts` to assert `role="tab"` and the linked tabpanel.

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:e2e -- --grep "global header owns|default workspace" --reporter=line
```

Expected: FAIL because `AppHeader` and stable IDs do not exist and theme/account state is still duplicated.

- [ ] **Step 3: Implement `AppHeader`**

Create `src/workspaces/AppHeader.tsx` with this contract:

```tsx
import logoUrl from '../logo.svg'
import type { User } from '../auth'
import type { Mode } from '../useAppTheme'
import type { WorkspaceMode } from './types'

interface AppHeaderProps {
  mode: WorkspaceMode
  theme: Mode
  user: User | null
  onModeChange: (mode: WorkspaceMode) => void
  onToggleTheme: () => void
  onRequestAuth: () => void
  onLogout: () => void
}

export function AppHeader(props: AppHeaderProps) {
  return (
    <header className="app-header" data-testid="app-header">
      <div className="app-brand">
        <img src={logoUrl} alt="" width="28" height="28" />
        <strong>叮卡</strong>
      </div>
      <div className="workspace-tabs" role="tablist" aria-label="工作区">
        <button
          id="workspace-tab-markdown"
          role="tab"
          data-testid="workspace-tab-markdown"
          aria-controls="workspace-panel-markdown"
          aria-selected={props.mode === 'markdown-card'}
          onClick={() => props.onModeChange('markdown-card')}
        >
          Markdown 卡片
        </button>
        <button
          id="workspace-tab-freeform"
          role="tab"
          data-testid="workspace-tab-freeform"
          aria-controls="workspace-panel-freeform"
          aria-selected={props.mode === 'freeform-slide'}
          onClick={() => props.onModeChange('freeform-slide')}
        >
          自由编辑
        </button>
      </div>
      <div className="app-header-spacer" />
      <button data-testid="theme-toggle" aria-label="切换深浅色" onClick={props.onToggleTheme}>
        {props.theme === 'dark' ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21 12.6A8.8 8.8 0 1 1 11.4 3 7 7 0 0 0 21 12.6Z" />
          </svg>
        )}
      </button>
      {props.user ? (
        <button
          data-testid="account-logout"
          aria-label={`退出登录（${props.user.username}）`}
          title="点击退出登录"
          onClick={props.onLogout}
        >
          {props.user.username.slice(0, 1)}
        </button>
      ) : (
        <button data-testid="account-login" onClick={props.onRequestAuth}>登录</button>
      )}
    </header>
  )
}
```

Use line SVG icons with a consistent `24×24` viewBox. Do not use `☀`/`☾` text glyphs.

- [ ] **Step 4: Lift state into `AppShell`**

First add `WorkspaceShellProps` to `src/workspaces/types.ts` using the shared contract at the top of this plan, then replace the temporary `{ isActive: boolean }` props from Task 1.

Use one theme hook, one user state, and one auth modal:

```tsx
const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('markdown-card')
const [appTheme, toggleAppTheme] = useAppTheme()
const [user, setUser] = useState<User | null>(() => currentUser())
const [showAuth, setShowAuth] = useState(false)

function handleLogout() {
  authLogout()
  setUser(null)
}
```

Render panels with complete tab semantics:

```tsx
<div
  id="workspace-panel-markdown"
  className="workspace-panel"
  role="tabpanel"
  aria-labelledby="workspace-tab-markdown"
  hidden={workspaceMode !== 'markdown-card'}
>
  <MarkdownWorkspace isActive={workspaceMode === 'markdown-card'} user={user} requestAuth={() => setShowAuth(true)} />
</div>
```

Repeat for freeform, then render one `AuthModal` in `AppShell`.

- [ ] **Step 5: Remove duplicated workspace auth/theme state safely**

Both workspaces must accept `WorkspaceShellProps`. Remove their `AuthModal`, `useAppTheme`, `currentUser`, and `authLogout` ownership.

Preserve user-scoped draft identity with the same effect in both workspaces:

```ts
const previousUserId = useRef<string | null>(user?.id ?? null)

useEffect(() => {
  const nextUserId = user?.id ?? null
  setDrafts(user ? listDrafts(user.id) : [])

  if (previousUserId.current !== nextUserId) {
    previousUserId.current = nextUserId
    setDraftId(null)
    setSavedAt(null)
    setShowDrafts(false)
  }
}, [user])
```

Keep the existing `refreshDrafts` callback because save/delete handlers use it, but replace the old mount/user effect (`useEffect(() => refreshDrafts(), [refreshDrafts])`) with the identity-transition effect above. Do not run two competing user-change effects.

When saving or opening drafts while logged out, call `requestAuth()` and return. Do not auto-replay a save after authentication.

- [ ] **Step 6: Add cross-account draft identity coverage**

Extend the global header test or add a separate test that saves as user A, logs out, registers user B, saves again, and asserts the two localStorage draft IDs differ:

```ts
const ids = await page.evaluate(() =>
  Object.keys(localStorage)
    .filter((key) => key.startsWith('slicer.drafts.'))
    .flatMap((key) => JSON.parse(localStorage.getItem(key) ?? '[]').map((draft: { id: string }) => draft.id)),
)
expect(new Set(ids).size).toBe(ids.length)
```

- [ ] **Step 7: Style and verify**

Add the 52px global header, light active workspace tabs, orange focus state, theme/account controls, and dark mode in `styles.css`. The active tab must not use the same solid treatment as the primary export action.

Run:

```powershell
npm run test:e2e -- --grep "global header owns|cross-account|default workspace" --reporter=line
npm run test:unit
npm run build
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```powershell
git diff --check
git add src/workspaces/AppHeader.tsx src/workspaces/AppShell.tsx src/workspaces/types.ts src/workspaces/markdown/MarkdownWorkspace.tsx src/freeform/FreeformWorkspace.tsx src/styles.css e2e/freeform.spec.ts e2e/ime.spec.ts
git commit -m "feat: add shared app header"
```

---

### Task 3: Introduce the shared contextual toolbar

**Files:**
- Create: `src/workspaces/WorkspaceToolbar.tsx`
- Modify: `src/workspaces/markdown/MarkdownWorkspace.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing toolbar hierarchy tests**

```ts
test('only the active workspace contextual toolbar is exposed', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await expect(page.getByTestId('freeform-toolbar')).toBeHidden()

  await page.getByTestId('workspace-tab-freeform').click()
  await expect(page.getByTestId('markdown-toolbar')).toBeHidden()
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('freeform-primary-export')).toBeVisible()
})
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:e2e -- --grep "contextual toolbar" --reporter=line
```

Expected: FAIL because shared toolbar IDs and hierarchy do not exist.

- [ ] **Step 3: Create toolbar primitives**

Create `WorkspaceToolbar.tsx`:

```tsx
import type { ReactNode } from 'react'

interface WorkspaceToolbarProps {
  testId: string
  label: string
  children: ReactNode
}

export function WorkspaceToolbar({ testId, label, children }: WorkspaceToolbarProps) {
  return <header className="workspace-toolbar" data-testid={testId} aria-label={label}>{children}</header>
}

export function ToolbarGroup({ side = 'left', children }: { side?: 'left' | 'right'; children: ReactNode }) {
  return <div className={`toolbar-group toolbar-group-${side}`}>{children}</div>
}

export function ToolbarDivider() {
  return <span className="toolbar-divider" aria-hidden="true" />
}
```

- [ ] **Step 4: Migrate Markdown toolbar**

Left group: platform segmented control, card theme, font, profile.  
Right group: save draft, drafts, export all.

Remove brand/theme/account elements already owned by `AppHeader`. Keep the existing handlers and disabled/exporting behavior unchanged.

- [ ] **Step 5: Migrate the freeform toolbar skeleton**

For now, wrap the existing size/insertion/undo/save/export actions in `WorkspaceToolbar`; Task 4 and Task 5 will compact them. Preserve handler identity and ordering only where behavior needs it—tests will no longer use positional selectors.

The current slide count/size/saved status becomes low-emphasis text inside the left toolbar group, not a separate title column.

- [ ] **Step 6: Add toolbar styling and run tests**

Implement a 50px toolbar, 32px visual controls, a left/right flex split, a single orange primary export button, and visible focus states.

```powershell
npm run test:e2e -- --grep "contextual toolbar|switches to the freeform" --reporter=line
npm run build
```

- [ ] **Step 7: Commit**

```powershell
git add src/workspaces/WorkspaceToolbar.tsx src/workspaces/markdown/MarkdownWorkspace.tsx src/freeform/FreeformWorkspace.tsx src/styles.css e2e/freeform.spec.ts
git commit -m "feat: add contextual workspace toolbars"
```

---

### Task 4: Move page sizing into an accessible popover

**Files:**
- Create: `src/freeform/FreeformPageSizePopover.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing page-size popover tests**

```ts
test('edits preset and custom page sizes from the toolbar popover', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  await page.getByTestId('page-size-trigger').click()
  await expect(page.getByTestId('page-size-popover')).toBeVisible()

  await page.getByRole('button', { name: '9:16' }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/1080×1920px/)

  await page.getByTestId('page-size-trigger').click()
  await page.getByLabel('宽度 px').fill('100')
  await page.getByLabel('高度 px').fill('200')
  await page.getByRole('button', { name: '应用尺寸' }).click()
  await expect(page.getByRole('alert')).toContainText('128')

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('page-size-popover')).toBeHidden()
  await expect(page.getByTestId('page-size-trigger')).toBeFocused()
})
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:e2e -- --grep "page sizes from the toolbar popover" --reporter=line
```

Expected: FAIL because page sizing is still spread across the stage header.

- [ ] **Step 3: Implement the component**

Use this focused contract:

```tsx
interface FreeformPageSizePopoverProps {
  isActive: boolean
  width: number
  height: number
  onApply: (width: number, height: number) => void
}
```

Inside the component:

```ts
const [open, setOpen] = useState(false)
const [widthDraft, setWidthDraft] = useState(String(width))
const [heightDraft, setHeightDraft] = useState(String(height))
const [error, setError] = useState<string | null>(null)

useEffect(() => {
  if (!isActive) {
    setOpen(false)
    setError(null)
  }
}, [isActive])

function apply(widthValue: number, heightValue: number) {
  const validation = validatePageSize(widthValue, heightValue)
  if (!validation.ok) {
    setError(validation.message)
    return
  }
  setError(null)
  onApply(widthValue, heightValue)
  setOpen(false)
}
```

Requirements:

- Trigger text contains the matched ratio when available plus exact pixels.
- Opening syncs local drafts from the current slide.
- Escape/outside click closes without applying and returns focus to the trigger.
- When `isActive` becomes false, close without applying and do not move focus back into the hidden workspace.
- Invalid/empty/NaN values keep the popover open and expose `role="alert"`.
- Preset click applies immediately through the same validated path.
- No visible native select or number spinner.

- [ ] **Step 4: Wire into `FreeformWorkspace`**

Remove `widthDraft`, `heightDraft`, `sizeError`, `applyCustomSize`, and the inline preset/input row from the workspace. Keep `applySlideSize(width, height)` as the only reducer/history boundary.

Pass the workspace `isActive` prop into `FreeformPageSizePopover`. Keep zoom controls in the canvas stage header/status area.

Extend the E2E test: open the size popover, switch to Markdown, switch back to freeform, and assert the popover is closed.

- [ ] **Step 5: Run page-size and history tests**

```powershell
npm run test:e2e -- --grep "page size|custom page size|inherit" --reporter=line
npm run test:unit -- src/freeform/__tests__/document.test.ts src/freeform/__tests__/history.test.ts
```

- [ ] **Step 6: Commit**

```powershell
git add src/freeform/FreeformPageSizePopover.tsx src/freeform/FreeformWorkspace.tsx src/styles.css e2e/freeform.spec.ts
git commit -m "feat: add freeform page size popover"
```

---

### Task 5: Replace crowded shape/line buttons with insert menus

**Files:**
- Create: `src/freeform/FreeformInsertMenu.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Add failing menu and focus tests**

```ts
test('inserts shapes and lines through accessible toolbar menus', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  await page.getByTestId('insert-shape').click()
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  await expect(shapeMenu).toBeVisible()
  await shapeMenu.getByRole('menuitem', { name: '矩形' }).click()
  await expect(page.getByTestId('freeform-shape')).toHaveCount(1)

  await page.getByTestId('insert-line').click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: '线条' })).toBeHidden()
  await expect(page.getByTestId('insert-line')).toBeFocused()
})
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:e2e -- --grep "accessible toolbar menus" --reporter=line
```

- [ ] **Step 3: Implement `FreeformInsertMenu`**

Create a generic, typed menu:

```tsx
interface InsertOption<T extends string> {
  id: T
  label: string
}

interface FreeformInsertMenuProps<T extends string> {
  isActive: boolean
  testId: string
  label: string
  options: Array<InsertOption<T>>
  onSelect: (id: T) => void
}
```

Behavior:

- Trigger uses `aria-haspopup="menu"` and `aria-expanded`.
- Menu uses `role="menu"` plus `aria-label={label}`; options use `role="menuitem"`.
- Arrow Up/Down moves focus, Enter/Space selects, Escape closes, outside click closes.
- When `isActive` becomes false, close the menu without selection and without returning focus into the hidden workspace.
- Selection calls the existing handler exactly once, closes, and returns focus.
- Closing/canceling does not modify document history.

Use an explicit activity effect inside the component:

```ts
useEffect(() => {
  if (!isActive) setOpen(false)
}, [isActive])
```

- [ ] **Step 4: Wire direct and grouped insert actions**

Use stable IDs:

```tsx
<button data-testid="insert-text" onClick={addText}>文本</button>
<button data-testid="insert-image" onClick={() => imageInputRef.current?.click()}>图片</button>
<FreeformInsertMenu
  isActive={isActive}
  testId="insert-shape"
  label="形状"
  options={SHAPES}
  onSelect={addShape}
/>
<FreeformInsertMenu
  isActive={isActive}
  testId="insert-line"
  label="线条"
  options={[
    { id: 'line', label: '直线' },
    { id: 'arrow', label: '箭头' },
  ]}
  onSelect={addLine}
/>
```

Keep the file input hidden and preserve cancel behavior.

Extend the menu E2E test: open a shape or line menu, switch to Markdown, switch back to freeform, and assert the menu is closed and no element was inserted.

- [ ] **Step 5: Replace brittle E2E selectors**

Replace every `.freeform-toolbar .bar-btn:nth(...)` and equivalent insertion-order locator with stable IDs or role/name queries. Also update both Task 1 hidden-workspace tests, which initially clicked the old direct “矩形” button, to call the new `insertShape` helper. Use helpers near the top of `e2e/freeform.spec.ts`:

```ts
async function openFreeform(page: Page) {
  await page.getByTestId('workspace-tab-freeform').click()
}

async function insertText(page: Page) {
  await page.getByTestId('insert-text').click()
}

async function insertShape(page: Page, label = '矩形') {
  await page.getByTestId('insert-shape').click()
  await page.getByRole('menuitem', { name: label }).click()
}
```

- [ ] **Step 6: Run the complete freeform E2E file**

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --reporter=line --timeout=30000
```

Expected: all freeform tests PASS.

- [ ] **Step 7: Commit**

```powershell
rg -n "freeform-toolbar.*nth|bar-btn.*nth" e2e
git diff --check
git add src/freeform/FreeformInsertMenu.tsx src/freeform/FreeformWorkspace.tsx src/styles.css e2e/freeform.spec.ts
git commit -m "feat: add compact freeform insert menus"
```

---

### Task 6: Reorganize the inspector into consistent semantic sections

**Files:**
- Create: `src/freeform/InspectorSection.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Add failing inspector hierarchy tests**

```ts
test('shows page, geometry, fill, stroke, and arrange sections in context', async ({ page }) => {
  await page.goto('/')
  await openFreeform(page)

  await expect(page.getByTestId('inspector-page')).toBeVisible()
  await expect(page.getByTestId('inspector-geometry')).toHaveCount(0)

  await insertShape(page)
  await expect(page.getByTestId('inspector-geometry')).toBeVisible()
  await expect(page.getByTestId('inspector-fill')).toBeVisible()
  await expect(page.getByTestId('inspector-stroke')).toBeVisible()
  await expect(page.getByTestId('inspector-arrange')).toBeVisible()
})
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:e2e -- --grep "inspector hierarchy" --reporter=line
```

- [ ] **Step 3: Create `InspectorSection`**

```tsx
import type { ReactNode } from 'react'

interface InspectorSectionProps {
  title: string
  testId: string
  tone?: 'default' | 'danger'
  children: ReactNode
}

export function InspectorSection({ title, testId, tone = 'default', children }: InspectorSectionProps) {
  return (
    <section className={`inspector-section inspector-section-${tone}`} data-testid={testId}>
      <h2 className="inspector-section-title">{title}</h2>
      <div className="inspector-section-body">{children}</div>
    </section>
  )
}
```

- [ ] **Step 4: Reorder existing controls without changing data contracts**

Required order:

1. Page/basic information (`inspector-page`).
2. Geometry (`inspector-geometry`).
3. Typography for text (`inspector-typography`).
4. Fill (`inspector-fill`).
5. Stroke/line (`inspector-stroke`).
6. Arrange/align/distribute (`inspector-arrange`).
7. Danger actions (`inspector-danger`).

Rules:

- Keep existing `PaintField`, `ColorPickerButton`, `Select`, reducer actions, and test IDs.
- No selection shows page controls plus a short hint; it must not show stale object fields.
- Mixed multi-selection shows only existing shared arrange/alignment operations.
- Shape fill keeps solid/gradient/image in one section.
- Line stroke remains solid-only but uses the same styled color entry.
- Do not introduce new document fields or draft migration.

- [ ] **Step 5: Style all visible controls consistently**

Use shared 32px control height, 8px radius, visible focus ring, custom number inputs, custom range track/thumb, hidden file inputs, and no visible native color/select UI. Preserve existing popover positioning inside the inspector.

- [ ] **Step 6: Run inspector, paint, and multi-select coverage**

```powershell
npm run test:e2e -- --grep "inspector|paint|color|gradient|image fill|multi-select|align|distributes" --reporter=line
npm run test:unit -- src/freeform/__tests__/paint.test.ts src/freeform/__tests__/selection.test.ts
```

- [ ] **Step 7: Commit**

```powershell
git add src/freeform/InspectorSection.tsx src/freeform/FreeformWorkspace.tsx src/styles.css e2e/freeform.spec.ts
git commit -m "feat: unify freeform inspector sections"
```

---

### Task 7: Apply the approved visual system and responsive layout

**Files:**
- Modify: `src/styles.css`
- Modify: `src/workspaces/AppHeader.tsx`
- Modify: `src/workspaces/WorkspaceToolbar.tsx`
- Modify: `src/workspaces/markdown/MarkdownWorkspace.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing 1440/1024 layout tests**

```ts
for (const viewport of [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'compact', width: 1024, height: 768 },
]) {
  test(`freeform chrome fits the ${viewport.name} desktop viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await openFreeform(page)

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await expect(page.getByTestId('freeform-primary-export')).toBeVisible()
    await expect(page.locator('.freeform-inspector')).toBeVisible()
    await expect(page.locator('.freeform-stage-scroll')).toBeVisible()
  })
}
```

Add dark-mode visibility assertions for toolbar, popovers, range controls, disabled buttons, and inspector text.

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:e2e -- --grep "desktop viewport|dark mode" --reporter=line
```

Expected: at least the 1024px layout fails or overflows before the responsive rules are complete.

- [ ] **Step 3: Add shared chrome tokens**

At the token layer in `styles.css`, add:

```css
:root {
  --app-header-height: 52px;
  --workspace-toolbar-height: 50px;
  --control-height: 32px;
  --control-radius: 8px;
  --panel-radius: 10px;
}
```

Use the brand accent for the single primary export action. Workspace active tabs use a light surface, border, font weight, and subtle shadow—not the primary button fill.

- [ ] **Step 4: Apply the three-column freeform layout**

Desktop >=1280px:

```css
.freeform-main {
  grid-template-columns: 152px minmax(0, 1fr) 248px;
  gap: 0;
  padding: 0;
  overflow: hidden;
}
```

Compact 1024–1279px:

```css
@media (max-width: 1279px) {
  .freeform-main {
    grid-template-columns: 136px minmax(0, 1fr) 224px;
  }

  .toolbar-collapsible-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
}
```

Each rail owns its own scrolling. The root page and `.freeform-main` must not horizontally scroll.

- [ ] **Step 5: Match the approved freeform visual direction**

- Remove the current dotted/radial stage background; use a neutral warm-gray sink.
- Use a restrained canvas shadow and no decorative gradients/textures in the work area.
- Use a 2px brand accent border for the selected page thumbnail.
- Keep page numbers separate from thumbnail content.
- Reduce nested-card appearance: use surface separation and hairlines, not a rounded card around every region.
- Make all hover/focus/pressed/disabled states visible in light and dark themes.
- Use only line SVG icons; no emoji or font-symbol icons.
- Keep Markdown body/editor/preview styling unchanged apart from the new chrome above it.

- [ ] **Step 6: Add motion and hit-target safeguards**

Visual icon size may be 16–18px, but the clickable area must be at least 44×44px without overlapping neighbors. Add:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 7: Run responsive and broad UI regressions**

```powershell
npm run test:e2e -- --grep "desktop viewport|dark mode|styled range|styled scrollbars|custom color popover|contextual toolbar" --reporter=line
npm run build
```

- [ ] **Step 8: Commit**

```powershell
git diff --check
git add src/styles.css src/workspaces/AppHeader.tsx src/workspaces/WorkspaceToolbar.tsx src/workspaces/markdown/MarkdownWorkspace.tsx src/freeform/FreeformWorkspace.tsx e2e/freeform.spec.ts
git commit -m "feat: polish freeform editor workspace"
```

---

### Task 8: Lock export output against app-theme and chrome regressions

**Files:**
- Modify: `e2e/freeform.spec.ts`
- Modify if the test exposes leakage: `src/styles.css`
- Modify if filtering needs clarification: `src/freeform/FreeformWorkspace.tsx`

- [ ] **Step 1: Add the light/dark export invariance test**

Reuse the existing PNG helpers in `e2e/freeform.spec.ts`:

```ts
test('exports identical artwork pixels in light and dark app themes', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('slicer.mode.v1', 'light'))
  await page.reload()
  await openFreeform(page)
  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()

  async function downloadCurrent() {
    await expect(page.getByTestId('freeform-primary-export')).toBeEnabled()
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('freeform-primary-export').click()
    const download = await downloadPromise
    const path = await download.path()
    if (!path) throw new Error('missing downloaded PNG path')
    await expect(page.getByTestId('freeform-primary-export')).toBeEnabled()
    return path
  }

  const lightPath = await downloadCurrent()
  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const darkPath = await downloadCurrent()

  expect(readPngSize(await readFile(lightPath))).toEqual(readPngSize(await readFile(darkPath)))
  for (const [x, y] of [[10, 10], [540, 720], [1000, 1300]]) {
    expect(await samplePngPixel(page, lightPath, x, y)).toEqual(await samplePngPixel(page, darkPath, x, y))
  }
})
```

- [ ] **Step 2: Run and inspect RED/GREEN honestly**

```powershell
npm run test:e2e -- --grep "identical artwork pixels" --reporter=line
```

If it already passes, keep the regression test and do not invent implementation work. If it fails, use `@superpowers:systematic-debugging` to find the selector or computed-style leak before editing CSS.

- [ ] **Step 3: Enforce CSS/export boundaries only if required**

Rules:

- New chrome selectors must be rooted under `.app-header`, `.workspace-toolbar`, `.freeform-rail`, `.freeform-stage-pane`, or `.freeform-inspector`.
- Do not target `.freeform-artboard *` with app-theme typography/color rules.
- Selection controls remain `.freeform-ui-only` and continue to be filtered from `toBlob`.
- Do not change document paint/render helpers to compensate for a chrome CSS leak.

- [ ] **Step 4: Run all export and theme tests**

```powershell
npm run test:e2e -- --grep "exports|exporting|identical artwork pixels|dark mode" --reporter=line --timeout=30000
```

- [ ] **Step 5: Request code review**

Use `@superpowers:requesting-code-review` with the design spec, this plan, and the commit range from Task 1 through Task 8. Resolve only evidence-backed findings.

- [ ] **Step 6: Commit test/fix**

```powershell
git add e2e/freeform.spec.ts src/styles.css src/freeform/FreeformWorkspace.tsx
git commit -m "test: protect freeform export from app chrome"
```

Only add files that actually changed.

---

### Task 9: Version bump, full verification, and handoff

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify if implementation changed a contract: `docs/superpowers/specs/2026-07-13-app-header-freeform-ui-refresh-design.md`

- [ ] **Step 1: Run the AGENTS.md change checklist**

Verify explicitly:

1. Function contracts: canceled menus/popovers, invalid page sizes, missing users, account switches, hidden workspace shortcuts, export null/fallback paths.
2. Naming: grep all new props/test IDs/component names for consistent spelling.
3. Error/status codes: no new code set is introduced; validation uses existing messages/contracts.
4. Documentation: spec and plan match actual behavior; update only real deviations.
5. Version: this is a new UI feature, so minor bump.
6. Environments: light/dark, 1024/1440, logged-in/logged-out, Markdown/freeform, blank/complex page, system/network font.

- [ ] **Step 2: Check names and accidental scope**

```powershell
rg -n "WorkspaceShellProps|isActive|requestAuth|page-size-trigger|insert-shape|insert-line|InspectorSection" src e2e
rg -n "freeform-toolbar.*nth|bar-btn.*nth" e2e
git diff --check
git status --short
```

Expected:

- New names are consistent.
- No positional freeform insertion selectors remain.
- Only intended source/test/docs files are modified.

- [ ] **Step 3: Bump to `0.7.0`**

```powershell
npm version 0.7.0 --no-git-tag-version
```

Verify exactly three root version positions:

```powershell
rg -n '"version": "0\.7\.0"|"version": "0\.6\.3"' package.json package-lock.json
```

Expected: `0.7.0` in `package.json`, package-lock top level, and package-lock root package; no remaining root `0.6.3`.

- [ ] **Step 4: Run fresh full verification**

```powershell
npm run build
npm run test:unit
npm run test:e2e -- --reporter=line --timeout=30000
git diff --check
git status --short
```

Expected:

- Build exits 0.
- All unit tests pass.
- All Playwright tests pass at 0 failures.
- No whitespace errors.
- Status contains only expected uncommitted version/docs files before the final commit.

- [ ] **Step 5: Perform visual smoke verification on port 5174**

Start a hidden Vite server without touching the user's existing Chrome:

```powershell
Start-Process -FilePath 'F:\nodejs\node.exe' `
  -ArgumentList 'node_modules\vite\bin\vite.js','--host','127.0.0.1','--port','5174','--strictPort' `
  -WorkingDirectory 'D:\New_god\rednote\.worktrees\freeform-editor' `
  -WindowStyle Hidden
```

Verify:

- `http://127.0.0.1:5174/` returns HTTP 200.
- 1440×900 light/dark screenshots show A-layout hierarchy.
- 1024×768 has no page horizontal overflow and primary export remains visible.
- Markdown content/editor area is unchanged below the new toolbar.
- Freeform page rail, neutral stage, inspector, popovers, sliders, inputs, focus states, and export progress are visually coherent.

- [ ] **Step 6: Final commit**

```powershell
git add package.json package-lock.json docs/superpowers/specs/2026-07-13-app-header-freeform-ui-refresh-design.md
git commit -m "chore: bump version for workspace UI refresh"
```

Only include the design spec if it actually changed during implementation.

- [ ] **Step 7: Final branch check**

```powershell
git status --short
git log --oneline -12
```

Expected: clean worktree and a readable commit sequence covering isolation, global header, contextual toolbars, page-size popover, insert menus, inspector, visual polish, export protection, and version bump.

Do not merge the worktree branch unless the user explicitly requests integration.
