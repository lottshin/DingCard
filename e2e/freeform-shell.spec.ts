// The app shell around the canvas: top bar, account and storage fallbacks, theme,
// narrow-viewport layout, and the runtime visual tokens.

import { expect, test } from '@playwright/test'
import {
  applyFreeformCustomSize,
  contrastRatio,
  expectFreeformCanvasMatchesZoom,
  fitFreeformCanvas,
  freeformCanvasScale,
  freeformElementBoxes,
  freeformStageMetrics,
  insertShape,
  insertText,
  openFreeform,
  openPageMenu,
  registerUser,
  selectFreeformPagePreset,
  setFreeformZoom,
  setSelectedElementBox,
  setSelectedElementPosition,
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

test('each editor top bar carries theme and account state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/edit/md')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await expect(page.getByTestId('app-header')).toHaveCount(1)
  await expect(page.getByTestId('app-header')).toHaveAttribute('data-system', 'markdown-card')

  await page.getByTestId('theme-toggle').click()
  const theme = await page.locator('html').getAttribute('data-theme')
  expect(theme).toMatch(/^(light|dark)$/)

  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('app-header')).toHaveCount(1)
  await expect(page.getByTestId('app-header')).toHaveAttribute('data-system', 'freeform-slide')
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme!)

  await page.getByTestId('account-login').click()
  await expect(page.locator('.form-note')).toContainText('仅保存在此浏览器本地')
  await registerUser(page, `header-${Date.now()}`)

  await expect(page.getByTestId('account-menu')).toBeVisible()
  await expect(page.locator('html')).not.toHaveClass(/theme-anim/)
  const accountBackground = await page
    .getByTestId('account-menu')
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  const primaryExportBackground = await page
    .getByTestId('freeform-export')
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  const accentBackground = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--accent)'
    document.body.append(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  })
  expect(accountBackground).not.toBe(accentBackground)
  expect(accountBackground).not.toBe(primaryExportBackground)
  await page.goto('/#/edit/md')
  await expect(page.getByTestId('account-menu')).toBeVisible()
  await page.getByTestId('account-menu').click()
  await expect(page.getByRole('menu').getByTestId('account-logout')).toBeVisible()
})

test('malformed account storage falls back to a logged-out app shell', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => {
    localStorage.setItem('slicer.users.v1', '{}')
    localStorage.setItem('slicer.session.v1', 'broken-session')
  })
  await page.reload()

  await expect(page.getByTestId('app-header')).toBeVisible()
  await expect(page.getByTestId('account-login')).toBeVisible()
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
})

test('blocked browser storage keeps the app shell and theme toggle usable', async ({ page }) => {
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException('storage blocked', 'SecurityError')
    }
    Storage.prototype.getItem = blocked
    Storage.prototype.setItem = blocked
    Storage.prototype.removeItem = blocked
  })
  await page.goto('/#/edit')

  const html = page.locator('html')
  await expect(page.getByTestId('app-header')).toBeVisible()
  const initialTheme = await html.getAttribute('data-theme')
  expect(initialTheme).toMatch(/^(light|dark)$/)

  await page.getByTestId('theme-toggle').click()
  await expect(html).toHaveAttribute('data-theme', initialTheme === 'light' ? 'dark' : 'light')
  await expect(page.getByTestId('app-header')).toBeVisible()
})

