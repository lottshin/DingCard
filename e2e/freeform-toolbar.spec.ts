// Tool rail behaviour: insert panels, toolbar menus and the page size popover,
// keyboard cycling, and preset or custom page sizes.

import { expect, test } from '@playwright/test'
import {
  insertShape,
  insertText,
  openFreeform,
  openStoredDrafts,
  registerUser,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('switches to the freeform workspace and edits a slide', async ({ page }) => {
  await openFreeform(page)

  await expect(page.getByTestId('freeform-thumb')).toHaveCount(1)
  await expect(page.getByTestId('freeform-slide-size')).toContainText('1080×1440px')
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()

  await page.getByTestId('page-size-trigger').click()
  await page.getByRole('button', { name: '16:9', exact: true }).click()
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(1)
  await expect(page.getByTestId('freeform-slide-size')).toContainText('1920×1080px')

  await insertText(page)
  await expect(page.getByLabel('文本内容')).toBeVisible()

  await insertShape(page)
  await expect(page.getByTestId('freeform-shape')).toBeVisible()
})

test('inserts shapes and lines from the elements panel', async ({ page }) => {
  await page.goto('/#/edit/canvas')

  const elementsTool = page.getByTestId('freeform-elements-tool')
  const panel = page.getByRole('complementary', { name: '元素' })
  await expect(elementsTool).toHaveAttribute('aria-expanded', 'false')
  await elementsTool.click()
  await expect(elementsTool).toHaveAttribute('aria-expanded', 'true')
  await expect(panel).toBeVisible()
  await panel.getByRole('group', { name: '形状' }).getByRole('button', { name: '矩形', exact: true }).click()
  await expect(page.getByTestId('freeform-shape')).toHaveCount(1)
  // The panel stays open for the next insert, like Canva's.
  await expect(panel).toBeVisible()
  await panel.getByRole('group', { name: '线条' }).getByRole('button', { name: '直线', exact: true }).click()
  await expect(page.getByTestId('freeform-line')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(elementsTool).toHaveAttribute('aria-expanded', 'false')
  await expect(elementsTool).toBeFocused()
})

test('an open insert panel turns its rail icon ink in the dark theme', async ({ page }) => {
  await openFreeform(page)
  if ((await page.locator('html').getAttribute('data-theme')) !== 'dark') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const inkColors = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--on-btn)'
    probe.style.backgroundColor = 'var(--btn)'
    document.body.append(probe)
    const style = getComputedStyle(probe)
    const colors = {
      color: style.color,
      background: style.backgroundColor,
    }
    probe.remove()
    return colors
  })

  const elementsTool = page.getByTestId('freeform-elements-tool')
  const icon = elementsTool.locator('svg')
  await elementsTool.click()
  await expect(elementsTool).toHaveAttribute('aria-expanded', 'true')
  await expect(icon).toHaveCSS('background-color', inkColors.background)
  await expect(icon).toHaveCSS('color', inkColors.color)
})

test('rail panels open one at a time and insert styled text', async ({ page }) => {
  await openFreeform(page)

  const elementsTool = page.getByTestId('freeform-elements-tool')
  const textTool = page.getByTestId('freeform-text-tool')
  const elementsPanel = page.getByTestId('freeform-elements-drawer')
  const textPanel = page.getByTestId('freeform-text-drawer')

  await elementsTool.click()
  await expect(elementsPanel).toBeVisible()
  await textTool.click()
  await expect(elementsPanel).toHaveCount(0)
  await expect(textPanel).toBeVisible()
  await expect(elementsTool).toHaveAttribute('aria-expanded', 'false')
  await expect(textTool).toHaveAttribute('aria-expanded', 'true')

  await textPanel.getByTestId('insert-text-heading').click()
  await expect(page.getByTestId('freeform-textbox')).toHaveCount(1)
  await expect(page.getByTestId('freeform-textbox')).toContainText('添加标题')
  // Each default style shows itself the way it lands on the page.
  const headingSize = await textPanel.getByTestId('insert-text-heading').evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
  const bodySize = await textPanel.getByTestId('insert-text-body').evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
  expect(headingSize).toBeGreaterThan(bodySize)

  await textPanel.getByRole('button', { name: '关闭面板' }).click()
  await expect(textPanel).toHaveCount(0)
})

