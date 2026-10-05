// Shape image fills: a pending upload stays isolated to its target path, draft,
// and account, and manual changes cancel it.

import { expect, test } from '@playwright/test'
import {
  TEST_PNG,
  expectShapeFillFileReaderStarted,
  insertShape,
  installShapeFillFileReaderGate,
  nestedV3Draft,
  openFreeform,
  openNestedV3Draft,
  registerUser,
  releaseShapeFillFileReaderGate,
  restoreShapeFillFileReaderGate,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('delayed shape image fill cannot write into another draft with the same scene ids', async ({
  page,
}) => {
  await openNestedV3Draft(page, `shape-fill-draft-race-${Date.now()}`)

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]')
    const source = structuredClone(drafts[0])
    source.id = 'shape-fill-race-target'
    source.title = 'Shape fill race target'
    source.updatedAt += 1
    localStorage.setItem(key, JSON.stringify([...drafts, source]))
  })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Scaled root leaf' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await installShapeFillFileReaderGate(page)

  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'delayed-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.goto('/#/edit/canvas/shape-fill-race-target')
  await expect(page.getByTestId('editor-title')).toHaveText('Shape fill race target')
  await releaseShapeFillFileReaderGate(page)
  await expect.poll(() => page.evaluate(() => {
    const images = JSON.parse(sessionStorage.getItem('slicer.images.v1') ?? '{}')
    return Object.keys(images).length
  })).toBeGreaterThan(0)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Scaled root leaf' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const shapeFill = page.getByTestId('shape-fill-paint')
  await expect(shapeFill.getByTestId('paint-mode-solid')).toHaveClass(/\bon\b/)
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(0)

  await restoreShapeFillFileReaderGate(page)
})

test('delayed shape image fill cannot write across account identity changes', async ({ page }) => {
  const accountSuffix = Date.now()
  await openNestedV3Draft(page, `shape-fill-user-race-${accountSuffix}-a`)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Scaled root leaf' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await installShapeFillFileReaderGate(page)
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'cross-account-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.getByTestId('account-menu').click()
  await page.getByTestId('account-logout').click()
  await expect(page.getByTestId('account-login')).toBeVisible()
  await page.getByTestId('account-login').click()
  await registerUser(page, `shape-fill-user-race-${accountSuffix}-b`)
  await expect(page.getByTestId('account-menu')).toBeVisible()

  // B opens a project with the same scene ids before A's pending read is released
  // (no reload, so the read is still pending). A stale completion would therefore
  // be visible in B's active document and draft.
  await page.goto('/#/projects')
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'same-scene.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(nestedV3Draft().document)),
  })
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  const bFillBefore = await page.evaluate(() => {
    const userId = localStorage.getItem('slicer.session.v1')
    if (!userId) throw new Error('session user missing after registration')
    const drafts = JSON.parse(localStorage.getItem(`slicer.drafts.${userId}`) ?? '[]') as Array<{
      document?: { slides?: Array<{ nodes?: Array<{ id: string; fill?: unknown }> }> }
    }>
    const node = drafts.at(-1)?.document?.slides?.[0]?.nodes?.find((candidate) => (
      candidate.id === 'scaled-root'
    ))
    return node?.fill
  })
  expect(bFillBefore).toMatchObject({ type: 'solid' })

  await releaseShapeFillFileReaderGate(page)
  await expect.poll(() => page.evaluate(() => {
    const images = JSON.parse(sessionStorage.getItem('slicer.images.v1') ?? '{}')
    return Object.keys(images).length
  })).toBeGreaterThan(0)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Scaled root leaf' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const shapeFill = page.getByTestId('shape-fill-paint')
  await expect(shapeFill.getByTestId('paint-mode-solid')).toHaveClass(/\bon\b/)
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(0)

  // Save after release so a late reducer update cannot hide behind an unsaved
  // in-memory state; the persisted B draft must still contain the original fill.
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  const bFillAfter = await page.evaluate(() => {
    const userId = localStorage.getItem('slicer.session.v1')
    if (!userId) throw new Error('session user missing after release')
    const drafts = JSON.parse(localStorage.getItem(`slicer.drafts.${userId}`) ?? '[]') as Array<{
      document?: { slides?: Array<{ nodes?: Array<{ id: string; fill?: unknown }> }> }
    }>
    const node = drafts.at(-1)?.document?.slides?.[0]?.nodes?.find((candidate) => (
      candidate.id === 'scaled-root'
    ))
    return node?.fill
  })
  expect(bFillAfter).toEqual(bFillBefore)

  await restoreShapeFillFileReaderGate(page)
})