test('only the open editor exposes its toolbar, with one primary action in the top bar', async ({ page }) => {
  await page.goto('/#/edit/md')

  const markdownToolbar = page.getByTestId('markdown-toolbar')
  const header = page.getByTestId('app-header')
  await expect(markdownToolbar).toBeVisible()
  await expect(markdownToolbar).toHaveAttribute('role', 'toolbar')
  await expect(markdownToolbar).toHaveCSS('height', '50px')
  await expect(page.getByTestId('freeform-toolbar')).toHaveCount(0)
  await expect(page.locator('.workspace-panel:not([hidden]) .toolbar-primary')).toHaveCount(1)
  await expect(header).toHaveCSS('height', '52px')
  await expect(markdownToolbar.locator('.bar-btn').first()).toHaveCSS('height', '32px')
  await expect(markdownToolbar.locator('.sel-trigger').first()).toHaveCSS('height', '32px')
  await expect(header.locator('.toolbar-primary')).toHaveCSS('height', '32px')
  const segmentBox = await markdownToolbar.getByRole('tablist', { name: '平台' }).boundingBox()
  expect(segmentBox).toBeTruthy()
  expect(segmentBox!.height).toBeLessThanOrEqual(32)

  const accentColor = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--accent)'
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
  const focusableControls = [
    markdownToolbar.locator('.seg-btn').first(),
    markdownToolbar.locator('.sel-trigger').first(),
    markdownToolbar.locator('.bar-btn').first(),
    header.locator('.toolbar-primary'),
  ]
  for (const control of focusableControls) {
    await control.focus()
    await expect(control).toHaveCSS('outline-color', accentColor)
    await expect(control).toHaveCSS('outline-style', 'solid')
    await expect(control).toHaveCSS('outline-width', '2px')
  }

  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('markdown-toolbar')).toBeHidden()
  const freeformToolbar = page.getByTestId('freeform-toolbar')
  await expect(freeformToolbar).toBeVisible()
  await expect(freeformToolbar).toHaveAttribute('role', 'toolbar')
  // The freeform tools ride in the top bar instead of a second row.
  await expect(page.getByTestId('app-header').getByTestId('freeform-toolbar')).toBeVisible()
  await expect(freeformToolbar).toHaveCSS('height', '44px')
  await expect(page.getByTestId('freeform-export')).toBeVisible()
  await expect(page.locator('.workspace-panel:not([hidden]) .toolbar-primary')).toHaveCount(1)
  const tools = page.getByRole('navigation', { name: '插入' })
  for (const testId of ['freeform-template-button', 'freeform-text-tool', 'freeform-images-tool', 'freeform-elements-tool', 'freeform-layers-tool']) {
    await expect(tools.getByTestId(testId)).toBeVisible()
    const box = await tools.getByTestId(testId).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  await expect(freeformToolbar.getByTestId('freeform-text-tool')).toHaveCount(0)
  await expect(page.getByTestId('freeform-export')).toHaveCSS('height', '32px')
  await expect(page.locator('.freeform-thumb.on')).toHaveAttribute('aria-current', 'page')
})

