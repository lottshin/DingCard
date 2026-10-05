// Core editing commands: copy/paste/delete, layer order, multi-selection,
// snapping, keyboard nudges, marquee, and alignment.

import { expect, test } from '@playwright/test'
import {
  freeformCanvasScale,
  freeformElementBoxes,
  freeformElementKinds,
  freeformElementPositions,
  insertLine,
  insertShape,
  insertText,
  insertTwoRectanglesLeavingInspectorFocused,
  insertTwoSelectedRectangles,
  locatorOwnsPoint,
  openFreeform,
  selectedFreeformElements,
  setFreeformZoom,
  setSelectedElementBox,
  setSelectedElementPosition,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('copies, pastes, and deletes the selected element', async ({ page }) => {
  await openFreeform(page)
  await insertText(page)

  await expect(page.locator('.freeform-element')).toHaveCount(1)
  const before = await freeformElementPositions(page)

  await page.keyboard.press('ControlOrMeta+C')
  await page.keyboard.press('ControlOrMeta+V')
  await expect(page.locator('.freeform-element')).toHaveCount(2)

  const after = await freeformElementPositions(page)
  expect(after[1].x - before[0].x).toBe(16)
  expect(after[1].y - before[0].y).toBe(16)

  await page.keyboard.press('Delete')
  await expect(page.locator('.freeform-element')).toHaveCount(1)
})

test('hidden freeform workspace does not handle Delete', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(1)
  await elements.first().click()
  await page.goto('/#/edit/md')
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await page.keyboard.press('Delete')
  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(elements).toHaveCount(1)
})

test('hidden freeform workspace does not handle undo', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(1)
  await page.goto('/#/edit/md')
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await page.keyboard.press('Control+z')
  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(elements).toHaveCount(1)
})

test('moves the selected element through layer order', async ({ page }) => {
  await openFreeform(page)
  await insertText(page)
  await insertShape(page)

  await expect(page.locator('.freeform-element')).toHaveCount(2)
  await expect.poll(() => freeformElementKinds(page)).toEqual(['text', 'shape'])

  await page.getByRole('button', { name: '置底' }).click()
  await expect.poll(() => freeformElementKinds(page)).toEqual(['shape', 'text'])

  await page.getByRole('button', { name: '置顶' }).click()

  await expect.poll(() => freeformElementKinds(page)).toEqual(['text', 'shape'])
})

test('inserts line and arrow elements', async ({ page }) => {
  await openFreeform(page)

  await insertLine(page, '直线')
  await expect(page.getByTestId('freeform-line')).toBeVisible()

  await insertLine(page, '箭头')
  await expect(page.getByTestId('freeform-arrow')).toBeVisible()
})

test('multi-selects elements and aligns them left', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  await setSelectedElementPosition(page, 100, 120)
  await insertShape(page)
  await setSelectedElementPosition(page, 400, 240)

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 120 },
    { x: 400, y: 240 },
  ])

  await page.locator('.freeform-element').first().click({ modifiers: ['Shift'] })
  await page.locator('.freeform-inspector').getByRole('button', { name: '左对齐' }).click()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 120 },
    { x: 100, y: 240 },
  ])
})

test('selection keeps artwork order', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 220, 220)
  await insertShape(page)
  await setSelectedElementBox(page, 180, 180, 220, 220)

  const canvas = page.getByTestId('freeform-canvas')
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const point = {
    x: canvasBox!.x + 280 * scale,
    y: canvasBox!.y + 280 * scale,
  }
  const topArtworkIsSelected = () => page.evaluate(({ x, y }) => {
    const hit = document.elementsFromPoint(x, y)
      .map((node) => node.closest<HTMLElement>('[data-testid="freeform-element"]'))
      .find((node): node is HTMLElement => Boolean(node))
    return hit?.getAttribute('data-selected') === 'true'
  }, point)

  expect(await topArtworkIsSelected()).toBe(true)

  await page.mouse.click(
    canvasBox!.x + 120 * scale,
    canvasBox!.y + 120 * scale,
  )
  await expect(page.getByTestId('freeform-element').first()).toHaveAttribute(
    'data-selected',
    'true',
  )

  expect(await topArtworkIsSelected()).toBe(false)
})