test('delayed shape image fill survives the first save of the same document', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('account-login').click()
  await registerUser(page, `shape-fill-first-save-${Date.now()}`)
  await insertShape(page)

  await installShapeFillFileReaderGate(page)
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'first-save-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await releaseShapeFillFileReaderGate(page)

  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
  await restoreShapeFillFileReaderGate(page)
})

test('shape image fill accepts only the newest pending upload', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

  await installShapeFillFileReaderGate(page)
  const input = page.locator('.freeform-properties-tabpanel input.freeform-file')
  await input.setInputFiles({
    name: 'older-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)
  await input.setInputFiles({
    name: 'newer-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page, 2)

  await releaseShapeFillFileReaderGate(page, 2)
  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await restoreShapeFillFileReaderGate(page)
})

test('shape image fill operations are isolated by target path', async ({ page }) => {
  await openNestedV3Draft(page, `shape-fill-target-isolation-${Date.now()}`)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Visible leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await installShapeFillFileReaderGate(page)
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'nested-target-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'root-target-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page, 2)

  await releaseShapeFillFileReaderGate(page, 2)
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(2)
  await restoreShapeFillFileReaderGate(page)
})

test('manual shape fill changes cancel a pending image upload', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await installShapeFillFileReaderGate(page)
  const input = page.locator('.freeform-properties-tabpanel input.freeform-file')
  await input.setInputFiles({
    name: 'cancelled-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  const shapeFill = page.getByTestId('shape-fill-paint')
  await shapeFill.getByTestId('paint-mode-linear-gradient').click()
  await expect(shapeFill.getByTestId('paint-mode-linear-gradient')).toHaveClass(/\bon\b/)
  await releaseShapeFillFileReaderGate(page)

  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(0)
  await expect(page.getByTestId('freeform-shape')).toHaveCSS('background-image', /linear-gradient/)
  await restoreShapeFillFileReaderGate(page)
})

test('pending shape fill does not commit while a live pointer interaction is active', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const move = page.getByTestId('freeform-selection-move').first()
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()

  await installShapeFillFileReaderGate(page)
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'live-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  const start = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  }
  await move.dispatchEvent('pointerdown', {
    pointerId: 91,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 91,
      pointerType: 'touch',
      clientX: x + 24,
      clientY: y + 18,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  await releaseShapeFillFileReaderGate(page)
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(0)

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 91,
      pointerType: 'touch',
    }))
  })
  await restoreShapeFillFileReaderGate(page)
})

test('delayed shape image fill follows the original nested path after same-document selection changes', async ({
  page,
}) => {
  await openNestedV3Draft(page, `shape-fill-selection-race-${Date.now()}`)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const shapeRow = tree.getByRole('treeitem', { name: 'Visible leaf' })
  await shapeRow.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await installShapeFillFileReaderGate(page)

  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'same-document-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const textRow = tree.getByRole('treeitem', { name: 'Scope text' })
  await textRow.click()
  await expect(textRow).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]'))
    .toHaveCount(1)

  await releaseShapeFillFileReaderGate(page)
  await expect.poll(() => page.evaluate(() => {
    const images = JSON.parse(sessionStorage.getItem('slicer.images.v1') ?? '{}')
    return Object.keys(images).length
  })).toBeGreaterThan(0)

  await expect(textRow).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]'))
    .toHaveCount(1)
  await shapeRow.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
  await expect(page.getByTestId('shape-fill-paint').getByTestId('paint-mode-image'))
    .toHaveClass(/\bon\b/)

  await restoreShapeFillFileReaderGate(page)
})
