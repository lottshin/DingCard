// Canvas interaction polish: zoom, pan, alt-drag, rotation and resize gestures,
// context menus, thumbnails, the timeline, rulers, guides, and badges.

import { expect, test } from '@playwright/test'
import {
  TEST_PNG,
  dragGuideFromRuler,
  duplicateCurrentPage,
  freeformCanvasScale,
  freeformElementBoxes,
  insertShape,
  insertText,
  insertTwoSelectedRectangles,
  locatorOwnsPoint,
  openFreeform,
  openPageMenu,
  selectFreeformPagePreset,
  selectedFreeformElements,
  setFreeformZoom,
  setSelectedElementBox,
  setSelectedElementPosition,
  signUpToSave,
  stageGeometry,
  startWithSettingsPanelOpen,
  waitForCanvasFit,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test.describe('freeform canvas interaction polish', () => {
  async function canvasWorldPointAt(
    page: import('@playwright/test').Page,
    clientX: number,
    clientY: number,
  ) {
    return page.getByTestId('freeform-canvas').evaluate((canvas, point) => {
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / Number.parseFloat(canvas.style.width)
      return { x: (point.x - rect.left) / scale, y: (point.y - rect.top) / scale }
    }, { x: clientX, y: clientY })
  }

  async function elementRotationDegrees(
    page: import('@playwright/test').Page,
  ) {
    return page.getByTestId('freeform-element').evaluate((node) => {
      const transform = getComputedStyle(node).transform
      if (transform === 'none') return 0
      const matrix = new DOMMatrixReadOnly(transform)
      return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI
    })
  }

  test('ctrl+wheel zooms around the cursor while plain wheel still scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await selectFreeformPagePreset(page, '16:9')
    await setFreeformZoom(page, 200)
    const stage = page.locator('.freeform-stage-scroll')
    await stage.evaluate((node) => {
      node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2
      node.scrollTop = (node.scrollHeight - node.clientHeight) / 2
    })
    const value = page.getByTestId('freeform-zoom-value')
    await expect(value).toHaveText('200%')

    const stageBox = await stage.boundingBox()
    expect(stageBox).toBeTruthy()
    const cursor = {
      x: stageBox!.x + stageBox!.width * 0.6,
      y: stageBox!.y + stageBox!.height * 0.4,
    }
    const before = await canvasWorldPointAt(page, cursor.x, cursor.y)

    await page.mouse.move(cursor.x, cursor.y)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -120)
    await page.keyboard.up('Control')

    await expect(value).not.toHaveText('200%')
    const after = await canvasWorldPointAt(page, cursor.x, cursor.y)
    expect(after.x).toBeCloseTo(before.x, 0)
    expect(after.y).toBeCloseTo(before.y, 0)

    // Without Ctrl the wheel keeps scrolling the stage natively.
    await stage.evaluate((node) => { node.scrollTop = 0 })
    await page.mouse.wheel(0, 120)
    await expect.poll(() => stage.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
  })

  test('ctrl +/-/0 keyboard shortcuts step and reset the canvas zoom', async ({ page }) => {
    await openFreeform(page)
    const value = page.getByTestId('freeform-zoom-value')
    await expect(value).toHaveText('100%')

    await page.keyboard.press('Control+=')
    await expect(value).toHaveText('110%')
    await page.keyboard.press('Control+Shift+=')
    await expect(value).toHaveText('120%')
    await page.keyboard.press('Control+-')
    await expect(value).toHaveText('110%')
    await page.keyboard.press('Control+0')
    await expect(value).toHaveText('100%')
  })

  test('holding space pans the canvas instead of selecting or dragging', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await selectFreeformPagePreset(page, '16:9')
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 100)
    await page.keyboard.press('Escape')
    await setFreeformZoom(page, 200)
    const stage = page.locator('.freeform-stage-scroll')
    await stage.evaluate((node) => {
      node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2
      node.scrollTop = (node.scrollHeight - node.clientHeight) / 2
    })
    const before = await stage.evaluate((node) => ({
      left: node.scrollLeft,
      top: node.scrollTop,
    }))
    const stageBox = await stage.boundingBox()
    expect(stageBox).toBeTruthy()

    // Focus still sits on the zoom button (canvas pointerdown is prevented);
    // blur it so Space arms panning the way it does for a plain page focus.
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur() })
    await page.keyboard.down('Space')
    await expect(stage).toHaveClass(/space-pan-ready/)
    await expect(stage).toHaveCSS('cursor', 'grab')

    const panFrom = {
      x: stageBox!.x + stageBox!.width / 2,
      y: stageBox!.y + stageBox!.height / 2,
    }
    await page.mouse.move(panFrom.x, panFrom.y)
    await page.mouse.down()
    await expect(stage).toHaveClass(/space-panning/)
    await expect(stage).toHaveCSS('cursor', 'grabbing')
    await page.mouse.move(panFrom.x - 120, panFrom.y - 80)
    await page.mouse.up()
    await expect(stage).not.toHaveClass(/space-panning/)
    await expect(stage).toHaveClass(/space-pan-ready/)

    const afterPan = await stage.evaluate((node) => ({
      left: node.scrollLeft,
      top: node.scrollTop,
    }))
    expect(afterPan.left).toBeCloseTo(before.left + 120, 0)
    expect(afterPan.top).toBeCloseTo(before.top + 80, 0)

    await expect(page.getByTestId('freeform-selection-box')).toHaveCount(0)
    await expect
      .poll(() => freeformElementBoxes(page))
      .toEqual([{ x: 100, y: 100, width: 120, height: 100 }])

    await page.keyboard.up('Space')
    await expect(stage).not.toHaveClass(/space-pan-ready/)

    // Space on a focused button keeps activating the button instead of panning.
    await page.getByRole('button', { name: '放大画布', exact: true }).focus()
    await page.keyboard.down('Space')
    await expect(stage).not.toHaveClass(/space-pan-ready/)
    await page.keyboard.up('Space')
  })

  test('alt+drag duplicates the selection in one undo entry', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 80, 120, 100)
    const element = page.getByTestId('freeform-element')
    await expect(element).toHaveCount(1)
    const scale = await freeformCanvasScale(page)
    const workspace = page.locator('.freeform-workspace')
    const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

    const box = await element.boundingBox()
    expect(box).toBeTruthy()
    const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
    await page.keyboard.down('Alt')
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 120 * scale, start.y + 80 * scale)
    await page.mouse.up()
    await page.keyboard.up('Alt')

    await expect(element).toHaveCount(2)
    await expect(selectedFreeformElements(page)).toHaveCount(1)
    await expect
      .poll(() => freeformElementBoxes(page))
      .toEqual([
        { x: 100, y: 80, width: 120, height: 100 },
        { x: 220, y: 160, width: 120, height: 100 },
      ])
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))

    await page.keyboard.press('Control+Z')
    await expect(element).toHaveCount(1)
    await expect
      .poll(() => freeformElementBoxes(page))
      .toEqual([{ x: 100, y: 80, width: 120, height: 100 }])
  })

  test('shift rotation snaps to 15° steps', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 200, 200, 120, 100)
    const element = page.getByTestId('freeform-element')

    const handleBox = await page.getByTestId('freeform-selection-rotate').boundingBox()
    const selBox = await page.getByTestId('freeform-selection-box').boundingBox()
    expect(handleBox).toBeTruthy()
    expect(selBox).toBeTruthy()
    const center = { x: selBox!.x + selBox!.width / 2, y: selBox!.y + selBox!.height / 2 }
    const start = {
      x: handleBox!.x + handleBox!.width / 2,
      y: handleBox!.y + handleBox!.height / 2,
    }
    const vector = { x: start.x - center.x, y: start.y - center.y }
    const pointAtAngle = (degrees: number) => {
      const rad = (degrees * Math.PI) / 180
      return {
        x: center.x + vector.x * Math.cos(rad) - vector.y * Math.sin(rad),
        y: center.y + vector.x * Math.sin(rad) + vector.y * Math.cos(rad),
      }
    }

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.keyboard.down('Shift')
    await page.mouse.move(pointAtAngle(26).x, pointAtAngle(26).y)
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect.poll(() => elementRotationDegrees(page)).toBeCloseTo(30, 0)

    await page.keyboard.press('Control+Z')
    await expect.poll(() => elementRotationDegrees(page)).toBeCloseTo(0, 1)

    // The same gesture without Shift lands on the raw angle.
    await element.click()
    const secondHandle = await page.getByTestId('freeform-selection-rotate').boundingBox()
    const secondBox = await page.getByTestId('freeform-selection-box').boundingBox()
    expect(secondHandle).toBeTruthy()
    expect(secondBox).toBeTruthy()
    const secondCenter = {
      x: secondBox!.x + secondBox!.width / 2,
      y: secondBox!.y + secondBox!.height / 2,
    }
    const secondStart = {
      x: secondHandle!.x + secondHandle!.width / 2,
      y: secondHandle!.y + secondHandle!.height / 2,
    }
    const secondVector = { x: secondStart.x - secondCenter.x, y: secondStart.y - secondCenter.y }
    const secondPoint = (degrees: number) => {
      const rad = (degrees * Math.PI) / 180
      return {
        x: secondCenter.x + secondVector.x * Math.cos(rad) - secondVector.y * Math.sin(rad),
        y: secondCenter.y + secondVector.x * Math.sin(rad) + secondVector.y * Math.cos(rad),
      }
    }
    await page.mouse.move(secondStart.x, secondStart.y)
    await page.mouse.down()
    await page.mouse.move(secondPoint(26).x, secondPoint(26).y)
    await page.mouse.up()
    await expect.poll(() => elementRotationDegrees(page)).toBeCloseTo(26, 0)
  })

  test('shift resize keeps the leaf aspect ratio', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 100)
    const scale = await freeformCanvasScale(page)

    const handleBox = await page.getByTestId('freeform-selection-resize').boundingBox()
    expect(handleBox).toBeTruthy()
    const start = {
      x: handleBox!.x + handleBox!.width / 2,
      y: handleBox!.y + handleBox!.height / 2,
    }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.keyboard.down('Shift')
    await page.mouse.move(start.x + 60 * scale, start.y + 30 * scale)
    await page.mouse.up()
    await page.keyboard.up('Shift')

    const [resized] = await freeformElementBoxes(page)
    // Shift scales both edges by the same factor, so the 120:100 aspect
    // survives while neither edge keeps its per-axis delta (180 / 130).
    expect(resized.width / resized.height).toBeCloseTo(1.2, 2)
    expect(resized.width).toBeGreaterThan(160)
    expect(resized.width).toBeLessThan(180)
    expect(resized.height).toBeGreaterThan(135)
    expect(resized.height).toBeLessThan(150)
  })
})

