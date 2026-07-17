# Editor Interaction Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the verified Select, authentication dialog, and editor hit-target regressions that can be delivered independently of the recursive layer-tree migration, then establish a reusable acceptance-test entry point.

**Architecture:** Keep the existing UI structure and storage contracts. Harden the shared `Select` and `AuthModal` components with explicit focus/event contracts, cover them through real browser tests, and add a focused Playwright acceptance suite that later layer-tree tasks can extend. Transform-handle geometry moves with the scene overlay in the layer-tree plan to avoid implementing it twice.

**Tech Stack:** React 18, TypeScript, Playwright with system Chrome, existing CSS tokens and offline-font routes.

**Release sequencing:** This plan is the required prerequisite to the layer-tree plan and intentionally defers the single frontend minor bump to that plan's final release task; do not create an intermediate `0.9.1` release between the two plans.

---

## File Structure

- Modify `src/Select.tsx`
  - Close-before-change semantics, event isolation, complete listbox keyboard state and ARIA linkage.
- Create `src/Select.test.tsx`
  - Empty-options server-render contract without adding a browser-only test harness.
- Modify `src/AuthModal.tsx`
  - Dialog semantics, focus trap, Escape close, focus restoration and live errors.
- Modify `src/workspaces/AppShell.tsx`
  - Capture the authentication opener before rendering the auto-focused dialog and restore it after unmount.
- Modify `src/styles.css`
  - Screen-reader-only dialog title and any focus styles required by the existing visual system.
- Modify `e2e/freeform.spec.ts`
  - Focused regression coverage for the shared font Select while a canvas object is selected.
- Create `e2e/auth.spec.ts`
  - Authentication dialog keyboard and semantics coverage.
- Create `e2e/editor-acceptance.spec.ts`
  - High-value local editor journey, visual metrics and export verification.
- Modify `package.json`
  - Add the stable `test:acceptance` command.

---

### Task 1: Make custom Select close and isolate keyboard events

**Files:**
- Modify: `src/Select.tsx`
- Create: `src/Select.test.tsx`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing keyboard/ARIA and empty-options tests**

Add tests that assert:

- choosing a font closes the menu and retains the selected text element; this is an existing regression assertion, not the reason for RED;
- opening the font menu and pressing Escape hides it, returns focus to the trigger, and leaves the text element selected;
- clicking a focusable control outside the Select closes the listbox while focus remains on the clicked control; clicking non-focusable content outside closes it and restores focus to the Select trigger;
- the trigger's `aria-controls` points to the live listbox;
- ArrowDown, Home, End and typed Chinese/Latin prefix update `aria-activedescendant` without moving the canvas object;
- Enter selects the active option and Tab closes the menu without trapping focus.

In `src/Select.test.tsx`, render the real component with `react-dom/server` and `options=[]`. Assert it does not throw, renders a disabled trigger with `暂无选项`, exposes neither `aria-controls` nor `aria-activedescendant`, and cannot render a listbox. The disabled trigger plus the guarded chooser is the stable guarantee that this state never calls `onChange`.

- [ ] **Step 2: Run the expanded Select tests to verify RED**

Run:

```powershell
npm run test:unit -- src/Select.test.tsx
npm run test:e2e -- e2e/freeform.spec.ts --grep "font menu|font listbox"
```

Expected: the unit test fails because the component dereferences a missing selected option; Escape event isolation, ARIA linkage and Home/End/typeahead fail in E2E. The existing click-close assertion may already pass and must not be cited as RED.

- [ ] **Step 3: Implement the listbox keyboard and fallback contract**

In `Select.tsx`:

- close local state before calling `onChange`, without timers or document-query workarounds;
- keep DOM focus on the trigger;
- assign stable IDs to the listbox and every option;
- set `aria-controls` and `aria-activedescendant` while open;
- call `preventDefault()` and `stopPropagation()` for handled Escape, arrows, Home, End, Enter and Space;
- close on Escape/Tab and restore or retain trigger focus according to the originating key;
- implement a 500ms typeahead buffer with a ref, matching option labels from the current active index and wrapping once;
- reset the buffer when the menu closes or unmounts.
- when `options` is empty, render `暂无选项`, disable the trigger, omit listbox linkage/active-descendant attributes, keep the menu closed and make the chooser a no-op.

- [ ] **Step 4: Verify Select tests and the existing font test**

Run:

```powershell
npm run test:unit -- src/Select.test.tsx
npm run test:e2e -- e2e/freeform.spec.ts --grep "font"
```

