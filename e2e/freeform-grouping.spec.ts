// Grouping: panel and shortcut paths, canvas scope entry and exit, and rejection
// of locked or single-layer selections.

import { expect, test } from '@playwright/test'
import {
  freeformElementBoxes,
  groupingDraft,
  openNestedV3Draft,
  scopeNavigationDraft,
  startWithSettingsPanelOpen,
  textScopeDraft,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('groups non-contiguous layers from the panel and ungroups promoted paths', async ({ page }) => {
  await openNestedV3Draft(page, `group-panel-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const layerA = tree.getByRole('treeitem', { name: 'Layer A' })
  const layerC = tree.getByRole('treeitem', { name: 'Layer C' })
  await layerA.click()
  await layerC.focus()
  await page.keyboard.press('Space')
  await expect(layerA).toHaveAttribute('aria-selected', 'true')
  await expect(layerC).toHaveAttribute('aria-selected', 'true')

  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  await page.getByTestId('freeform-group-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  // The grouping is an edit, so it saves itself.
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  const selectedGroup = page.locator('.freeform-scene-group[data-selected="true"]')
  await expect(selectedGroup).toHaveCount(1)
  const groupId = await selectedGroup.getAttribute('data-scene-node-id')
  expect(groupId).toBeTruthy()
  const rootIdsAfterGroup = await page.locator('.freeform-artwork-clip > [data-scene-node-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-scene-node-id')))
  expect(rootIdsAfterGroup).toEqual(['layer-b', groupId, 'layer-d', 'locked-container'])
  const groupedChildIds = await selectedGroup.locator(':scope > [data-scene-node-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-scene-node-id')))
  expect(groupedChildIds).toEqual(['layer-a', 'layer-c'])

  await page.getByTestId('freeform-ungroup-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 2))
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(0)
  const selectedLabels = await tree.locator('[role="treeitem"][aria-selected="true"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')))
  expect(selectedLabels).toEqual(['Layer C', 'Layer A'])
  const allIds = await page.getByTestId('freeform-canvas').locator('[data-scene-node-id]')
    .evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-scene-node-id')).filter(Boolean),
  )
  expect(new Set(allIds).size).toBe(allIds.length)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(1)
  await expect(page.getByTestId('freeform-canvas').locator('[data-selected="true"]')).toHaveCount(0)
})

test('group and ungroup shortcuts share the command layer for nested groups', async ({ page }) => {
  await openNestedV3Draft(page, `group-shortcuts-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  const layerB = tree.getByRole('treeitem', { name: 'Layer B' })
  await layerB.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ControlOrMeta+g')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(1)
  await expect(workspace).toHaveAttribute('data-history-depth', '1')

  const layerC = tree.getByRole('treeitem', { name: 'Layer C' })
  await layerC.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ControlOrMeta+g')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(2)
  await expect(workspace).toHaveAttribute('data-history-depth', '2')

  await page.keyboard.press('ControlOrMeta+Shift+g')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(1)
  await expect(workspace).toHaveAttribute('data-history-depth', '3')
  const selectedLabels = await tree.locator('[role="treeitem"][aria-selected="true"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')))
  expect(selectedLabels).toEqual(['Layer C', '组'])
})