test('selection overlay hit targets stay accessible across zooms', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 240, 260, 180, 140)

  const controls = [
    {
      testId: 'freeform-selection-move',
      name: '\u79fb\u52a8\u5bf9\u8c61',
    },
    {
      testId: 'freeform-selection-resize',
      name: '\u8c03\u6574\u5927\u5c0f',
    },
  ] as const

  for (const zoom of [50, 100, 150]) {
    await setFreeformZoom(page, zoom)
    for (const control of controls) {
      const handle = page.getByTestId(control.testId)
      await expect(handle).toHaveAccessibleName(control.name)
      const box = await handle.boundingBox()
      expect(box, `${control.testId} missing at ${zoom}%`).toBeTruthy()
      expect(box!.width, `${control.testId} width at ${zoom}%`).toBeGreaterThanOrEqual(28)
      expect(box!.height, `${control.testId} height at ${zoom}%`).toBeGreaterThanOrEqual(28)

      await handle.focus()
      await expect(handle).toBeFocused()
      expect(await handle.evaluate((node) => {
        const style = getComputedStyle(node)
        const hasOutline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
        return hasOutline || (style.boxShadow !== 'none' && style.boxShadow !== '')
      }), `${control.testId} focus ring at ${zoom}%`).toBe(true)
    }
  }
})

test('selection overlay edge handles keep a real 28px hit span', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  await setSelectedElementBox(page, 0, 0, 180, 140)
  const moveHandle = page.getByTestId('freeform-selection-move')
  const moveBox = await moveHandle.boundingBox()
  expect(moveBox).toBeTruthy()
  const moveX = moveBox!.x + moveBox!.width / 2
  expect(await locatorOwnsPoint(moveHandle, moveX, moveBox!.y + 2)).toBe(true)
  expect(await locatorOwnsPoint(moveHandle, moveX, moveBox!.y + 29)).toBe(true)

  await setSelectedElementBox(page, 900, 1300, 180, 140)
  const resizeHandle = page.getByTestId('freeform-selection-resize')
  const resizeBox = await resizeHandle.boundingBox()
  expect(resizeBox).toBeTruthy()
  const resizeCenterX = resizeBox!.x + resizeBox!.width / 2
  const resizeCenterY = resizeBox!.y + resizeBox!.height / 2
  expect(await locatorOwnsPoint(resizeHandle, resizeBox!.x + 2, resizeCenterY)).toBe(true)
  expect(await locatorOwnsPoint(resizeHandle, resizeBox!.x + 29, resizeCenterY)).toBe(true)
  expect(await locatorOwnsPoint(resizeHandle, resizeCenterX, resizeBox!.y + 2)).toBe(true)
  expect(await locatorOwnsPoint(resizeHandle, resizeCenterX, resizeBox!.y + 29)).toBe(true)
})

test('leaf pointercancel cleanup move ignores foreign pointer streams', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const before = await freeformElementBoxes(page)
  const handle = page.getByTestId('freeform-selection-move')
  const box = await handle.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await handle.dispatchEvent('pointerdown', {
    pointerId: 41,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 42,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 42,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
  }, start)
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)

  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 41,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
  }, start)
  await expect.poll(() => freeformElementBoxes(page)).not.toEqual(before)

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 42,
      pointerType: 'touch',
    }))
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 41,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
})

test('leaf pointercancel cleanup resize ignores foreign pointer streams', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const before = await freeformElementBoxes(page)
  const handle = page.getByTestId('freeform-selection-resize')
  const box = await handle.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await handle.dispatchEvent('pointerdown', {
    pointerId: 51,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 52,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 52,
      pointerType: 'touch',
    }))
  }, start)
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'resize',
  )

  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 51,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
  }, start)
  await expect.poll(() => freeformElementBoxes(page)).not.toEqual(before)
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 51,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
})

