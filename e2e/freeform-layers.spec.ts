// The layers panel: the accessible tree, renames, drag reorder, locks, hidden
// groups, and selection reconciliation.

import { expect, test } from '@playwright/test'
import {
  contrastRatio,
  duplicateCurrentPage,
  openExportMenu,
  openNestedV3Draft,
  panelLiveRegion,
  samplePngPixel,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('layers tab exposes a reverse accessible tree with roving keyboard focus', async ({ page }) => {
  await openNestedV3Draft(page, `layers-tree-${Date.now()}`)

  const tablist = page.getByRole('tablist', { name: '自由编辑面板' })
  await expect(tablist).toBeVisible()
  await expect(tablist.getByRole('tab')).toHaveCount(3)
  await tablist.getByRole('tab', { name: '图层', exact: true }).click()

  const panel = page.getByRole('tabpanel', { name: '图层' })
  const tree = panel.getByRole('tree', { name: '图层树' })
  await expect(tree).toBeVisible()
  const rows = tree.getByRole('treeitem')
  await expect(rows).toHaveCount(12)
  await expect(rows.first()).toHaveAttribute('aria-label', 'Locked root group')
  await expect(rows.last()).toHaveAttribute('aria-label', 'Underlay')
  await expect(tree.getByRole('treeitem', { name: 'Scope text' })).toHaveAttribute('aria-level', '2')
  await expect(tree.getByRole('treeitem', { name: 'Locked text' })).toHaveAttribute('aria-level', '3')
  const outerGroup = tree.getByRole('treeitem', { name: 'Outer group' })
  const ownedGroupId = await outerGroup.getAttribute('aria-owns')
  expect(ownedGroupId).toBeTruthy()
  await expect(tree.locator(`[id="${ownedGroupId}"]`)).toHaveAttribute('role', 'group')
  await expect(tree.locator('[tabindex="0"]')).toHaveCount(1)

  await rows.first().focus()
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked root group')
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked root group leaf')
  await page.keyboard.press('Home')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked root group')
  await page.keyboard.press('End')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Underlay')
})

test('layers tab keeps independent panel linkage and tree state across tab switches', async ({ page }) => {
  await openNestedV3Draft(page, `layers-tab-state-${Date.now()}`)

  const tablist = page.getByRole('tablist', { name: '自由编辑面板' })
  const propertiesTab = tablist.getByRole('tab', { name: '属性', exact: true })
  const layersTab = tablist.getByRole('tab', { name: '图层', exact: true })
  const propertiesPanelId = await propertiesTab.getAttribute('aria-controls')
  const layersPanelId = await layersTab.getAttribute('aria-controls')
  expect(propertiesPanelId).toBeTruthy()
  expect(layersPanelId).toBeTruthy()
  expect(propertiesPanelId).not.toBe(layersPanelId)
  await expect(page.locator(`#${propertiesPanelId}`)).toHaveAttribute('aria-labelledby', await propertiesTab.getAttribute('id'))
  await expect(page.locator(`#${layersPanelId}`)).toHaveAttribute('aria-labelledby', await layersTab.getAttribute('id'))

  await layersTab.click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await outer.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toHaveCount(0)

  await propertiesTab.click()
  await expect(page.getByRole('tabpanel', { name: '属性' })).toBeVisible()
  await layersTab.click()
  await expect(page.getByRole('tabpanel', { name: '图层' })).toBeVisible()
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toHaveCount(0)
  await expect(outer).toHaveAttribute('tabindex', '0')
})

test('layers tree selects deep nodes in their parent scope and rejects cross-parent toggles', async ({ page }) => {
  await openNestedV3Draft(page, `layers-selection-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })

  const deepRow = tree.getByRole('treeitem', { name: 'Scope text' })
  await deepRow.click()
  await expect(deepRow).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'outer')
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]')).toHaveCount(1)

  const sibling = tree.getByRole('treeitem', { name: 'Visible leaf' })
  await sibling.focus()
  await page.keyboard.press('Space')
  await expect(deepRow).toHaveAttribute('aria-selected', 'true')
  await expect(sibling).toHaveAttribute('aria-selected', 'true')

  const rootRow = tree.getByRole('treeitem', { name: 'Underlay' })
  await rootRow.focus()
  await page.keyboard.press('Space')
  await expect(deepRow).toHaveAttribute('aria-selected', 'true')
  await expect(sibling).toHaveAttribute('aria-selected', 'true')
  await expect(panelLiveRegion(page)).toContainText('只能同时选择同一组内的图层')
})

test('layers tree renames with F2 and reorders siblings with Alt arrows', async ({ page }) => {
  await openNestedV3Draft(page, `layers-edit-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const scopeRow = tree.getByRole('treeitem', { name: 'Scope text' })
  await scopeRow.focus()
  await page.keyboard.press('F2')
  const renameInput = page.getByRole('textbox', { name: '重命名图层' })
  await expect(renameInput).toBeVisible()
  await renameInput.fill('')
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: '文本' })).toBeVisible()

  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  await underlay.focus()
  await page.keyboard.press('Alt+ArrowUp')
  const rootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootLabels.indexOf('Underlay')).toBe(3)
  await expect(panelLiveRegion(page)).toContainText('Underlay')
})

