// Pointer interaction guards: one transform owner at a time, autosave and export
// reject transient snapshots, and interrupted gestures roll back.

import { expect, test } from '@playwright/test'
import {
  groupLocal,
  sceneNodesBoundsInParent,
  transformPoint,
} from '../src/freeform/sceneTransform'
import type { FreeformSceneNode } from '../src/freeform/types'
import {
  TEST_PNG,
  crossScopeClipboardDraft,
  freeformCanvasScale,
  freeformElementBoxes,
  groupingDraft,
  insertLine,
  insertShape,
  insertText,
  offCenterScopeDraft,
  openExportMenu,
  openFreeform,
  openNestedV3Draft,
  scopeNavigationDraft,
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

test('autosave and export reject a transient live pointer snapshot', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await signUpToSave(page, `live-snapshot-${Date.now()}`)
  // Signing in starts a new selection scope; pick the shape again.
  await page.getByTestId('freeform-element').first().click()
  await expect(page.getByTestId('freeform-selection-move')).toHaveCount(1)
  const storedShape = () => page.evaluate(() => {
    const userId = localStorage.getItem('slicer.session.v1')
    const drafts = JSON.parse(localStorage.getItem(`slicer.drafts.${userId}`) ?? '[]') as Array<{
      document: { slides: Array<{ nodes: Array<{ x: number; y: number }> }> }
    }>
    const node = drafts[0]?.document.slides[0]?.nodes[0]
    return node ? { x: node.x, y: node.y } : null
  })
  const storedBefore = await storedShape()
  expect(storedBefore).not.toBeNull()
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
    pointerId: 83,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 83,
      pointerType: 'touch',
      clientX: x + 32,
      clientY: y + 20,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  // Well past the autosave pause, the half-dragged position is still not stored.
  await page.waitForTimeout(1200)
  expect(await storedShape()).toEqual(storedBefore)

  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await page.waitForTimeout(100)
  expect(downloads).toEqual([])
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 83,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  expect(await storedShape()).toEqual(storedBefore)
})

test('a second pointer cannot replace an active transform owner', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const before = await freeformElementBoxes(page)
  const move = page.getByTestId('freeform-selection-move').first()
  const resize = page.getByTestId('freeform-selection-resize').first()
  const moveBox = await move.boundingBox()
  const resizeBox = await resize.boundingBox()
  expect(moveBox).toBeTruthy()
  expect(resizeBox).toBeTruthy()

  await move.dispatchEvent('pointerdown', {
    pointerId: 85,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: moveBox!.x + moveBox!.width / 2,
    clientY: moveBox!.y + moveBox!.height / 2,
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  await resize.dispatchEvent('pointerdown', {
    pointerId: 86,
    pointerType: 'touch',
    isPrimary: false,
    button: 0,
    clientX: resizeBox!.x + resizeBox!.width / 2,
    clientY: resizeBox!.y + resizeBox!.height / 2,
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 86,
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
      pointerId: 85,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
})

test('marquee pointercancel cleans up and ignores foreign pointer streams', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const canvas = page.getByTestId('freeform-canvas')
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).toBeTruthy()
  const start = {
    x: canvasBox!.x + 8,
    y: canvasBox!.y + 8,
  }

  await canvas.evaluate((node, point) => {
    const target = node.querySelector('.freeform-artwork-clip')
    if (!target) throw new Error('artwork target missing')
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 87,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: point.x,
      clientY: point.y,
    }))
  }, start)
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 88,
      pointerType: 'touch',
      clientX: x + 300,
      clientY: y + 300,
    }))
  }, start)
  await expect(page.locator('.freeform-marquee')).toHaveCount(1)
  const marqueeStyle = await page.locator('.freeform-marquee').getAttribute('style')

  await page.evaluate(({ x, y }) => {
    const target = document.querySelector<HTMLElement>('.freeform-artwork-clip')
    if (!target) throw new Error('artwork target missing')
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 89,
      pointerType: 'touch',
      isPrimary: false,
      button: 0,
      clientX: x + 10,
      clientY: y + 10,
    }))
  }, start)
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(page.locator('.freeform-marquee')).toHaveAttribute('style', marqueeStyle ?? '')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 88,
      pointerType: 'touch',
    }))
  })
  await expect(page.locator('.freeform-marquee')).toHaveAttribute('style', marqueeStyle ?? '')
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 87,
      pointerType: 'touch',
    }))
  })
  await expect(page.locator('.freeform-marquee')).toHaveCount(0)
})

