// PowerPoint-style crop: the frame and its source surface, keyboard and pointer
// gestures, batching, decode failures, and nested transforms.

import { expect, test } from '@playwright/test'
import {
  groupLocal,
  multiply,
  sceneNodeLocalMatrix,
  transformVector,
} from '../src/freeform/sceneTransform'
import type { FreeformSceneNode } from '../src/freeform/types'
import {
  WIDE_TEST_SVG,
  WIDE_TEST_SVG_DATA_URL,
  beginPendingCropPointerMove,
  cropGeometryOf,
  cropMarkerColorSignatures,
  dispatchCropPointerGesture,
  freeformCanvasScale,
  imageCropTransformDraft,
  insertShape,
  installCropDraftObserver,
  observeCropDraftCommits,
  openFreeform,
  openNestedV3Draft,
  readCropOverlayDraft,
  readCropVisualGeometry,
  readObservedCropDraft,
  releaseLateCropFrame,
  sampleViewportPixels,
  setFreeformZoom,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('fills a shape with an image', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '插入图片填充' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles('public/favicon.svg')

  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
})

test('PowerPoint crop shows the full source around the crop frame', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.setItem('slicer.mode.v1', 'light'))
  await page.reload()
  await page.goto('/#/edit/canvas')
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'wide-crop-source.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })

  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement).toHaveCount(1)
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await expect(imageElement).toHaveAttribute('data-selected', 'true')

  const cropButton = page.getByTestId('freeform-crop-image')
  await expect(cropButton).toHaveText('裁剪')
  await page.getByTestId('paint-image-fit-contain').click()
  await expect(cropButton).toBeDisabled()
  await page.getByTestId('paint-image-fit-cover').click()
  await expect(cropButton).toBeEnabled()
  await cropButton.click()

  const overlay = page.getByTestId('freeform-image-crop-overlay')
  const dimImage = overlay.locator('.freeform-image-crop-dim')
  const cropWindow = overlay.locator('.freeform-image-crop-window')
  const brightImage = cropWindow.locator('.freeform-image-crop-bright')
  const cropFrame = overlay.locator('.freeform-image-crop-frame')
  await expect(overlay).toBeVisible()
  await expect(dimImage).toBeVisible()
  await expect(brightImage).toBeVisible()
  await expect(cropFrame.locator('[data-crop-handle]')).toHaveCount(8)
  for (const name of [
    '裁剪上边',
    '裁剪右上角',
    '裁剪右边',
    '裁剪右下角',
    '裁剪下边',
    '裁剪左下角',
    '裁剪左边',
    '裁剪左上角',
  ]) {
    await expect(cropFrame.getByRole('button', { name, exact: true })).toBeVisible()
  }

  const cropGeometry = await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>(
      '[data-testid="freeform-image-crop-overlay"]',
    )!
    const dim = overlay.querySelector<HTMLImageElement>('.freeform-image-crop-dim')!
    const windowElement = overlay.querySelector<HTMLElement>('.freeform-image-crop-window')!
    const bright = overlay.querySelector<HTMLImageElement>('.freeform-image-crop-bright')!
    const frame = overlay.querySelector<HTMLElement>('.freeform-image-crop-frame')!
    const dimRect = dim.getBoundingClientRect()
    const windowRect = windowElement.getBoundingClientRect()
    const brightRect = bright.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    return {
      sameSource: dim.currentSrc === bright.currentSrc,
      windowOverflow: getComputedStyle(windowElement).overflow,
      sourceBeyondFrame: dimRect.left < frameRect.left - 0.5
        || dimRect.top < frameRect.top - 0.5
        || dimRect.right > frameRect.right + 0.5
        || dimRect.bottom > frameRect.bottom + 0.5,
      windowMatchesFrame: Math.abs(windowRect.left - frameRect.left) <= 0.5
        && Math.abs(windowRect.top - frameRect.top) <= 0.5
        && Math.abs(windowRect.right - frameRect.right) <= 0.5
        && Math.abs(windowRect.bottom - frameRect.bottom) <= 0.5,
      brightCoversWindow: brightRect.left <= windowRect.left + 0.5
        && brightRect.top <= windowRect.top + 0.5
        && brightRect.right >= windowRect.right - 0.5
        && brightRect.bottom >= windowRect.bottom - 0.5,
    }
  })
  expect(cropGeometry).toEqual({
    sameSource: true,
    windowOverflow: 'hidden',
    sourceBeyondFrame: true,
    windowMatchesFrame: true,
    brightCoversWindow: true,
  })

  await expect(imageElement).toHaveAttribute('data-scene-node-id', /.+/)
  await expect(imageElement.locator('[data-image-crop-hidden="true"]')).toHaveCount(1)
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(0)
  await expect(page.getByTestId('freeform-framing-surface')).toHaveCount(0)
  await expect(page.getByTestId('freeform-framing-zoom')).toHaveCount(0)
  await expect(page.getByTestId('freeform-framing-zoom-in')).toHaveCount(0)
  await expect(page.getByTestId('freeform-framing-zoom-out')).toHaveCount(0)
  await expect(page.locator('.freeform-framing-third')).toHaveCount(0)

  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(cropFrame.locator('[data-crop-handle]')).toHaveCount(8)
  await page.getByTestId('freeform-image-crop-done').click()
  await expect(overlay).toHaveCount(0)

  await imageElement.dblclick()
  await expect(overlay).toBeVisible()
  await page.getByTestId('freeform-image-crop-done').click()

  await insertShape(page)
  await page.locator('input.freeform-file').nth(1).setInputFiles({
    name: 'shape-fill.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const shapeElement = page.getByTestId('freeform-element').filter({
    has: page.getByTestId('freeform-shape-image-fill'),
  })
  await expect(shapeElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await expect(page.getByTestId('freeform-adjust-framing')).toHaveText('调整取景')
  await shapeElement.dblclick()
  await expect(page.getByTestId('freeform-framing-surface')).toBeVisible()
  await expect(overlay).toHaveCount(0)
  await page.getByTestId('freeform-framing-cancel').click()
})





















