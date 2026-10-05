// Nested scene documents: rendering a v3 tree, locked canvas hits, live moves,
// and save/restore of a freeform draft.

import { expect, test } from '@playwright/test'
import {
  freeformCanvasScale,
  insertText,
  locatorOwnsPoint,
  openNestedV3Draft,
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

test('renders nested v3 scene with inherited visibility lock and root selection', async ({ page }) => {
  await openNestedV3Draft(page, `nested-v3-${Date.now()}`)

  const leaves = page.locator('[data-scene-leaf="true"]')
  await expect(leaves).toHaveCount(7)
  await expect(page.locator('[data-scene-node-id="hidden-leaf"]')).toHaveCount(0)

  const logicalBoxes = await leaves.evaluateAll((nodes) => {
    const canvas = document.querySelector<HTMLElement>('[data-testid="freeform-canvas"]')
    if (!canvas) throw new Error('canvas missing')
    const canvasRect = canvas.getBoundingClientRect()
    const scale = canvasRect.width / 800
    return Object.fromEntries(nodes.map((node) => {
      const element = node as HTMLElement
      const rect = element.getBoundingClientRect()
      return [element.dataset.sceneNodeId, {
        x: (rect.left - canvasRect.left) / scale,
        y: (rect.top - canvasRect.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      }]
    }))
  }) as Record<string, { x: number; y: number; width: number; height: number }>
  const expectedBoxes = {
    underlay: { x: 40, y: 40, width: 460, height: 320 },
    'visible-leaf': { x: 200, y: 125, width: 100, height: 50 },
    'scope-text': { x: 200, y: 200, width: 125, height: 50 },
    'locked-text': { x: 350, y: 225, width: 125, height: 50 },
    'scaled-root': { x: 495, y: 380, width: 150, height: 120 },
  }
  // 文字盒会按内容自动增高（grow-only）：x/y/width 与声明几何一致，
  // height 只会大于等于声明值，不会小于。
  const textLeafIds = new Set(['scope-text', 'locked-text'])
  for (const [id, expectedBox] of Object.entries(expectedBoxes)) {
    expect(logicalBoxes[id], id).toBeDefined()
    expect(logicalBoxes[id].x, `${id} x`).toBeCloseTo(expectedBox.x, 1)
    expect(logicalBoxes[id].y, `${id} y`).toBeCloseTo(expectedBox.y, 1)
    expect(logicalBoxes[id].width, `${id} width`).toBeCloseTo(expectedBox.width, 1)
    if (textLeafIds.has(id)) {
      expect(logicalBoxes[id].height, `${id} height`).toBeGreaterThanOrEqual(expectedBox.height - 0.05)
    } else {
      expect(logicalBoxes[id].height, `${id} height`).toBeCloseTo(expectedBox.height, 1)
    }
  }

  const lockedText = page.locator('[data-scene-node-id="locked-text"] [role="textbox"]')
  await expect(lockedText).toHaveAttribute('contenteditable', 'false')
  await expect(lockedText).toHaveAttribute('aria-readonly', 'true')
  const scopeText = page.locator('[data-scene-node-id="scope-text"] [role="textbox"]')
  await expect(scopeText).toHaveAttribute('contenteditable', 'false')
  await expect(scopeText).toHaveAttribute('aria-readonly', 'true')

  const rootOrder = async () => page.locator(
    '.freeform-artwork-clip > [data-scene-root-node="true"]',
  ).evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.sceneNodeId))
  const beforeOrder = await rootOrder()
  expect(beforeOrder).toEqual([
    'underlay',
    'outer',
    'scaled-root',
    'locked-root-leaf',
    'locked-root-group',
  ])

  await page.locator('[data-scene-node-id="visible-leaf"]').click()
  await expect(page.locator('[data-scene-node-id="outer"]')).toHaveAttribute('data-selected', 'true')
  await expect(page.locator('[data-scene-node-id="visible-leaf"]')).toHaveAttribute(
    'data-selected',
    'false',
  )
  expect(await rootOrder()).toEqual(beforeOrder)

  const scaledRoot = page.locator('[data-scene-node-id="scaled-root"]')
  await scaledRoot.click()
  const selectionBox = page.getByTestId('freeform-selection-box')
  await expect(selectionBox).toHaveAttribute('data-element-id', 'scaled-root')

  const beforeArtwork = await scaledRoot.boundingBox()
  const beforeOverlay = await selectionBox.boundingBox()
  expect(beforeArtwork).toBeTruthy()
  expect(beforeOverlay).toBeTruthy()
  const expectBoxesToMatch = (
    actual: NonNullable<typeof beforeArtwork>,
    expected: NonNullable<typeof beforeArtwork>,
    label: string,
  ) => {
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect.soft(
        Math.abs(actual[key] - expected[key]),
        `${label} ${key}`,
      ).toBeLessThanOrEqual(1)
    }
  }
  expectBoxesToMatch(beforeOverlay!, beforeArtwork!, 'initial selection overlay')

  const moveHandle = page.getByTestId('freeform-selection-move')
  const resizeHandle = page.getByTestId('freeform-selection-resize')
  for (const [label, handle] of [
    ['move', moveHandle],
    ['resize', resizeHandle],
  ] as const) {
    const box = await handle.boundingBox()
    expect(box, `${label} handle missing`).toBeTruthy()
    expect(box!.width, `${label} handle width`).toBeGreaterThanOrEqual(28)
    expect(box!.height, `${label} handle height`).toBeGreaterThanOrEqual(28)
    expect(
      await locatorOwnsPoint(handle, box!.x + box!.width / 2, box!.y + box!.height / 2),
      `${label} handle center hit target`,
    ).toBe(true)
  }

  const workspace = page.locator('.freeform-workspace')
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  expect(Number.isInteger(historyBefore)).toBe(true)
  const interactionScale = await freeformCanvasScale(page)
  const initialLogicalGeometry = await scaledRoot.evaluate((node) => {
    const element = node as HTMLElement
    return {
      x: Number.parseFloat(element.style.left),
      y: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }
  })
  const resizeStartBox = await resizeHandle.boundingBox()
  expect(resizeStartBox).toBeTruthy()
  const resizeStart = {
    x: resizeStartBox!.x + resizeStartBox!.width / 2,
    y: resizeStartBox!.y + resizeStartBox!.height / 2,
  }
  await page.mouse.move(resizeStart.x, resizeStart.y)
  await page.mouse.down()
  await page.mouse.move(resizeStart.x + 60, resizeStart.y + 45)
  await page.mouse.up()

  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  const resizedArtwork = await scaledRoot.boundingBox()
  const resizedOverlay = await selectionBox.boundingBox()
  const resizedHandle = await resizeHandle.boundingBox()
  const resizedLogicalGeometry = await scaledRoot.evaluate((node) => {
    const element = node as HTMLElement
    return {
      x: Number.parseFloat(element.style.left),
      y: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }
  })
  expect(resizedArtwork).toBeTruthy()
  expect(resizedOverlay).toBeTruthy()
  expect(resizedHandle).toBeTruthy()
  expect(resizedArtwork!.width).toBeGreaterThan(beforeArtwork!.width)
  expect(resizedArtwork!.height).toBeGreaterThan(beforeArtwork!.height)
  const expectedWidth = initialLogicalGeometry.width + 60 / interactionScale / 1.5
  const expectedHeight = initialLogicalGeometry.height + 45 / interactionScale / 1.5
  expect(resizedLogicalGeometry.width).toBeCloseTo(expectedWidth, 3)
  expect(resizedLogicalGeometry.height).toBeCloseTo(expectedHeight, 3)
  expect(resizedLogicalGeometry.x).toBeCloseTo(
    initialLogicalGeometry.x + (expectedWidth - initialLogicalGeometry.width) / 4,
    3,
  )
  expect(resizedLogicalGeometry.y).toBeCloseTo(
    initialLogicalGeometry.y + (expectedHeight - initialLogicalGeometry.height) / 4,
    3,
  )
  expect.soft(Math.abs(resizedArtwork!.x - beforeArtwork!.x), 'resize visual left').toBeLessThanOrEqual(1)
  expect.soft(Math.abs(resizedArtwork!.y - beforeArtwork!.y), 'resize visual top').toBeLessThanOrEqual(1)
  expectBoxesToMatch(resizedOverlay!, resizedArtwork!, 'resized selection overlay')
  expect.soft(
    Math.abs(
      resizedHandle!.x + resizedHandle!.width / 2 - (resizedArtwork!.x + resizedArtwork!.width),
    ),
    'resize handle follows visual right',
  ).toBeLessThanOrEqual(1)
  expect.soft(
    Math.abs(
      resizedHandle!.y + resizedHandle!.height / 2 - (resizedArtwork!.y + resizedArtwork!.height),
    ),
    'resize handle follows visual bottom',
  ).toBeLessThanOrEqual(1)

  await page.getByRole('button', { name: '\u64a4\u9500', exact: true }).click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))
  await expect.poll(async () => {
    const restored = await scaledRoot.boundingBox()
    if (!restored) return Number.POSITIVE_INFINITY
    return Math.max(
      ...(['x', 'y', 'width', 'height'] as const).map((key) => (
        Math.abs(restored[key] - beforeArtwork![key])
      )),
    )
  }).toBeLessThanOrEqual(1)

  const canvas = page.getByTestId('freeform-canvas')
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).toBeTruthy()
  const canvasScale = await freeformCanvasScale(page)
  // Marquee from a point clear of the frame's corner handles (they resize).
  await page.mouse.move(
    canvasBox!.x + 465 * canvasScale,
    canvasBox!.y + 372 * canvasScale,
  )
  await page.mouse.down()
  await page.mouse.move(
    canvasBox!.x + 510 * canvasScale,
    canvasBox!.y + 390 * canvasScale,
  )
  await page.mouse.up()
  await expect(scaledRoot).toHaveAttribute('data-selected', 'true')

  const moveHistoryBefore = Number(await workspace.getAttribute('data-history-depth'))
  const moveStartBox = await moveHandle.boundingBox()
  expect(moveStartBox).toBeTruthy()
  const moveStart = {
    x: moveStartBox!.x + moveStartBox!.width / 2,
    y: moveStartBox!.y + moveStartBox!.height / 2,
  }
  await page.mouse.move(moveStart.x, moveStart.y)
  await page.mouse.down()
  await page.mouse.move(moveStart.x + 300, moveStart.y + 160)
  await page.mouse.up()

  await expect(workspace).toHaveAttribute('data-history-depth', String(moveHistoryBefore + 1))
  const movedArtwork = await scaledRoot.boundingBox()
  expect(movedArtwork).toBeTruthy()
  expect(Math.abs(movedArtwork!.x + movedArtwork!.width - canvasBox!.x - canvasBox!.width))
    .toBeLessThanOrEqual(1)
  expect(Math.abs(movedArtwork!.y + movedArtwork!.height - canvasBox!.y - canvasBox!.height))
    .toBeLessThanOrEqual(1)

  await page.getByRole('button', { name: '\u64a4\u9500', exact: true }).click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(moveHistoryBefore))
  await expect.poll(async () => {
    const restored = await scaledRoot.boundingBox()
    if (!restored) return Number.POSITIVE_INFINITY
    return Math.max(
      ...(['x', 'y', 'width', 'height'] as const).map((key) => (
        Math.abs(restored[key] - beforeArtwork![key])
      )),
    )
  }).toBeLessThanOrEqual(1)
})