test('layers tabs and tree directional keys stay in the panel without canvas nudges', async ({ page }) => {
  await openNestedV3Draft(page, `layers-keyboard-${Date.now()}`)

  const tablist = page.getByRole('tablist', { name: '自由编辑面板' })
  const propertiesTab = tablist.getByRole('tab', { name: '属性', exact: true })
  const layersTab = tablist.getByRole('tab', { name: '图层', exact: true })
  const historyTab = tablist.getByRole('tab', { name: '历史', exact: true })
  await propertiesTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(layersTab).toHaveAttribute('aria-selected', 'true')
  await expect(layersTab).toBeFocused()
  await expect(page.locator(`#${await layersTab.getAttribute('aria-controls')}`)).toHaveAttribute(
    'aria-labelledby',
    await layersTab.getAttribute('id'),
  )
  await page.keyboard.press('Home')
  await expect(propertiesTab).toHaveAttribute('aria-selected', 'true')
  await expect(propertiesTab).toBeFocused()
  await propertiesTab.focus()
  await page.keyboard.press('End')
  await expect(historyTab).toHaveAttribute('aria-selected', 'true')
  await expect(historyTab).toBeFocused()
  await layersTab.click()

  const tree = page.getByRole('tree', { name: '图层树' })
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await outer.focus()
  await expect(outer).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toHaveCount(0)
  await expect(outer).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Hidden inner')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Outer group')

  const scaled = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await scaled.click()
  const before = await page.locator('[data-scene-node-id="scaled-root"]').getAttribute('style')
  await scaled.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveAttribute('style', before ?? '')
})

test('layers selection reconciles after delete, undo, and switching the active page', async ({ page }) => {
  await openNestedV3Draft(page, `layers-reconcile-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const scopeRow = tree.getByRole('treeitem', { name: 'Scope text' })
  await scopeRow.click()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'outer')

  await page.keyboard.press('Delete')
  await expect(tree.getByRole('treeitem', { name: 'Scope text' })).toHaveCount(0)
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]')).toHaveCount(0)

  await page.keyboard.press('Control+z')
  await expect(tree.getByRole('treeitem', { name: 'Scope text' })).toBeVisible()
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]')).toHaveCount(0)

  await duplicateCurrentPage(page)
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', '')
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]')).toHaveCount(0)
})

test('layers selection resets when another draft opens in the same workspace mount', async ({ page }) => {
  await openNestedV3Draft(page, `layers-draft-identity-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Scope text' }).click()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'outer')

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]')
    const source = structuredClone(drafts[0])
    source.id = 'other-freeform-draft'
    source.title = 'Other freeform draft'
    source.updatedAt += 1
    source.document.activeSlideId = 'other-slide'
    source.document.slides = [{
      ...source.document.slides[0],
      id: 'other-slide',
      name: 'Other slide',
      nodes: [source.document.slides[0].nodes[0]],
    }]
    localStorage.setItem(key, JSON.stringify([...drafts, source]))
  })
  await page.goto('/#/edit/canvas/other-freeform-draft')
  await expect(page.getByTestId('editor-title')).toHaveText('Other freeform draft')

  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', '')
  await expect(page.locator('[data-scene-node-id][data-selected="true"]')).toHaveCount(0)
  await expect(page.getByRole('tree', { name: '图层树' }).getByRole('treeitem')).toHaveCount(1)
})