test.describe('freeform context menu', () => {
  test('right-click opens a scoped menu and delete removes the node', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const element = page.getByTestId('freeform-element')
    await expect(element).toHaveCount(1)

    await element.click({ button: 'right' })
    const menu = page.getByTestId('freeform-context-menu')
    await expect(menu).toBeVisible()
    await expect(menu).toHaveAttribute('role', 'menu')
    await expect(menu).toHaveAttribute('aria-label', '画布操作')
    await expect(menu.getByTestId('freeform-context-menu-copy')).toBeEnabled()
    await expect(menu.getByTestId('freeform-context-menu-paste')).toBeDisabled()
    await expect(menu.getByTestId('freeform-context-menu-delete')).toBeEnabled()
    await expect(menu.getByTestId('freeform-context-menu-forward')).toBeEnabled()
    await expect(menu.getByTestId('freeform-context-menu-group')).toBeDisabled()
    await expect(menu.getByTestId('freeform-context-menu-ungroup')).toBeDisabled()
    await expect(menu.getByTestId('freeform-context-menu-lock')).toHaveText('锁定')
    await expect(menu.getByTestId('freeform-context-menu-visibility')).toHaveText('隐藏')

    await menu.getByTestId('freeform-context-menu-delete').click()
    await expect(menu).toHaveCount(0)
    await expect(element).toHaveCount(0)
  })

  test('groups and ungroups from the context menu', async ({ page }) => {
    await insertTwoSelectedRectangles(page)
    const element = page.getByTestId('freeform-element')
    await expect(element).toHaveCount(2)

    await element.first().click({ button: 'right' })
    const menu = page.getByTestId('freeform-context-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('freeform-context-menu-group')).toBeEnabled()
    await menu.getByTestId('freeform-context-menu-group').click()
    await expect(menu).toHaveCount(0)
    const group = page.getByTestId('freeform-scene-group')
    await expect(group).toHaveCount(1)

    // The group wrapper itself has no box (children are absolutely placed);
    // right-click a child, whose hit path climbs to the group.
    await element.first().click({ button: 'right' })
    await expect(page.getByTestId('freeform-context-menu')).toBeVisible()
    await expect(page.getByTestId('freeform-context-menu-ungroup')).toBeEnabled()
    await page.getByTestId('freeform-context-menu-ungroup').click()
    await expect(page.getByTestId('freeform-context-menu')).toHaveCount(0)
    await expect(element).toHaveCount(2)
  })

  test('empty-canvas menu pastes and closes on escape and outside click', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const element = page.getByTestId('freeform-element')
    await element.click()
    await page.keyboard.press('Control+C')
    const canvas = page.getByTestId('freeform-canvas')

    await canvas.click({ position: { x: 20, y: 20 }, button: 'right' })
    const menu = page.getByTestId('freeform-context-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('freeform-context-menu-delete')).toBeDisabled()
    await expect(menu.getByTestId('freeform-context-menu-copy')).toBeDisabled()
    await expect(menu.getByTestId('freeform-context-menu-paste')).toBeEnabled()

    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)

    await canvas.click({ position: { x: 20, y: 20 }, button: 'right' })
    await expect(menu).toBeVisible()
    await page.getByTestId('inspector-page').locator('.inspector-section-title').click()
    await expect(menu).toHaveCount(0)

    await canvas.click({ position: { x: 20, y: 20 }, button: 'right' })
    await expect(menu).toBeVisible()
    await menu.getByTestId('freeform-context-menu-paste').click()
    await expect(menu).toHaveCount(0)
    await expect(element).toHaveCount(2)
  })

  test('lock and hide toggle from the context menu', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const element = page.getByTestId('freeform-element')

    await element.click({ button: 'right' })
    const menu = page.getByTestId('freeform-context-menu')
    await expect(menu).toBeVisible()
    await menu.getByTestId('freeform-context-menu-lock').click()
    await expect(menu).toHaveCount(0)
    // Both the inspector's lock note and the bar above the canvas offer to unlock.
    const unlock = page.getByRole('button', { name: /^解锁/ })
    await expect(page.getByTestId('freeform-lock-banner').getByRole('button', { name: /^解锁/ })).toBeVisible()
    await expect(page.getByTestId('freeform-context-toolbar').getByRole('button', { name: '解锁对象' })).toBeVisible()

    await element.click({ button: 'right' })
    await expect(page.getByTestId('freeform-context-menu-lock')).toHaveText('解锁')
    await page.getByTestId('freeform-context-menu-lock').click()
    await expect(unlock).toHaveCount(0)

    await element.click({ button: 'right' })
    await page.getByTestId('freeform-context-menu-visibility').click()
    await expect(element).toBeHidden()
    await page.keyboard.press('Control+Z')
    await expect(element).toBeVisible()
  })
})

test.describe('freeform layout efficiency', () => {
  test('floating align bar aligns and distributes the multi-selection', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 100, 80)
    await insertShape(page)
    await setSelectedElementBox(page, 350, 180, 100, 60)
    await insertShape(page)
    await setSelectedElementBox(page, 800, 60, 100, 110)
    const bar = page.getByTestId('freeform-align-bar')
    // A single selection shows the bar too (align-to-page mode); the
    // distribute buttons stay disabled until three objects are selected.
    await expect(bar).toBeVisible()
    await expect(bar.getByTestId('freeform-distribute-h')).toBeDisabled()
    await expect(bar.getByTestId('freeform-distribute-v')).toBeDisabled()

    const elements = page.getByTestId('freeform-element')
    await elements.nth(0).click({ modifiers: ['Shift'] })
    await expect(bar).toBeVisible()
    await expect(bar).toHaveAttribute('role', 'toolbar')
    await expect(bar).toHaveAttribute('aria-label', '对齐与分布')
    await expect(bar.getByTestId('freeform-distribute-h')).toBeDisabled()
    await expect(bar.getByTestId('freeform-distribute-v')).toBeDisabled()
    await elements.nth(1).click({ modifiers: ['Shift'] })
    await expect(selectedFreeformElements(page)).toHaveCount(3)
    await expect(bar.getByTestId('freeform-distribute-h')).toBeEnabled()
    await expect(bar.getByTestId('freeform-distribute-v')).toBeEnabled()

    // Gaps 150 and 350 become equal 250 gaps; the outer elements stay put.
    await bar.getByTestId('freeform-distribute-h').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 100, y: 100, width: 100, height: 80 },
      { x: 450, y: 180, width: 100, height: 60 },
      { x: 800, y: 60, width: 100, height: 110 },
    ])

    await bar.getByTestId('freeform-align-left').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 100, y: 100, width: 100, height: 80 },
      { x: 100, y: 180, width: 100, height: 60 },
      { x: 100, y: 60, width: 100, height: 110 },
    ])

    await bar.getByTestId('freeform-align-top').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 100, y: 60, width: 100, height: 80 },
      { x: 100, y: 60, width: 100, height: 60 },
      { x: 100, y: 60, width: 100, height: 110 },
    ])

    await page.keyboard.press('Escape')
    await expect(bar).toHaveCount(0)
  })

  test('shift+2 zooms to the selection and shift+1 fits the page again', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await insertShape(page)
    // Off the page center so the recentering is observable, and mid-page so
    // the required scroll stays clear of the bottom clamp.
    await setSelectedElementBox(page, 150, 500, 500, 250)
    const value = page.getByTestId('freeform-zoom-value')
    await expect(value).toHaveText('100%')
    const stage = page.locator('.freeform-stage-scroll')
    const stageBox = await stage.boundingBox()
    expect(stageBox).toBeTruthy()

    // Leave the inspector inputs so the shortcut reaches the canvas handler.
    const element = page.getByTestId('freeform-element')
    await element.click()
    await page.keyboard.press('Shift+2')
    await expect(value).not.toHaveText('100%')

    const box = await element.boundingBox()
    expect(box).toBeTruthy()
    // The visible content center: clientWidth/Height exclude any scrollbar
    // that appeared once the zoomed canvas outgrew the stage.
    const visibleCenter = await stage.evaluate((node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      const padding = (value: string) => Number.parseFloat(value) || 0
      const paddingLeft = padding(style.paddingLeft)
      const paddingTop = padding(style.paddingTop)
      return {
        x: rect.left + node.clientLeft + paddingLeft
          + (node.clientWidth - paddingLeft - padding(style.paddingRight)) / 2,
        y: rect.top + node.clientTop + paddingTop
          + (node.clientHeight - paddingTop - padding(style.paddingBottom)) / 2,
      }
    })
    expect(Math.abs(box!.x + box!.width / 2 - visibleCenter.x)).toBeLessThan(2)
    expect(Math.abs(box!.y + box!.height / 2 - visibleCenter.y)).toBeLessThan(2)

    await page.keyboard.press('Shift+1')
    await expect(value).toHaveText('100%')
  })

  test('copy and paste style between leaves with shortcuts and the context menu', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 100)
    const hexInput = page.getByTestId('inspector-fill')
      .getByTestId('shape-fill-paint')
      .getByLabel('填充 hex', { exact: true })
    await hexInput.fill('#8b5cf6')
    await expect(hexInput).toHaveValue('#8b5cf6')

    await insertShape(page)
    await setSelectedElementBox(page, 300, 340, 100, 100)
    await expect(hexInput).not.toHaveValue('#8b5cf6')

    const elements = page.getByTestId('freeform-element')
    const menu = page.getByTestId('freeform-context-menu')
    await elements.nth(1).click({ button: 'right' })
    await expect(menu.getByTestId('freeform-context-menu-copy-style')).toBeEnabled()
    await expect(menu.getByTestId('freeform-context-menu-paste-style')).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)

    await elements.first().click({ button: 'right' })
    await menu.getByTestId('freeform-context-menu-copy-style').click()
    await expect(menu).toHaveCount(0)

    await elements.nth(1).click()
    const workspace = page.locator('.freeform-workspace')
    const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
    await page.keyboard.press('Control+Alt+V')
    await expect(hexInput).toHaveValue('#8b5cf6')
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))

    await page.keyboard.press('Control+Z')
    await expect(hexInput).not.toHaveValue('#8b5cf6')

    await elements.nth(1).click({ button: 'right' })
    await expect(menu.getByTestId('freeform-context-menu-paste-style')).toBeEnabled()
    await menu.getByTestId('freeform-context-menu-zoom-selection').click()
    await expect(menu).toHaveCount(0)
    await expect(page.getByTestId('freeform-zoom-value')).not.toHaveText('100%')
  })
})