test('crop focuses the image surface and pans by keyboard immediately', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-keyboard-focus.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')

  await page.getByTestId('freeform-crop-image').click()
  const overlay = page.getByTestId('freeform-image-crop-overlay')
  await expect(overlay).toBeFocused()

  const before = await readCropOverlayDraft(page)
  await page.keyboard.press('ArrowRight')
  const afterOne = await readCropOverlayDraft(page)
  expect(afterOne.image.left).toBeCloseTo(before.image.left + 1, 10)
  expect(afterOne.frame).toEqual(before.frame)

  await page.keyboard.press('Shift+ArrowLeft')
  const afterTen = await readCropOverlayDraft(page)
  expect(afterTen.image.left).toBeCloseTo(afterOne.image.left - 10, 10)
  expect(afterTen.frame).toEqual(before.frame)
  await page.getByTestId('freeform-image-crop-done').click()
})

test('crop aspect ratios expose only the six presets and stay one-shot', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-aspect-ratios.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await page.getByTestId('freeform-crop-image').click()

  const aspectTrigger = page.getByTestId('freeform-image-crop-aspect')
  await expect(aspectTrigger).toHaveText('比例')
  await aspectTrigger.click()
  const menu = page.getByRole('menu', { name: '比例', exact: true })
  await expect(menu.getByRole('menuitem')).toHaveText([
    '原图',
    '1:1',
    '4:3',
    '3:4',
    '16:9',
    '9:16',
  ])
  await menu.getByRole('menuitem', { name: '1:1', exact: true }).click()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toBeVisible()

  const square = await readCropOverlayDraft(page)
  expect(square.frame.right - square.frame.left).toBeCloseTo(
    square.frame.bottom - square.frame.top,
    4,
  )
  await dispatchCropPointerGesture(
    page,
    page.locator('[data-crop-handle="e"]'),
    901,
    { x: -24, y: 0 },
  )
  const freeform = await readCropOverlayDraft(page)
  expect(freeform.frame.right - freeform.frame.left).not.toBeCloseTo(
    freeform.frame.bottom - freeform.frame.top,
    4,
  )
  await page.getByTestId('freeform-image-crop-done').click()
})

test('crop aspect menu Escape commits once and exits the crop', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-aspect-escape.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

  await page.getByTestId('freeform-crop-image').click()
  const originalDraft = await readCropOverlayDraft(page)
  await dispatchCropPointerGesture(
    page,
    page.locator('[data-crop-handle="e"]'),
    902,
    { x: -24, y: 0 },
  )
  const changedDraft = await readCropOverlayDraft(page)
  expect(changedDraft.frame.right).not.toBeCloseTo(originalDraft.frame.right, 4)

  await page.getByTestId('freeform-image-crop-aspect').click()
  const menu = page.getByRole('menu', { name: '比例', exact: true })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(menu).toHaveCount(0)
  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))

  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))
  await imageElement.click()
  await page.getByTestId('freeform-crop-image').click()
  expect(await readCropOverlayDraft(page)).toEqual(originalDraft)
  await page.getByTestId('freeform-image-crop-done').click()
})