for (const viewport of [
  // The settings panel is 21% of the window, between 256px and 304px.
  { name: 'wide', width: 1440, height: 900, toolsWidth: 72, inspectorWidth: 302.4 },
  { name: 'compact', width: 1024, height: 768, toolsWidth: 64, inspectorWidth: 256 },
]) {
  test(`freeform chrome fits the ${viewport.name} desktop viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openFreeform(page)

    const documentOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(documentOverflow).toBeLessThanOrEqual(0)

    const main = page.locator('.freeform-main')
    const mainOverflow = await main.evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(mainOverflow).toBeLessThanOrEqual(0)
    await expect(main).toHaveCSS('overflow-x', 'hidden')
    await expect(page.getByTestId('freeform-export')).toBeVisible()
    await expect(page.locator('.freeform-inspector')).toBeVisible()
    await expect(page.locator('.freeform-stage-scroll')).toBeVisible()

    const toolsBox = await page.locator('.freeform-tools').boundingBox()
    const stageBox = await page.locator('.freeform-stage-pane').boundingBox()
    const pagesBox = await page.locator('.freeform-rail').boundingBox()
    const inspectorBox = await page.locator('.freeform-inspector').boundingBox()
    expect(toolsBox?.width).toBeCloseTo(viewport.toolsWidth, 0)
    expect(inspectorBox?.width).toBeCloseTo(viewport.inspectorWidth, 0)
    // The page list runs down between the tools and the stage, as tall as the stage;
    // nothing sits under the stage.
    expect(pagesBox!.x).toBeCloseTo(toolsBox!.x + toolsBox!.width, 0)
    expect(pagesBox!.x + pagesBox!.width).toBeCloseTo(stageBox!.x, 0)
    expect(pagesBox!.height).toBeCloseTo(stageBox!.height, 0)
    expect(stageBox!.y + stageBox!.height).toBeCloseTo(viewport.height, 0)
    await expect(page.locator('.freeform-slide-list')).toHaveCSS('overflow-y', 'auto')
    await expect(page.locator('.freeform-stage-scroll')).toHaveCSS('overflow-y', 'auto')
    await expect(page.locator('.freeform-inspector')).toHaveCSS('overflow-y', 'auto')

    const themeBox = await page.getByTestId('theme-toggle').boundingBox()
    expect(themeBox?.width).toBeGreaterThanOrEqual(44)
    expect(themeBox?.height).toBeGreaterThanOrEqual(44)
    for (const name of ['缩小画布', '放大画布']) {
      const zoomBox = await page.getByRole('button', { name }).boundingBox()
      expect(zoomBox?.width).toBeGreaterThanOrEqual(44)
      expect(zoomBox?.height).toBeGreaterThanOrEqual(44)
    }
  })
}

test('freeform layout stacks the stage above the panels on narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFreeform(page)

  // No horizontal overflow: the toolbar scrolls on its own, nothing sticks out.
  const documentOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(documentOverflow).toBeLessThanOrEqual(0)
  const main = page.locator('.freeform-main')
  const mainOverflow = await main.evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(mainOverflow).toBeLessThanOrEqual(0)

  // The stage keeps a usable width instead of being crushed between the panels.
  const stage = await page.locator('.freeform-stage-pane').boundingBox()
  expect(stage?.width).toBeGreaterThanOrEqual(330)
  expect(stage?.height).toBeGreaterThanOrEqual(300)

  // The rail and inspector stack below the stage at full width.
  const rail = await page.locator('.freeform-rail').boundingBox()
  const inspector = await page.locator('.freeform-inspector').boundingBox()
  expect(rail?.width).toBeGreaterThanOrEqual(330)
  expect(rail?.y).toBeGreaterThan(stage!.y + stage!.height - 1)
  expect(inspector?.width).toBeGreaterThanOrEqual(330)
  expect(inspector?.y).toBeGreaterThan(rail!.y)

  // Editing still works: insert a shape and see it selected in the inspector.
  await insertShape(page)
  await expect(page.getByTestId('inspector-geometry')).toBeVisible()
  await expect(page.locator('.freeform-shape')).toBeVisible()
})

test.describe('fit-relative freeform zoom', () => {
  test('withholds the canvas until the first active fit measurement', async ({ page }) => {
    await page.goto('/#/edit')
    await expect(page.getByTestId('freeform-canvas')).toHaveCount(0)

    await page.goto('/#/edit/canvas')

    await expect(page.getByTestId('freeform-canvas')).toBeVisible()
    await expect(page.locator('.freeform-stage-scroll')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByTestId('freeform-export')).toBeEnabled()
  })

  // The bottom edge keeps room for the zoom control in the corner.
  for (const viewport of [
    { name: 'wide', width: 1440, height: 900, padding: 32, paddingBottom: 72 },
    { name: 'compact', width: 1024, height: 768, padding: 24, paddingBottom: 72 },
  ]) {
    test(`fits common ratios at 100% in the ${viewport.name} stage`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openFreeform(page)
      await expect(page.getByTestId('freeform-zoom-value')).toHaveText('100%')

      for (const ratio of ['1:1', '9:16', '16:9'] as const) {
        await selectFreeformPagePreset(page, ratio)
        const metrics = await expectFreeformCanvasMatchesZoom(page, 100, true)
        expect(metrics.paddingLeft).toBeCloseTo(viewport.padding, 3)
        expect(metrics.paddingRight).toBeCloseTo(viewport.padding, 3)
        expect(metrics.paddingTop).toBeCloseTo(viewport.padding, 3)
        expect(metrics.paddingBottom).toBeCloseTo(viewport.paddingBottom, 3)
      }
    })

    test(`fits minimum and maximum custom pages in the ${viewport.name} stage`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openFreeform(page)

      await applyFreeformCustomSize(page, 128, 128)
      await expectFreeformCanvasMatchesZoom(page, 100, true)

      await applyFreeformCustomSize(page, 4096, 4096)
      await expectFreeformCanvasMatchesZoom(page, 100, true)
    })
  }

  test('keeps 50% smaller and makes both vertical edges reachable at 110%', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await selectFreeformPagePreset(page, '9:16')
    const fitted = await expectFreeformCanvasMatchesZoom(page, 100, true)

    await setFreeformZoom(page, 50)
    const half = await expectFreeformCanvasMatchesZoom(page, 50, true)
    expect(half.renderedHeight).toBeCloseTo(fitted.renderedHeight / 2, 0)

    await fitFreeformCanvas(page)
    await setFreeformZoom(page, 110)
    await expect
      .poll(async () => {
        const metrics = await freeformStageMetrics(page)
        return metrics.scrollHeight - metrics.clientHeight
      })
      .toBeGreaterThan(1)

    const stage = page.locator('.freeform-stage-scroll')
    await stage.evaluate((node) => { node.scrollTop = 0 })
    const atTop = await freeformStageMetrics(page)
    expect(atTop.canvasTop).toBeCloseTo(atTop.stageTop + atTop.paddingTop, 0)

    await stage.evaluate((node) => { node.scrollTop = node.scrollHeight })
    await expect.poll(async () => (await freeformStageMetrics(page)).scrollTop).toBeGreaterThan(0)
    const atBottom = await freeformStageMetrics(page)
    // Scroll offsets are whole pixels, so a fractional canvas height can leave half a pixel.
    expect(Math.abs(atBottom.canvasBottom - (atBottom.stageBottom - atBottom.paddingBottom))).toBeLessThanOrEqual(0.5)
  })

  test('makes both horizontal edges reachable at 110%', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await selectFreeformPagePreset(page, '16:9')
    await setFreeformZoom(page, 110)
    await expect
      .poll(async () => {
        const metrics = await freeformStageMetrics(page)
        return metrics.scrollWidth - metrics.clientWidth
      })
      .toBeGreaterThan(1)

    const stage = page.locator('.freeform-stage-scroll')
    await stage.evaluate((node) => { node.scrollLeft = 0 })
    const atLeft = await freeformStageMetrics(page)
    expect(atLeft.canvasLeft).toBeCloseTo(atLeft.stageLeft + atLeft.paddingLeft, 0)

    await stage.evaluate((node) => { node.scrollLeft = node.scrollWidth })
    await expect.poll(async () => (await freeformStageMetrics(page)).scrollLeft).toBeGreaterThan(0)
    const atRight = await freeformStageMetrics(page)
    expect(Math.abs(atRight.canvasRight - (atRight.stageRight - atRight.paddingRight))).toBeLessThanOrEqual(0.5)
  })

  test('enforces zoom bounds and resets the middle control to 100%', async ({ page }) => {
    await openFreeform(page)
    const shrink = page.getByRole('button', { name: '缩小画布', exact: true })
    const enlarge = page.getByRole('button', { name: '放大画布', exact: true })
    const value = page.getByTestId('freeform-zoom-value')

    await setFreeformZoom(page, 10)
    await expect(shrink).toBeDisabled()
    await expect(enlarge).toBeEnabled()

    await setFreeformZoom(page, 400)
    await expect(enlarge).toBeDisabled()
    await expect(shrink).toBeEnabled()

    await fitFreeformCanvas(page)
    await expect(value).toHaveText('100%')
    await expect(shrink).toBeEnabled()
    await expect(enlarge).toBeEnabled()
  })

  test('preserves 150% while the viewport, page ratio, and active workspace change', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await setFreeformZoom(page, 150)
    const wide = await expectFreeformCanvasMatchesZoom(page, 150, false)

    await page.setViewportSize({ width: 1024, height: 768 })
    const compact = await expectFreeformCanvasMatchesZoom(page, 150, false)
    expect(compact.renderedWidth).not.toBeCloseTo(wide.renderedWidth, 0)
    await expect(page.getByTestId('freeform-zoom-value')).toHaveText('150%')

    await selectFreeformPagePreset(page, '9:16')
    await expectFreeformCanvasMatchesZoom(page, 150, false)
    await expect(page.getByTestId('freeform-zoom-value')).toHaveText('150%')

    await page.goto('/#/edit/md')
    await page.goto('/#/edit/canvas')
    await expectFreeformCanvasMatchesZoom(page, 150, false)
    await expect(page.getByTestId('freeform-zoom-value')).toHaveText('150%')
  })

  test('uses the live render scale for dragging and resizing at 150%', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 100)
    await setFreeformZoom(page, 150)
    const scale = await freeformCanvasScale(page)

    const element = page.getByTestId('freeform-element')
    const elementBox = await element.boundingBox()
    expect(elementBox).toBeTruthy()
    const dragStart = {
      x: elementBox!.x + elementBox!.width / 2,
      y: elementBox!.y + elementBox!.height / 2,
    }
    await page.mouse.move(dragStart.x, dragStart.y)
    await page.mouse.down()
    await page.mouse.move(dragStart.x + 120 * scale, dragStart.y + 80 * scale)
    await page.mouse.up()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 220, y: 180, width: 120, height: 100 },
    ])

    const resizeHandle = page.locator('.element-resize')
    const handleBox = await resizeHandle.boundingBox()
    expect(handleBox).toBeTruthy()
    const resizeStart = {
      x: handleBox!.x + handleBox!.width / 2,
      y: handleBox!.y + handleBox!.height / 2,
    }
    await page.mouse.move(resizeStart.x, resizeStart.y)
    await page.mouse.down()
    await page.mouse.move(resizeStart.x + 60 * scale, resizeStart.y + 40 * scale)
    await page.mouse.up()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 220, y: 180, width: 180, height: 140 },
    ])
  })
})

test('dark mode keeps freeform chrome controls and popovers legible', async ({ page }) => {
  await openFreeform(page)
  const html = page.locator('html')
  if ((await html.getAttribute('data-theme')) !== 'dark') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(html).not.toHaveClass(/theme-anim/)

  const toolbar = page.getByTestId('freeform-toolbar')
  // The tools sit on the top bar, which carries the surface and the divider.
  const header = page.getByTestId('app-header')
  await expect(header).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(header).not.toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)')
  const undoButton = toolbar.getByRole('button', { name: '撤销', exact: true })
  await expect(undoButton).toBeDisabled()
  const undoOpacity = Number(await undoButton.evaluate((button) => getComputedStyle(button).opacity))
  expect(undoOpacity).toBeGreaterThanOrEqual(0.35)
  expect(undoOpacity).toBeLessThan(1)
  await expect(undoButton).toHaveCSS('cursor', 'not-allowed')

  // The only page can't be deleted; its menu says so by greying the entry out.
  const pageMenu = await openPageMenu(page, 0)
  const deletePageItem = pageMenu.getByTestId('freeform-slide-context-menu-delete')
  await expect(deletePageItem).toBeDisabled()
  const enabledColor = await pageMenu.getByTestId('freeform-slide-context-menu-duplicate')
    .evaluate((item) => getComputedStyle(item).color)
  await expect(deletePageItem).not.toHaveCSS('color', enabledColor)
  await page.keyboard.press('Escape')
  await expect(pageMenu).toHaveCount(0)

  const pageTitleColors = await page.locator('.freeform-thumb-title').evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element.closest('.freeform-rail')!).backgroundColor,
  }))
  expect(contrastRatio(pageTitleColors.foreground, pageTitleColors.background)).toBeGreaterThanOrEqual(4.5)


  await page.getByTestId('page-size-trigger').click()
  const pageSizePopover = page.getByTestId('page-size-popover')
  await expect(pageSizePopover).toBeVisible()
  const pageSizeColors = await pageSizePopover.locator('.page-size-popover-heading strong').evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element.closest('.page-size-popover')!).backgroundColor,
  }))
  expect(contrastRatio(pageSizeColors.foreground, pageSizeColors.background)).toBeGreaterThanOrEqual(4.5)
  await page.keyboard.press('Escape')

  await page.getByTestId('freeform-elements-tool').click()
  const rectangle = page.getByTestId('freeform-elements-drawer').getByRole('button', { name: '矩形', exact: true })
  const tileColors = await rectangle.evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor,
  }))
  expect(contrastRatio(tileColors.foreground, tileColors.background)).toBeGreaterThanOrEqual(4.5)
  await rectangle.click()
  await page.getByTestId('freeform-elements-tool').click()

  const inspectorTitle = page.getByTestId('inspector-geometry').locator('.inspector-section-title')
  const inspectorColors = await inspectorTitle.evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element.closest('.freeform-inspector')!).backgroundColor,
  }))
  expect(contrastRatio(inspectorColors.foreground, inspectorColors.background)).toBeGreaterThanOrEqual(4.5)

  for (const locator of [
    page.locator('.freeform-inspector .field-grid label').first(),
    page.locator('.freeform-inspector .field-grid .color-field').first(),
  ]) {
    const colors = await locator.evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element.closest('.freeform-inspector')!).backgroundColor,
    }))
    expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5)
  }

  const shapeFill = page.getByTestId('shape-fill-paint')
  await shapeFill.getByTestId('paint-mode-linear-gradient').click()
  const range = shapeFill.getByTestId('paint-gradient-angle')
  await expect(range).toBeVisible()
  await expect(range).toHaveCSS('appearance', 'none')
  await expect(range).toHaveCSS('background-image', /linear-gradient/)
})

test('freeform chrome provides visible pressed feedback', async ({ page }) => {
  await openFreeform(page)
  const trigger = page.getByTestId('freeform-elements-tool')
  const box = await trigger.boundingBox()
  expect(box).toBeTruthy()
  const idleTransform = await trigger.evaluate((element) => getComputedStyle(element).transform)

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  const pressedTransform = await trigger.evaluate((element) => getComputedStyle(element).transform)
  expect(pressedTransform).not.toBe(idleTransform)
  await page.mouse.up()
  await page.keyboard.press('Escape')
})

test('reduced motion suppresses theme animation transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/edit')
  await page.evaluate(() => document.documentElement.classList.add('theme-anim'))

  const longestTransitionMs = await page.getByTestId('app-header').evaluate((element) => {
    const toMilliseconds = (value: string) =>
      value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000
    return Math.max(
      ...getComputedStyle(element)
        .transitionDuration.split(',')
        .map((value) => toMilliseconds(value.trim())),
    )
  })

  expect(longestTransitionMs).toBeLessThanOrEqual(0.01)
})

test('keeps artwork chrome-free on a warm stage in light and dark themes', async ({ page }) => {
  await openFreeform(page)
  const html = page.locator('html')
  const artboard = page.getByTestId('freeform-canvas')
  const stageBox = page.locator('.freeform-stage-box')
  const stage = page.locator('.freeform-stage-scroll')

  for (const theme of ['light', 'dark'] as const) {
    if ((await html.getAttribute('data-theme')) !== theme) {
      await page.getByTestId('theme-toggle').click()
    }
    await expect(html).toHaveAttribute('data-theme', theme)
    await expect(artboard).toHaveCSS('box-shadow', 'none')
    await expect(stageBox).not.toHaveCSS('box-shadow', 'none')

    const channels = await stage.evaluate((element) => {
      const values = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number)
      if (!values || values.length !== 3) throw new Error('stage background must be an RGB color')
      return values
    })
    expect(channels[0]).toBeGreaterThanOrEqual(channels[1])
    expect(channels[1]).toBeGreaterThanOrEqual(channels[2])
    expect(channels[0] - channels[2]).toBeGreaterThanOrEqual(2)
  }
})

test('freeform visual system uses approved runtime tokens and neutral stage rules', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFreeform(page)

  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return Object.fromEntries(
      [
        '--app-header-height',
        '--workspace-toolbar-height',
        '--control-height',
        '--control-radius',
        '--panel-radius',
      ].map((name) => [name, style.getPropertyValue(name).trim()]),
    )
  })
  expect(tokens).toEqual({
    '--app-header-height': '52px',
    '--workspace-toolbar-height': '50px',
    '--control-height': '32px',
    '--control-radius': '8px',
    '--panel-radius': '10px',
  })

  const mainColumns = await page.locator('.freeform-main').evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      columns: style.gridTemplateColumns.split(' '),
      gap: style.columnGap,
      padding: style.padding,
      overflowX: style.overflowX,
    }
  })
  expect(mainColumns.columns.at(0)).toBe('72px')
  expect(Number.parseFloat(mainColumns.columns.at(-1)!)).toBeCloseTo(302.4, 0)
  expect(mainColumns.gap).toBe('0px')
  expect(mainColumns.padding).toBe('0px')
  expect(mainColumns.overflowX).toBe('hidden')
  // The desk under the page is a quiet dot grid.
  await expect(page.locator('.freeform-stage-scroll')).toHaveCSS('background-image', /radial-gradient/)
  // The active page is outlined on the page itself (2px accent drop-shadow ring), not the thumb button.
  await expect(page.locator('.freeform-thumb.on .freeform-thumb-art'))
    .toHaveCSS('filter', /drop-shadow\(rgb\([^)]*\) 2px 0px 0px\)/)
})

test('arrow keys in the language menu do not nudge selected freeform elements', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementPosition(page, 240, 180)

  const positionInputs = page.locator('.freeform-inspector .field-grid').first().locator('input')
  const readPosition = async () => ({
    x: Number(await positionInputs.nth(0).inputValue()),
    y: Number(await positionInputs.nth(1).inputValue()),
  })
  const before = await readPosition()

  await page.evaluate(() => {
    document.documentElement.dataset.workspaceTabArrowEvents = '0'
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'ArrowLeft') {
          document.documentElement.dataset.workspaceTabArrowEvents = '1'
        }
      },
      { once: true },
    )
  })

  const languageMenu = page.getByTestId('language-menu')
  await languageMenu.focus()
  await page.keyboard.press('ArrowDown')
  const menu = page.getByRole('menu', { name: '界面语言' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(languageMenu).toBeFocused()
  await expect(page.locator('html')).toHaveAttribute('data-workspace-tab-arrow-events', '0')
  await expect.poll(readPosition).toEqual(before)
})

test('account changes reset the open project', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const accountSuffix = Date.now()
  await insertText(page)
  await page.getByLabel('文本内容').fill('跨账户草稿内容')

  await signUpToSave(page, `draft-${accountSuffix}-a`)

  const slideStatus = page.getByTestId('editor-save-state')
  await expect(slideStatus).toHaveText('已保存')
  const userADraftIds = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('slicer.drafts.'))
      .flatMap((key) =>
        (JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ id: string }>).map(
          (draft) => draft.id,
        ),
      ),
  )
  expect(userADraftIds).toHaveLength(1)

  // Signing out leaves nothing of account A on screen: its work is saved, the canvas starts over.
  await page.getByTestId('account-menu').click()
  await page.getByTestId('account-logout').click()
  await expect(page.getByTestId('account-login')).toBeVisible()
  await expect(slideStatus).toHaveCount(0)
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(page.getByTestId('editor-title')).toHaveText('未命名设计')

  // Account B starts empty and gets nothing of A's until it edits.
  await page.getByTestId('account-login').click()
  await registerUser(page, `draft-${accountSuffix}-b`)
  await expect(page.getByTestId('account-menu')).toBeVisible()
  await insertText(page)
  await expect(slideStatus).toHaveText('已保存')

  const draftStores = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('slicer.drafts.'))
      .map((key) => ({
        key,
        ids: (JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ id: string }>).map(
          (draft) => draft.id,
        ),
        texts: (JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ document: { slides: Array<{ nodes: Array<{ text?: string }> }> } }>)
          .flatMap((draft) => draft.document.slides.flatMap((slide) => slide.nodes.map((node) => node.text ?? ''))),
      })),
  )
  expect(draftStores).toHaveLength(2)
  expect(draftStores.every((store) => store.ids.length === 1)).toBe(true)
  const allDraftIds = draftStores.flatMap((store) => store.ids)
  expect(allDraftIds).toContain(userADraftIds[0])
  expect(new Set(allDraftIds).size).toBe(allDraftIds.length)
  expect(draftStores.filter((store) => store.texts.includes('跨账户草稿内容'))).toHaveLength(1)
})