test.describe('freeform page management', () => {
  test('thumbnail drag reorders pages with an insertion indicator', async ({ page }) => {
    await openFreeform(page)
    const addPage = page.getByRole('button', { name: '新增页面' })
    await addPage.click()
    await addPage.click()
    const thumbs = page.getByTestId('freeform-thumb')
    const titles = page.locator('.freeform-thumb-title')
    const slideOrder = () => thumbs.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-slide-id')))
    await expect(thumbs).toHaveCount(3)
    await expect(titles).toHaveText(['第 1 页', '第 2 页', '第 3 页'])
    const [first, second, third] = await slideOrder()

    // The insertion indicator follows the pointer's half of the hovered thumb
    // (upper or lower: the list runs down the side).
    const dragOver = (locator: import('@playwright/test').Locator, ratio: number) =>
      locator.evaluate((node, y) => {
        const bounds = node.getBoundingClientRect()
        node.dispatchEvent(new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          clientX: bounds.left + bounds.width / 2,
          clientY: bounds.top + bounds.height * y,
          dataTransfer: new DataTransfer(),
        }))
      }, ratio)
    await thumbs.first().evaluate((node) => {
      node.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      }))
    })
    await dragOver(thumbs.nth(2), 0.75)
    await expect(thumbs.nth(2)).toHaveClass(/drop-after/)
    await dragOver(thumbs.nth(2), 0.25)
    await expect(thumbs.nth(2)).toHaveClass(/drop-before/)
    await expect(thumbs.nth(2)).not.toHaveClass(/drop-after/)
    await thumbs.first().evaluate((node) => {
      node.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true }))
    })
    await expect(thumbs.nth(2)).not.toHaveClass(/drop-before/)

    // A real drag gesture moves page 1 below page 3.
    const target = await thumbs.nth(2).boundingBox()
    expect(target).toBeTruthy()
    await thumbs.first().dragTo(thumbs.nth(2), {
      targetPosition: { x: target!.width / 2, y: target!.height * 0.75 },
    })
    await expect.poll(slideOrder).toEqual([second, third, first])
    // Pages nobody named are called by where they sit now.
    await expect(titles).toHaveText(['第 1 页', '第 2 页', '第 3 页'])
    // Reordering never changes the active page.
    await expect(page.locator('.freeform-thumb.on')).toHaveAttribute('data-slide-id', third!)
    await expect(page.locator('.freeform-thumb.on .freeform-thumb-title')).toHaveText('第 2 页')

    await page.keyboard.press('Control+z')
    await expect.poll(slideOrder).toEqual([first, second, third])
  })

  test('thumbnail context menu duplicates, deletes, and moves pages', async ({ page }) => {
    await openFreeform(page)
    await page.getByRole('button', { name: '新增页面' }).click()
    const thumbs = page.getByTestId('freeform-thumb')
    const titles = page.locator('.freeform-thumb-title')
    const slideOrder = () => thumbs.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-slide-id')))
    await expect(titles).toHaveText(['第 1 页', '第 2 页'])
    const [first, second] = await slideOrder()

    await thumbs.nth(1).click({ button: 'right' })
    const menu = page.getByTestId('freeform-slide-context-menu')
    await expect(menu).toBeVisible()
    await expect(menu).toHaveAttribute('role', 'menu')
    await expect(menu).toHaveAttribute('aria-label', '页面操作')
    await expect(menu.getByTestId('freeform-slide-context-menu-up')).toBeEnabled()
    await expect(menu.getByTestId('freeform-slide-context-menu-down')).toBeDisabled()
    await expect(menu.getByTestId('freeform-slide-context-menu-delete')).toBeEnabled()
    await menu.getByTestId('freeform-slide-context-menu-up').click()
    await expect(menu).toHaveCount(0)
    await expect.poll(slideOrder).toEqual([second, first])

    await thumbs.first().click({ button: 'right' })
    await page.getByTestId('freeform-slide-context-menu-back').click()
    await expect.poll(slideOrder).toEqual([first, second])

    await thumbs.nth(1).click({ button: 'right' })
    await page.getByTestId('freeform-slide-context-menu-duplicate').click()
    await expect(thumbs).toHaveCount(3)
    const copy = (await slideOrder())[2]
    expect([first, second]).not.toContain(copy)
    await expect(titles).toHaveText(['第 1 页', '第 2 页', '第 3 页'])
    await expect(page.locator('.freeform-thumb.on')).toHaveAttribute('data-slide-id', copy!)

    await thumbs.nth(2).click({ button: 'right' })
    await page.getByTestId('freeform-slide-context-menu-delete').click()
    await expect(thumbs).toHaveCount(2)
    await expect.poll(slideOrder).toEqual([first, second])

    await thumbs.first().click({ button: 'right' })
    await page.getByTestId('freeform-slide-context-menu-delete').click()
    await expect(thumbs).toHaveCount(1)
    await expect.poll(slideOrder).toEqual([second])
    await expect(titles).toHaveText(['第 1 页'])

    await thumbs.first().click({ button: 'right' })
    await expect(page.getByTestId('freeform-slide-context-menu-delete')).toBeDisabled()
    await expect(page.getByTestId('freeform-slide-context-menu-up')).toBeDisabled()
    await expect(page.getByTestId('freeform-slide-context-menu-down')).toBeDisabled()
    await expect(page.getByTestId('freeform-slide-context-menu-front')).toBeDisabled()
    await expect(page.getByTestId('freeform-slide-context-menu-back')).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('freeform-slide-context-menu')).toHaveCount(0)
  })
})

test.describe('freeform history panel', () => {
  const historyItem = (page: import('@playwright/test').Page, label: string) =>
    page.locator('[data-testid="freeform-history-item"]').filter({
      has: page.locator('.freeform-history-label', { hasText: label }),
    })

  test('lists labeled steps and jumps to any state on the timeline', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementPosition(page, 300, 240)
    const hexInput = page.getByTestId('inspector-fill')
      .getByTestId('shape-fill-paint')
      .getByLabel('填充 hex', { exact: true })
    await hexInput.fill('#8b5cf6')

    const element = page.getByTestId('freeform-element')
    const shapeFill = async () => element.locator('.freeform-shape').evaluate((node) =>
      getComputedStyle(node).backgroundColor,
    )
    expect(await shapeFill()).toBe('rgb(139, 92, 246)')

    await page.getByRole('tab', { name: '历史', exact: true }).click()
    await expect(page.getByTestId('freeform-history-panel')).toBeVisible()
    const items = page.getByTestId('freeform-history-item')
    // Insert, X move, Y move, fill: the newest edit sits on top.
    await expect(items).toHaveCount(5)
    await expect(items.nth(0)).toHaveAttribute('data-history-kind', 'current')
    await expect(items.nth(0).locator('.freeform-history-label')).toHaveText('更改样式')
    await expect(items.nth(1)).toHaveAttribute('data-history-kind', 'past')
    await expect(items.nth(1).locator('.freeform-history-label')).toHaveText('移动对象')
    await expect(items.nth(2).locator('.freeform-history-label')).toHaveText('移动对象')
    await expect(items.nth(3).locator('.freeform-history-label')).toHaveText('插入对象')
    await expect(items.nth(4).locator('.freeform-history-label')).toHaveText('初始文档')

    // Jump to the state right after the insert: the fill reverts.
    await historyItem(page, '插入对象').click()
    await expect(items).toHaveCount(5)
    await expect(items.nth(3)).toHaveAttribute('data-history-kind', 'current')
    await expect(items.nth(3).locator('.freeform-history-label')).toHaveText('插入对象')
    await expect(items.nth(0)).toHaveAttribute('data-history-kind', 'future')
    await expect(items.nth(0).locator('.freeform-history-label')).toHaveText('更改样式')
    await expect(items.nth(1).locator('.freeform-history-label')).toHaveText('移动对象')
    await expect(await shapeFill()).not.toBe('rgb(139, 92, 246)')
    await expect(element).toHaveCount(1)

    // Jump to the very first state: the shape disappears.
    await historyItem(page, '初始文档').first().click()
    await expect(element).toHaveCount(0)

    // Jump forward to the newest future state: everything comes back.
    await historyItem(page, '更改样式').first().click()
    await expect(element).toHaveCount(1)
    expect(await shapeFill()).toBe('rgb(139, 92, 246)')
    await expect(items).toHaveCount(5)
    await expect(items.nth(0)).toHaveAttribute('data-history-kind', 'current')

    // A fresh edit clears the redo branch.
    await insertShape(page)
    await expect(items).toHaveCount(6)
    await expect(items.nth(0).locator('.freeform-history-label')).toHaveText('插入对象')
    for (const item of await items.all()) {
      await expect(item).not.toHaveAttribute('data-history-kind', 'future')
    }
  })

  test('labels live-edit gestures on the timeline', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const scale = await freeformCanvasScale(page)
    const element = page.getByTestId('freeform-element')

    const box = await element.boundingBox()
    expect(box).toBeTruthy()
    const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 60 * scale, start.y + 40 * scale)
    await page.mouse.up()

    await page.keyboard.down('Alt')
    const moved = await element.boundingBox()
    expect(moved).toBeTruthy()
    const second = { x: moved!.x + moved!.width / 2, y: moved!.y + moved!.height / 2 }
    await page.mouse.move(second.x, second.y)
    await page.mouse.down()
    await page.mouse.move(second.x + 50 * scale, second.y + 30 * scale)
    await page.mouse.up()
    await page.keyboard.up('Alt')

    await page.getByRole('tab', { name: '历史', exact: true }).click()
    const items = page.getByTestId('freeform-history-item')
    await expect(items).toHaveCount(4)
    await expect(items.nth(0).locator('.freeform-history-label')).toHaveText('拖拽复制')
    await expect(items.nth(1).locator('.freeform-history-label')).toHaveText('移动对象')
    await expect(items.nth(2).locator('.freeform-history-label')).toHaveText('插入对象')
    await expect(items.nth(3).locator('.freeform-history-label')).toHaveText('初始文档')
  })
})



/** Drag a fresh guide from a ruler and drop it at the given page position. */