test('crop finish semantics commit from every exit and undo atomically', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-finish-semantics.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

  await page.getByTestId('freeform-crop-image').click()
  const originalDraft = await readCropOverlayDraft(page)
  await page.getByTestId('freeform-image-crop-done').click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))

  const exits = ['done', 'Escape', 'Enter', 'outside'] as const
  for (let index = 0; index < exits.length; index += 1) {
    await imageElement.click()
    await page.getByTestId('freeform-crop-image').click()
    await dispatchCropPointerGesture(
      page,
      page.locator('[data-crop-handle="e"]'),
      910 + index,
      { x: -20 - index * 2, y: 0 },
    )
    const changedDraft = await readCropOverlayDraft(page)
    expect(changedDraft.frame.right).not.toBeCloseTo(originalDraft.frame.right, 4)

    const exit = exits[index]
    if (exit === 'done') {
      await page.getByTestId('freeform-image-crop-done').click()
    } else if (exit === 'outside') {
      const canvasBox = await page.getByTestId('freeform-canvas').boundingBox()
      expect(canvasBox).toBeTruthy()
      await page.mouse.click(canvasBox!.x + 5, canvasBox!.y + 5)
    } else {
      await page.keyboard.press(exit)
    }

    await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))

    await imageElement.click()
    await page.getByTestId('freeform-crop-image').click()
    expect(await readCropOverlayDraft(page)).toEqual(originalDraft)
    await page.getByTestId('freeform-image-crop-done').click()
    await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))
  }
})

test('crop blocks document commands while editing', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-command-blocking.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await page.keyboard.press('ControlOrMeta+C')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const nodeCountBefore = await page.getByTestId('freeform-element').count()

  await page.getByTestId('freeform-crop-image').click()
  await dispatchCropPointerGesture(
    page,
    page.locator('[data-crop-handle="e"]'),
    931,
    { x: -20, y: 0 },
  )
  const cropBeforeCommands = cropGeometryOf(await readCropOverlayDraft(page))
  await expect(page.getByTestId('freeform-toolbar')).toHaveAttribute('inert', '')
  await expect(page.locator('.freeform-right-panel')).toHaveAttribute('inert', '')

  for (const shortcut of [
    'ControlOrMeta+Z',
    'ControlOrMeta+Shift+Z',
    'ControlOrMeta+V',
    'ControlOrMeta+G',
    'ControlOrMeta+Shift+G',
    'Delete',
  ]) await page.keyboard.press(shortcut)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'blocked-replacement.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  await page.getByTestId('paint-image-fit-contain').evaluate((button) => (
    button as HTMLButtonElement
  ).click())
  await expect(page.getByTestId('freeform-export')).toBeDisabled()
  await page.getByTestId('freeform-export').evaluate((button) => (
    button as HTMLButtonElement
  ).click())
  await expect(page.getByTestId('freeform-export-options')).toHaveCount(0)

  await expect(page.getByTestId('freeform-image-crop-overlay')).toBeVisible()
  expect(cropGeometryOf(await readCropOverlayDraft(page))).toEqual(cropBeforeCommands)
  expect(await page.getByTestId('freeform-element').count()).toBe(nodeCountBefore)
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await page.keyboard.press('Escape')
})

test('crop invalidates on a real decode error without history', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-decode-error.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await page.getByTestId('freeform-crop-image').click()
  await page.locator('.freeform-image-crop-dim').dispatchEvent('error')

  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await expect(workspace).not.toHaveClass(/is-image-cropping/)
  await expect(page.getByRole('alert')).toContainText('图片加载失败，请重试')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByTestId('freeform-toolbar')).not.toHaveAttribute('inert', '')
})

test('crop invalidates silently when its resolved image identity changes', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-source-identity.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await page.getByTestId('freeform-crop-image').click()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toBeVisible()

  const replacement = `${WIDE_TEST_SVG_DATA_URL}#resolved-identity-change`
  await page.evaluate(async (nextResolvedSrc) => {
    const module = await import('/src/storage/index.ts')
    const imageStore = module.store.images
    const originalResolve = imageStore.resolve
    imageStore.resolve = (href: string) => (
      href.startsWith('img:') ? nextResolvedSrc : originalResolve(href)
    )
    const testWindow = window as typeof window & {
      __restoreCropImageResolve?: () => void
    }
    testWindow.__restoreCropImageResolve = () => {
      imageStore.resolve = originalResolve
    }
  }, replacement)

  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect.poll(() => imageElement.locator('img[data-framed-image-content="true"]')
      .getAttribute('src')).toBe(replacement)
    await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
    await expect(workspace).not.toHaveClass(/is-image-cropping/)
    await expect(page.getByTestId('freeform-toolbar')).not.toHaveAttribute('inert', '')
    await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally {
    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __restoreCropImageResolve?: () => void
      }
      testWindow.__restoreCropImageResolve?.()
      delete testWindow.__restoreCropImageResolve
    })
  }
})