test('locked canvas hits preserve an existing selection', async ({ page }) => {
  await openNestedV3Draft(page, `locked-hit-${Date.now()}`)

  const selectedSceneNodeIds = () => page.locator(
    '[data-scene-node-id][data-selected="true"]',
  ).evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.sceneNodeId))
  const unlocked = page.locator('[data-scene-node-id="scaled-root"]')
  const lockedRootLeaf = page.locator('[data-scene-node-id="locked-root-leaf"]')
  const lockedRootDescendant = page.locator('[data-scene-node-id="locked-root-group-leaf"]')
  const effectiveLockedDescendant = page.locator('[data-scene-node-id="locked-text"]')

  const expectLockedHitToKeepSelection = async (
    hit: import('@playwright/test').Locator,
    modifiers?: ('Shift')[],
  ) => {
    await unlocked.click()
    await expect(unlocked).toHaveAttribute('data-selected', 'true')
    await hit.click(modifiers ? { modifiers } : undefined)
    expect.soft(await selectedSceneNodeIds()).toEqual(['scaled-root'])
  }

  await expectLockedHitToKeepSelection(lockedRootLeaf)
  await expectLockedHitToKeepSelection(lockedRootDescendant)
  await expectLockedHitToKeepSelection(lockedRootDescendant, ['Shift'])
  await expectLockedHitToKeepSelection(effectiveLockedDescendant)
})