test.describe('freeform rulers and guides', () => {
  // Rulers start hidden; these tests begin with them turned on.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const key = 'slicer.freeform.prefs.v1'
      const current = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      if (typeof current.rulersVisible !== 'boolean') {
        localStorage.setItem(key, JSON.stringify({ ...current, rulersVisible: true }))
      }
    })
  })

  test('rulers stay hidden until the view toggle turns them on, and the choice sticks', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('rulers-reset')) {
        sessionStorage.setItem('rulers-reset', '1')
        localStorage.setItem('slicer.freeform.prefs.v1', JSON.stringify({ rulersVisible: false }))
      }
    })
    await openFreeform(page)
    const toggle = page.getByTestId('freeform-rulers-toggle')
    await expect(page.getByTestId('freeform-canvas')).toBeVisible()
    await expect(page.getByTestId('freeform-ruler-x')).toHaveCount(0)
    // The view toggles sit in the top bar beside the page size.
    await expect(page.getByTestId('freeform-toolbar').getByTestId('freeform-rulers-toggle')).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('freeform-ruler-x')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('freeform-ruler-x')).toBeVisible()
  })

  test('renders zoom-adaptive ruler ticks that track scrolling', async ({ page }) => {
    await openFreeform(page)
    await expect(page.getByTestId('freeform-ruler-x')).toBeVisible()
    await expect(page.getByTestId('freeform-ruler-y')).toBeVisible()
    await expect(page.locator('.freeform-ruler-x .freeform-ruler-label').first()).toBeVisible()

    // At fit zoom the tick step is coarse, so a 250 label never appears.
    await expect(
      page.locator('.freeform-ruler-x .freeform-ruler-label', { hasText: /^250$/ }),
    ).toHaveCount(0)
    await setFreeformZoom(page, 300)
    // Zooming in refines the step until 250 labels appear.
    await expect(
      page.locator('.freeform-ruler-x .freeform-ruler-label', { hasText: /^250$/ }),
    ).toHaveCount(1)

    // Scrolling the stage slides the ticks with the content: the fixed 250
    // label moves left by exactly the scroll delta.
    const label250 = page.locator('.freeform-ruler-x .freeform-ruler-label', { hasText: /^250$/ })
    const before = await label250.boundingBox()
    expect(before).toBeTruthy()
    await page.evaluate(() => {
      const scroll = document.querySelector('.freeform-stage-scroll')
      if (!scroll) throw new Error('stage scroll missing')
      scroll.scrollLeft = 120
    })
    await expect.poll(async () => {
      const moved = await label250.boundingBox()
      return moved ? moved.x : Number.NaN
    }).toBeLessThan(before!.x - 100)
  })

  test('creates a guide from the ruler, undoes and redoes it', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'x', 420)
    const guide = page.getByTestId('freeform-guide')
    await expect(guide).toHaveCount(1)
    await expect(guide).toHaveAttribute('data-guide-axis', 'x')
    // Guides never render into exports: they carry the editor-only marker class.
    await expect(guide).toHaveClass(/freeform-ui-only/)
    expect(await guide.evaluate((node) => Number.parseFloat(node.style.left))).toBe(420)

    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(guide).toHaveCount(0)
    await page.getByRole('button', { name: '重做', exact: true }).click()
    await expect(guide).toHaveCount(1)
    expect(await guide.evaluate((node) => Number.parseFloat(node.style.left))).toBe(420)
  })

  test('moves a guide by dragging and deletes it by dragging off the page', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'x', 300)
    const guide = page.getByTestId('freeform-guide')
    await expect(guide).toHaveCount(1)

    const geometry = await stageGeometry(page)
    const scale = await freeformCanvasScale(page)
    const grabY = (geometry.artboardTop + geometry.artboardBottom) / 2
    const fromX = geometry.artboardLeft + 300 * scale
    const toX = geometry.artboardLeft + 520 * scale
    await page.mouse.move(fromX, grabY)
    await page.mouse.down()
    await page.mouse.move((fromX + toX) / 2, grabY)
    await page.mouse.move(toX, grabY)
    await page.mouse.up()
    await expect(guide).toHaveCount(1)
    expect(await guide.evaluate((node) => Number.parseFloat(node.style.left))).toBe(520)

    // Dragging the guide past the page edge removes it.
    const edgeX = geometry.artboardRight + 80
    await page.mouse.move(toX, grabY)
    await page.mouse.down()
    await page.mouse.move((toX + edgeX) / 2, grabY)
    await page.mouse.move(edgeX, grabY)
    await page.mouse.up()
    await expect(guide).toHaveCount(0)
  })

  test('deletes a guide with a double tap', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'y', 360)
    const guide = page.getByTestId('freeform-guide')
    await expect(guide).toHaveCount(1)
    await expect(guide).toHaveAttribute('data-guide-axis', 'y')

    const geometry = await stageGeometry(page)
    const scale = await freeformCanvasScale(page)
    const tapX = (geometry.artboardLeft + geometry.artboardRight) / 2
    const tapY = geometry.artboardTop + 360 * scale
    await page.mouse.click(tapX, tapY)
    await page.waitForTimeout(60)
    await page.mouse.click(tapX, tapY)
    await expect(guide).toHaveCount(0)
  })

  test('snaps a dragged shape onto a guide', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'x', 420)
    await expect(page.getByTestId('freeform-guide')).toHaveCount(1)

    await insertShape(page)
    await setSelectedElementPosition(page, 300, 400)
    const scale = await freeformCanvasScale(page)
    const element = page.getByTestId('freeform-element')
    const box = await element.boundingBox()
    expect(box).toBeTruthy()

    // Aim the left edge 3 world px left of the guide so the snap must engage.
    const dragDistance = (417 - 300) * scale
    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + dragDistance / 2, startY)
    await page.mouse.move(startX + dragDistance, startY)
    await page.mouse.up()

    const boxes = await freeformElementBoxes(page)
    expect(boxes).toHaveLength(1)
    expect(boxes[0].x).toBe(420)
    expect(boxes[0].y).toBe(400)
  })

  test('a dragged guide shows where it is and settles on the page centre', async ({ page }) => {
    await openFreeform(page)
    if (await page.getByTestId('freeform-ruler-x').count() === 0) await page.getByTestId('freeform-rulers-toggle').click()
    await page.getByTestId('freeform-ruler-x').waitFor({ state: 'attached' })
    const geometry = await stageGeometry(page)
    const scale = await freeformCanvasScale(page)
    // Drop it 3 page px off the centre of the 1080 page: it lands on 540.
    const dropX = geometry.artboardLeft + 537 * scale
    const dropY = geometry.artboardTop + 200 * scale
    await page.mouse.move(dropX, geometry.rulerTop + 10)
    await page.mouse.down()
    await page.mouse.move(dropX, (geometry.rulerTop + dropY) / 2)
    await page.mouse.move(dropX, dropY)
    const readout = page.getByTestId('freeform-guide-readout')
    await expect(readout).toHaveText('居中 · 540')
    await expect(readout).toHaveClass(/is-snapped/)
    await page.mouse.up()
    await expect(readout).toHaveCount(0)
    const guide = page.getByTestId('freeform-guide')
    expect(await guide.evaluate((node) => Number.parseFloat(node.style.left))).toBe(540)

    // Pressing a guide shows its position without moving it.
    const guideX = geometry.artboardLeft + 540 * scale
    const grabY = (geometry.artboardTop + geometry.artboardBottom) / 2
    await page.mouse.move(guideX + 2, grabY)
    await page.mouse.down()
    await expect(readout).toHaveText('居中 · 540')
    await page.mouse.up()
    expect(await guide.evaluate((node) => Number.parseFloat(node.style.left))).toBe(540)
  })

  test('keeps guides scoped to their page', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'x', 420)
    const guide = page.getByTestId('freeform-guide')
    await expect(guide).toHaveCount(1)

    await page.getByRole('button', { name: '新增页面' }).click()
    await expect(page.getByTestId('freeform-thumb')).toHaveCount(2)
    // A fresh page starts without the first page's guides.
    await expect(guide).toHaveCount(0)

    await page.getByTestId('freeform-thumb').first().click()
    await expect(guide).toHaveCount(1)
    expect(await guide.evaluate((node) => Number.parseFloat(node.style.left))).toBe(420)
  })
})

test.describe('freeform selection completion', () => {
  test('Cmd/Ctrl+A selects every object in the current scope', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await insertShape(page)
    await insertShape(page)
    await expect(page.getByTestId('freeform-element')).toHaveCount(3)

    await page.keyboard.press('Control+a')
    await expect(selectedFreeformElements(page)).toHaveCount(3)

    // Cmd/Ctrl+Shift+A inverts the selection: everything selected -> nothing.
    await page.keyboard.press('Control+Shift+a')
    await expect(selectedFreeformElements(page)).toHaveCount(0)
    // Inverting again restores the full selection.
    await page.keyboard.press('Control+Shift+a')
    await expect(selectedFreeformElements(page)).toHaveCount(3)

    // Escape drops the selection again.
    await page.keyboard.press('Escape')
    await expect(selectedFreeformElements(page)).toHaveCount(0)
  })

  test('a single selected object aligns to the page bounds', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 120, 120, 80)

    const bar = page.getByTestId('freeform-align-bar')
    await expect(bar).toBeVisible()
    await bar.getByTestId('freeform-align-left').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 0, y: 120, width: 120, height: 80 },
    ])
    await bar.getByTestId('freeform-align-hcenter').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 480, y: 120, width: 120, height: 80 },
    ])
    await bar.getByTestId('freeform-align-bottom').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 480, y: 1360, width: 120, height: 80 },
    ])

    // Inside a group, a single selected object aligns to the group's bounds
    // instead of the page bounds. Move the first shape away from the page
    // bottom first so the floating align bar can never cover it.
    await setSelectedElementBox(page, 700, 200, 120, 80)
    await insertShape(page)
    const beforeGroup = await freeformElementBoxes(page)
    expect(beforeGroup).toHaveLength(2)
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+g')
    // Double-clicking a group child enters the group's scope. (A plain click
    // selects the group itself, and Enter depends on where focus landed.)
    await page.getByTestId('freeform-element').nth(1).dblclick()
    const groupChildren = page.getByTestId('freeform-element')
    await expect(groupChildren).toHaveCount(2)
    // Select the big center-area child; the selected flag lands on the child
    // element itself once the group scope is active.
    await groupChildren.nth(1).click()
    await expect(groupChildren.nth(1)).toHaveAttribute('data-selected', 'true')

    // World-space box: grouped children expose local coordinates in their
    // inline styles, so measure through the rendered DOM instead.
    const childWorldBox = (locator: import('@playwright/test').Locator) =>
      locator.evaluate((node) => {
        const artboard = document.querySelector('[data-testid="freeform-canvas"]')
        if (!artboard) throw new Error('artboard missing')
        const board = artboard.getBoundingClientRect()
        const rect = node.getBoundingClientRect()
        const scale = board.width / 1080
        return {
          x: Math.round((rect.left - board.left) / scale),
          y: Math.round((rect.top - board.top) / scale),
          width: Math.round(rect.width / scale),
          height: Math.round(rect.height / scale),
        }
      })

    await page.getByTestId('freeform-align-bar')
      .getByTestId('freeform-align-right').click()
    // The child aligns to the group's right edge (the union's maximum
    // right), not the page's right edge.
    const groupRight = Math.max(...beforeGroup.map((box) => box.x + box.width))
    await expect
      .poll(() => childWorldBox(groupChildren.nth(1)))
      .toEqual({
        x: groupRight - beforeGroup[1].width,
        y: beforeGroup[1].y,
        width: beforeGroup[1].width,
        height: beforeGroup[1].height,
      })

    // Each align step lands in history with the align-to-page label — the
    // three page aligns plus the group-scoped one, with the grouping entry
    // interleaved right after the newest align.
    await page.getByRole('tab', { name: '历史', exact: true }).click()
    const labels = page.getByTestId('freeform-history-item')
      .locator('.freeform-history-label')
    await expect(labels.nth(0)).toHaveText('对齐到页面')
    await expect(labels.nth(1)).toHaveText('编组')
    await expect(labels.filter({ hasText: '对齐到页面' })).toHaveCount(4)
  })

  test('the guides toggle hides guide lines and persists across reloads', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'x', 420)
    const guide = page.getByTestId('freeform-guide')
    await expect(guide).toHaveCount(1)

    const toggle = page.getByTestId('freeform-guides-toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(guide).toHaveCount(0)

    // The preference survives a reload, and so does the guest's page (saved on
    // this device) with its guide, still hidden.
    await page.reload()
    await page.goto('/#/edit/canvas')
    await expect(page.locator('.freeform-stage-scroll')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByTestId('freeform-guides-toggle')).toHaveAttribute('aria-pressed', 'false')
    await expect(guide).toHaveCount(0)

    // Dragging a fresh guide from the ruler re-enables visibility.
    await dragGuideFromRuler(page, 'x', 500)
    await expect(page.getByTestId('freeform-guides-toggle')).toHaveAttribute('aria-pressed', 'true')
    await expect(guide).toHaveCount(2)
  })

  test('the snap toggle disables snapping but keeps page clamping', async ({ page }) => {
    await openFreeform(page)
    await dragGuideFromRuler(page, 'x', 420)
    await expect(page.getByTestId('freeform-guide')).toHaveCount(1)

    await insertShape(page)
    await setSelectedElementPosition(page, 300, 400)
    const scale = await freeformCanvasScale(page)
    const element = page.getByTestId('freeform-element')
    const box = await element.boundingBox()
    expect(box).toBeTruthy()

    // With snapping off the shape lands 3 world px left of the guide.
    await page.getByTestId('freeform-snap-toggle').click()
    const dragDistance = (417 - 300) * scale
    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + dragDistance / 2, startY)
    await page.mouse.move(startX + dragDistance, startY)
    await page.mouse.up()
    let boxes = await freeformElementBoxes(page)
    expect(boxes).toHaveLength(1)
    expect(boxes[0].x).toBe(417)

    // Re-enabling snapping pulls the same drag onto the guide.
    await page.getByTestId('freeform-snap-toggle').click()
    const box2 = await element.boundingBox()
    await page.mouse.move(box2!.x + box2!.width / 2, box2!.y + box2!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2!.x + box2!.width / 2 + 2 * scale, box2!.y + box2!.height / 2)
    await page.mouse.up()
    boxes = await freeformElementBoxes(page)
    expect(boxes[0].x).toBe(420)
  })
})