test('layer tree reports structural read-only state for a group with locked descendants', async ({ page }) => {
  await openNestedV3Draft(page, `group-locked-descendant-reorder-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  await underlay.click()
  const historyBefore = await workspace.getAttribute('data-history-depth')

  await outer.focus()
  await expect(outer).toHaveAttribute('aria-selected', 'false')
  await expect(outer).toHaveAttribute('draggable', 'false')
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.getByTestId('freeform-layer-live')).toContainText('锁定')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
})

test('opening another project cannot be rolled back by an old pointer cancellation', async ({ page }) => {
  await openNestedV3Draft(page, `group-live-open-${Date.now()}`, false, groupingDraft)
  await page.evaluate(() => {
    const userId = localStorage.getItem('slicer.session.v1')
    const key = `slicer.drafts.${userId}`
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]')
    const other = structuredClone(drafts[0])
    other.id = 'group-live-other'
    other.title = 'Group live other'
    other.updatedAt += 1
    localStorage.setItem(key, JSON.stringify([...drafts, other]))
  })
  const workspace = page.locator('.freeform-workspace')
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Layer A' })
    .click()
  const move = page.getByTestId('freeform-selection-move').first()
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()
  const start = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  }

  await move.dispatchEvent('pointerdown', {
    pointerId: 84,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  await page.evaluate(() => {
    location.hash = '#/edit/canvas/group-live-other'
  })
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(page.getByTestId('editor-title')).toHaveText('Nested v3 scene')
  await expect(workspace).toHaveAttribute('data-history-depth', '0')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 84,
      pointerType: 'touch',
    }))
  })
  await expect(page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Layer A' })).toHaveCount(1)
})

test('nested insertion preserves the active scope pre-insertion world center', async ({ page }) => {
  const fixture = offCenterScopeDraft()
  const parent = fixture.document.slides[0].nodes[0] as unknown as FreeformSceneNode
  if (parent.type !== 'group') throw new Error('offset fixture parent must be a group')
  const bounds = sceneNodesBoundsInParent(parent.children)
  if (!bounds) throw new Error('offset fixture bounds missing')
  const localCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
  const worldCenter = transformPoint(
    groupLocal(parent.x, parent.y, parent.rotation, parent.scale),
    localCenter,
  )

  await openNestedV3Draft(page, `group-offset-center-${Date.now()}`, false, () => structuredClone(fixture))
  const anchor = page.locator('[data-scene-node-id="offset-anchor"]')
  await anchor.dblclick()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'offset-parent')
  const parentLocator = page.locator('[data-scene-node-id="offset-parent"]')
  const leafWorldCenter = async (leaf: import('@playwright/test').Locator) => {
    const geometry = await leaf.evaluate((node) => {
      const parseNumber = (value: string, label: string) => {
        const parsed = Number.parseFloat(value)
        if (!Number.isFinite(parsed)) throw new Error(`invalid ${label}: ${value}`)
        return parsed
      }
      const readTransform = (element: HTMLElement) => {
        const rotation = element.style.transform.match(/rotate\((-?[\d.]+)deg\)/)?.[1]
        const scale = element.style.transform.match(/scale\((-?[\d.]+)\)/)?.[1]
        if (rotation === undefined || scale === undefined) {
          throw new Error(`invalid scene transform: ${element.style.transform}`)
        }
        return {
          x: parseNumber(element.style.left, 'x'),
          y: parseNumber(element.style.top, 'y'),
          rotation: parseNumber(rotation, 'rotation'),
          scale: parseNumber(scale, 'scale'),
        }
      }
      const element = node as HTMLElement
      const groups: ReturnType<typeof readTransform>[] = []
      let ancestor = element.parentElement?.closest<HTMLElement>('.freeform-scene-group') ?? null
      while (ancestor) {
        groups.push(readTransform(ancestor))
        ancestor = ancestor.parentElement?.closest<HTMLElement>('.freeform-scene-group') ?? null
      }
      return {
        leaf: {
          x: parseNumber(element.style.left, 'leaf x'),
          y: parseNumber(element.style.top, 'leaf y'),
          width: parseNumber(element.style.width, 'leaf width'),
          height: parseNumber(element.style.height, 'leaf height'),
        },
        groups,
      }
    })
    let center = {
      x: geometry.leaf.x + geometry.leaf.width / 2,
      y: geometry.leaf.y + geometry.leaf.height / 2,
    }
    geometry.groups.forEach((group) => {
      center = transformPoint(
        groupLocal(group.x, group.y, group.rotation, group.scale),
        center,
      )
    })
    return center
  }

  await insertText(page)
  const textNode = parentLocator.locator(':scope > [data-selected="true"]')
  const textCenter = await leafWorldCenter(textNode)
  expect(textCenter.x).toBeCloseTo(worldCenter.x, 3)
  expect(textCenter.y).toBeCloseTo(worldCenter.y, 3)

  await insertShape(page)
  const shapeNode = parentLocator.locator(':scope > [data-selected="true"]')
  const shapeCenter = await leafWorldCenter(shapeNode)
  expect(shapeCenter.x).toBeCloseTo(worldCenter.x, 3)
  expect(shapeCenter.y).toBeCloseTo(worldCenter.y, 3)
})

test('inserts all new scene nodes under the active group path', async ({ page }) => {
  await openNestedV3Draft(page, `group-insert-${Date.now()}`, false, scopeNavigationDraft)
  const leaf = page.locator('[data-scene-node-id="scope-leaf"]')
  await leaf.dblclick()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'scope-outer')
  const outer = page.locator('[data-scene-node-id="scope-outer"]')
  const directLeaves = () => outer.locator(':scope > [data-scene-leaf="true"]')
  await expect(directLeaves()).toHaveCount(1)

  await insertText(page)
  await expect(directLeaves()).toHaveCount(2)
  await insertShape(page)
  await expect(directLeaves()).toHaveCount(3)
  await insertLine(page, '直线')
  await expect(directLeaves()).toHaveCount(4)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'nested-image.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expect(directLeaves()).toHaveCount(5)
  await expect(outer.locator(':scope > [data-selected="true"]')).toHaveCount(1)
  const canvasBox = await page.getByTestId('freeform-canvas').boundingBox()
  const insertedBoxes = await directLeaves().evaluateAll((nodes) => nodes.slice(1).map((node) => {
    const box = node.getBoundingClientRect()
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
  }))
  expect(canvasBox).not.toBeNull()
  insertedBoxes.forEach((box) => {
    expect(box.right).toBeGreaterThan(canvasBox!.x)
    expect(box.bottom).toBeGreaterThan(canvasBox!.y)
    expect(box.left).toBeLessThan(canvasBox!.x + canvasBox!.width)
    expect(box.top).toBeLessThan(canvasBox!.y + canvasBox!.height)
  })
})

test('rotation handle accessibility remains stable for a nested group', async ({ page }) => {
  await openNestedV3Draft(page, `nested-group-transform-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  await tree.getByRole('treeitem', { name: 'Layer B' }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('freeform-group-selection').click()

  const selection = page.getByTestId('freeform-selection-box')
  await expect(selection).toHaveAttribute('data-selection-kind', 'group')
  const rotate = page.getByTestId('freeform-selection-rotate')
  const zoomOut = page.getByRole('button', { name: '缩小画布' })
  for (let index = 0; index < 3; index += 1) {
    const box = await rotate.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.width).toBeGreaterThanOrEqual(28)
    expect(box!.height).toBeGreaterThanOrEqual(28)
    if (index < 2) await zoomOut.click()
  }
  await rotate.focus()
  await expect(rotate).toBeFocused()
  const outline = await rotate.evaluate((node) => getComputedStyle(node).outlineStyle)
  expect(outline).not.toBe('none')
})

test('nested group transforms keep one history entry per gesture', async ({ page }) => {
  await openNestedV3Draft(page, `nested-group-gestures-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  await tree.getByRole('treeitem', { name: 'Layer B' }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('freeform-group-selection').click()
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  const group = page.locator('[data-testid="freeform-scene-group"][data-selected="true"]')
  const before = await group.getAttribute('style')

  const move = page.getByTestId('freeform-selection-move')
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()
  await move.dispatchEvent('pointerdown', {
    pointerId: 111,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: moveBox!.x + moveBox!.width / 2,
    clientY: moveBox!.y + moveBox!.height / 2,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 111,
      pointerType: 'touch',
      clientX: x + 30,
      clientY: y + 20,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 111,
      pointerType: 'touch',
      clientX: x + 30,
      clientY: y + 20,
    }))
  }, { x: moveBox!.x + moveBox!.width / 2, y: moveBox!.y + moveBox!.height / 2 })
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(group).not.toHaveAttribute('style', before ?? '')

  const rotate = page.getByTestId('freeform-selection-rotate')
  const rotateBox = await rotate.boundingBox()
  expect(rotateBox).toBeTruthy()
  await rotate.dispatchEvent('pointerdown', {
    pointerId: 112,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: rotateBox!.x + rotateBox!.width / 2,
    clientY: rotateBox!.y + rotateBox!.height / 2,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 112,
      pointerType: 'touch',
      clientX: x + 18,
      clientY: y + 26,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 112,
      pointerType: 'touch',
      clientX: x + 18,
      clientY: y + 26,
    }))
  }, { x: rotateBox!.x + rotateBox!.width / 2, y: rotateBox!.y + rotateBox!.height / 2 })
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 2))
})

test('cross-scope paste preserves world geometry with the page offset', async ({ page }) => {
  await openNestedV3Draft(page, `cross-scope-paste-${Date.now()}`, false, crossScopeClipboardDraft)
  const sourceLeaf = page.locator('[data-scene-node-id="clipboard-source-leaf"]')
  await sourceLeaf.dblclick()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute(
    'data-active-group-path',
    'clipboard-source',
  )
  await sourceLeaf.click()
  const sourceBox = await sourceLeaf.boundingBox()
  expect(sourceBox).toBeTruthy()
  await page.keyboard.press('Control+C')
  await page.keyboard.press('Escape')

  const targetLeaf = page.locator('[data-scene-node-id="clipboard-target-leaf"]')
  await targetLeaf.dblclick()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute(
    'data-active-group-path',
    'clipboard-target',
  )
  await page.keyboard.press('Control+V')
  const target = page.locator('[data-scene-node-id="clipboard-target"]')
  await expect(target.locator(':scope > [data-scene-leaf="true"]')).toHaveCount(2)
  const pasted = target.locator(
    ':scope > [data-scene-leaf="true"]:not([data-scene-node-id="clipboard-target-leaf"])',
  )
  const pastedId = await pasted.getAttribute('data-scene-node-id')
  expect(pastedId).not.toBe('clipboard-source-leaf')
  const pastedBox = await pasted.boundingBox()
  const canvasScale = await freeformCanvasScale(page)
  expect(pastedBox).toBeTruthy()
  expect((pastedBox!.x - sourceBox!.x) / canvasScale).toBeCloseTo(16, 2)
  expect((pastedBox!.y - sourceBox!.y) / canvasScale).toBeCloseTo(16, 2)
  expect(pastedBox!.width).toBeCloseTo(sourceBox!.width, 2)
  expect(pastedBox!.height).toBeCloseTo(sourceBox!.height, 2)
})

test('logical group alignment moves a group as one unit', async ({ page }) => {
  await openNestedV3Draft(page, `logical-group-alignment-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  await tree.getByRole('treeitem', { name: 'Layer B' }).focus()
  await page.keyboard.press('Space')
  await page.getByTestId('freeform-group-selection').click()
  await tree.getByRole('treeitem', { name: 'Layer C' }).focus()
  await page.keyboard.press('Space')

  const layerA = page.locator('[data-scene-node-id="layer-a"]')
  const layerB = page.locator('[data-scene-node-id="layer-b"]')
  const layerC = page.locator('[data-scene-node-id="layer-c"]')
  const beforeA = await layerA.boundingBox()
  const beforeB = await layerB.boundingBox()
  expect(beforeA).toBeTruthy()
  expect(beforeB).toBeTruthy()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await page.locator('.freeform-inspector').getByRole('button', { name: '左对齐', exact: true }).click()

  const afterA = await layerA.boundingBox()
  const afterB = await layerB.boundingBox()
  const afterC = await layerC.boundingBox()
  expect(afterA).toBeTruthy()
  expect(afterB).toBeTruthy()
  expect(afterC).toBeTruthy()
  expect(Math.min(afterA!.x, afterB!.x)).toBeCloseTo(afterC!.x, 2)
  expect(afterB!.x - afterA!.x).toBeCloseTo(beforeB!.x - beforeA!.x, 3)
})

test('nested local nudge uses the inverse parent world matrix', async ({ page }) => {
  await openNestedV3Draft(page, `nested-local-nudge-${Date.now()}`, false, crossScopeClipboardDraft)
  const sourceLeaf = page.locator('[data-scene-node-id="clipboard-source-leaf"]')
  await sourceLeaf.dblclick()
  await sourceLeaf.click()
  const before = await sourceLeaf.boundingBox()
  const scale = await freeformCanvasScale(page)
  expect(before).toBeTruthy()
  await page.keyboard.press('ArrowRight')
  const after = await sourceLeaf.boundingBox()
  expect(after).toBeTruthy()
  expect((after!.x - before!.x) / scale).toBeCloseTo(1, 2)
})