test('live move ignores ArrowRight before pointerup and commits one history entry', async ({ page }) => {
  await openNestedV3Draft(page, `live-move-up-${Date.now()}`)

  const workspace = page.locator('.freeform-workspace')
  await expect(workspace).toHaveAttribute('data-history-depth', '0')
  const element = page.locator('[data-scene-node-id="scaled-root"]')
  await element.click()
  const before = await element.boundingBox()
  expect(before).toBeTruthy()
  const handle = page.getByTestId('freeform-selection-move')
  const handleBox = await handle.boundingBox()
  expect(handleBox).toBeTruthy()
  const start = {
    x: handleBox!.x + handleBox!.width / 2,
    y: handleBox!.y + handleBox!.height / 2,
  }

  await handle.dispatchEvent('pointerdown', {
    pointerId: 71,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 71,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 30,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await expect.poll(async () => (await element.boundingBox())?.x).not.toBeCloseTo(before!.x, 1)

  await page.keyboard.press('ArrowRight')
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 71,
      pointerType: 'touch',
    }))
  })

  await expect.soft(workspace).toHaveAttribute('data-history-depth', '1')
  const undo = page.getByRole('button', { name: '\u64a4\u9500', exact: true })
  await undo.click()
  await expect.poll(async () => {
    const restored = await element.boundingBox()
    if (!restored) return Number.POSITIVE_INFINITY
    return Math.max(
      ...(['x', 'y', 'width', 'height'] as const).map((key) => Math.abs(restored[key] - before![key])),
    )
  }).toBeLessThanOrEqual(1)
  await expect.soft(undo).toBeDisabled()
})