test.describe('freeform canvas feedback', () => {
  test('dragging shows red distance measurements to siblings and page edges', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 80)
    await insertShape(page)
    await setSelectedElementBox(page, 400, 100, 120, 80)

    const geometry = await stageGeometry(page)
    const scale = await freeformCanvasScale(page)
    await expect(page.getByTestId('freeform-measurement')).toHaveCount(0)
    await expect(page.getByTestId('freeform-selection-badge')).toHaveCount(0)

    // Drag the first shape right so its right edge keeps a 60px gap to the
    // second shape (100 -> 220).
    const first = page.getByTestId('freeform-element').nth(0)
    await first.hover()
    await page.mouse.down()
    await page.mouse.move(geometry.artboardLeft + 280 * scale, geometry.artboardTop + 140 * scale, { steps: 8 })

    // Right: 60 to the sibling; left: 220 and top: 100 to the page edges;
    // the far bottom page edge (1260) stays out of range.
    const measurements = page.getByTestId('freeform-measurement')
    await expect(measurements).toHaveCount(3)
    await expect(page.getByTestId('freeform-selection-badge')).toHaveText('120×80')
    const right = page.locator('[data-testid="freeform-measurement"][data-measurement-side="right"]')
    await expect(right).toHaveAttribute('data-measurement-source', 'element')
    await expect(right.getByTestId('freeform-measurement-label')).toHaveText('60')
    await expect(page.locator('[data-testid="freeform-measurement"][data-measurement-side="left"] [data-testid="freeform-measurement-label"]')).toHaveText('220')
    await expect(page.locator('[data-testid="freeform-measurement"][data-measurement-side="top"] [data-testid="freeform-measurement-label"]')).toHaveText('100')
    // Measurements are canvas chrome and never reach exports.
    await expect(measurements.first()).toHaveClass(/freeform-ui-only/)

    await page.mouse.up()
    await expect(measurements).toHaveCount(0)
    await expect(page.getByTestId('freeform-selection-badge')).toHaveCount(0)
    const boxes = await freeformElementBoxes(page)
    // The client->world conversion carries sub-pixel float drift.
    expect(boxes[0].x).toBeCloseTo(220, 1)
  })

  test('resizing shows a live size badge under the selection', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 80)

    const scale = await freeformCanvasScale(page)
    const handle = page.getByTestId('freeform-selection-resize')
    const handleBox = await handle.boundingBox()
    expect(handleBox).toBeTruthy()
    const startX = handleBox!.x + handleBox!.width / 2
    const startY = handleBox!.y + handleBox!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 100 * scale, startY + 50 * scale, { steps: 5 })

    await expect(page.getByTestId('freeform-selection-badge')).toHaveText('220×130')
    await page.mouse.up()
    await expect(page.getByTestId('freeform-selection-badge')).toHaveCount(0)
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 100, y: 100, width: 220, height: 130 },
    ])
  })

  test('rotating shows a live angle badge', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 400, 500, 120, 80)

    const geometry = await stageGeometry(page)
    const scale = await freeformCanvasScale(page)
    const rotate = page.getByTestId('freeform-selection-rotate')
    const handleBox = await rotate.boundingBox()
    expect(handleBox).toBeTruthy()
    const centerX = geometry.artboardLeft + 460 * scale
    const centerY = geometry.artboardTop + 540 * scale
    const handleX = handleBox!.x + handleBox!.width / 2
    const handleY = handleBox!.y + handleBox!.height / 2
    const startAngle = Math.atan2(handleY - centerY, handleX - centerX)
    const radius = Math.hypot(handleX - centerX, handleY - centerY)
    const targetAngle = startAngle + Math.PI / 6

    await page.mouse.move(handleX, handleY)
    await page.mouse.down()
    await page.mouse.move(
      centerX + radius * Math.cos(targetAngle),
      centerY + radius * Math.sin(targetAngle),
      { steps: 10 },
    )
    await expect(page.getByTestId('freeform-selection-badge')).toHaveText('30°')
    await page.mouse.up()
    await expect(page.getByTestId('freeform-selection-badge')).toHaveCount(0)
  })
})

test.describe('freeform color history', () => {
  test('recent colors record committed picks and persist across reloads', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const paint = page.getByTestId('shape-fill-paint')
    const popover = paint.getByTestId('paint-popover')
    const trigger = paint.getByTestId('paint-color-button')

    await trigger.click()
    await expect(popover).toBeVisible()
    await expect(popover.getByTestId('paint-recent-grid')).toHaveCount(0)

    // Pick the first preset and close: one recent swatch appears, newest
    // first, and the trigger reflects the picked color.
    const presets = popover.locator('.paint-swatch-grid .paint-swatch')
    const firstPresetColor = await presets.nth(0).evaluate((node) => getComputedStyle(node).backgroundColor)
    await presets.nth(0).click()
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    await expect(trigger).toHaveCSS('background-color', firstPresetColor)

    await trigger.click()
    const recent = popover.getByTestId('paint-recent-grid')
    await expect(recent).toBeVisible()
    await expect(recent.locator('.paint-swatch')).toHaveCount(1)
    expect(await recent.locator('.paint-swatch').first().evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(firstPresetColor)

    // A second pick moves to the front; the list keeps both, newest first.
    const secondPresetColor = await presets.nth(1).evaluate((node) => getComputedStyle(node).backgroundColor)
    await presets.nth(1).click()
    await page.keyboard.press('Escape')
    await trigger.click()
    await expect(recent.locator('.paint-swatch')).toHaveCount(2)
    expect(await recent.locator('.paint-swatch').first().evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(secondPresetColor)
    expect(await recent.locator('.paint-swatch').nth(1).evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(firstPresetColor)

    // Closing without a pick records nothing (untouched sessions are free).
    await page.keyboard.press('Escape')
    await trigger.click()
    await expect(recent.locator('.paint-swatch')).toHaveCount(2)

    // The recents survive a reload (the unsaved shape does not).
    await page.keyboard.press('Escape')
    await page.reload()
    await page.goto('/#/edit/canvas')
    await expect(page.locator('.freeform-stage-scroll')).toHaveAttribute('aria-busy', 'false')
    await insertShape(page)
    await page.getByTestId('shape-fill-paint').getByTestId('paint-color-button').click()
    const recentAfterReload = page.getByTestId('paint-popover').getByTestId('paint-recent-grid')
    await expect(recentAfterReload.locator('.paint-swatch')).toHaveCount(2)
    expect(await recentAfterReload.locator('.paint-swatch').first().evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(secondPresetColor)
  })

  test('the eyedropper control follows EyeDropper API availability', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const paint = page.getByTestId('shape-fill-paint')
    await paint.getByTestId('paint-color-button').click()
    const popover = paint.getByTestId('paint-popover')
    await expect(popover).toBeVisible()

    // The native picker cannot be driven by automation — only assert the
    // control matches the platform API and that the popover still closes.
    const supported = await page.evaluate(() => 'EyeDropper' in window)
    await expect(paint.getByTestId('paint-eyedropper')).toHaveCount(supported ? 1 : 0)

    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
  })
})

test.describe('freeform duplicate and z-order shortcuts', () => {
  test('Ctrl+D duplicates the selection in place and selects the copies', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 120, 160, 120, 80)

    await page.keyboard.press('Control+d')
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 120, y: 160, width: 120, height: 80 },
      { x: 120, y: 160, width: 120, height: 80 },
    ])
    // The fresh copy carries the selection.
    await expect(page.getByTestId('freeform-element').nth(1)).toHaveAttribute('data-selected', 'true')
    await expect(page.getByTestId('freeform-element').nth(0)).toHaveAttribute('data-selected', 'false')

    // One history entry records the duplicate.
    await page.getByRole('tab', { name: '历史', exact: true }).click()
    await expect(page.getByTestId('freeform-history-item').locator('.freeform-history-label').first()).toHaveText('原位复制')
  })

  test('bracket keys and their modifiers reorder the selection', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 80)
    await insertShape(page)
    await setSelectedElementBox(page, 400, 100, 120, 80)
    await insertShape(page)
    await setSelectedElementBox(page, 700, 100, 120, 80)
    const elements = page.getByTestId('freeform-element')
    await expect(elements).toHaveCount(3)

    // Bare ] brings the first shape straight to the front (Figma semantics).
    await elements.nth(0).click()
    await page.keyboard.press(']')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([400, 700, 100])

    // Bare [ sends it straight back; Ctrl+] steps one layer up, Ctrl+[ back down.
    await page.keyboard.press('[')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([100, 400, 700])
    await page.keyboard.press('Control+]')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([400, 100, 700])
    await page.keyboard.press('Control+[')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([100, 400, 700])

    // Ctrl+Shift+] / Ctrl+Shift+[ also jump to the front/back.
    await page.keyboard.press('Control+Shift+]')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([400, 700, 100])
    await page.keyboard.press('Control+Shift+[')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([100, 400, 700])

    // While an input is focused the brackets never reorder the selection.
    const positionInputs = page.locator('.freeform-inspector .field-grid').first().locator('input')
    await positionInputs.nth(0).click()
    await page.keyboard.press(']')
    await expect.poll(async () => (await freeformElementBoxes(page)).map((box) => box.x)).toEqual([100, 400, 700])

    // The context menu offers in-place duplication too (right-click an
    // unselected shape — the selection overlay covers the selected one).
    await page.getByTestId('freeform-element').nth(1).click({ button: 'right' })
    await page.getByTestId('freeform-context-menu-duplicate').click()
    await expect.poll(async () => await page.getByTestId('freeform-element').count()).toBe(4)
  })

  test('right-clicking a selected shape through its drag handle keeps the element menu', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    // A small shape at fit zoom: its center sits under the round drag handle.
    await setSelectedElementBox(page, 400, 100, 120, 80)
    const element = page.getByTestId('freeform-element')
    // The inserted shape is already selected (the box edits above prove it).
    await expect(element).toHaveAttribute('data-selected', 'true')

    // Locator clicks refuse points owned by overlay chrome; use raw mouse
    // events at the shape's center (under the drag handle at fit zoom).
    const handleBox = await element.boundingBox()
    expect(handleBox).toBeTruthy()
    await page.mouse.click(
      handleBox!.x + handleBox!.width / 2,
      handleBox!.y + handleBox!.height / 2,
      { button: 'right' },
    )
    const menu = page.getByTestId('freeform-context-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('freeform-context-menu-delete')).toBeEnabled()
    await expect(menu.getByTestId('freeform-context-menu-duplicate')).toBeEnabled()
    // The selection survives the right-click through overlay chrome.
    await expect(element).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Escape')
  })
})