test('crop clears and reports a real scene image decode error without history', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-scene-decode-error.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  const sceneImage = imageElement.locator('img[data-framed-image-content="true"]')
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await page.getByTestId('freeform-crop-image').click()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toBeVisible()
  await sceneImage.dispatchEvent('error')

  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await expect(workspace).not.toHaveClass(/is-image-cropping/)
  await expect(page.getByRole('alert')).toContainText('图片加载失败，请重试')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByTestId('freeform-toolbar')).not.toHaveAttribute('inert', '')
})

test('PowerPoint crop pans the picture and crops from every handle', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-gestures.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await page.getByTestId('freeform-crop-image').click()

  const overlay = page.getByTestId('freeform-image-crop-overlay')
  const dim = overlay.locator('.freeform-image-crop-dim')
  const beforePan = await readCropOverlayDraft(page)
  const beforePanVisual = await readCropVisualGeometry(page)
  await dispatchCropPointerGesture(page, dim, 701, { x: 24, y: 0 })
  await expect.poll(() => readCropOverlayDraft(page)).not.toEqual(beforePan)
  const afterPan = await readCropOverlayDraft(page)
  const afterPanVisual = await readCropVisualGeometry(page)
  expect(afterPan.frame).toEqual(beforePan.frame)
  expect(afterPan.image.left).not.toBeCloseTo(beforePan.image.left, 4)
  expect(afterPanVisual.frame).toEqual(beforePanVisual.frame)
  expect(afterPanVisual.image.left).not.toBeCloseTo(beforePanVisual.image.left, 2)
  expect(afterPanVisual.markers.topLeft.x).not.toBeCloseTo(
    beforePanVisual.markers.topLeft.x,
    2,
  )

  type CropEdge = 'left' | 'top' | 'right' | 'bottom'
  const cases: Array<{
    handle: string
    delta: { x: number; y: number }
    active: CropEdge[]
    fixed: CropEdge[]
  }> = [
    { handle: 'n', delta: { x: 0, y: 10 }, active: ['top'], fixed: ['left', 'right', 'bottom'] },
    { handle: 'ne', delta: { x: -10, y: 10 }, active: ['top', 'right'], fixed: ['left', 'bottom'] },
    { handle: 'e', delta: { x: -10, y: 0 }, active: ['right'], fixed: ['left', 'top', 'bottom'] },
    { handle: 'se', delta: { x: -10, y: -10 }, active: ['right', 'bottom'], fixed: ['left', 'top'] },
    { handle: 's', delta: { x: 0, y: -10 }, active: ['bottom'], fixed: ['left', 'top', 'right'] },
    { handle: 'sw', delta: { x: 10, y: -10 }, active: ['left', 'bottom'], fixed: ['right', 'top'] },
    { handle: 'w', delta: { x: 10, y: 0 }, active: ['left'], fixed: ['top', 'right', 'bottom'] },
    { handle: 'nw', delta: { x: 10, y: 10 }, active: ['left', 'top'], fixed: ['right', 'bottom'] },
  ]
  for (const [index, item] of cases.entries()) {
    const before = await readCropOverlayDraft(page)
    const beforeVisual = await readCropVisualGeometry(page)
    const beforeMarkerPoints = Object.values(beforeVisual.markers)
    const beforeMarkerPixels = await sampleViewportPixels(page, beforeMarkerPoints)
    const beforeMarkerColors = cropMarkerColorSignatures(beforeMarkerPixels)
    // A marker a crop edge runs through samples the edge's anti-aliasing, not
    // the picture; only markers clear of the frame's edges are compared.
    const clearOf = (frame: { left: number; right: number; top: number; bottom: number }) => (
      (point: { x: number; y: number }) => (
        [frame.left, frame.right].every((x) => Math.abs(point.x - x) > 3)
        && [frame.top, frame.bottom].every((y) => Math.abs(point.y - y) > 3)
      )
    )
    const clearBefore = beforeMarkerPoints.map(clearOf(beforeVisual.frame))
    expect(
      beforeMarkerColors.filter((_, markerIndex) => clearBefore[markerIndex]),
      `${item.handle} distinct marker colors`,
    ).toEqual(['rbg', 'gbr', 'bgr', 'brg'].filter((_, markerIndex) => clearBefore[markerIndex]))
    await dispatchCropPointerGesture(
      page,
      overlay.locator(`[data-crop-handle="${item.handle}"]`),
      720 + index,
      item.delta,
    )
    const after = await readCropOverlayDraft(page)
    const afterVisual = await readCropVisualGeometry(page)
    for (const edge of item.active) {
      expect(after.frame[edge], `${item.handle} draft changed ${edge}`)
        .not.toBeCloseTo(before.frame[edge], 3)
      expect(afterVisual.frame[edge], `${item.handle} visual changed ${edge}`)
        .not.toBeCloseTo(beforeVisual.frame[edge], 2)
    }
    for (const edge of item.fixed) {
      expect(after.frame[edge], `${item.handle} draft fixed ${edge}`)
        .toBeCloseTo(before.frame[edge], 3)
      expect(
        Math.abs(afterVisual.frame[edge] - beforeVisual.frame[edge]),
        `${item.handle} visual fixed ${edge}`,
      ).toBeLessThan(0.05)
    }
    expect(after.image).toEqual(before.image)
    expect(afterVisual.image).toEqual(beforeVisual.image)
    for (const marker of Object.keys(beforeVisual.markers) as Array<keyof typeof beforeVisual.markers>) {
      expect(afterVisual.markers[marker].x, `${item.handle} ${marker} marker x`)
        .toBeCloseTo(beforeVisual.markers[marker].x, 3)
      expect(afterVisual.markers[marker].y, `${item.handle} ${marker} marker y`)
        .toBeCloseTo(beforeVisual.markers[marker].y, 3)
    }
    const afterMarkerPixels = await sampleViewportPixels(page, beforeMarkerPoints)
    const afterMarkerColors = cropMarkerColorSignatures(afterMarkerPixels)
    const clearAfter = clearOf(afterVisual.frame)
    const comparable = beforeMarkerPoints.flatMap((point, markerIndex) => (
      clearBefore[markerIndex] && clearAfter(point) ? [markerIndex] : []
    ))
    expect(comparable.length, `${item.handle} comparable markers`).toBeGreaterThanOrEqual(1)
    expect(comparable.map((markerIndex) => afterMarkerColors[markerIndex]), `${item.handle} stable marker colors`)
      .toEqual(comparable.map((markerIndex) => beforeMarkerColors[markerIndex]))
  }
  await page.getByTestId('freeform-image-crop-done').click()
})

