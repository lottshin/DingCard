// Image framing (fill/fit focus and zoom): one history entry per commit, cancels
// restore the saved frame, and persistence through copies, saves, and switches.

import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import {
  cropGeometryOf,
  currentUserId,
  dispatchCropPointerGesture,
  duplicateCurrentPage,
  expectFreeformImagesDecoded,
  insertImageElementAndShapeFill,
  openExportMenu,
  openFreeform,
  readCropOverlayDraft,
  readPngSize,
  setRangeValue,
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

test('image framing commits one history entry and cancel restores the saved frame', async ({ page }) => {
  await openFreeform(page)
  await insertImageElementAndShapeFill(page)

  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  await expect(imageElement).toHaveCount(1)
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await imageElement.click()

  const workspace = page.locator('.freeform-workspace')
  const initialHistoryDepth = Number(await workspace.getAttribute('data-history-depth'))
  const adjust = page.getByTestId('freeform-adjust-framing')
  const reset = page.getByTestId('freeform-reset-framing')
  await expect(adjust).toBeEnabled()
  await expect(reset).toBeDisabled()

  await adjust.click()
  const surface = page.getByTestId('freeform-framing-surface')
  const zoom = page.getByTestId('freeform-framing-zoom')
  await expect(surface).toBeVisible()
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(0)
  await setRangeValue(zoom, 200)
  await expect(surface).toHaveAttribute('data-framing-zoom', '2')
  await page.getByTestId('freeform-framing-done').click()
  await expect(workspace).toHaveAttribute(
    'data-history-depth',
    String(initialHistoryDepth + 1),
  )
  await expect(reset).toBeEnabled()

  await imageElement.dblclick()
  await expect(surface).toBeVisible()
  await page.getByTestId('freeform-framing-done').click()
  await expect(workspace).toHaveAttribute(
    'data-history-depth',
    String(initialHistoryDepth + 1),
  )

  await adjust.click()
  await setRangeValue(zoom, 250)
  await page.getByTestId('freeform-framing-cancel').click()
  await expect(workspace).toHaveAttribute(
    'data-history-depth',
    String(initialHistoryDepth + 1),
  )
  await adjust.click()
  await expect(surface).toHaveAttribute('data-framing-zoom', '2')
  await page.keyboard.press('Escape')
  await expect(surface).toHaveCount(0)
})

test('persists shape framing and image crops through node copy, page copy, save, and reload', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  await page.goto('/#/edit/canvas')
  await insertImageElementAndShapeFill(page)
  await expectFreeformImagesDecoded(page)

  const surface = page.getByTestId('freeform-framing-surface')
  const readFrame = async () => ({
    focusX: Number(await surface.getAttribute('data-framing-focus-x')),
    focusY: Number(await surface.getAttribute('data-framing-focus-y')),
    zoom: Number(await surface.getAttribute('data-framing-zoom')),
  })

  const shapeElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  await expect(shapeElement).toHaveAttribute('data-selected', 'true')
  await page.getByTestId('freeform-adjust-framing').click()
  await setRangeValue(page.getByTestId('freeform-framing-zoom'), 160)
  await surface.focus()
  await page.keyboard.press('Shift+ArrowRight')
  const shapeFrame = await readFrame()
  await page.getByTestId('freeform-framing-done').click()

  const imageElements = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: '图片' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await page.getByTestId('freeform-crop-image').click()
  const cropOverlay = page.getByTestId('freeform-image-crop-overlay')
  const cropBefore = await readCropOverlayDraft(page)
  await dispatchCropPointerGesture(
    page,
    cropOverlay.locator('.freeform-image-crop-dim'),
    2001,
    { x: 0, y: 24 },
  )
  await dispatchCropPointerGesture(
    page,
    cropOverlay.locator('[data-crop-handle="e"]'),
    2002,
    { x: -24, y: 0 },
  )
  const imageCrop = cropGeometryOf(await readCropOverlayDraft(page))
  expect(imageCrop).not.toEqual(cropGeometryOf(cropBefore))
  await page.getByTestId('freeform-image-crop-done').click()

  await page.keyboard.press('ControlOrMeta+C')
  await page.keyboard.press('ControlOrMeta+V')
  await expect(imageElements).toHaveCount(2)
  await duplicateCurrentPage(page)
  await expect(page.locator('.freeform-thumb')).toHaveCount(2)

  await signUpToSave(page, `framing-persist-${Date.now()}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  const storedDocument = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
      document: unknown
    }>
    if (!drafts[0]) throw new Error('saved draft missing')
    return drafts[0].document
  }) as {
    documentVersion: number
    slides: Array<{
      nodes: Array<{
        type: string
        width?: number
        height?: number
        framing?: { focusX: number; focusY: number; zoom: number }
        fill?: {
          type: string
          framing?: { focusX: number; focusY: number; zoom: number }
        }
      }>
    }>
  }

  expect(storedDocument.documentVersion).toBe(41)
  expect(storedDocument.slides).toHaveLength(2)
  const firstImage = storedDocument.slides[0].nodes.find((node) => node.type === 'image')
  expect(firstImage).toBeDefined()
  const persistedImageCrop = {
    width: firstImage?.width,
    height: firstImage?.height,
    framing: firstImage?.framing,
  }
  expect(persistedImageCrop.framing).not.toEqual({ focusX: 0.5, focusY: 0.5, zoom: 1 })
  for (const slide of storedDocument.slides) {
    const images = slide.nodes.filter((node) => node.type === 'image')
    const imageShapes = slide.nodes.filter((node) => (
      node.type === 'shape' && node.fill?.type === 'image'
    ))
    expect(images).toHaveLength(2)
    expect(images.map((node) => ({
      width: node.width,
      height: node.height,
      framing: node.framing,
    }))).toEqual([persistedImageCrop, persistedImageCrop])
    expect(imageShapes).toHaveLength(1)
    expect(imageShapes[0].fill?.framing).toEqual(shapeFrame)
  }

  await page.evaluate(() => sessionStorage.removeItem('slicer.images.v1'))
  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expectFreeformImagesDecoded(page)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const restoredTree = page.getByRole('tree', { name: '图层树' })
  await restoredTree.getByRole('treeitem', { name: '图片' }).first().click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await page.getByTestId('freeform-crop-image').click()
  const restoredImageCrop = cropGeometryOf(await readCropOverlayDraft(page))
  for (const bounds of ['frame', 'image'] as const) {
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(restoredImageCrop[bounds][edge]).toBeCloseTo(imageCrop[bounds][edge], 10)
    }
  }
  await page.getByTestId('freeform-image-crop-done').click()

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await restoredTree.getByRole('treeitem', { name: '形状' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await page.getByTestId('freeform-adjust-framing').click()
  expect(await readFrame()).toEqual(shapeFrame)
  await page.getByTestId('freeform-framing-cancel').click()
})

test('image framing keyboard, buttons, drag cancel, and narrow controls stay deterministic', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 860 })
  await openFreeform(page)
  await insertImageElementAndShapeFill(page)
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await expect(imageElement).toHaveAttribute('data-selected', 'true')
  await page.getByTestId('freeform-adjust-framing').click()

  const surface = page.getByTestId('freeform-framing-surface')
  const zoomBar = page.locator('.freeform-framing-zoom')
  await page.getByTestId('freeform-framing-zoom-in').click()
  await expect(surface).toHaveAttribute('data-framing-zoom', '1.1')
  await setRangeValue(page.getByTestId('freeform-framing-zoom'), 200)

  const focusXBeforeKeys = Number(await surface.getAttribute('data-framing-focus-x'))
  await surface.focus()
  await page.keyboard.press('ArrowLeft')
  const focusXAfterOne = Number(await surface.getAttribute('data-framing-focus-x'))
  await page.keyboard.press('Shift+ArrowLeft')
  const focusXAfterTen = Number(await surface.getAttribute('data-framing-focus-x'))
  expect(focusXAfterOne).toBeGreaterThan(focusXBeforeKeys)
  expect(focusXAfterTen - focusXAfterOne).toBeGreaterThan(
    Math.abs(focusXAfterOne - focusXBeforeKeys) * 5,
  )

  const segmentStart = Number(await surface.getAttribute('data-framing-focus-y'))
  const box = await surface.boundingBox()
  expect(box).not.toBeNull()
  await surface.dispatchEvent('pointerdown', {
    pointerId: 41,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    clientX: box!.x + box!.width / 2,
    clientY: box!.y + box!.height / 2,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 41,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: 1,
      clientX: x,
      clientY: y,
      bubbles: true,
    }))
  }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 + 50 })
  await expect.poll(async () => Number(await surface.getAttribute('data-framing-focus-y')))
    .not.toBe(segmentStart)
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
    pointerId: 41,
    pointerType: 'mouse',
    isPrimary: true,
    bubbles: true,
  })))
  await expect(surface).toHaveAttribute('data-framing-focus-y', String(segmentStart))

  const layout = await page.evaluate(() => {
    const bar = document.querySelector('.freeform-framing-zoom')!.getBoundingClientRect()
    const head = document.querySelector('.freeform-framing-head')!.getBoundingClientRect()
    return {
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      barLeft: bar.left,
      barRight: bar.right,
      headLeft: head.left,
      headRight: head.right,
      overlap: Math.max(0, Math.min(bar.right, head.right) - Math.max(bar.left, head.left)) > 0
        && Math.max(0, Math.min(bar.bottom, head.bottom) - Math.max(bar.top, head.top)) > 0,
    }
  })
  expect(layout.scrollWidth).toBe(layout.viewportWidth)
  expect(layout.barLeft).toBeGreaterThanOrEqual(0)
  expect(layout.barRight).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.headLeft).toBeGreaterThanOrEqual(0)
  expect(layout.headRight).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.overlap).toBe(false)
  await page.getByTestId('freeform-framing-cancel').click()
})

test('image framing stays covered and unobstructed across viewport widths and themes', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.setItem('slicer.mode.v1', 'light'))
  await page.reload()
  await page.goto('/#/edit/canvas')
  await insertImageElementAndShapeFill(page)
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')

  const viewports = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 440, height: 860 },
  ]
  // The fit-scale recompute chain (stage resize → ResizeObserver → React
  // commit of the new artboard scale) can lag well behind the viewport
  // change on slow runners, and the surface is sized by the committed scale.
  // Wait for the surface itself to stop moving before snapshotting it.
  const waitForFramingSurfaceToSettle = async () => {
    await expect.poll(async () => page.evaluate(async () => {
      const surface = document.querySelector('[data-testid="freeform-framing-surface"]')
      if (!surface) return false
      const first = surface.getBoundingClientRect().width
      await new Promise((resolve) => setTimeout(resolve, 120))
      return first > 0 && surface.getBoundingClientRect().width === first
    }), { timeout: 5_000 }).toBe(true)
  }
  for (const theme of ['light', 'dark'] as const) {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await expect(imageElement).toHaveAttribute('data-selected', 'true')
      await page.getByTestId('freeform-adjust-framing').click()
      await setRangeValue(page.getByTestId('freeform-framing-zoom'), 250)
      await waitForFramingSurfaceToSettle()

      const layout = await page.evaluate(() => {
        const surface = document.querySelector<HTMLElement>('[data-testid="freeform-framing-surface"]')!
        const image = document.querySelector<HTMLImageElement>(
          '[data-scene-node-id][data-selected="true"] [data-framed-image-content="true"]',
        )!
        const head = document.querySelector<HTMLElement>('.freeform-framing-head')!
        const zoom = document.querySelector<HTMLElement>('.freeform-framing-zoom')!
        const frameRect = surface.getBoundingClientRect()
        const imageRect = image.getBoundingClientRect()
        const headRect = head.getBoundingClientRect()
        const zoomRect = zoom.getBoundingClientRect()
        const zoomChildren = [...zoom.children].map((child) => child.getBoundingClientRect())
        const overlap = (a: DOMRect, b: DOMRect) => (
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) > 0
          && Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) > 0
        )
        return {
          viewportWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          frame: {
            left: frameRect.left,
            top: frameRect.top,
            right: frameRect.right,
            bottom: frameRect.bottom,
          },
          image: {
            left: imageRect.left,
            top: imageRect.top,
            right: imageRect.right,
            bottom: imageRect.bottom,
          },
          head: { left: headRect.left, right: headRect.right },
          zoom: { left: zoomRect.left, right: zoomRect.right },
          zoomContent: {
            left: Math.min(...zoomChildren.map((rect) => rect.left)),
            right: Math.max(...zoomChildren.map((rect) => rect.right)),
          },
          narrowChrome: {
            toolbar: getComputedStyle(document.querySelector<HTMLElement>('.freeform-toolbar')!).display,
            rail: getComputedStyle(document.querySelector<HTMLElement>('.freeform-rail')!).display,
            inspector: getComputedStyle(document.querySelector<HTMLElement>('.freeform-right-panel')!).display,
          },
          controlsOverlap: overlap(headRect, zoomRect),
        }
      })
      expect(layout.scrollWidth).toBe(layout.viewportWidth)
      expect(layout.head.left).toBeGreaterThanOrEqual(0)
      expect(layout.head.right).toBeLessThanOrEqual(layout.viewportWidth)
      expect(layout.zoom.left).toBeGreaterThanOrEqual(0)
      expect(layout.zoom.right).toBeLessThanOrEqual(layout.viewportWidth)
      expect(layout.zoomContent.left).toBeGreaterThanOrEqual(0)
      expect(layout.zoomContent.right).toBeLessThanOrEqual(layout.viewportWidth)
      expect(layout.controlsOverlap).toBe(false)
      expect(layout.image.left).toBeLessThanOrEqual(layout.frame.left + 0.5)
      expect(layout.image.top).toBeLessThanOrEqual(layout.frame.top + 0.5)
      expect(layout.image.right).toBeGreaterThanOrEqual(layout.frame.right - 0.5)
      expect(layout.image.bottom).toBeGreaterThanOrEqual(layout.frame.bottom - 0.5)
      if (viewport.width === 440) {
        expect(layout.narrowChrome).toEqual({
          toolbar: 'none',
          rail: 'none',
          inspector: 'none',
        })
        expect(layout.frame.right - layout.frame.left).toBeGreaterThanOrEqual(120)
        await expect(page.getByTestId('freeform-framing-cancel')).toBeVisible()
        await expect(page.getByTestId('freeform-framing-done')).toBeVisible()
      }
      await page.getByTestId('freeform-framing-cancel').click()
      if (viewport.width === 440) {
        await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
        await expect(page.locator('.freeform-rail')).toBeVisible()
        await expect(page.locator('.freeform-right-panel')).toBeVisible()
      }
    }
    if (theme === 'light') {
      await page.getByRole('button', { name: '切换深浅色' }).click()
    }
  }
})

test('shape image framing supports every shape and is disabled for contain', async ({ page }) => {
  await openFreeform(page)
  await insertImageElementAndShapeFill(page)
  const shapeElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  await expect(shapeElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await shapeElement.click()

  const adjust = page.getByTestId('freeform-adjust-framing')
  await expect(adjust).toBeEnabled()
  await page.getByTestId('paint-image-fit-contain').click()
  await expect(adjust).toBeDisabled()
  await page.getByTestId('paint-image-fit-cover').click()
  await expect(adjust).toBeEnabled()

  const geometry = page.getByTestId('inspector-geometry')
  for (const [label, className] of [
    ['矩形', 'shape-rect'],
    ['圆形', 'shape-ellipse'],
    ['三角形', 'shape-triangle'],
  ] as const) {
    await geometry.getByRole('button', { name: label, exact: true }).click()
    await shapeElement.dblclick()
    await expect(page.getByTestId('freeform-framing-surface'))
      .toHaveClass(new RegExp(className))
    await page.getByTestId('freeform-framing-cancel').click()
  }
})

test('crop transition commits images while shape framing cancels across page and workspace switches', async ({ page }) => {
  await openFreeform(page)
  await insertImageElementAndShapeFill(page)
  await expectFreeformImagesDecoded(page)
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  const shapeElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  const selectTransitionLayer = async (name: '图片' | '形状') => {
    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.getByRole('tree', { name: '图层树' })
      .getByRole('treeitem', { name, exact: true })
      .click()
    await page.getByRole('tab', { name: '属性', exact: true }).click()
  }

  await page.getByRole('button', { name: '新增页面' }).click()
  const thumbnails = page.locator('.freeform-thumb')
  await thumbnails.first().click()
  await expect(imageElement).toBeVisible()
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await selectTransitionLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  const cropBeforePage = cropGeometryOf(await readCropOverlayDraft(page))
  await dispatchCropPointerGesture(
    page,
    page.locator('[data-crop-handle="e"]'),
    941,
    { x: -24, y: 0 },
  )
  const cropAfterPage = cropGeometryOf(await readCropOverlayDraft(page))
  expect(cropAfterPage.frame.right).not.toBeCloseTo(cropBeforePage.frame.right, 4)
  await expect(page.getByTestId('freeform-toolbar')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.locator('.freeform-right-panel')).toHaveAttribute('aria-disabled', 'true')

  await thumbnails.nth(1).click()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await expect(thumbnails.nth(1)).toHaveAttribute('aria-current', 'page')
  await thumbnails.first().click()
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await selectTransitionLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  const restoredAfterPage = cropGeometryOf(await readCropOverlayDraft(page))
  expect(restoredAfterPage.frame.right).toBeCloseTo(cropAfterPage.frame.right, 3)
  await dispatchCropPointerGesture(
    page,
    page.locator('[data-crop-handle="s"]'),
    942,
    { x: 0, y: -18 },
  )
  const cropAfterWorkspace = cropGeometryOf(await readCropOverlayDraft(page))

  await page.goto('/#/edit/md')
  await page.goto('/#/edit/canvas')
  await selectTransitionLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  const restoredAfterWorkspace = cropGeometryOf(await readCropOverlayDraft(page))
  expect(restoredAfterWorkspace.frame.bottom).toBeCloseTo(cropAfterWorkspace.frame.bottom, 3)
  await page.getByTestId('freeform-image-crop-done').click()

  await selectTransitionLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await setRangeValue(page.getByTestId('freeform-framing-zoom'), 200)
  await thumbnails.nth(1).click()
  await thumbnails.first().click()
  await expect(shapeElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await selectTransitionLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await expect(page.getByTestId('freeform-framing-surface'))
    .toHaveAttribute('data-framing-zoom', '1')

  await setRangeValue(page.getByTestId('freeform-framing-zoom'), 180)
  await page.goto('/#/edit/md')
  await page.goto('/#/edit/canvas')
  await selectTransitionLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await expect(page.getByTestId('freeform-framing-surface'))
    .toHaveAttribute('data-framing-zoom', '1')
  await page.getByTestId('freeform-framing-cancel').click()
})

test('crop transition commits images while shape framing cancels across project switches', async ({ page }) => {
  await openFreeform(page)
  await insertImageElementAndShapeFill(page)
  await expectFreeformImagesDecoded(page)
  await signUpToSave(page, `crop-draft-transition-${Date.now()}`)

  const userId = await currentUserId(page)
  const sourceId = await page.evaluate((key) => {
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
      id: string
      title: string
      updatedAt: number
    }>
    const source = structuredClone(drafts[0])
    if (!source) throw new Error('source draft missing')
    const sourceId = source.id
    source.id = 'crop-draft-transition-target'
    source.title = 'Crop draft transition target'
    source.updatedAt += 1
    localStorage.setItem(key, JSON.stringify([...drafts, source]))
    return sourceId
  }, `slicer.drafts.${userId}`)

  const selectLayer = async (name: '图片' | '形状') => {
    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.getByRole('tree', { name: '图层树' })
      .getByRole('treeitem', { name, exact: true })
      .click()
    await page.getByRole('tab', { name: '属性', exact: true }).click()
  }
  const openProject = async (id: string, title: string) => {
    await page.goto(`/#/edit/canvas/${encodeURIComponent(id)}`)
    await expect(page.getByTestId('editor-title')).toHaveText(title)
  }
  const sourceTitle = await page.getByTestId('editor-title').textContent()

  await selectLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  const cropBefore = cropGeometryOf(await readCropOverlayDraft(page))
  await dispatchCropPointerGesture(page, page.locator('[data-crop-handle="e"]'), 961, { x: -24, y: 0 })
  const cropChanged = cropGeometryOf(await readCropOverlayDraft(page))
  expect(cropChanged.frame.right).not.toBeCloseTo(cropBefore.frame.right, 4)

  // Opening another project mid-crop commits the crop into the project being left.
  await openProject('crop-draft-transition-target', 'Crop draft transition target')
  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await selectLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  await expect.poll(async () => cropGeometryOf(await readCropOverlayDraft(page)))
    .toEqual(cropBefore)
  await page.getByTestId('freeform-image-crop-done').click()

  await openProject(sourceId, sourceTitle ?? '')
  await selectLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  await expect.poll(async () => cropGeometryOf(await readCropOverlayDraft(page)))
    .toEqual(cropChanged)
  await page.getByTestId('freeform-image-crop-done').click()

  // Shape framing is cancelled instead: the zoom never reaches either project.
  await selectLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await setRangeValue(page.getByTestId('freeform-framing-zoom'), 180)
  await openProject('crop-draft-transition-target', 'Crop draft transition target')
  await expect(page.getByTestId('freeform-framing-surface')).toHaveCount(0)
  await openProject(sourceId, sourceTitle ?? '')
  await selectLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await expect(page.getByTestId('freeform-framing-surface')).toHaveAttribute('data-framing-zoom', '1')
  await page.getByTestId('freeform-framing-cancel').click()
})