test('keeps focus on an outside toolbar button when closing the page size popover', async ({ page }) => {
  await openFreeform(page)

  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const templateButton = page.getByTestId('freeform-template-button')

  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()
  await page.getByTestId('freeform-rulers-toggle').click()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  await expect(pageSizePopover).toBeHidden()
  await expect(page.getByTestId('freeform-rulers-toggle')).toBeFocused()
  await expect(page.getByTestId('freeform-rulers-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect(templateButton).toBeVisible()
})

test('opening an insert panel closes the page size popover without inserting', async ({ page }) => {
  await openFreeform(page)

  const undo = page.getByRole('button', { name: '撤销' })
  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const elementsTool = page.getByTestId('freeform-elements-tool')

  await expect(undo).toBeDisabled()
  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()
  await elementsTool.click()

  await expect(pageSizePopover).toBeHidden()
  await expect(page.getByTestId('freeform-elements-drawer')).toBeVisible()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()

  // The panel is docked, so the popover opens beside it.
  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()
  await expect(pageSizePopover.getByRole('button', { name: '3:4', exact: true })).toBeFocused()
  await expect(page.getByTestId('freeform-elements-drawer')).toBeVisible()
  await expect(undo).toBeDisabled()
})

test('closes a toolbar menu when tabbing to the next toolbar trigger', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const bar = page.getByTestId('freeform-context-toolbar')
  const alignTrigger = bar.getByTestId('ctx-align-menu')
  const orderTrigger = bar.getByTestId('ctx-order-menu')
  const alignMenu = page.getByRole('menu', { name: '位置' })
  const orderMenu = page.getByRole('menu', { name: '层级' })

  await alignTrigger.click()
  await expect(alignMenu.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('Tab')

  await expect(orderTrigger).toBeFocused()
  await expect(alignMenu).toBeHidden()
  await page.keyboard.press('Enter')
  await expect(orderMenu).toBeVisible()
  await expect(page.getByRole('menu')).toHaveCount(1)
})

test('closes the page size popover before keyboard-opening a toolbar menu', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const orderTrigger = page.getByTestId('ctx-order-menu')
  const orderMenu = page.getByRole('menu', { name: '层级' })

  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await orderTrigger.evaluate((element) => element === document.activeElement)) break
    await page.keyboard.press('Tab')
  }

  await expect(orderTrigger).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(pageSizePopover).toBeHidden()
  await expect(orderMenu).toBeVisible()
  await expect(orderMenu.getByRole('menuitem', { name: '置于顶层' })).toBeFocused()
  await expect(page.getByRole('menu')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(orderMenu).toBeHidden()
  await expect(orderTrigger).toBeFocused()
})

test('keeps the page size popover open when clicking non-focusable content inside it', async ({ page }) => {
  await openFreeform(page)

  const pageSizePopover = page.getByTestId('page-size-popover')
  await page.getByTestId('page-size-trigger').click()
  await expect(pageSizePopover).toBeVisible()
  await expect(pageSizePopover.getByRole('button', { name: '3:4', exact: true })).toBeFocused()

  await pageSizePopover.locator('.page-size-popover-heading').click()

  await expect(pageSizePopover).toBeVisible()
})

test('supports cyclic keyboard selection in toolbar menus', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await insertShape(page)

  const shapeTrigger = page.getByTestId('ctx-shape-menu')
  const element = page.getByTestId('freeform-element')
  await shapeTrigger.click()
  const shapeMenu = page.getByRole('menu', { name: '矩形' })
  const rectangle = shapeMenu.getByRole('menuitem', { name: '矩形' })
  const ellipse = shapeMenu.getByRole('menuitem', { name: '圆形' })
  const triangle = shapeMenu.getByRole('menuitem', { name: '三角形' })
  const diamond = shapeMenu.getByRole('menuitem', { name: '菱形' })
  const pentagon = shapeMenu.getByRole('menuitem', { name: '五边形' })
  const star = shapeMenu.getByRole('menuitem', { name: '五角星' })
  const hexagon = shapeMenu.getByRole('menuitem', { name: '六边形' })
  const bubble = shapeMenu.getByRole('menuitem', { name: '对话气泡' })

  await expect(rectangle).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(bubble).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rectangle).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(ellipse).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(triangle).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(diamond).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(pentagon).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(hexagon).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(star).toBeFocused()
  await page.keyboard.press('Space')

  await expect(shapeMenu).toBeHidden()
  await expect(shapeTrigger).toHaveText('五角星')
  await expect(shapeTrigger).toBeFocused()
  await expect(element).toHaveCount(1)

  await shapeTrigger.click()
  await expect(page.getByRole('menu', { name: '五角星' }).getByRole('menuitem', { name: '矩形' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(shapeTrigger).toHaveText('矩形')
  await expect(shapeTrigger).toBeFocused()
})

test('opening and closing insert panels records no history', async ({ page }) => {
  await page.goto('/#/edit/canvas')

  const undo = page.getByRole('button', { name: '撤销' })
  const textTool = page.getByTestId('freeform-text-tool')
  const elementsTool = page.getByTestId('freeform-elements-tool')

  await expect(undo).toBeDisabled()
  await textTool.click()
  await page.getByTestId('insert-text').focus()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('freeform-text-drawer')).toHaveCount(0)
  await expect(textTool).toBeFocused()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()

  await elementsTool.click()
  await page.getByTestId('freeform-canvas').click({ position: { x: 8, y: 8 } })
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()

  // Leaving for the other editor and coming back inserts nothing either.
  await page.goto('/#/edit/md')
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()
})

