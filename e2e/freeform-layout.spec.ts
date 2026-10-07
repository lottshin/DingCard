import { expect, test } from '@playwright/test'
import {
  insertFreeformShape,
  insertFreeformText,
  openPageMenu,
  openToolPanel,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// The default layout: tool rail, insert panels and the page list on the left,
// the object toolbar above the canvas, zoom alone in its lower right corner,
// and the settings panel only when asked for.

const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

test('the canvas opens without a settings panel; 更多 opens it and the choice is kept', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  const more = page.getByTestId('ctx-more')
  const panel = page.getByRole('complementary', { name: '属性和图层面板' })
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()
  await expect(panel).toHaveCount(0)
  await expect(more).toHaveAttribute('aria-pressed', 'false')

  await insertFreeformText(page)
  await expect(page.getByTestId('freeform-context-toolbar')).toHaveAttribute('data-subject', 'text')
  await expect(panel).toHaveCount(0)

  const stageWidth = () => page.locator('.freeform-stage-pane').evaluate((node) => node.getBoundingClientRect().width)
  const wideStage = await stageWidth()
  await more.click()
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('tab', { name: '属性', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('inspector-typography')).toBeVisible()
  await expect(more).toHaveAttribute('aria-pressed', 'true')
  expect(await stageWidth()).toBeLessThan(wideStage)

  await page.reload()
  await expect(panel).toBeVisible()

  await panel.getByTestId('freeform-panel-close').click()
  await expect(panel).toHaveCount(0)
  await expect(more).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()
  await expect(panel).toHaveCount(0)
})

test('the layers button opens the panel on its layers tab, and 更多 switches it to properties', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await insertFreeformShape(page)
  const layers = page.getByTestId('freeform-layers-tool')
  const more = page.getByTestId('ctx-more')
  const panel = page.getByRole('complementary', { name: '属性和图层面板' })

  await layers.click()
  await expect(panel.getByRole('tab', { name: '图层', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('tree', { name: '图层树' })).toBeVisible()
  await expect(layers).toHaveAttribute('aria-pressed', 'true')
  await expect(more).toHaveAttribute('aria-pressed', 'false')

  await more.click()
  await expect(panel.getByRole('tab', { name: '属性', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(layers).toHaveAttribute('aria-pressed', 'false')
  await expect(more).toHaveAttribute('aria-pressed', 'true')

  await more.click()
  await expect(panel).toHaveCount(0)
})

test('insert panels stay open for the next insert and close from the rail, their button or Escape', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  const elementsTool = page.getByTestId('freeform-elements-tool')
  const panel = page.getByTestId('freeform-elements-drawer')

  await elementsTool.click()
  await panel.getByRole('button', { name: '三角形', exact: true }).click()
  await panel.getByRole('button', { name: '箭头', exact: true }).click()
  await expect(page.getByTestId('freeform-element')).toHaveCount(2)
  await expect(panel).toBeVisible()

  await elementsTool.click()
  await expect(panel).toHaveCount(0)

  await elementsTool.click()
  await panel.getByRole('button', { name: '关闭面板' }).click()
  await expect(panel).toHaveCount(0)

  await elementsTool.click()
  await panel.getByRole('button', { name: '圆形', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(elementsTool).toBeFocused()
})

test('a shape filled with a picture is framed from the toolbar', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await insertFreeformShape(page)
  // Filling a shape with a picture is an advanced setting in the panel.
  await page.getByTestId('ctx-more').click()
  await page.locator('input.freeform-file').nth(1).setInputFiles({
    name: 'shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(1)
  await page.getByTestId('freeform-panel-close').click()

  const frame = page.getByTestId('ctx-adjust-framing')
  await expect(frame).toBeEnabled()
  const stageBox = () => page.locator('.freeform-stage-scroll').evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return { top: rect.top, height: rect.height }
  })
  const before = await stageBox()
  await frame.click()
  await expect(page.getByTestId('freeform-framing-surface')).toBeVisible()
  // The bar steps aside without giving up its row, so the canvas keeps its size.
  await expect(page.getByTestId('freeform-context-toolbar')).toHaveCSS('visibility', 'hidden')
  expect(await stageBox()).toEqual(before)
  await page.getByTestId('freeform-framing-cancel').click()
  await expect(page.getByTestId('freeform-framing-surface')).toHaveCount(0)
})

test('the narrow layout has no empty panel row while the panel is closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()
  await expect(page.locator('.freeform-inspector')).toHaveCount(0)
  const rows = await page.locator('.freeform-main').evaluate((node) => getComputedStyle(node).gridTemplateRows.split(' ').length)
  expect(rows).toBe(4)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('the templates panel shows first pages; a deck opens to its pages, the gallery opens from the top', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  const templatesTool = page.getByTestId('freeform-template-button')
  await templatesTool.click()
  await expect(templatesTool).toHaveAttribute('aria-expanded', 'true')
  const panel = page.getByTestId('freeform-templates-drawer')
  const tiles = panel.locator('.freeform-template-tile')
  await expect(tiles).toHaveCount(36)
  await expect(tiles.first().locator('.freeform-slide-preview-artboard')).toHaveCount(1)

  const second = tiles.nth(1)
  const title = await second.locator('.freeform-template-tile-title').innerText()
  await second.click()
  await expect(panel.getByTestId('freeform-template-pages').getByRole('heading')).toHaveText(title)
  await panel.getByTestId('freeform-template-back').click()
  await expect(tiles).toHaveCount(36)

  await panel.getByTestId('freeform-templates-browse').click()
  const gallery = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(gallery).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(gallery).toHaveCount(0)
  await expect(panel).toBeVisible()
})

test('nothing runs under the stage: pages sit on the left and zoom alone in the corner', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()
  const box = (selector: string) => page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
  })

  const tools = await box('.freeform-tools')
  const pages = await box('.freeform-rail')
  const stage = await box('.freeform-stage-pane')
  expect(pages.left).toBeCloseTo(tools.right, 0)
  expect(pages.right).toBeCloseTo(stage.left, 0)
  expect(pages.top).toBeCloseTo(stage.top, 0)
  expect(stage.bottom).toBeCloseTo(900, 0)
  expect(pages.bottom).toBeCloseTo(900, 0)

  // Zoom floats in the stage's lower right corner, clear of the fitted page.
  const zoom = await box('.freeform-zoom')
  const canvas = await box('[data-testid="freeform-canvas"]')
  expect(zoom.right).toBeLessThanOrEqual(stage.right)
  expect(zoom.bottom).toBeLessThanOrEqual(stage.bottom)
  expect(stage.right - zoom.right).toBeLessThan(24)
  expect(stage.bottom - zoom.bottom).toBeLessThan(24)
  expect(canvas.bottom).toBeLessThan(zoom.top)
  await expect(page.locator('.freeform-zoom button')).toHaveCount(3)

  // The value fits the page again.
  await page.getByRole('button', { name: '放大画布', exact: true }).click()
  await expect(page.getByTestId('freeform-zoom-value')).toHaveText('110%')
  await page.getByTestId('freeform-zoom-value').click()
  await expect(page.getByTestId('freeform-zoom-value')).toHaveText('100%')

  // Rulers, guides and snapping are toggles in the top bar, beside the page size.
  const topBar = page.getByTestId('freeform-toolbar')
  const views = topBar.getByRole('group', { name: '视图' })
  await expect(views.getByRole('button')).toHaveCount(3)
  for (const [name, pressed] of [['显示标尺', 'false'], ['显示参考线', 'true'], ['对象吸附', 'true']] as const) {
    await expect(views.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', pressed)
  }
  await views.getByRole('button', { name: '显示标尺', exact: true }).click()
  await expect(page.getByTestId('freeform-ruler-x')).toBeVisible()

  // With nothing selected the bar above the canvas holds only 更多.
  await expect(page.getByTestId('freeform-context-toolbar').getByRole('button')).toHaveText(['更多'])

  // The page list stays beside an open insert panel, so a picture can go on each page in turn.
  await page.getByRole('button', { name: '新增页面' }).click()
  await openToolPanel(page, 'elements')
  // (The panel slides in, so wait for it to settle before measuring.)
  await expect.poll(async () => (await box('.freeform-rail')).left - (await box('.freeform-drawer')).right)
    .toBeCloseTo(0, 0)
  await page.getByTestId('freeform-thumb').first().click()
  await expect(page.getByTestId('freeform-thumb').first()).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('freeform-elements-drawer')).toBeVisible()
  const menuForPage = await openPageMenu(page, 1)
  await expect(menuForPage.getByTestId('freeform-slide-context-menu-delete')).toBeEnabled()
})

test('the settings panel follows the window width and its fields never spill out', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dingcard.lang.v1', 'en')
    localStorage.setItem('slicer.freeform.prefs.v1', JSON.stringify({ panelOpen: true }))
  })
  const panel = page.locator('.freeform-right-panel')
  const spill = () => panel.evaluate((node) => {
    const edge = node.getBoundingClientRect()
    return Array.from(node.querySelectorAll<HTMLElement>('*'))
      .filter((child) => !child.closest('[hidden]') && child.getClientRects().length > 0)
      .filter((child) => {
        const rect = child.getBoundingClientRect()
        return rect.width > 0 && (rect.right > edge.right + 0.5 || rect.left < edge.left - 0.5)
      })
      .map((child) => child.className || child.tagName)
  })

  for (const [width, expected] of [[1024, 256], [1440, 302.4], [1920, 304]] as const) {
    await page.setViewportSize({ width, height: 860 })
    await page.goto('/#/edit/canvas')
    await expect(panel).toBeVisible()
    expect((await panel.boundingBox())!.width).toBeCloseTo(expected, 0)
    // The page background as a radial gradient: stops with hex, position and remove.
    await panel.getByTestId('paint-mode-radial-gradient').first().click()
    await expect(panel.getByTestId('paint-stop-0-offset')).toBeVisible()
    await panel.getByTestId('paint-stops-add').first().click()
    await expect(panel.getByTestId('paint-stop-2-remove')).toBeEnabled()
    expect(await spill()).toEqual([])
    await expect(panel.getByTestId('freeform-panel-close')).toBeInViewport({ ratio: 1 })
  }
})