test.describe('freeform clipboard completion', () => {
  test('cut removes the selection and paste-in-place restores the exact position', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 480, 640, 120, 80)

    await page.keyboard.press('Control+x')
    await expect(page.getByTestId('freeform-element')).toHaveCount(0)

    // Cut lands in history as one atomic step.
    await page.getByRole('tab', { name: '历史', exact: true }).click()
    await expect(page.getByTestId('freeform-history-item').locator('.freeform-history-label').first()).toHaveText('剪切对象')
    await page.getByRole('tab', { name: '属性', exact: true }).click()

    // Paste in place restores the exact source coordinates.
    await page.keyboard.press('Control+Shift+v')
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 480, y: 640, width: 120, height: 80 },
    ])
    await page.getByRole('tab', { name: '历史', exact: true }).click()
    await expect(page.getByTestId('freeform-history-item').locator('.freeform-history-label').first()).toHaveText('原位粘贴')
    await page.getByRole('tab', { name: '属性', exact: true }).click()

    // One undo removes the paste; a second restores the cut shape.
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('freeform-element')).toHaveCount(0)
    await page.keyboard.press('Control+z')
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 480, y: 640, width: 120, height: 80 },
    ])
  })

  test('paste-in-place keeps coordinates across pages while normal paste offsets', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 480, 640, 120, 80)
    await page.keyboard.press('Control+c')

    await page.getByRole('button', { name: '新增页面' }).click()
    await expect(page.getByTestId('freeform-thumb')).toHaveCount(2)

    // Normal paste offsets the copy by 16px.
    await page.keyboard.press('Control+v')
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 496, y: 656, width: 120, height: 80 },
    ])
    await page.keyboard.press('Control+z')

    // Paste in place lands at the exact source coordinates on the new page.
    await page.keyboard.press('Control+Shift+v')
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 480, y: 640, width: 120, height: 80 },
    ])
  })

  test('the context menu offers cut and paste-in-place', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 480, 640, 120, 80)

    const menu = page.getByTestId('freeform-context-menu')
    // Paste-in-place stays disabled without a clipboard.
    await page.mouse.click(200, 300, { button: 'right' })
    await expect(menu.getByTestId('freeform-context-menu-cut')).toBeDisabled()
    await expect(menu.getByTestId('freeform-context-menu-paste-in-place')).toBeDisabled()
    await page.keyboard.press('Escape')

    // Cut through the menu removes the shape and fills the clipboard.
    await page.getByTestId('freeform-element').click({ button: 'right' })
    await menu.getByTestId('freeform-context-menu-cut').click()
    await expect(page.getByTestId('freeform-element')).toHaveCount(0)

    // Paste-in-place through the menu restores the exact position.
    await page.mouse.click(200, 300, { button: 'right' })
    await menu.getByTestId('freeform-context-menu-paste-in-place').click()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 480, y: 640, width: 120, height: 80 },
    ])
  })
})

test.describe('freeform page rename', () => {
  test('double-clicking the caption renames a page inline', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)

    const title = page.getByTestId('freeform-thumb-title').first()
    await expect(title).toHaveText('第 1 页')
    await title.dblclick()

    const input = page.getByTestId('freeform-thumb-rename')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('第 1 页')
    await input.fill('封面页')
    await input.press('Enter')
    await expect(page.getByTestId('freeform-thumb-rename')).toHaveCount(0)
    await expect(title).toHaveText('封面页')

    // The rename lands in history as one step.
    await page.getByRole('tab', { name: '历史', exact: true }).click()
    await expect(page.getByTestId('freeform-history-item').locator('.freeform-history-label').first()).toHaveText('重命名页面')
    await page.getByRole('tab', { name: '属性', exact: true }).click()

    // Escape cancels without recording anything.
    await title.dblclick()
    await page.getByTestId('freeform-thumb-rename').fill('放弃')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('freeform-thumb-rename')).toHaveCount(0)
    await expect(title).toHaveText('封面页')

    // Empty input keeps the current name.
    await title.dblclick()
    await page.getByTestId('freeform-thumb-rename').fill('   ')
    await page.getByTestId('freeform-thumb-rename').press('Enter')
    await expect(title).toHaveText('封面页')
  })

  test('the slide context menu renames the right-clicked page', async ({ page }) => {
    await openFreeform(page)
    await page.getByRole('button', { name: '新增页面' }).click()
    await expect(page.getByTestId('freeform-thumb')).toHaveCount(2)

    // Right-click the second thumbnail and rename it.
    await page.getByTestId('freeform-thumb').nth(1).click({ button: 'right' })
    const menu = page.getByTestId('freeform-slide-context-menu')
    await expect(menu.getByTestId('freeform-slide-context-menu-rename')).toBeVisible()
    await menu.getByTestId('freeform-slide-context-menu-rename').click()

    const input = page.getByTestId('freeform-thumb-rename')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('第 2 页')
    await input.fill('结尾页')
    await input.press('Enter')
    await expect(page.getByTestId('freeform-thumb-title').nth(1)).toHaveText('结尾页')
    await expect(page.getByTestId('freeform-thumb-title').nth(0)).toHaveText('第 1 页')
  })

  test('confirming an automatic page name keeps it following the page', async ({ page }) => {
    await openFreeform(page)
    await page.getByRole('button', { name: '新增页面' }).click()
    const titles = page.getByTestId('freeform-thumb-title')
    await titles.nth(1).dblclick()
    const input = page.getByTestId('freeform-thumb-rename')
    await expect(input).toHaveValue('第 2 页')
    await input.press('Enter')
    await expect(input).toHaveCount(0)

    await page.getByRole('tab', { name: '历史', exact: true }).click()
    await expect(page.getByTestId('freeform-history-item').filter({ hasText: '重命名页面' })).toHaveCount(0)
    await page.getByRole('tab', { name: '属性', exact: true }).click()

    // Moved to the front, it is 「第 1 页」 now.
    await (await openPageMenu(page, 1)).getByTestId('freeform-slide-context-menu-up').click()
    await expect(page.getByTestId('freeform-thumb').first()).toHaveAttribute('aria-current', 'page')
    await expect(titles).toHaveText(['第 1 页', '第 2 页'])
    await expect(page.getByTestId('inspector-page').getByLabel('页面名称')).toHaveValue('第 1 页')
  })
})