test('live move ignores ArrowRight before pointercancel and restores complete history', async ({ page }) => {
  await openNestedV3Draft(page, `live-move-cancel-${Date.now()}`)

  const workspace = page.locator('.freeform-workspace')
  await expect(workspace).toHaveAttribute('data-history-depth', '0')
  const element = page.locator('[data-scene-node-id="scaled-root"]')
  await element.click()
  const before = await element.boundingBox()
  expect(before).toBeTruthy()
  const handle = page.getByTestId('freeform-selection-move')
  const handleBox = await handle.boundingBox()
  expect(handleBox).toBeTruthy()
  const start = {
    x: handleBox!.x + handleBox!.width / 2,
    y: handleBox!.y + handleBox!.height / 2,
  }

  await handle.dispatchEvent('pointerdown', {
    pointerId: 72,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 72,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 30,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await expect.poll(async () => (await element.boundingBox())?.x).not.toBeCloseTo(before!.x, 1)

  await page.keyboard.press('ArrowRight')
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 72,
      pointerType: 'touch',
    }))
  })

  const geometryDistanceFromStart = async () => {
    const current = await element.boundingBox()
    if (!current) return Number.POSITIVE_INFINITY
    return Math.max(
      ...(['x', 'y', 'width', 'height'] as const).map((key) => Math.abs(current[key] - before![key])),
    )
  }
  await expect.poll(geometryDistanceFromStart).toBeLessThanOrEqual(1)
  await expect.soft(workspace).toHaveAttribute('data-history-depth', '0')
  const undo = page.getByRole('button', { name: '\u64a4\u9500', exact: true })
  await expect.soft(undo).toBeDisabled()
  if (await undo.isEnabled()) {
    await undo.click()
    await expect.poll(geometryDistanceFromStart).toBeLessThanOrEqual(1)
  }
})

test('saves and restores a freeform draft', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await insertText(page)
  await page.getByLabel('文本内容').fill('保存恢复测试')

  await signUpToSave(page, `freeform-${Date.now()}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expect(page.getByLabel('文本内容')).toContainText('保存恢复测试')
})