Expected: all matching tests pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/Select.tsx src/Select.test.tsx e2e/freeform.spec.ts
git commit -m "fix(ui): harden custom select interactions"
```

---

### Task 2: Make AuthModal a real accessible dialog

**Files:**
- Modify: `src/AuthModal.tsx`
- Modify: `src/workspaces/AppShell.tsx`
- Modify: `src/styles.css`
- Create: `e2e/auth.spec.ts`

- [ ] **Step 1: Write failing dialog semantics and focus tests**

Create `e2e/auth.spec.ts`, install offline font routes in `beforeEach`, and test:

```ts
test('auth dialog traps focus, closes with Escape, and restores its trigger', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByTestId('account-login')
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(page.getByLabel('用户名')).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '注册', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '登录', exact: true }).first()).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '登录', exact: true }).last()).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})
```

Also open the dialog through the focused freeform `保存草稿` button and verify focus returns to that button, not always the header login button. Switch to login, submit invalid local credentials, and assert `getByRole('alert')` contains the stable authentication error without closing the dialog or losing focus order.

- [ ] **Step 2: Run auth E2E to verify RED**

Run:

```powershell
npm run test:e2e -- e2e/auth.spec.ts
```

Expected: FAIL because no dialog role or focus trap exists.

- [ ] **Step 3: Capture and restore the opener outside the auto-focused dialog**

In `AppShell.tsx`, route every header/workspace `requestAuth` call through one callback that stores `document.activeElement` when it is a connected `HTMLElement` before setting `showAuth=true`. Track the `true → false` transition in the shell and restore that stored element only after `AuthModal` has unmounted. This owner-level transition must remain correct under React StrictMode; do not capture the opener from a modal mount effect after `autoFocus` has already moved focus.

- [ ] **Step 4: Implement dialog semantics and focus lifecycle**

In `AuthModal.tsx`:

- add a dialog ref and a visually hidden `<h2 id={titleId}>账户登录与注册</h2>`;
- set `role="dialog"`, `aria-modal="true"`, and `aria-labelledby={titleId}` on `.sheet`;
- keep the existing username `autoFocus` behavior;
- handle Escape at the dialog boundary with `preventDefault`, `stopPropagation`, and `onClose`;
- on Tab/Shift+Tab, cycle among enabled buttons, inputs, textareas, selects and `[tabindex]:not([tabindex="-1"])` within the dialog;
- add `role="alert"` and `aria-live="polite"` to `.form-error`.

The backdrop click still closes the dialog. Busy submit state must remain focusable only through controls that are not disabled.

- [ ] **Step 5: Add the screen-reader utility style**

Add a single reusable `.sr-only` class using the conventional clipped 1px pattern. Do not hide the title with `display:none` or `visibility:hidden`.

- [ ] **Step 6: Verify AuthModal tests are GREEN**

Run:

```powershell
npm run test:e2e -- e2e/auth.spec.ts
```

Expected: all auth tests pass.

- [ ] **Step 7: Run workspace focus regression tests**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "focus|account changes"
```

Expected: all matching tests pass.

- [ ] **Step 8: Commit Task 2**

```powershell
git add src/AuthModal.tsx src/workspaces/AppShell.tsx src/styles.css e2e/auth.spec.ts
git commit -m "fix(auth): add accessible dialog focus management"
```

---

### Task 3: Establish the reusable editor acceptance suite

**Files:**
- Create: `e2e/editor-acceptance.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the script before the test file**

Add:

```json
"test:acceptance": "playwright test e2e/editor-acceptance.spec.ts"
```

Run:

```powershell
npm run test:acceptance
```

Expected: FAIL because the acceptance spec does not exist.

- [ ] **Step 2: Create a focused acceptance journey**

The test must use a fresh browser context, offline font routes and the local storage adapter. In one deterministic flow it must:

1. open freeform at 1440×900 and set 9:16;
2. reject a 100×200 custom page while retaining 1080×1920;
3. apply page and text gradients;
4. insert text, choose 思源宋体, and verify the listbox closes;
5. save via a unique local account, reload, reopen the draft and verify text/font recovery;
6. export `slide-01.png` and parse the PNG header as 1080×1920;
7. verify no native visible `select`/`color` controls, visible ranges have `appearance:none`, no unnamed visible controls, no body overflow and no toolbar overlap;
8. repeat layout metrics at 1366×768 and 1024×768 in dark mode;
9. record export duration with `test.info().annotations`, failing only above the 5000ms regression ceiling.

Keep helper functions local to the acceptance file unless an existing helper already provides the same behavior.

- [ ] **Step 3: Run acceptance to verify GREEN**

Run:

```powershell
npm run test:acceptance
```

Expected: the acceptance journey passes without external network access.

- [ ] **Step 4: Run interaction regression suite**

Run:

```powershell
npm run test:e2e -- e2e/auth.spec.ts e2e/editor-acceptance.spec.ts e2e/freeform.spec.ts --grep "font|auth dialog|acceptance"
```

Expected: all matching tests pass.

- [ ] **Step 5: Build and run unit tests**

Run:

```powershell
npm run test:unit
npm run build
git diff --check
```

Expected: 126 existing unit tests pass, build exits 0 with only the known bundle-size warning, and diff check is clean.

- [ ] **Step 6: Commit Task 3**

```powershell
git add package.json e2e/editor-acceptance.spec.ts
git commit -m "test(e2e): add editor acceptance journey"
```

---

## Interaction Hardening Completion Gate

Run fresh:

```powershell
npm run test:unit
npm run test:e2e
npm run test:acceptance
npm run build
git diff --check
```

Expected: all tests pass; no unexpected console or request failures; existing Chrome and the master preview remain untouched.