test('leaf pointercancel cleanup move', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const workspace = page.locator('.freeform-workspace')
  const historyDepth = await workspace.getAttribute('data-history-depth')
  expect(historyDepth).not.toBeNull()
  const before = await freeformElementBoxes(page)
  const elementBox = await page.getByTestId('freeform-element').boundingBox()
  expect(elementBox).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const start = {
    x: elementBox!.x + elementBox!.width / 2,
    y: elementBox!.y + elementBox!.height / 2,
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (390 - 5) * scale, start.y)
  const overlay = page.getByTestId('freeform-selection-overlay')
  await expect(overlay).toHaveAttribute('data-live-interaction', 'move')
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(1)

  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
  await expect(overlay).not.toHaveAttribute('data-live-interaction', /.+/)
  await expect(workspace).toHaveAttribute('data-history-depth', historyDepth!)
  await page.mouse.up()
})

test('leaf pointercancel cleanup resize', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const workspace = page.locator('.freeform-workspace')
  const historyDepth = await workspace.getAttribute('data-history-depth')
  expect(historyDepth).not.toBeNull()
  const before = await freeformElementBoxes(page)
  const resizeHandle = page.getByTestId('freeform-selection-resize')
  const handleBox = await resizeHandle.boundingBox()
  expect(handleBox).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const start = {
    x: handleBox!.x + handleBox!.width / 2,
    y: handleBox!.y + handleBox!.height / 2,
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 80 * scale, start.y + 60 * scale)
  const overlay = page.getByTestId('freeform-selection-overlay')
  await expect(overlay).toHaveAttribute('data-live-interaction', 'resize')
  await expect.poll(() => freeformElementBoxes(page)).not.toEqual(before)

  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
  await expect(overlay).not.toHaveAttribute('data-live-interaction', /.+/)
  await expect(workspace).toHaveAttribute('data-history-depth', historyDepth!)
  await page.mouse.up()
})

test('drags selected elements together', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 320, 120, 100, 100)

  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(2)
  await elements.first().click({ modifiers: ['Shift'] })
  await expect(selectedFreeformElements(page)).toHaveCount(2)

  const firstElementBox = await elements.first().boundingBox()
  expect(firstElementBox).toBeTruthy()
  const start = {
    x: firstElementBox!.x + firstElementBox!.width / 2,
    y: firstElementBox!.y + firstElementBox!.height / 2,
  }
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 100 * scale, start.y + 40 * scale)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 200, y: 140 },
    { x: 420, y: 160 },
  ])

  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 100 },
    { x: 320, y: 120 },
  ])
})

test('snapping aligns a dragged element to the page center and hides guides after release', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const element = page.getByTestId('freeform-element').first()
  const box = await element.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (390 - 5) * scale, start.y)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(1)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([{ x: 490, y: 100 }])
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
})

test('snapping aligns a dragged element to another element left edge', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 700, 120, 140, 100)

  const first = page.getByTestId('freeform-element').first()
  const box = await first.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (600 - 5) * scale, start.y)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 700, y: 100 },
    { x: 700, y: 120 },
  ])
})

test('snapping aligns a selected group by its bounding box', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  const first = page.getByTestId('freeform-element').first()
  const box = await first.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (280 - 5) * scale, start.y)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 380, y: 100 },
    { x: 600, y: 120 },
  ])
})

test('snapping hides guides when pointer drag is canceled', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const element = page.getByTestId('freeform-element').first()
  const box = await element.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (390 - 5) * scale, start.y)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(1)

  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
  await page.mouse.up()
})

test('snapping does not apply to keyboard nudges', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 485, 100, 100, 100)
  await page.getByTestId('freeform-element').first().click()
  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([{ x: 486, y: 100 }])
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
})

