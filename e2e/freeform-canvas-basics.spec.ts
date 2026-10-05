// Canvas basics: inspector gradients, the contenteditable textbox, the compact
// saved top bar, and chrome selector scoping.

import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import {
  expectVisibleFreeformToolbarButtonsToFit,
  findUnscopedWorkspaceChromeSelectors,
  insertShape,
  insertText,
  openFreeform,
  signUpToSave,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('applies page, shape, and text gradients from the inspector', async ({ page }) => {
  await openFreeform(page)

  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-canvas')).toHaveCSS('background-image', /linear-gradient/)

  await insertShape(page)
  await page.getByTestId('freeform-element').last().click()
  await page.getByTestId('shape-fill-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-shape').last()).toHaveCSS('background-image', /linear-gradient/)

  await insertText(page)
  await page.getByTestId('freeform-element').last().click()
  await page.getByTestId('text-fill-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-textbox').last()).toHaveCSS('background-image', /linear-gradient/)
})

test('edits Chinese text in the freeform contenteditable textbox without losing text', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const textbox = page.getByTestId('freeform-textbox').last()
  await expect(textbox).toHaveAttribute('contenteditable', 'true')
  await textbox.fill('中文渐变测试')

  await expect(textbox).toContainText('中文渐变测试')
})

test('pastes plain text into the freeform contenteditable textbox', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const textbox = page.getByTestId('freeform-textbox').last()
  await textbox.evaluate((node) => {
    const data = new DataTransfer()
    data.setData('text/html', '<b>bold</b>')
    data.setData('text/plain', 'plain text')
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })

  await expect(textbox).toContainText('plain text')
  await expect(textbox.locator('b')).toHaveCount(0)
})

test('compact saved freeform top bar keeps controls from overlapping', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await insertText(page)
  await signUpToSave(page, `c${Date.now().toString(36).slice(-6)}`)

  await expect(page.getByTestId('editor-title')).toBeVisible()
  await expect(page.getByTestId('freeform-export')).toBeVisible()
  await expect(page.getByTestId('account-menu')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存草稿' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^我的草稿/ })).toHaveCount(0)
  await expectVisibleFreeformToolbarButtonsToFit(page)

  const header = await page.getByTestId('app-header').evaluate((bar) => {
    const box = bar.getBoundingClientRect()
    const controls = Array.from(bar.querySelectorAll<HTMLElement>('button, [data-testid="editor-save-state"]'))
      .map((control) => ({ label: control.getAttribute('aria-label') ?? control.textContent ?? '', rect: control.getBoundingClientRect() }))
      .filter((control) => control.rect.width > 0 && control.rect.height > 0)
    const issues: string[] = []
    for (const control of controls) {
      if (control.rect.left < box.left - 0.5 || control.rect.right > box.right + 0.5) issues.push(`${control.label} leaves the bar`)
    }
    for (let first = 0; first < controls.length; first += 1) {
      for (let second = first + 1; second < controls.length; second += 1) {
        const a = controls[first].rect
        const b = controls[second].rect
        const inside = (outer: DOMRect, inner: DOMRect) => inner.left >= outer.left && inner.right <= outer.right
          && inner.top >= outer.top && inner.bottom <= outer.bottom
        if (inside(a, b) || inside(b, a)) continue
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) {
          issues.push(`${controls[first].label} overlaps ${controls[second].label}`)
        }
      }
    }
    return issues
  })
  expect(header).toEqual([])
})



test('workspace chrome selectors stay scoped to workspace toolbar', async () => {
  expect(findUnscopedWorkspaceChromeSelectors(`
    @media (max-width: 1100px) {
      .page-size-trigger { color: red; }
      .freeform-insert-trigger { color: red; }
      .freeform-add-page { color: red; }
      .freeform-stage-head .zoom-btn { color: red; }
      .toolbar-collapsible-label { color: red; }
    }
    .page-size-trigger .workspace-toolbar { color: red; }
    .freeform-insert-menu .freeform-toolbar { color: red; }
    .workspace-toolbar .page-size-trigger { content: ".page-size-declaration"; }
    .freeform-toolbar .freeform-insert-trigger { content: ".freeform-insert-declaration"; }
    .freeform-rail .freeform-add-page { color: green; }
    .freeform-stage-pane .freeform-stage-head { color: green; }
    .workspace-toolbar .toolbar-collapsible-label { color: green; }
  `)).toEqual([
    '.page-size-trigger',
    '.freeform-insert-trigger',
    '.freeform-add-page',
    '.freeform-stage-head .zoom-btn',
    '.toolbar-collapsible-label',
    '.page-size-trigger .workspace-toolbar',
    '.freeform-insert-menu .freeform-toolbar',
  ])

  const css = await readFile('src/styles.css', 'utf8')
  const unscoped = findUnscopedWorkspaceChromeSelectors(css)

  expect(unscoped, `裸 workspace chrome 选择器：${unscoped.join(' | ')}`).toEqual([])
})