test('PowerPoint crop owns one pointer and rolls back interrupted gestures', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-pointer-ownership.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await page.getByTestId('freeform-crop-image').click()
  const overlay = page.getByTestId('freeform-image-crop-overlay')
  const dim = overlay.locator('.freeform-image-crop-dim')
  const initial = await readCropOverlayDraft(page)
  const dimBox = await dim.boundingBox()
  expect(dimBox).toBeTruthy()
  const start = { x: dimBox!.x + dimBox!.width / 2, y: dimBox!.y + dimBox!.height / 2 }

  await dim.dispatchEvent('pointerdown', {
    pointerId: 801,
    pointerType: 'pen',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  await overlay.locator('[data-crop-handle="e"]').dispatchEvent('pointerdown', {
    pointerId: 802,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 802,
      pointerType: 'touch',
      isPrimary: true,
      buttons: 1,
      clientX: x + 120,
      clientY: y,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 802,
      pointerType: 'touch',
      isPrimary: true,
      clientX: x + 120,
      clientY: y,
    }))
  }, start)
  await expect.poll(() => readCropOverlayDraft(page)).toEqual(initial)

  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 801,
      pointerType: 'pen',
      isPrimary: true,
      buttons: 1,
      clientX: x + 40,
      clientY: y,
    }))
  }, start)
  await expect.poll(() => readCropOverlayDraft(page)).not.toEqual(initial)
  const moved = await readCropOverlayDraft(page)

  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true,
    pointerId: 802,
    pointerType: 'mouse',
    isPrimary: true,
  })))
  await expect.poll(() => readCropOverlayDraft(page)).toEqual(moved)
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true,
    pointerId: 801,
    pointerType: 'pen',
    isPrimary: true,
  })))
  await expect.poll(async () => cropGeometryOf(await readCropOverlayDraft(page)))
    .toEqual(cropGeometryOf(initial))

  await dim.dispatchEvent('pointerdown', {
    pointerId: 805,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true,
    pointerId: 805,
    pointerType: 'mouse',
    isPrimary: true,
    buttons: 1,
    clientX: x + 35,
    clientY: y,
  })), start)
  await expect.poll(() => readCropOverlayDraft(page)).not.toEqual(initial)
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true,
    pointerId: 805,
    pointerType: 'mouse',
    isPrimary: true,
  })))
  await expect.poll(async () => cropGeometryOf(await readCropOverlayDraft(page)))
    .toEqual(cropGeometryOf(initial))

  await dispatchCropPointerGesture(page, dim, 803, { x: 30, y: 0 }, 'pen')
  const afterCompletedSegment = await readCropOverlayDraft(page)
  await dim.dispatchEvent('pointerdown', {
    pointerId: 804,
    pointerType: 'pen',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true,
    pointerId: 804,
    pointerType: 'pen',
    isPrimary: true,
    buttons: 1,
    clientX: x + 40,
    clientY: y,
  })), start)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect.poll(async () => cropGeometryOf(await readCropOverlayDraft(page)))
    .toEqual(cropGeometryOf(afterCompletedSegment))
  await page.getByTestId('freeform-image-crop-done').click()
})