test.describe('freeform reload restore', () => {
  test('reload restores the freeform workspace and its open draft', async ({ page }) => {
    await page.goto('/#/edit/canvas')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    await insertText(page)
    await page.getByLabel('文本内容').fill('刷新恢复的内容')
    await signUpToSave(page, `restore-${Date.now().toString(36)}`)
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

    await page.reload()

    // 刷新后：编辑器和项目都自动恢复。
    await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
    await expect(page.getByTestId('freeform-element')).toHaveCount(1)
    await expect(page.getByLabel('文本内容')).toContainText('刷新恢复的内容')
    await expect(page.getByTestId('editor-title')).toHaveText('未命名设计')
  })

  test('reload falls back to a fresh document when the recorded draft was deleted', async ({ page }) => {
    await page.goto('/#/edit/canvas')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    await insertText(page)
    await page.getByLabel('文本内容').fill('将被删除的内容')
    await signUpToSave(page, `restore-gone-${Date.now().toString(36)}`)
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

    // 在工作台删掉这个项目（恢复记录随之清空），再回到编辑器刷新。
    await page.getByTestId('editor-home').click()
    const card = page.getByTestId('project-card')
    await card.getByRole('button', { name: /更多操作/ }).click()
    await page.getByRole('menuitem', { name: '删除' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
    await expect(card).toHaveCount(0)
    await page.goto('/#/edit/canvas')
    await page.reload()

    // 编辑器打开，但项目已不存在：回到空白文档而不是报错。
    await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
    await expect(page.locator('.freeform-stage-scroll')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByTestId('freeform-element')).toHaveCount(0)
    await expect(page.getByTestId('editor-save-state')).toHaveCount(0)
  })

  test('reload restores the markdown workspace and its open draft', async ({ page }) => {
    await page.goto('/#/edit')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.waitForFunction(() => !!window.__cmView)
    await page.evaluate(() => {
      const view = window.__cmView!
      view.dispatch({ changes: { from: 0, to: view.state.doc.toString().length, insert: '# 刷新恢复的文稿\n\n正文内容。' } })
    })

    await signUpToSave(page, `restore-md-${Date.now().toString(36)}`)

    // 在自由编辑里也存一份（让「上次编辑器」指向自由编辑），再回到 Markdown。
    await page.goto('/#/edit/canvas')
    await insertText(page)
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
    await page.goto('/#/edit/md')
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

    await page.reload()

    // 刷新 Markdown 编辑器，项目内容自动恢复。
    await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
    await page.waitForFunction(() => !!window.__cmView)
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
    await expect.poll(() =>
      page.evaluate(() => window.__cmView!.state.doc.toString()),
    ).toContain('刷新恢复的文稿')
  })
})

test.describe('freeform text auto size', () => {
  test('typing past the box grows it so text is never clipped', async ({ page }) => {
    await openFreeform(page)
    await insertText(page)
    const element = page.getByTestId('freeform-element').last()
    const initialHeight = await element.evaluate((el) => el.offsetHeight)
    expect(initialHeight).toBe(150)

    // 六行 48px 文字远超默认 150px 的盒子；行高随系统字体在 1.0–1.4 倍字号之间变化，
    // 六行在任何 CJK 字体下都放不进 150px。
    await page.getByLabel('文本内容').fill('一\n二\n三\n四\n五\n六')
    await expect.poll(() => element.evaluate((el) => el.offsetHeight)).toBeGreaterThan(220)

    // 内容不再被裁：盒子不小于文字实际需要的高度。
    const overflow = await element.evaluate((el) => {
      const box = el.querySelector('.freeform-textbox') as HTMLElement
      return box.scrollHeight - box.clientHeight
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('the text box never shrinks back when content is removed', async ({ page }) => {
    await openFreeform(page)
    await insertText(page)
    const element = page.getByTestId('freeform-element').last()

    await page.getByLabel('文本内容').fill('一\n二\n三\n四\n五\n六')
    const grownHeight = await element.evaluate((el) => el.offsetHeight)
    expect(grownHeight).toBeGreaterThan(220)

    await page.getByLabel('文本内容').fill('短')
    await expect(await element.evaluate((el) => el.offsetHeight)).toBe(grownHeight)
  })

  test('vertical text grows the box wider instead of clipping columns', async ({ page }) => {
    await openFreeform(page)
    await insertText(page)
    const element = page.getByTestId('freeform-element').last()
    const initialWidth = await element.evaluate((el) => el.offsetWidth)
    expect(initialWidth).toBe(520)

    await page.getByTestId('text-vertical-toggle').click()
    await expect(page.getByTestId('text-vertical-toggle')).toHaveAttribute('aria-pressed', 'true')
    // 竖排每列占一个行高，行高随系统字体在 1.0–1.4 倍字号之间变化：二十个字在行高小的字体
    // （如 Linux 的 Noto CJK，每列排三个字）里放得进 520px，并不需要变宽；四十个字在任何
    // 字体下都至少要十四列，远超默认 520px 宽。
    await page.getByLabel('文本内容').fill('一二三四五六七八九十'.repeat(4))
    await expect.poll(() => element.evaluate((el) => el.offsetWidth)).toBeGreaterThan(560)

    const overflow = await element.evaluate((el) => {
      const box = el.querySelector('.freeform-textbox') as HTMLElement
      return box.scrollWidth - box.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('freeform editing chrome', () => {
  test('the bar above the canvas follows the selection', async ({ page }) => {
    // Wide enough for the whole text row beside the page list and the open panel.
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    const bar = page.getByRole('toolbar', { name: '对象工具条' })
    await expect(bar).toHaveAttribute('data-subject', 'page')
    // Nothing selected: only 更多, which opens the page's settings.
    await expect(bar.getByRole('button')).toHaveText(['更多'])

    await insertText(page)
    await expect(bar).toHaveAttribute('data-subject', 'text')
    const size = bar.getByLabel('文字大小', { exact: true })
    const inspectorSize = page.getByTestId('inspector-typography').getByLabel('字号', { exact: true })
    await expect(size).toHaveValue('48')
    // − / + walk the usual sizes, and the inspector shows the same value.
    await bar.getByRole('button', { name: '放大字号' }).click()
    await expect(size).toHaveValue('56')
    await expect(inspectorSize).toHaveValue('56')
    await bar.getByRole('button', { name: '缩小字号' }).click()
    await expect(inspectorSize).toHaveValue('48')

    const bold = bar.getByRole('button', { name: '加粗文字' })
    await expect(bold).toHaveAttribute('aria-pressed', 'true')
    await bold.click()
    await expect(bold).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('text-weight-toggle')).toHaveAttribute('aria-pressed', 'false')
    await bar.getByRole('button', { name: '文字居中' }).click()
    await expect(bar.getByRole('button', { name: '文字居中' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('inspector-typography').getByRole('button', { name: '文字居中' }))
      .toHaveAttribute('aria-pressed', 'true')

    await insertShape(page)
    await expect(bar).toHaveAttribute('data-subject', 'shape')
    const shapeMenu = bar.getByTestId('ctx-shape-menu')
    await expect(shapeMenu).toHaveText('矩形')
    await shapeMenu.click()
    await page.getByRole('menu', { name: '矩形' }).getByRole('menuitem', { name: '圆形', exact: true }).click()
    await expect(shapeMenu).toHaveText('圆形')
    await expect(page.getByTestId('inspector-geometry').getByRole('button', { name: '圆形', exact: true }))
      .toHaveClass(/\bon\b/)

    const elements = page.getByTestId('freeform-element')
    await expect(elements).toHaveCount(2)
    await bar.getByTestId('ctx-duplicate').click()
    await expect(elements).toHaveCount(3)
    await bar.getByTestId('ctx-delete').click()
    await expect(elements).toHaveCount(2)
    await expect(bar).toHaveAttribute('data-subject', 'page')
  })

  test('colour pickers and menus in the bar open over the canvas', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 100, 100)
    await insertShape(page)
    const bar = page.getByRole('toolbar', { name: '对象工具条' })

    await bar.getByTestId('ctx-shape-fill').click()
    const popover = bar.getByTestId('paint-popover')
    await expect(popover).toBeVisible()
    // The bar never scrolls, so nothing clips what opens from it.
    const popoverBox = (await popover.boundingBox())!
    expect(await locatorOwnsPoint(popover, popoverBox.x + popoverBox.width / 2, popoverBox.y + popoverBox.height - 12))
      .toBe(true)
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)

    const layerOrder = () => page.getByTestId('freeform-element')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-scene-node-id')))
    const [below, above] = await layerOrder()
    await bar.getByTestId('ctx-order-menu').click()
    const orderMenu = page.getByRole('menu', { name: '层级' })
    await expect(orderMenu).toBeVisible()
    const menuBox = (await orderMenu.boundingBox())!
    expect(await locatorOwnsPoint(orderMenu, menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height - 8)).toBe(true)
    await orderMenu.getByRole('menuitem', { name: '移到底层' }).click()
    await expect.poll(layerOrder).toEqual([above, below])
  })

  test('with both side panels open the bar keeps one row, so selecting never moves the canvas', async ({ page }) => {
    await openFreeform(page)
    const bar = page.getByRole('toolbar', { name: '对象工具条' })
    const canvas = page.getByTestId('freeform-canvas')
    const elements = page.getByTestId('freeform-elements-tool')
    await elements.click()
    await expect(page.getByTestId('freeform-elements-drawer')).toBeVisible()
    await waitForCanvasFit(page)
    const idle = await canvas.boundingBox()

    await page.getByTestId('insert-shape-rect').click()
    await expect(bar).toHaveAttribute('data-subject', 'shape')
    await waitForCanvasFit(page)
    expect(await bar.evaluate((node) => (node as HTMLElement).offsetHeight)).toBe(48)
    expect(await canvas.boundingBox()).toEqual(idle)
    // What the narrow bar folds away is still in the settings panel; 更多 keeps its name.
    await expect(bar.getByTestId('ctx-shape-fill')).toBeVisible()
    await expect(bar.getByTestId('ctx-delete')).toBeVisible()
    await expect(bar.getByTestId('ctx-order-menu')).toBeHidden()
    await expect(bar.getByTestId('ctx-more')).toHaveAccessibleName('更多')

    await canvas.click({ position: { x: 8, y: 8 } })
    await expect(bar).toHaveAttribute('data-subject', 'page')
    await waitForCanvasFit(page)
    expect(await canvas.boundingBox()).toEqual(idle)

    // A wider stage brings the folded controls back.
    await page.getByTestId('freeform-element').click()
    await elements.click()
    await expect(page.getByTestId('freeform-elements-drawer')).toHaveCount(0)
    await expect(bar.getByTestId('ctx-order-menu')).toBeVisible()
    await expect(bar.getByTestId('ctx-duplicate')).toBeVisible()
    expect(await bar.evaluate((node) => (node as HTMLElement).offsetHeight)).toBe(48)
  })

  test('the bar locks, unlocks and groups the selection', async ({ page }) => {
    await insertTwoSelectedRectangles(page)
    const bar = page.getByRole('toolbar', { name: '对象工具条' })
    await expect(bar).toHaveAttribute('data-subject', 'multi')
    await expect(bar.getByTestId('freeform-context-subject')).toHaveText('2 个对象')
    await bar.getByRole('button', { name: '编成一组' }).click()
    await expect(bar).toHaveAttribute('data-subject', 'group')
    await bar.getByRole('button', { name: '取消编组' }).click()
    await expect(bar).toHaveAttribute('data-subject', 'multi')

    await page.keyboard.press('Escape')
    await expect(selectedFreeformElements(page)).toHaveCount(0)
    await page.getByTestId('freeform-element').nth(1).click()
    await expect(bar).toHaveAttribute('data-subject', 'shape')
    await bar.getByTestId('ctx-lock').click()
    await expect(bar).toHaveAttribute('data-subject', 'locked')
    await expect(bar.getByTestId('ctx-lock')).toHaveAccessibleName('解锁对象')
    await expect(bar.getByTestId('ctx-delete')).toHaveCount(0)
    await bar.getByTestId('ctx-lock').click()
    await expect(bar).toHaveAttribute('data-subject', 'shape')
    await expect(bar.getByTestId('ctx-lock')).toHaveAccessibleName('锁定对象')
  })

  test('each page\'s 「…」 button opens its menu from the keyboard too', async ({ page }) => {
    await openFreeform(page)
    const thumbs = page.getByTestId('freeform-thumb')
    const menuButtons = page.getByTestId('freeform-thumb-menu')
    const menu = page.getByTestId('freeform-slide-context-menu')
    const slideOrder = () => thumbs.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-slide-id')))

    // Only the current page shows its button until the pointer comes by.
    await page.getByRole('button', { name: '新增页面' }).click()
    await expect(menuButtons.nth(1)).toHaveCSS('opacity', '1')
    await expect(menuButtons.nth(0)).toHaveCSS('opacity', '0')
    await thumbs.nth(0).hover()
    await expect(menuButtons.nth(0)).toHaveCSS('opacity', '1')
    await expect(menuButtons.nth(1)).toHaveAccessibleName('第 2 页 的页面操作')

    // Enter opens the menu on its first entry; the arrows walk it; Escape hands focus back.
    const [first, second] = await slideOrder()
    await menuButtons.nth(1).focus()
    await page.keyboard.press('Enter')
    await expect(menu).toBeVisible()
    await expect(menuButtons.nth(1)).toHaveAttribute('aria-expanded', 'true')
    await expect(menu.getByTestId('freeform-slide-context-menu-rename')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByTestId('freeform-slide-context-menu-duplicate')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(menuButtons.nth(1)).toBeFocused()

    // Clicking the button again closes the menu it opened.
    await menuButtons.nth(1).click()
    await expect(menu).toBeVisible()
    await menuButtons.nth(1).click()
    await expect(menu).toHaveCount(0)

    // An entry runs and focus stays on the moved page's button.
    await (await openPageMenu(page, 1)).getByTestId('freeform-slide-context-menu-up').click()
    await expect.poll(slideOrder).toEqual([second, first])
    await expect(menuButtons.nth(0)).toBeFocused()
    await expect(thumbs.nth(0)).toHaveAttribute('aria-current', 'page')

    // A copy of a named page carries the name.
    await page.getByTestId('inspector-page').getByLabel('页面名称').fill('结尾')
    await duplicateCurrentPage(page)
    await expect(thumbs).toHaveCount(3)
    await expect(page.getByTestId('freeform-thumb-title')).toHaveText(['结尾', '结尾 副本', '第 3 页'])
  })

  test('pictures dropped on the canvas land where they fall', async ({ page }) => {
    await openFreeform(page)

    const viewport = page.locator('.freeform-stage-viewport')
    const canvasBox = (await page.getByTestId('freeform-canvas').boundingBox())!
    const scale = await freeformCanvasScale(page)
    // Pointer events carry whole pixels; aim at the one nearest page point (300, 400).
    const point = {
      clientX: Math.round(canvasBox.x + 300 * scale),
      clientY: Math.round(canvasBox.y + 400 * scale),
    }
    const target = { x: (point.clientX - canvasBox.x) / scale, y: (point.clientY - canvasBox.y) / scale }
    const pictures = await page.evaluateHandle((base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }))
      return transfer
    }, TEST_PNG.toString('base64'))
    await viewport.dispatchEvent('dragenter', { dataTransfer: pictures, ...point })
    await viewport.dispatchEvent('dragover', { dataTransfer: pictures, ...point })
    await expect(page.getByTestId('freeform-drop-overlay')).toBeVisible()
    await viewport.dispatchEvent('drop', { dataTransfer: pictures, ...point })
    await expect(page.getByTestId('freeform-drop-overlay')).toHaveCount(0)

    const image = page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') })
    await expect(image).toHaveCount(1)
    const placed = await image.evaluate((element) => {
      const node = element as HTMLElement
      return {
        centerX: Number.parseFloat(node.style.left) + node.offsetWidth / 2,
        centerY: Number.parseFloat(node.style.top) + node.offsetHeight / 2,
      }
    })
    expect(Math.abs(placed.centerX - target.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(placed.centerY - target.y)).toBeLessThanOrEqual(1)

    // Anything that isn't a picture is turned away.
    const note = await page.evaluateHandle(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['hi'], 'note.txt', { type: 'text/plain' }))
      return transfer
    })
    await viewport.dispatchEvent('drop', { dataTransfer: note, ...point })
    await expect(page.getByRole('alert')).toContainText('这里只能放图片')
    await expect(page.getByTestId('freeform-element')).toHaveCount(1)
  })

  test('new elements fan out from the middle instead of stacking on one spot', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await insertShape(page)
    await insertShape(page)
    // 3% of the 1080px page width per step, down and to the right.
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 360, y: 600, width: 360, height: 240 },
      { x: 392, y: 632, width: 360, height: 240 },
      { x: 424, y: 664, width: 360, height: 240 },
    ])
    // Moving one off the middle frees its spot for the next insert.
    await setSelectedElementPosition(page, 40, 40)
    await insertShape(page)
    await expect.poll(async () => (await freeformElementBoxes(page)).at(-1)).toEqual(
      { x: 424, y: 664, width: 360, height: 240 },
    )
  })

  test('a picture on the system clipboard pastes into the page', async ({ page }) => {
    await openFreeform(page)
    await expect(page.getByTestId('freeform-canvas')).toBeVisible()
    const images = page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') })
    const pastePicture = (picture: Buffer = TEST_PNG) => page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      const clipboard = new DataTransfer()
      clipboard.items.add(new File([bytes], 'screenshot.png', { type: 'image/png' }))
      document.body.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }))
    }, picture.toString('base64'))
    // A different blue pixel: swapping to it is visible in the src.
    const BLUE_PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwSPkPAAJbAZRxR3Z2AAAAAElFTkSuQmCC',
      'base64',
    )

    await pastePicture()
    await expect(images).toHaveCount(1)
    await expect(images.first()).toHaveAttribute('data-selected', 'true')
    // With nothing selected (a click on empty canvas), a second paste steps
    // clear of the first.
    await page.getByTestId('freeform-canvas').click({ position: { x: 10, y: 10 } })
    await pastePicture()
    await expect(images).toHaveCount(2)
    const [first, second] = await images.evaluateAll((nodes) => nodes.map((node) => ({
      x: Number.parseFloat((node as HTMLElement).style.left),
      y: Number.parseFloat((node as HTMLElement).style.top),
    })))
    expect(second.x - first.x).toBe(32)
    expect(second.y - first.y).toBe(32)

    // A single selected shape takes the pasted picture as its fill — no new
    // image element appears. (Parked in the corner first so it stays clear
    // of the images for the clicks that follow.)
    await insertShape(page)
    await setSelectedElementPosition(page, 40, 40)
    await pastePicture()
    await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(1)
    await expect(page.getByTestId('freeform-shape-image-fill')
      .locator('[data-framed-image="true"]')).toHaveAttribute('data-image-load-state', 'ready')
    await expect(images).toHaveCount(2)

    // A single selected image node swaps its picture instead of adding one.
    // (The second image only steps 32px clear, so the click goes to the
    // first image's uncovered top-left corner.)
    await images.first().click({ position: { x: 10, y: 10 } })
    await expect(images.first()).toHaveAttribute('data-selected', 'true')
    const srcBefore = await images.first().locator('img').getAttribute('src')
    await pastePicture(BLUE_PNG)
    await expect(images).toHaveCount(2)
    await expect(images.first().locator('[data-framed-image="true"]'))
      .toHaveAttribute('data-image-load-state', 'ready')
    // The picture itself was swapped in place, not just left alone: pasting a
    // different picture changes the image's source. (The paste pipeline runs
    // on after the event itself, so the change is polled for.)
    await expect.poll(async () => images.first().locator('img').getAttribute('src'))
      .not.toBe(srcBefore)

    // Without a picture, a paste brings back what was copied in the editor.
    await page.keyboard.press('Control+c')
    await page.evaluate(() => {
      document.body.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
      }))
    })
    await expect(images).toHaveCount(3)

    // A text field keeps its own paste.
    await page.keyboard.press('Escape')
    const pageName = page.getByTestId('inspector-page').getByLabel('页面名称')
    await pageName.focus()
    await pageName.evaluate((node, base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      const clipboard = new DataTransfer()
      clipboard.items.add(new File([bytes], 'screenshot.png', { type: 'image/png' }))
      node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }))
    }, TEST_PNG.toString('base64'))
    await expect(images).toHaveCount(3)
  })

  test('canvas menu items show their shortcuts without changing their names', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    const element = page.getByTestId('freeform-element').first()
    await element.click({ button: 'right' })
    const menu = page.getByTestId('freeform-context-menu')
    await expect(menu).toBeVisible()
    const duplicate = menu.getByRole('menuitem', { name: '原位复制', exact: true })
    await expect(duplicate).toBeVisible()
    await expect(duplicate.locator('kbd')).toHaveAttribute('aria-hidden', 'true')
    await expect(duplicate.locator('kbd')).toHaveText(/D$/)
    await expect(menu.getByTestId('freeform-context-menu-front').locator('kbd')).toHaveText(']')
    await expect(menu.getByTestId('freeform-context-menu-lock').locator('kbd')).toHaveCount(0)
  })
})