test('crop transition commits images while shape framing cancels across account switches', async ({ page }) => {
  await openFreeform(page)
  await insertImageElementAndShapeFill(page)
  await expectFreeformImagesDecoded(page)
  const username = `crop-account-transition-${Date.now()}`
  await signUpToSave(page, username)

  const selectLayer = async (name: '图片' | '形状') => {
    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.getByRole('tree', { name: '图层树' })
      .getByRole('treeitem', { name, exact: true })
      .click()
    await page.getByRole('tab', { name: '属性', exact: true }).click()
  }
  const logOut = async () => {
    await page.getByTestId('account-menu').click()
    await page.getByTestId('account-logout').click()
    await expect(page.getByTestId('account-login')).toBeVisible()
  }
  const logBackIn = async () => {
    await page.getByTestId('account-login').click()
    const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
    await dialog.getByLabel('用户名').fill(username)
    await dialog.getByLabel('密码').fill('1234')
    await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  }

  await selectLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  const cropBefore = cropGeometryOf(await readCropOverlayDraft(page))
  await dispatchCropPointerGesture(page, page.locator('[data-crop-handle="e"]'), 971, { x: -28, y: 0 })
  const cropChanged = cropGeometryOf(await readCropOverlayDraft(page))
  expect(cropChanged.frame.right).not.toBeCloseTo(cropBefore.frame.right, 4)

  // Signing out mid-crop commits the crop to the account and clears the canvas.
  await logOut()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await logBackIn()
  await selectLayer('图片')
  await page.getByTestId('freeform-crop-image').click()
  await expect.poll(async () => cropGeometryOf(await readCropOverlayDraft(page))).toEqual(cropChanged)
  await page.getByTestId('freeform-image-crop-done').click()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  // Shape framing is cancelled on the way out.
  await selectLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await setRangeValue(page.getByTestId('freeform-framing-zoom'), 180)
  await logOut()
  await expect(page.getByTestId('freeform-framing-surface')).toHaveCount(0)
  await logBackIn()
  await selectLayer('形状')
  await page.getByTestId('freeform-adjust-framing').click()
  await expect(page.getByTestId('freeform-framing-surface')).toHaveAttribute('data-framing-zoom', '1')
  await page.getByTestId('freeform-framing-cancel').click()
})

test('persists image element and shape fill through ImageStore', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  await page.goto('/#/edit/canvas')

  await insertImageElementAndShapeFill(page)
  await expectFreeformImagesDecoded(page)

  const sessionImageKeys = await page.evaluate(() => {
    const raw = sessionStorage.getItem('slicer.images.v1')
    return Object.keys(raw ? JSON.parse(raw) as Record<string, string> : {})
  })
  expect(sessionImageKeys).toHaveLength(2)

  await signUpToSave(page, `image-store-${Date.now()}`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  const persistedDrafts = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    return key ? localStorage.getItem(key) ?? '' : ''
  })
  expect(persistedDrafts).toContain('data:image/png;base64,')
  expect(persistedDrafts).not.toContain('img:')

  await page.evaluate(() => sessionStorage.removeItem('slicer.images.v1'))
  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await expectFreeformImagesDecoded(page)

  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).toBeTruthy()
  expect(readPngSize(await readFile(downloadPath!))).toEqual({ width: 1080, height: 1440 })
})