test('PowerPoint crop batches pointer moves and preserves preview through rerenders', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-batching.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await page.getByTestId('freeform-crop-image').click()
  const overlay = page.getByTestId('freeform-image-crop-overlay')
  const dim = overlay.locator('.freeform-image-crop-dim')
  const box = await dim.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const renderScale = await freeformCanvasScale(page)
  const finalScreenDelta = Math.min(24, renderScale * 40)

  await dim.dispatchEvent('pointerdown', {
    pointerId: 901,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  })
  const beforeBatch = await readCropOverlayDraft(page)
  await observeCropDraftCommits(page)
  await page.evaluate(({ x, y, total }) => {
    for (let index = 1; index <= 120; index += 1) {
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 901,
        pointerType: 'mouse',
        isPrimary: true,
        buttons: 1,
        clientX: x + total * (index / 120),
        clientY: y,
      }))
    }
  }, { ...start, total: finalScreenDelta })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  const afterBatch = await readCropOverlayDraft(page)
  await expect(page.locator('html')).toHaveAttribute('data-crop-dom-commit-count', '1')
  expect(afterBatch.image.left - beforeBatch.image.left).toBeCloseTo(
    finalScreenDelta / renderScale,
    3,
  )
  expect(afterBatch.image.right - beforeBatch.image.right).toBeCloseTo(
    finalScreenDelta / renderScale,
    3,
  )
  expect(afterBatch.overlaySize.width).toBeCloseTo(Math.max(
    1,
    afterBatch.frame.right,
    afterBatch.image.right,
  ), 4)
  expect(afterBatch.overlaySize.height).toBeCloseTo(Math.max(
    1,
    afterBatch.frame.bottom,
    afterBatch.image.bottom,
  ), 4)

  const hitSizeBeforeRerender = await overlay.evaluate((element) => (
    (element as HTMLElement).style.getPropertyValue('--crop-hit-size')
  ))
  await page.setViewportSize({ width: 980, height: 780 })
  await expect.poll(() => overlay.evaluate((element) => (
    (element as HTMLElement).style.getPropertyValue('--crop-hit-size')
  ))).not.toBe(hitSizeBeforeRerender)
  await expect.poll(() => readCropOverlayDraft(page)).toEqual(afterBatch)
  await page.evaluate(({ x, y, total }) => window.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true,
    pointerId: 901,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: x + total,
    clientY: y,
  })), { ...start, total: finalScreenDelta })
  await expect.poll(() => readCropOverlayDraft(page)).toEqual(afterBatch)
  await page.getByTestId('freeform-image-crop-done').click()
})

test('PowerPoint crop uses the latest canvas scale for each new gesture', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-latest-scale.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await page.getByTestId('freeform-crop-image').click()

  const overlay = page.getByTestId('freeform-image-crop-overlay')
  const dim = overlay.locator('.freeform-image-crop-dim')
  const startScale = await freeformCanvasScale(page)
  const hitSizeBeforeResize = await overlay.evaluate((element) => (
    (element as HTMLElement).style.getPropertyValue('--crop-hit-size')
  ))
  await page.setViewportSize({ width: 980, height: 780 })
  await expect.poll(() => overlay.evaluate((element) => (
    (element as HTMLElement).style.getPropertyValue('--crop-hit-size')
  ))).not.toBe(hitSizeBeforeResize)
  const resizedScale = await freeformCanvasScale(page)
  expect(resizedScale).not.toBeCloseTo(startScale, 4)

  const beforeGesture = await readCropOverlayDraft(page)
  const screenDelta = Math.min(18, resizedScale * 24)
  await dispatchCropPointerGesture(page, dim, 911, { x: screenDelta, y: 0 })
  const afterGesture = await readCropOverlayDraft(page)
  expect(afterGesture.image.left - beforeGesture.image.left).toBeCloseTo(
    screenDelta / resizedScale,
    3,
  )
  expect(afterGesture.image.right - beforeGesture.image.right).toBeCloseTo(
    screenDelta / resizedScale,
    3,
  )
  await page.getByTestId('freeform-image-crop-done').click()
})