test('finds and replaces text across the whole deck with one undo', async ({ page }) => {
  await openFreeform(page)
  // One page carrying the words, then a duplicate so the deck has two.
  await insertText(page)
  await page.locator('.freeform-element .freeform-textbox').first().fill('周一喝咖啡')
  await duplicateCurrentPage(page)
  await insertText(page)
  await page.locator('.freeform-element .freeform-textbox').first().fill('周二也喝咖啡')

  await page.getByTestId('find-replace-trigger').click()
  const dialog = page.getByTestId('find-replace-dialog')
  await expect(dialog).toBeVisible()
  // Empty find keeps the button disabled.
  await expect(page.getByTestId('find-replace-apply')).toBeDisabled()
  await page.getByTestId('find-input').fill('咖啡')
  await page.getByTestId('replace-input').fill('手冲')
  await page.getByTestId('find-replace-apply').click()
  await expect(page.getByTestId('find-replace-result')).toHaveText('已替换')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await expect(page.getByTestId('editor-save-state')).toHaveText(/已保存/)
  // The current (second) page carries the new words on the canvas...
  await expect(page.locator('.freeform-element .freeform-textbox').first()).toHaveText('周二也喝手冲')
  // ...and so does the first page in the stored draft: one apply covered the deck.
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    const drafts = key ? JSON.parse(localStorage.getItem(key) ?? '[]') : []
    return drafts.find((entry: { mode?: string }) => entry.mode === 'freeform-slide') ?? null
  })
  const storedTexts = stored.document.slides.flatMap(
    (slide: { nodes: Array<{ type: string; text?: string }> }) => slide.nodes
      .filter((node) => node.type === 'text').map((node) => node.text),
  )
  expect(storedTexts).toContain('周一喝手冲')
  expect(storedTexts).toContain('周二也喝手冲')

  // One undo returns both pages to the old words.
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.locator('.freeform-element .freeform-textbox').first()).toHaveText('周二也喝咖啡')
  await expect(page.getByTestId('editor-save-state')).toHaveText(/已保存/)
  const undone = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    const drafts = key ? JSON.parse(localStorage.getItem(key) ?? '[]') : []
    return drafts.find((entry: { mode?: string }) => entry.mode === 'freeform-slide') ?? null
  })
  expect(undone.document.slides[0].nodes.find((node: { type: string }) => node.type === 'text').text).toBe('周一喝咖啡')
})

test('shows an equal-spacing badge while a drag evens out the gaps', async ({ page }) => {
  await openFreeform(page)
  // Two anchored cards and a third dragged between them until its gaps with
  // the neighbours are almost equal; the snap evens them and shows the gap.
  await insertShape(page, '矩形')
  await setSelectedElementBox(page, 80, 300, 200, 150)
  await insertShape(page, '矩形')
  await setSelectedElementBox(page, 760, 300, 200, 150)
  await insertShape(page, '矩形')
  await setSelectedElementBox(page, 400, 320, 200, 150)
  const elements = page.locator('[data-testid="freeform-element"]')
  await expect(elements).toHaveCount(3)
  const boxOf = async (index: number) => {
    const box = await elements.nth(index).boundingBox()
    expect(box).toBeTruthy()
    return box!
  }
  const middleBox = await boxOf(2)
  const scale = await freeformCanvasScale(page)
  // Even gaps are 140/140 at x 420 (centre 520, clear of the page centre);
  // aim 1 page px off so they are 141/139.
  const targetX = middleBox.x + middleBox.width / 2 + 21 * scale
  const targetY = middleBox.y + middleBox.height / 2
  await page.mouse.move(middleBox.x + middleBox.width / 2, targetY)
  await page.mouse.down()
  await page.mouse.move(targetX, targetY, { steps: 10 })
  await expect(page.getByTestId('freeform-space-badge')).toBeVisible()
  await expect(page.getByTestId('freeform-space-badge')).toHaveText(/^间距 \d+/)
  await page.mouse.up()
})