test('keyboard nudges all selected elements by arrow key', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 101, y: 100 },
    { x: 321, y: 120 },
  ])
})

test('keyboard nudges all selected elements by 10 px with shift arrow', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('Shift+ArrowDown')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 110 },
    { x: 320, y: 130 },
  ])
})

test('long runs of keyboard edits log no React update-depth warning', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await insertTwoSelectedRectangles(page)

  // Each edit used to trigger effects that set state to what it already was;
  // after about 50 edits in a row React logs this warning.
  for (let index = 0; index < 60; index += 1) await page.keyboard.press('Shift+ArrowDown')
  for (let index = 0; index < 60; index += 1) await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 100 },
    { x: 320, y: 120 },
  ])
  for (let index = 0; index < 60; index += 1) await page.keyboard.press('ControlOrMeta+D')
  await expect(page.getByTestId('freeform-element')).toHaveCount(122)

  expect(errors.filter((text) => text.includes('Maximum update depth'))).toEqual([])
})

test('keyboard shortcuts work after shift-selecting from an inspector input', async ({ page }) => {
  const elements = await insertTwoRectanglesLeavingInspectorFocused(page)

  await elements.first().click({ modifiers: ['Shift'] })
  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 101, y: 100 },
    { x: 321, y: 120 },
  ])
})

test('batch copies two selected elements and keeps pasted elements selected', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('ControlOrMeta+C')
  await page.keyboard.press('ControlOrMeta+V')

  await expect(page.getByTestId('freeform-element')).toHaveCount(4)
  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 100 },
    { x: 320, y: 120 },
    { x: 116, y: 116 },
    { x: 336, y: 136 },
  ])
})

test('batch deletes all selected elements', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('Delete')

  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
})

test('keyboard shortcuts work after marquee from an inspector input', async ({ page }) => {
  await insertTwoRectanglesLeavingInspectorFocused(page)

  const canvas = page.getByTestId('freeform-canvas')
  const box = await canvas.boundingBox()
  expect(box).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const start = { x: box!.x + 70 * scale, y: box!.y + 70 * scale }
  const end = { x: box!.x + 500 * scale, y: box!.y + 290 * scale }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y)
  await page.mouse.up()

  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 101, y: 100 },
    { x: 321, y: 120 },
  ])
})

test('marquee selects elements by dragging empty canvas', async ({ page }) => {
  await openFreeform(page)
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 120, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 320, 140, 120, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 760, 140, 120, 100)

  const canvas = page.getByTestId('freeform-canvas')
  const box = await canvas.boundingBox()
  expect(box).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const start = { x: box!.x + 70 * scale, y: box!.y + 70 * scale }
  const end = { x: box!.x + 500 * scale, y: box!.y + 290 * scale }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y)
  await page.mouse.up()

  await expect(selectedFreeformElements(page)).toHaveCount(2)

  await page.locator('.freeform-inspector').getByRole('button', { name: '左对齐' }).click()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 100 },
    { x: 100, y: 140 },
    { x: 760, y: 140 },
  ])
})

test('distributes selected elements horizontally', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 160, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 400, 160, 100, 100)
  expect(await freeformElementPositions(page)).toEqual([
    { x: 100, y: 160 },
    { x: 400, y: 160 },
  ])
  await insertShape(page)
  await setSelectedElementBox(page, 800, 160, 100, 100)

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 160 },
    { x: 400, y: 160 },
    { x: 800, y: 160 },
  ])

  await page.locator('.freeform-element').nth(0).click({ modifiers: ['Shift'] })
  await page.locator('.freeform-element').nth(1).click({ modifiers: ['Shift'] })
  await page.locator('.freeform-inspector').getByRole('button', { name: '水平均分' }).click()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 160 },
    { x: 450, y: 160 },
    { x: 800, y: 160 },
  ])
})