test('layers reorder keeps a stable same-parent selection and does not write history at boundaries', async ({ page }) => {
  await openNestedV3Draft(page, `layers-reorder-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  const scaled = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await underlay.click()
  await scaled.focus()
  await page.keyboard.press('Space')
  await expect(underlay).toHaveAttribute('aria-selected', 'true')
  await expect(scaled).toHaveAttribute('aria-selected', 'true')

  const rootIdsBefore = await page.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  await underlay.focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled()
  await expect(underlay).toHaveAttribute('aria-selected', 'true')
  await expect(scaled).toHaveAttribute('aria-selected', 'true')
  const rootIdsAfterMove = await page.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootIdsAfterMove).not.toEqual(rootIdsBefore)
  expect(rootIdsAfterMove.filter((name) => name === 'Underlay' || name === 'Scaled root leaf')).toEqual([
    'Scaled root leaf',
    'Underlay',
  ])

  await page.keyboard.press('Control+z')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  const rootIdsAfterUndo = await page.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootIdsAfterUndo).toEqual(rootIdsBefore)

  await page.keyboard.press('Control+y')
  const rootIdsAfterRedo = await page.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootIdsAfterRedo).toEqual(rootIdsAfterMove)
  await expect(page.getByRole('button', { name: '重做', exact: true })).toBeDisabled()
  await expect(panelLiveRegion(page)).toContainText(/第 \d+ 层/)
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()

  await underlay.click()
  await underlay.focus()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('layers drag reorders adjacent siblings and rejects cross-parent drops', async ({ page }) => {
  await openNestedV3Draft(page, `layers-drag-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await underlay.dragTo(outer)
  const rootsAfterDrop = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootsAfterDrop.slice(-2)).toEqual(['Underlay', 'Outer group'])

  const scope = tree.getByRole('treeitem', { name: 'Scope text' })
  await scope.dragTo(underlay)
  await expect(panelLiveRegion(page)).toContainText('图层只能在同一组内排序')
  const rootsAfterRejectedDrop = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootsAfterRejectedDrop).toEqual(rootsAfterDrop)
})