test('the page list collapses, comes back from the rail, and PageUp / PageDown turn pages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()
  const list = page.getByTestId('freeform-page-strip')
  const pagesTool = page.getByTestId('freeform-pages-tool')
  const thumbs = page.getByTestId('freeform-thumb')
  const stageWidth = () => page.locator('.freeform-stage-pane').evaluate((node) => node.getBoundingClientRect().width)

  await page.getByRole('button', { name: '新增页面' }).click()
  await expect(list.getByRole('heading', { name: '2 页' })).toBeVisible()
  await expect(thumbs.nth(1)).toHaveAttribute('aria-current', 'page')

  // PageUp / PageDown walk the pages, which still works with the list collapsed.
  await page.locator('.freeform-stage-scroll').click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('PageUp')
  await expect(thumbs.first()).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('PageUp')
  await expect(thumbs.first()).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('PageDown')
  await expect(thumbs.nth(1)).toHaveAttribute('aria-current', 'page')

  await expect(pagesTool).toHaveAttribute('aria-pressed', 'true')
  const withList = await stageWidth()
  await list.getByRole('button', { name: '收起页面列表' }).click()
  await expect(list).toHaveCount(0)
  await expect(pagesTool).toHaveAttribute('aria-pressed', 'false')
  expect(await stageWidth()).toBeGreaterThan(withList + 100)

  // The choice is kept, and 页面 in the rail brings the list back.
  await page.reload()
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()
  await expect(list).toHaveCount(0)
  await pagesTool.click()
  await expect(list).toBeVisible()
  await expect(pagesTool).toHaveAttribute('aria-pressed', 'true')
  await expect(thumbs).toHaveCount(2)
})