test('crop transition settles pending frames without late writes', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'crop-pending-cleanup.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_TEST_SVG,
  })
  const imageElement = page.getByTestId('freeform-element').filter({
    has: page.locator('.freeform-image'),
  })
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  const cropButton = page.getByTestId('freeform-crop-image')
  await cropButton.click()

  let overlay = page.getByTestId('freeform-image-crop-overlay')
  let dim = overlay.locator('.freeform-image-crop-dim')
  const beforeFinish = cropGeometryOf(await readCropOverlayDraft(page))
  await installCropDraftObserver(page)
  const finishStart = await beginPendingCropPointerMove(page, dim, 921, { x: 40, y: 0 })
  expect(cropGeometryOf(await readCropOverlayDraft(page))).toEqual(beforeFinish)
  await page.keyboard.press('Escape')
  await expect(overlay).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-crop-frame-canceled', 'true')
  const finishedDraft = await readObservedCropDraft(page)
  expect(finishedDraft.frame).toEqual(beforeFinish.frame)
  expect(finishedDraft.image.left).not.toBeCloseTo(beforeFinish.image.left, 4)
  await releaseLateCropFrame(page, 921, { x: finishStart.x + 80, y: finishStart.y })
  expect(await readObservedCropDraft(page)).toEqual(finishedDraft)

  await cropButton.click()
  overlay = page.getByTestId('freeform-image-crop-overlay')
  dim = overlay.locator('.freeform-image-crop-dim')
  const beforeTransition = cropGeometryOf(await readCropOverlayDraft(page))
  await installCropDraftObserver(page)
  const transitionStart = await beginPendingCropPointerMove(page, dim, 922, { x: -40, y: 0 })
  expect(cropGeometryOf(await readCropOverlayDraft(page))).toEqual(beforeTransition)
  await page.goto('/#/edit/md')
  await expect(overlay).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-crop-frame-canceled', 'true')
  const transitionedDraft = await readObservedCropDraft(page)
  expect(transitionedDraft.frame).toEqual(beforeTransition.frame)
  expect(transitionedDraft.image.left).not.toBeCloseTo(beforeTransition.image.left, 4)
  await releaseLateCropFrame(page, 922, { x: transitionStart.x - 80, y: transitionStart.y })
  expect(await readObservedCropDraft(page)).toEqual(transitionedDraft)

  await page.goto('/#/edit/canvas')
  await imageElement.click()
  await cropButton.click()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toBeVisible()
  const restoredDraft = cropGeometryOf(await readCropOverlayDraft(page))
  for (const kind of ['frame', 'image'] as const) {
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(restoredDraft[kind][edge]).toBeCloseTo(transitionedDraft[kind][edge], 3)
    }
  }
  await page.getByTestId('freeform-image-crop-done').click()
})