test('grouping rejects locked selections and locked parent insertion without dirty history', async ({ page }) => {
  await openNestedV3Draft(page, `group-locked-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const lockedA = tree.getByRole('treeitem', { name: 'Locked child A' })
  const lockedB = tree.getByRole('treeitem', { name: 'Locked child B' })
  await lockedA.click()
  await lockedB.focus()
  await page.keyboard.press('Space')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.getByTestId('freeform-group-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('锁定')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.keyboard.press('ControlOrMeta+g')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('锁定')

  await page.getByTestId('freeform-text-tool').click()
  await page.getByTestId('insert-text').click()
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('锁定')
  await expect(tree.getByRole('treeitem', { name: '文本' })).toHaveCount(0)

  await tree.getByRole('treeitem', { name: 'Locked container' }).click()
  await page.getByTestId('freeform-ungroup-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('锁定')
})

test('group command rejects a single layer without changing history', async ({ page }) => {
  await openNestedV3Draft(page, `group-single-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const workspace = page.locator('.freeform-workspace')
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Layer A' })
    .click()
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await page.getByTestId('freeform-group-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('至少选择两个同级图层')
})

test('focused ungroup button keeps Enter as a native button command', async ({ page }) => {
  await openNestedV3Draft(page, `group-button-enter-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  const layerB = tree.getByRole('treeitem', { name: 'Layer B' })
  await layerB.focus()
  await page.keyboard.press('Space')
  await page.getByTestId('freeform-group-selection').click()
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(1)

  const ungroupButton = page.getByTestId('freeform-ungroup-selection')
  await ungroupButton.focus()
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(0)
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', '')
})

test('canvas group scope enters by double click or Enter and exits one level per Escape', async ({ page }) => {
  await openNestedV3Draft(page, `group-scope-${Date.now()}`, false, scopeNavigationDraft)
  const workspace = page.locator('.freeform-workspace')
  const canvas = page.getByTestId('freeform-canvas')
  const leaf = page.locator('[data-scene-node-id="scope-leaf"]')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await leaf.click()
  await expect(page.locator('[data-scene-node-id="scope-outer"][data-selected="true"]')).toHaveCount(1)
  await leaf.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await expect(canvas.locator('[data-selected="true"]')).toHaveCount(0)
  await expect(page.getByTestId('freeform-scope-breadcrumb')).toContainText('页面')
  await expect(page.getByTestId('freeform-scope-breadcrumb')).toContainText('Scope outer')

  await page.locator('[data-scene-node-id="scope-leaf"]').click()
  await expect(page.locator('[data-scene-node-id="scope-inner"][data-selected="true"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer/scope-inner')
  await expect(canvas.locator('[data-selected="true"]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-active-group-path', '')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
})

test('nested text consumes the first Escape before leaving its group scope', async ({ page }) => {
  await openNestedV3Draft(page, `group-text-escape-${Date.now()}`, false, textScopeDraft)
  const canvas = page.getByTestId('freeform-canvas')
  const editable = page.locator('[data-scene-node-id="scope-text-edit"] [contenteditable="true"]')
  await page.locator('[data-scene-node-id="scope-text-edit"]').dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await editable.click()
  await expect(editable).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(editable).not.toBeFocused()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-active-group-path', '')
})

test('IME composition keeps Escape inside nested text editing until composition ends', async ({ page }) => {
  await openNestedV3Draft(page, `group-text-ime-escape-${Date.now()}`, false, textScopeDraft)
  const canvas = page.getByTestId('freeform-canvas')
  const editable = page.locator('[data-scene-node-id="scope-text-edit"] [contenteditable="true"]')
  await page.locator('[data-scene-node-id="scope-text-edit"]').dblclick()
  await page.getByTestId('freeform-canvas').locator('[data-scene-node-id="scope-text-edit"]')
    .click()
  await expect(editable).toBeFocused()
  await editable.dispatchEvent('compositionstart')

  await page.keyboard.press('Escape')
  await expect(editable).toBeFocused()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')

  await editable.dispatchEvent('compositionend')
  await page.keyboard.press('Escape')
  await expect(editable).not.toBeFocused()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
})

test('paint popover consumes Escape before leaving a nested group scope', async ({ page }) => {
  await openNestedV3Draft(page, `group-paint-escape-${Date.now()}`, false, scopeNavigationDraft)
  const canvas = page.getByTestId('freeform-canvas')
  const leaf = page.locator('[data-scene-node-id="scope-leaf"]')

  await leaf.click()
  await leaf.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await leaf.click()
  await page.keyboard.press('Enter')
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer/scope-inner')
  await leaf.click()
  await expect(leaf).toHaveAttribute('data-selected', 'true')

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const trigger = page.getByTestId('shape-fill-paint').getByTestId('paint-color-button')
  await trigger.click()
  const popover = page.getByRole('dialog', { name: '填充 颜色 色板' })
  await expect(popover).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer/scope-inner')
  await expect(leaf).toHaveAttribute('data-selected', 'true')
  await expect(trigger).toBeFocused()
})

test('panel structure commands reject while a live pointer interaction is active', async ({ page }) => {
  await openNestedV3Draft(page, `group-live-move-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  const layerB = tree.getByRole('treeitem', { name: 'Layer B' })
  await layerB.focus()
  await page.keyboard.press('Space')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const before = await freeformElementBoxes(page)
  const move = page.getByTestId('freeform-selection-move').first()
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()
  const start = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  }
  await move.dispatchEvent('pointerdown', {
    pointerId: 81,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 81,
      pointerType: 'touch',
      clientX: x + 40,
      clientY: y + 30,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  const rootOrderBeforeReorder = await tree.locator('[role="treeitem"][aria-level="1"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')))
  const liveGeometryBeforeReorder = await freeformElementBoxes(page)
  await tree.getByRole('treeitem', { name: 'Layer A' }).focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect.poll(() => freeformElementBoxes(page)).toEqual(liveGeometryBeforeReorder)
  await expect(tree.locator('[role="treeitem"][aria-level="1"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))))
    .resolves.toEqual(rootOrderBeforeReorder)

  await page.getByRole('button', { name: '关闭提示' }).click()
  await tree.getByRole('treeitem', { name: 'Layer A' }).dragTo(
    tree.getByRole('treeitem', { name: 'Layer D' }),
  )
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect.poll(() => freeformElementBoxes(page)).toEqual(liveGeometryBeforeReorder)
  await expect(tree.locator('[role="treeitem"][aria-level="1"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))))
    .resolves.toEqual(rootOrderBeforeReorder)

  await page.getByRole('button', { name: '关闭提示' }).click()
  await tree.getByRole('treeitem', { name: 'Layer A' }).focus()
  await page.keyboard.press('F2')
  const renameInput = page.getByRole('textbox', { name: '重命名图层' })
  await renameInput.fill('Blocked rename')
  await renameInput.press('Enter')
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(tree.getByRole('treeitem', { name: 'Layer A' })).toHaveCount(1)
  await expect(tree.getByRole('treeitem', { name: 'Blocked rename' })).toHaveCount(0)

  await page.getByRole('button', { name: '关闭提示' }).click()
  await page.getByTestId('freeform-text-tool').click()
  await page.getByTestId('insert-text').click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(tree.getByRole('treeitem', { name: '文本' })).toHaveCount(0)

  await page.getByTestId('freeform-group-selection').click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(0)

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 81,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')

  await page.getByRole('button', { name: '关闭提示' }).click()
  await tree.getByRole('treeitem', { name: 'Layer C' }).click()
  const resize = page.getByTestId('freeform-selection-resize')
  const resizeBox = await resize.boundingBox()
  expect(resizeBox).toBeTruthy()
  const resizeStart = {
    x: resizeBox!.x + resizeBox!.width / 2,
    y: resizeBox!.y + resizeBox!.height / 2,
  }
  await resize.dispatchEvent('pointerdown', {
    pointerId: 82,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: resizeStart.x,
    clientY: resizeStart.y,
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'resize',
  )
  await page.getByTestId('freeform-ungroup-selection').click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 82,
      pointerType: 'touch',
    }))
  })
})