test('edits preset and custom page sizes from the toolbar popover', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await page.goto('/#/edit')
  if ((await page.locator('html').getAttribute('data-theme')) !== 'light') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.goto('/#/edit/canvas')

  const trigger = page.getByTestId('page-size-trigger')
  const popover = page.getByTestId('page-size-popover')
  const slideSize = page.getByTestId('freeform-slide-size')
  const widthInput = page.getByLabel('宽度 px')
  const heightInput = page.getByLabel('高度 px')
  const applyButton = page.getByRole('button', { name: '应用尺寸' })
  const readAccentColor = () =>
    page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.color = 'var(--accent)'
      document.body.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    })

  await trigger.click()
  await expect(popover).toBeVisible()
  await expect(trigger).toHaveCSS('border-color', await readAccentColor())
  await expect(popover.getByRole('button', { name: '3:4', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(trigger).toBeFocused()

  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await insertShape(page)
  const selectedElement = page.getByTestId('freeform-element').last()
  await expect(selectedElement).toHaveAttribute('data-selected', 'true')

  await trigger.click()
  await expect(popover).toBeVisible()
  await expect(trigger).toHaveCSS('border-color', await readAccentColor())
  await expect(trigger).toContainText('3:4 · 1080×1440px')

  await popover.getByRole('button', { name: '9:16', exact: true }).click()
  await expect(slideSize).toContainText('1080×1920px')
  await expect(popover).toBeHidden()

  await trigger.click()
  await expect(widthInput).toHaveValue('1080')
  await expect(heightInput).toHaveValue('1920')

  await widthInput.fill('100')
  await heightInput.fill('200')
  await applyButton.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('alert')).toContainText('128')
  await expect(slideSize).toContainText('1080×1920px')

  await widthInput.fill('128.5')
  await applyButton.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('alert')).toContainText('128')
  await expect(slideSize).toContainText('1080×1920px')

  await widthInput.fill('4097')
  await applyButton.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('alert')).toContainText('128')
  await expect(slideSize).toContainText('1080×1920px')

  await widthInput.fill('')
  await applyButton.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('alert')).toContainText('128')
  await expect(slideSize).toContainText('1080×1920px')

  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(selectedElement).toHaveAttribute('data-selected', 'true')

  await trigger.click()
  await page.goto('/#/edit/md')
  await expect(popover).toBeHidden()
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()

  await page.goto('/#/edit/canvas')
  await expect(popover).toBeHidden()
  await trigger.click()
  await expect(popover).toBeVisible()
  await widthInput.fill('1200')
  await heightInput.fill('1600')
  await page.locator('.freeform-stage-scroll').click({ position: { x: 6, y: 6 } })
  await expect(popover).toBeHidden()
  await expect(slideSize).toContainText('1080×1920px')
  await expect(trigger).toBeFocused()

  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(slideSize).toContainText('3:4 · 1080×1440px')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(slideSize).toContainText('9:16 · 1080×1920px')
})

test('reapplying the current page size preserves history and saved state', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const toolbar = page.getByTestId('freeform-toolbar')
  const slideMeta = page.getByTestId('editor-save-state')
  await expect(toolbar.locator('button:disabled')).toHaveCount(2)

  await page.getByTestId('account-login').click()
  await registerUser(page, `same-size-${Date.now()}`)
  await expect(page.getByTestId('account-menu')).toBeVisible()
  const slide = {
    id: 'same-size-slide',
    name: 'Same size',
    width: 1080,
    height: 1440,
    background: { type: 'solid', color: '#ffffff' },
    nodes: [],
  }
  await openStoredDrafts(page, [{
    id: 'same-size-draft',
    title: 'Same size',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: Date.now(),
    document: { documentVersion: 14, activeSlideId: slide.id, slides: [slide] },
  }])
  await expect(slideMeta).toHaveText('已保存')
  await expect(toolbar.locator('button:disabled')).toHaveCount(2)

  await page.getByTestId('page-size-trigger').click()
  await page.getByTestId('page-size-popover').getByRole('button', { name: '3:4', exact: true }).click()

  await expect(page.getByTestId('page-size-popover')).toBeHidden()
  await expect(slideMeta).toHaveText('已保存')
  await expect(toolbar.locator('button:disabled')).toHaveCount(2)

  await page.getByTestId('page-size-trigger').click()
  await page.getByLabel('宽度 px').fill('1080')
  await page.getByLabel('高度 px').fill('1440')
  await page.getByRole('button', { name: '应用尺寸', exact: true }).click()

  await expect(page.getByTestId('page-size-popover')).toBeHidden()
  await expect(slideMeta).toHaveText('已保存')
  await expect(toolbar.locator('button:disabled')).toHaveCount(2)
})

test('sets custom page size and new pages inherit it', async ({ page }) => {
  await page.goto('/#/edit/canvas')

  const trigger = page.getByTestId('page-size-trigger')
  await trigger.click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/1080×1920px/)

  await trigger.click()
  await page.getByLabel('宽度 px').fill('1200')
  await page.getByLabel('高度 px').fill('1600')
  await page.getByRole('button', { name: '应用尺寸' }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/自定义 · 1200×1600px/)

  await page.getByRole('button', { name: '新增页面' }).click()
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(2)
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/1200×1600px/)
})