test('layers drag moves a non-adjacent sibling to the exact visual drop position', async ({ page }) => {
  await openNestedV3Draft(page, `layers-drag-distance-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const source = tree.getByRole('treeitem', { name: 'Underlay' })
  const target = tree.getByRole('treeitem', { name: 'Locked root group', exact: true })
  const initialRootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  await source.dragTo(target)

  const visualRootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(visualRootLabels.slice(0, 2)).toEqual(['Underlay', 'Locked root group'])
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled()
  await page.keyboard.press('Control+z')
  const rootsAfterUndo = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootsAfterUndo).toEqual(initialRootLabels)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('layers drag inserts a non-contiguous selection as one block and ignores selected targets', async ({ page }) => {
  await openNestedV3Draft(page, `layers-drag-selection-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const scaled = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  const target = tree.getByRole('treeitem', { name: 'Locked root leaf', exact: true })
  await scaled.click()
  await underlay.focus()
  await page.keyboard.press('Space')

  const initialRootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  await underlay.dragTo(scaled)
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(initialRootLabels)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()

  await underlay.dragTo(target)
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual([
    'Locked root group',
    'Scaled root leaf',
    'Underlay',
    'Locked root leaf',
    'Outer group',
  ])
  await expect(panelLiveRegion(page)).toContainText('已移动 2 个图层至 Locked root leaf 上方')
  await page.keyboard.press('Control+z')
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(initialRootLabels)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('layer rename by double click is one undoable and redoable edit', async ({ page }) => {
  await openNestedV3Draft(page, `layers-rename-history-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const row = tree.getByRole('treeitem', { name: 'Scope text' })
  await row.locator('.freeform-layer-name').dblclick()
  const input = page.getByRole('textbox', { name: '重命名图层' })
  await input.fill('Caption layer')
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: 'Caption layer' })).toBeVisible()
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled()

  await page.keyboard.press('Control+z')
  await expect(tree.getByRole('treeitem', { name: 'Scope text' })).toBeVisible()
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  await page.keyboard.press('Control+y')
  await expect(tree.getByRole('treeitem', { name: 'Caption layer' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重做', exact: true })).toBeDisabled()
})

test('layer rename does not submit while an IME composition is active', async ({ page }) => {
  await openNestedV3Draft(page, `layers-rename-ime-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Scope text' }).press('F2')
  const input = page.getByRole('textbox', { name: '重命名图层' })
  await input.dispatchEvent('compositionstart')
  await input.fill('输入中')
  await input.press('Enter')
  await expect(input).toBeVisible()
  await input.dispatchEvent('compositionend')
  await input.press('Enter')
  await expect(tree.getByRole('treeitem', { name: '输入中' })).toBeVisible()
})

test('layer tree restores deterministic row focus after delete and collapse', async ({ page }) => {
  await openNestedV3Draft(page, `layers-focus-fallback-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const scope = tree.getByRole('treeitem', { name: 'Scope text' })
  await scope.click()
  await scope.focus()
  await page.keyboard.press('Delete')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Visible leaf')

  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await outer.focus()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Outer group')
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toHaveCount(0)
})

test('hidden group export excludes hidden pixels while preserving tree management and focus fallback', async ({ page }) => {
  await openNestedV3Draft(page, `layers-hide-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')

  const scope = tree.getByRole('treeitem', { name: 'Scope text' })
  await scope.click()
  await scope.focus()
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  const hideScope = scope.getByRole('button', { name: '隐藏图层 Scope text' })
  await expect(hideScope).toHaveAttribute('aria-pressed', 'false')

  await hideScope.dblclick()
  await expect(hideScope).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('textbox', { name: '重命名图层' })).toHaveCount(0)
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await page.keyboard.press('Control+z')
  await expect(hideScope).toHaveAttribute('aria-pressed', 'false')

  await scope.evaluate((element) => {
    element.addEventListener('dragstart', () => {
      ;(element as HTMLElement).dataset.actionDragStarted = 'true'
    }, { once: true })
  })
  const hideScopeBox = await hideScope.boundingBox()
  expect(hideScopeBox).toBeTruthy()
  await page.mouse.move(hideScopeBox!.x + hideScopeBox!.width / 2, hideScopeBox!.y + hideScopeBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(hideScopeBox!.x + 32, hideScopeBox!.y + hideScopeBox!.height / 2)
  await page.mouse.up()
  await expect(scope).not.toHaveAttribute('data-action-drag-started', 'true')
  await expect(hideScope).toHaveAttribute('aria-pressed', 'false')

  await scope.focus()
  await page.keyboard.press('Tab')
  await expect(hideScope).toBeFocused()
  await expect(hideScope).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Enter')
  await expect(hideScope).toHaveAttribute('aria-pressed', 'true')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(scope).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-scene-node-id="scope-text"]')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Visible leaf')

  await page.keyboard.press('Control+z')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))
  await expect(page.locator('[data-scene-node-id="scope-text"]')).toHaveCount(1)
  await page.keyboard.press('Control+y')
  await expect(page.locator('[data-scene-node-id="scope-text"]')).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-scene-node-id="scope-text"]')).toHaveCount(1)

  const scaledRoot = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await scaledRoot.click()
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(1)
  await scaledRoot.getByRole('button', { name: '隐藏图层 Scaled root leaf' }).click()
  await expect(scaledRoot).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveCount(0)
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(0)
  await page.keyboard.press('Control+z')

  const visibleLeaf = tree.getByRole('treeitem', { name: 'Visible leaf' })
  await visibleLeaf.focus()
  await visibleLeaf.getByRole('button', { name: '隐藏图层 Visible leaf' }).click()
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Scope text')
  await page.keyboard.press('Control+z')

  const lockedGroupLeaf = tree.getByRole('treeitem', { name: 'Locked root group leaf' })
  await lockedGroupLeaf.focus()
  await lockedGroupLeaf.getByRole('button', { name: '隐藏图层 Locked root group leaf' }).click()
  await expect(lockedGroupLeaf).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked root group')
  await page.keyboard.press('Control+z')

  const hiddenGroup = tree.getByRole('treeitem', { name: 'Hidden inner' })
  const hiddenGroupToggle = hiddenGroup.getByRole('button', { name: '隐藏图层 Hidden inner' })
  await expect(hiddenGroupToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(hiddenGroupToggle).toHaveAttribute('title', '显示 Hidden inner')
  const hiddenLeaf = tree.getByRole('treeitem', { name: 'Hidden leaf' })
  const hiddenLeafDescription = await hiddenLeaf.getAttribute('aria-describedby')
  expect(hiddenLeafDescription).toBeTruthy()
  await expect(page.locator(`[id="${hiddenLeafDescription}"]`)).toContainText('受父级隐藏影响')
  await expect(hiddenLeaf.locator('[title="受父级隐藏影响"]')).toBeVisible()

  const hiddenLeafToggle = hiddenLeaf.getByRole('button', { name: '隐藏图层 Hidden leaf' })
  await hiddenLeafToggle.focus()
  await expect(hiddenLeafToggle).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(hiddenLeafToggle).toBeFocused()
  await expect(hiddenLeafToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(panelLiveRegion(page)).toContainText('已设为自身隐藏，仍受父级隐藏影响')

  await hiddenGroupToggle.click()
  await expect(hiddenGroupToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-scene-node-id="hidden-leaf"]')).toHaveCount(0)
  await hiddenLeafToggle.click()
  await expect(hiddenLeafToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-scene-node-id="hidden-leaf"]')).toHaveCount(1)

  await hiddenGroupToggle.click()
  await expect(hiddenGroup).toBeVisible()
  await expect(page.locator('[data-scene-node-id="hidden-leaf"]')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked inner')

  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()
  expect(await samplePngPixel(page, path!, 400, 300)).toEqual([252, 165, 165, 255])
})

test('locks nested layers against editing and cancels an active IME composition', async ({ page }) => {
  await openNestedV3Draft(page, `layers-lock-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const scope = tree.getByRole('treeitem', { name: 'Scope text' })
  await scope.click()

  const textbox = page.locator('[data-scene-node-id="scope-text"] [role="textbox"]')
  await expect(textbox).toHaveAttribute('contenteditable', 'true')
  await textbox.focus()
  await textbox.dispatchEvent('compositionstart')
  await textbox.evaluate((element) => {
    element.textContent = '未授权的组合输入'
  })

  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  const lockScope = scope.getByRole('button', { name: '锁定图层 Scope text' })
  await expect(lockScope).toHaveAttribute('aria-pressed', 'false')
  const lockScopeBox = await lockScope.boundingBox()
  expect(lockScopeBox).toBeTruthy()
  await page.mouse.move(lockScopeBox!.x + lockScopeBox!.width / 2, lockScopeBox!.y + lockScopeBox!.height / 2)
  await page.mouse.down()
  await expect(textbox).toBeFocused()
  await page.mouse.up()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(lockScope).toHaveAttribute('aria-pressed', 'true')
  await expect(scope).toHaveAttribute('aria-selected', 'true')
  await expect(textbox).toHaveAttribute('contenteditable', 'false')
  await expect(textbox).toHaveAttribute('aria-readonly', 'true')
  await expect(textbox).toHaveCSS('cursor', 'default')
  await expect(textbox).toHaveText('Enter group to edit')
  await textbox.dispatchEvent('compositionend')
  await expect(textbox).toHaveText('Enter group to edit')

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const lockBanner = page.getByTestId('freeform-lock-banner')
  await expect(lockBanner).toContainText('已锁定')
  await expect(page.getByTestId('inspector-geometry')).toHaveCount(0)
  const unlock = lockBanner.getByRole('button', { name: '解锁 Scope text' })
  await unlock.focus()
  await page.keyboard.press('Enter')
  await expect(lockBanner).toHaveCount(0)
  await expect(page.getByRole('tab', { name: '属性', exact: true })).toBeFocused()
  await expect(textbox).toHaveAttribute('contenteditable', 'true')
  await expect(textbox).toHaveText('Enter group to edit')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 2))
  await page.keyboard.press('Control+z')
  await expect(textbox).toHaveAttribute('contenteditable', 'false')
  await page.keyboard.press('Control+y')
  await expect(textbox).toHaveAttribute('contenteditable', 'true')

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const scaledRoot = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await scaledRoot.click()
  const interactionLock = scaledRoot.getByRole('button', { name: '锁定图层 Scaled root leaf' })
  const interactionHide = scaledRoot.getByRole('button', { name: '隐藏图层 Scaled root leaf' })
  const moveHandle = page.getByTestId('freeform-selection-move')
  const moveHandleBox = await moveHandle.boundingBox()
  expect(moveHandleBox).toBeTruthy()
  const interactionHistory = await workspace.getAttribute('data-history-depth')
  const interactionStyleBefore = await page
    .locator('[data-scene-node-id="scaled-root"]')
    .getAttribute('style')
  await page.mouse.move(moveHandleBox!.x + moveHandleBox!.width / 2, moveHandleBox!.y + moveHandleBox!.height / 2)
  await page.mouse.down()
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute('data-live-interaction', 'move')
  await page.mouse.move(
    moveHandleBox!.x + moveHandleBox!.width / 2 + 18,
    moveHandleBox!.y + moveHandleBox!.height / 2 + 10,
  )
  await expect.poll(
    () => page.locator('[data-scene-node-id="scaled-root"]').getAttribute('style'),
  ).not.toBe(interactionStyleBefore)
  const interactionMovedStyle = await page
    .locator('[data-scene-node-id="scaled-root"]')
    .getAttribute('style')
  await interactionLock.evaluate((element) => (element as HTMLButtonElement).click())
  await interactionHide.evaluate((element) => (element as HTMLButtonElement).click())
  await expect(interactionLock).toHaveAttribute('aria-pressed', 'false')
  await expect(interactionHide).toHaveAttribute('aria-pressed', 'false')
  await expect(workspace).toHaveAttribute('data-history-depth', interactionHistory ?? '')
  await page.mouse.up()
  await expect(workspace).toHaveAttribute(
    'data-history-depth',
    String(Number(interactionHistory) + 1),
  )
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveAttribute(
    'style',
    interactionStyleBefore ?? '',
  )
  await page.keyboard.press('Control+y')
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveAttribute(
    'style',
    interactionMovedStyle ?? '',
  )

  const lockedRoot = tree.getByRole('treeitem', { name: 'Locked root leaf' })
  await lockedRoot.focus()
  await page.keyboard.press('Space')
  await expect(scaledRoot).toHaveAttribute('aria-selected', 'true')
  await expect(lockedRoot).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(1)
  await expect(page.getByTestId('freeform-selection-box'))
    .toHaveAttribute('data-element-id', 'scaled-root')
  const rootStyle = await page.locator('[data-scene-node-id="locked-root-leaf"]').getAttribute('style')
  const scaledStyle = await page.locator('[data-scene-node-id="scaled-root"]').getAttribute('style')
  const rootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  // Earlier edits in this test save themselves; locked rejections must not unsave anything.
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  const lockedHistory = await workspace.getAttribute('data-history-depth')
  await scaledRoot.focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(panelLiveRegion(page)).toContainText('图层已锁定，无法调整层级')
  await lockedRoot.focus()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(panelLiveRegion(page)).toContainText('图层已锁定，无法调整层级')
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(rootLabels)

  await page.locator('[data-scene-node-id="locked-root-leaf"]').click({ position: { x: 10, y: 10 } })
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const lockedInspector = page.getByRole('tabpanel', { name: '属性' })
  for (const section of [
    'inspector-geometry',
    'inspector-typography',
    'inspector-fill',
    'inspector-stroke',
    'inspector-arrange',
    'inspector-danger',
  ]) {
    await expect(page.getByTestId(section)).toHaveCount(0)
  }
  await expect(lockedInspector.locator('input, textarea, [role="combobox"]')).toHaveCount(0)
  await page.getByTestId('freeform-lock-banner').getByRole('button').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()
  await page.keyboard.press('Delete')
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await expect(page.locator('[data-scene-node-id="locked-root-leaf"]')).toHaveAttribute(
    'style',
    rootStyle ?? '',
  )
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveAttribute(
    'style',
    scaledStyle ?? '',
  )
  await expect(workspace).toHaveAttribute('data-history-depth', lockedHistory ?? '')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  await scaledRoot.dragTo(underlay)
  await expect(panelLiveRegion(page)).toContainText('图层已锁定，无法调整层级')
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(rootLabels)
  await lockedRoot.dragTo(underlay)
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(rootLabels)
  await expect(workspace).toHaveAttribute('data-history-depth', lockedHistory ?? '')

  await openExportMenu(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()
  expect(await samplePngPixel(page, path!, 720, 45)).toEqual([148, 163, 184, 255])
})

test('locked layer metadata remains manageable through inherited state and reload', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openNestedV3Draft(page, `layers-lock-metadata-${Date.now()}`, true)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const lockedText = tree.getByRole('treeitem', { name: 'Locked text' })
  const ownLock = lockedText.getByRole('button', { name: '锁定图层 Locked text' })
  await expect(ownLock).toHaveAttribute('aria-pressed', 'false')
  await expect(lockedText).toHaveAttribute('data-effective-locked', 'true')
  const lockedTextDescription = await lockedText.getAttribute('aria-describedby')
  expect(lockedTextDescription).toBeTruthy()
  await expect(page.locator(`[id="${lockedTextDescription}"]`)).toContainText('受父级锁定影响')
  await expect(lockedText.locator('[title="受父级锁定影响"]')).toBeVisible()
  await ownLock.click()
  await ownLock.click()
  await expect(ownLock).toHaveAttribute('aria-pressed', 'false')
  await expect(panelLiveRegion(page)).toContainText('已取消自身锁定，仍受父级锁定影响')

  const scaledRoot = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await scaledRoot.click()
  await page.keyboard.press('Control+c')
  await lockedText.click()
  const historyBeforePaste = await workspace.getAttribute('data-history-depth')
  const rowCountBeforePaste = await tree.getByRole('treeitem').count()
  await page.keyboard.press('Control+v')
  await expect(tree.getByRole('treeitem')).toHaveCount(rowCountBeforePaste)
  await expect(workspace).toHaveAttribute('data-history-depth', historyBeforePaste ?? '')
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const inheritedUnlock = page
    .getByTestId('freeform-lock-banner')
    .getByRole('button', { name: '解锁 Locked inner' })
  await inheritedUnlock.focus()
  await expect(inheritedUnlock).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()
  await inheritedUnlock.focus()
  await expect(inheritedUnlock).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-scene-node-id="locked-text"] [role="textbox"]'))
    .toHaveAttribute('contenteditable', 'true')
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-scene-node-id="locked-text"] [role="textbox"]'))
    .toHaveAttribute('contenteditable', 'false')
  await page.keyboard.press('Control+y')
  await expect(page.locator('[data-scene-node-id="locked-text"] [role="textbox"]'))
    .toHaveAttribute('contenteditable', 'true')

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await lockedText.getByRole('button', { name: '锁定图层 Locked text' }).click()
  await expect(lockedText).toHaveAttribute('data-effective-locked', 'true')
  const lockedInner = tree.getByRole('treeitem', { name: 'Locked inner' })
  await lockedInner.getByRole('button', { name: '锁定图层 Locked inner' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const doubleLockBanner = page.getByTestId('freeform-lock-banner')
  await expect(doubleLockBanner.getByRole('button', { name: '解锁 Locked text' })).toBeVisible()
  await doubleLockBanner.getByRole('button', { name: '解锁 Locked text' }).click()
  await expect(doubleLockBanner.getByRole('button', { name: '解锁 Locked inner' })).toBeVisible()
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await lockedText.getByRole('button', { name: '锁定图层 Locked text' }).click()
  await lockedInner.getByRole('button', { name: '锁定图层 Locked inner' }).click()
  await expect(lockedText.getByRole('button', { name: '锁定图层 Locked text' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(lockedText).toHaveAttribute('data-effective-locked', 'true')
  await expect(lockedText).toHaveAttribute('aria-selected', 'true')

  // Move focus with the panel's own keyboard navigation: the raw .focus()
  // call races the panel's roving focus and intermittently never lands, which
  // made F2 rename the previously focused row instead of this one.
  await page.keyboard.press('ArrowDown')
  await expect(lockedText).toBeFocused()
  await page.keyboard.press('F2')
  const renameInput = page.getByRole('textbox', { name: '重命名图层' })
  await renameInput.fill('Protected caption')
  await page.keyboard.press('Enter')
  const renamed = tree.getByRole('treeitem', { name: 'Protected caption' })
  await renamed.getByRole('button', { name: '隐藏图层 Protected caption' }).click()
  await expect(renamed).toBeVisible()
  await expect(page.locator('[data-scene-node-id="locked-text"]')).toHaveCount(0)

  const deepLayer = tree.getByRole('treeitem', { name: 'Deep layer label remains readable' })
  await expect(deepLayer).toHaveAttribute('aria-level', '25')
  await expect(deepLayer).toHaveAttribute('data-effective-locked', 'true')
  await expect(deepLayer).toHaveAttribute('data-effective-hidden', 'true')
  await expect(deepLayer.locator('[title="受父级隐藏和锁定影响"]')).toBeVisible()
  await expect(deepLayer.locator('.freeform-layer-depth')).toHaveText('25')
  await expect(deepLayer.locator('.freeform-layer-depth')).toHaveAttribute('title', '第 25 层')
  await deepLayer.click()
  await expect(renamed.locator('.freeform-layer-actions')).toHaveCSS('opacity', '1')
  expect(await renamed.getByRole('button', { name: '隐藏图层 Protected caption' }).evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  )).not.toBe('rgba(0, 0, 0, 0)')

  const lightHiddenStyles = await renamed.evaluate((row) => {
    const name = row.querySelector<HTMLElement>('.freeform-layer-name')!
    const panel = row.closest<HTMLElement>('.freeform-right-panel')!
    const nameStyle = getComputedStyle(name)
    return {
      opacity: nameStyle.opacity,
      color: nameStyle.color,
      background: getComputedStyle(panel).backgroundColor,
    }
  })
  expect(lightHiddenStyles.opacity).toBe('1')
  expect(contrastRatio(lightHiddenStyles.color, lightHiddenStyles.background)).toBeGreaterThanOrEqual(4.5)

  const treeMetrics = await tree.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(treeMetrics.scrollWidth).toBeLessThanOrEqual(treeMetrics.clientWidth)
  expect(await renamed.locator('.freeform-layer-name').evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(50)

  const deepGeometry = await deepLayer.evaluate((row) => {
    const name = row.querySelector<HTMLElement>('.freeform-layer-name')!.getBoundingClientRect()
    const actions = row.querySelector<HTMLElement>('.freeform-layer-actions')!.getBoundingClientRect()
    const tree = row.closest<HTMLElement>('[role="tree"]')!
    return {
      nameWidth: name.width,
      nameRight: name.right,
      actionsLeft: actions.left,
      treeClientWidth: tree.clientWidth,
      treeScrollWidth: tree.scrollWidth,
    }
  })
  expect(deepGeometry.nameWidth).toBeGreaterThan(40)
  expect(deepGeometry.nameRight).toBeLessThanOrEqual(deepGeometry.actionsLeft + 0.5)
  expect(deepGeometry.treeScrollWidth).toBeLessThanOrEqual(deepGeometry.treeClientWidth)

  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const restoredTree = page.getByRole('tree', { name: '图层树' })
  const restored = restoredTree.getByRole('treeitem', { name: 'Protected caption' })
  await expect(restored.getByRole('button', { name: '锁定图层 Protected caption' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(restored.getByRole('button', { name: '隐藏图层 Protected caption' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-scene-node-id="locked-text"]')).toHaveCount(0)
  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await restored.hover()
  await expect.poll(
    () => restored.locator('.freeform-layer-actions').evaluate(
      (element) => getComputedStyle(element).opacity,
    ),
  ).toBe('1')
  const darkActionStyles = await restored.locator('.freeform-layer-actions').evaluate((element) => {
    const action = getComputedStyle(element)
    const button = getComputedStyle(element.querySelector('button')!)
    return {
      opacity: action.opacity,
      background: action.backgroundColor,
      color: button.color,
    }
  })
  expect(darkActionStyles.opacity).toBe('1')
  expect(contrastRatio(darkActionStyles.color, darkActionStyles.background)).toBeGreaterThan(3)
  expect(await restored.getByRole('button', { name: '隐藏图层 Protected caption' }).evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  )).not.toBe('rgba(0, 0, 0, 0)')
  const darkHiddenStyles = await restored.evaluate((row) => {
    const name = row.querySelector<HTMLElement>('.freeform-layer-name')!
    const panel = row.closest<HTMLElement>('.freeform-right-panel')!
    const nameStyle = getComputedStyle(name)
    return {
      opacity: nameStyle.opacity,
      color: nameStyle.color,
      background: getComputedStyle(panel).backgroundColor,
    }
  })
  expect(darkHiddenStyles.opacity).toBe('1')
  expect(contrastRatio(darkHiddenStyles.color, darkHiddenStyles.background)).toBeGreaterThanOrEqual(4.5)
  await restored.getByRole('button', { name: '隐藏图层 Protected caption' }).click()
  await expect(page.locator('[data-scene-node-id="locked-text"] [role="textbox"]'))
    .toHaveAttribute('contenteditable', 'false')
})