test('PowerPoint crop keeps local controls exact through nested screen transforms', async ({ page }) => {
  await openNestedV3Draft(
    page,
    `crop-transform-${Date.now()}`,
    false,
    imageCropTransformDraft,
  )
  await setFreeformZoom(page, 150)
  const canvas = page.getByTestId('freeform-canvas')
  const imageElement = page.locator('[data-scene-node-id="crop-image"]')
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await imageElement.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'crop-outer')
  await imageElement.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'crop-outer/crop-inner')
  await imageElement.click()
  await page.getByTestId('freeform-crop-image').click()

  const fixture = imageCropTransformDraft()
  const outer = fixture.document.slides[0].nodes[0]
  const inner = outer.children[0]
  const imageNode = inner.children[0] as unknown as FreeformSceneNode
  const worldMatrix = multiply(
    groupLocal(outer.x, outer.y, outer.rotation, outer.scale),
    multiply(
      groupLocal(inner.x, inner.y, inner.rotation, inner.scale),
      sceneNodeLocalMatrix(imageNode),
    ),
  )
  const renderScale = await freeformCanvasScale(page)
  const toScreen = (local: { x: number; y: number }) => {
    const world = transformVector(worldMatrix, local)
    return { x: world.x * renderScale, y: world.y * renderScale }
  }

  const overlay = page.getByTestId('freeform-image-crop-overlay')
  const beforePan = await readCropOverlayDraft(page)
  await dispatchCropPointerGesture(
    page,
    overlay.locator('.freeform-image-crop-dim'),
    951,
    toScreen({ x: 20, y: 0 }),
  )
  const afterPan = await readCropOverlayDraft(page)
  expect(afterPan.image.left - beforePan.image.left).toBeCloseTo(20, 3)
  expect(afterPan.image.top).toBeCloseTo(beforePan.image.top, 3)

  const east = overlay.locator('[data-crop-handle="e"]')
  const beforeEast = await readCropOverlayDraft(page)
  await dispatchCropPointerGesture(page, east, 952, toScreen({ x: -12, y: 0 }))
  const afterEast = await readCropOverlayDraft(page)
  expect(afterEast.frame.left).toBeCloseTo(beforeEast.frame.left, 3)
  expect(afterEast.frame.right - beforeEast.frame.right).toBeCloseTo(-12, 3)

  const eastBox = await east.boundingBox()
  expect(eastBox).toBeTruthy()
  const symmetricStart = {
    x: eastBox!.x + eastBox!.width / 2,
    y: eastBox!.y + eastBox!.height / 2,
  }
  const symmetricDelta = toScreen({ x: -5, y: 0 })
  const beforeSymmetricPointer = await readCropOverlayDraft(page)
  await east.dispatchEvent('pointerdown', {
    pointerId: 953,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    ctrlKey: true,
    clientX: symmetricStart.x,
    clientY: symmetricStart.y,
  })
  await page.evaluate(({ start, delta }) => {
    const end = { x: start.x + delta.x, y: start.y + delta.y }
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 953,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: 1,
      clientX: end.x,
      clientY: end.y,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 953,
      pointerType: 'mouse',
      isPrimary: true,
      ctrlKey: true,
      clientX: end.x,
      clientY: end.y,
    }))
  }, { start: symmetricStart, delta: symmetricDelta })
  const afterSymmetricPointer = await readCropOverlayDraft(page)
  expect(afterSymmetricPointer.frame.left - beforeSymmetricPointer.frame.left).toBeCloseTo(5, 3)
  expect(afterSymmetricPointer.frame.right - beforeSymmetricPointer.frame.right).toBeCloseTo(-5, 3)

  await east.focus()
  const beforeOne = await readCropOverlayDraft(page)
  await page.keyboard.press('ArrowLeft')
  const afterOne = await readCropOverlayDraft(page)
  expect(afterOne.frame.right - beforeOne.frame.right).toBeCloseTo(-1, 4)
  await page.keyboard.press('Shift+ArrowLeft')
  const afterTen = await readCropOverlayDraft(page)
  expect(afterTen.frame.right - afterOne.frame.right).toBeCloseTo(-10, 4)

  const beforeSymmetric = await readCropOverlayDraft(page)
  await page.keyboard.press('Control+ArrowLeft')
  const afterSymmetric = await readCropOverlayDraft(page)
  expect(afterSymmetric.frame.left - beforeSymmetric.frame.left).toBeCloseTo(1, 4)
  expect(afterSymmetric.frame.right - beforeSymmetric.frame.right).toBeCloseTo(-1, 4)
  expect(
    (afterSymmetric.frame.left + afterSymmetric.frame.right)
      - (beforeSymmetric.frame.left + beforeSymmetric.frame.right),
  ).toBeCloseTo(0, 4)

  const northEast = overlay.locator('[data-crop-handle="ne"]')
  await northEast.focus()
  const beforeCorner = await readCropOverlayDraft(page)
  await page.keyboard.press('Control+ArrowLeft')
  const afterCorner = await readCropOverlayDraft(page)
  expect(afterCorner.frame.left).toBeCloseTo(beforeCorner.frame.left, 4)
  expect(afterCorner.frame.right - beforeCorner.frame.right).toBeCloseTo(-1, 4)
  await page.getByTestId('freeform-image-crop-done').click()
})

test('nested crop decode errors still report after entering the active group', async ({ page }) => {
  await openNestedV3Draft(
    page,
    `crop-nested-decode-${Date.now()}`,
    false,
    imageCropTransformDraft,
  )
  const canvas = page.getByTestId('freeform-canvas')
  const imageElement = page.locator('[data-scene-node-id="crop-image"]')
  await expect(imageElement.locator('[data-framed-image="true"]'))
    .toHaveAttribute('data-image-load-state', 'ready')
  await imageElement.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'crop-outer')
  await imageElement.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'crop-outer/crop-inner')
  await imageElement.click()
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await expect(page.getByTestId('freeform-crop-image')).toBeEnabled()
  await page.getByTestId('freeform-crop-image').click()
  await expect(page.getByTestId('freeform-image-crop-overlay')).toBeVisible()

  await imageElement.locator('img[data-framed-image-content="true"]').dispatchEvent('error')

  await expect(page.getByTestId('freeform-image-crop-overlay')).toHaveCount(0)
  await expect(workspace).not.toHaveClass(/is-image-cropping/)
  await expect(page.getByRole('alert')).toContainText('图片加载失败，请重试')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
})
