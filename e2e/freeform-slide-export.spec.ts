// Slide export mechanics: PNG at slide dimensions, the export options panel,
// framed-image decode waits, theme-independent pixels, and mixed-size zips.

import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import {
  TEST_PNG,
  insertLine,
  insertShape,
  insertText,
  openExportMenu,
  openFreeform,
  openNestedV3Draft,
  pngPixelDigest,
  readPngSize,
  rgbDistance,
  samplePngPixel,
  setFreeformZoom,
  setSelectedElementBox,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('exports the current slide as a PNG at slide dimensions', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.getByTestId('page-size-trigger').click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()

  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe('slide-01.png')
  const path = await download.path()
  expect(path).toBeTruthy()
  const size = readPngSize(await readFile(path!))
  expect(size).toEqual({ width: 1080, height: 1920 })
  await expect(page.getByTestId('freeform-primary-export')).toBeEnabled()
})

test('export options switch format, quality, scale, and persist', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.getByTestId('page-size-trigger').click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()

  await openExportMenu(page)
  const options = page.getByTestId('freeform-export-options')
  await expect(options).toBeVisible()
  // PNG by default: no quality slider.
  await expect(options.getByTestId('export-quality-range')).toHaveCount(0)
  // Local mode has no server to host a share page, so the entry stays away.
  await expect(options.getByTestId('freeform-export-share')).toHaveCount(0)

  await options.getByTestId('export-format-jpeg').click()
  await expect(options.getByTestId('export-quality-range')).toBeVisible()
  await options.getByTestId('export-quality-range').fill('80')
  await options.getByTestId('export-scale-2x').click()

  const jpegPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const jpeg = await jpegPromise
  expect(jpeg.suggestedFilename()).toBe('slide-01.jpg')
  const jpegPath = await jpeg.path()
  expect(jpegPath).toBeTruthy()
  // 2x of a 1080×1920 page: 2160×3840 JPEG.
  const jpegBytes = await readFile(jpegPath!)
  expect(jpegBytes[0]).toBe(0xff)
  expect(jpegBytes[1]).toBe(0xd8)
  const jpegBlob = new Blob([jpegBytes])

  await page.reload()
  await page.goto('/#/edit/canvas')
  await openExportMenu(page)
  const restored = page.getByTestId('freeform-export-options')
  await expect(restored.getByTestId('export-format-jpeg')).toHaveClass(/on/)
  await expect(restored.getByTestId('export-scale-2x')).toHaveClass(/on/)
  await expect(restored.getByTestId('export-quality-range')).toHaveValue('80')

  await restored.getByTestId('export-format-png').click()
  const pngPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const png = await pngPromise
  expect(png.suggestedFilename()).toBe('slide-01.png')
  const pngPath = await png.path()
  expect(pngPath).toBeTruthy()
  // The 2x scale setting applies to PNG as well; the guest's 9:16 page came
  // back after the reload (it saves on this device), so 2x is 2160×3840.
  expect(readPngSize(await readFile(pngPath!))).toEqual({ width: 2160, height: 3840 })
  expect(jpegBlob.size).toBeGreaterThan(0)
})

test('framed image export waits for the current image decode', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'delayed-export.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  const image = page.locator('.freeform-artboard img[data-framed-image-content="true"]')
  await expect(image).toHaveJSProperty('complete', true)
  await page.evaluate(() => {
    const target = document.querySelector<HTMLImageElement>(
      '.freeform-artboard img[data-framed-image-content="true"]',
    )!
    let release = () => undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const state = { called: false, release }
    ;(window as typeof window & { __framedDecodeGate?: typeof state }).__framedDecodeGate = state
    Object.defineProperty(target, 'decode', {
      configurable: true,
      value: () => {
        state.called = true
        return gate
      },
    })
  })

  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  await expect.poll(() => page.evaluate(() => Boolean(
    (window as typeof window & { __framedDecodeGate?: { called: boolean } })
      .__framedDecodeGate?.called,
  ))).toBe(true)
  await page.waitForTimeout(100)
  expect(downloads).toHaveLength(0)
  await page.evaluate(() => {
    (window as typeof window & { __framedDecodeGate?: { release: () => void } })
      .__framedDecodeGate?.release()
  })
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('slide-01.png')
})

test('framed image export reports decode failure without downloading', async ({ page }) => {
  await openFreeform(page)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'failed-export.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  const image = page.locator('.freeform-artboard img[data-framed-image-content="true"]')
  await expect(image).toHaveJSProperty('complete', true)
  await image.evaluate((target) => {
    Object.defineProperty(target, 'decode', {
      configurable: true,
      value: async () => { throw new Error('forced decode failure') },
    })
  })

  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  await expect(page.getByRole('alert')).toContainText('图片加载失败，导出已取消')
  expect(downloads).toHaveLength(0)
  await expect(page.getByTestId('freeform-primary-export')).toBeEnabled()
})

test('exports current freeform slide with gradient pixels and without editor ui', async ({ page }) => {
  await openFreeform(page)

  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await expect(page.getByTestId('freeform-element')).toHaveAttribute('data-selected', 'true')

  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()

  const size = readPngSize(await readFile(path!))
  expect(size).toEqual({ width: 1080, height: 1440 })

  const topLeft = await samplePngPixel(page, path!, 10, 10)
  const bottomRight = await samplePngPixel(page, path!, 1000, 1300)
  expect(topLeft.slice(0, 3)).not.toEqual(bottomRight.slice(0, 3))

  const accentRgb = await page.evaluate(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const match = accent.match(/^#([0-9a-f]{6})$/i)
    if (!match) throw new Error(`unexpected accent color: ${accent}`)
    return [
      Number.parseInt(match[1].slice(0, 2), 16),
      Number.parseInt(match[1].slice(2, 4), 16),
      Number.parseInt(match[1].slice(4, 6), 16),
    ]
  })
  const resizeHandleProbe = await samplePngPixel(page, path!, 203, 203)
  expect(rgbDistance(resizeHandleProbe, accentRgb)).toBeGreaterThan(30)
})

test('exports identical artwork pixels across app themes and preview zooms', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.setItem('slicer.mode.v1', 'light'))
  await page.reload()
  await page.goto('/#/edit/canvas')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  await insertText(page)
  await setSelectedElementBox(page, 80, 80, 320, 120)
  await page.locator('.freeform-inspector-text').fill('Theme isolation 主题')
  await insertShape(page)
  await setSelectedElementBox(page, 430, 240, 220, 180)
  await insertLine(page, '直线')
  await setSelectedElementBox(page, 180, 600, 480, 80)
  await expect(page.getByTestId('freeform-element')).toHaveCount(3)

  async function downloadCurrent() {
    await openExportMenu(page)
    const exportButton = page.getByTestId('freeform-primary-export')
    await expect(exportButton).toBeEnabled()
    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloadPromise
    const path = await download.path()
    if (!path) throw new Error('missing downloaded PNG path')
    await expect(exportButton).toBeEnabled()
    return path
  }

  await setFreeformZoom(page, 50)
  const lightPath = await downloadCurrent()
  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).not.toHaveClass(/theme-anim/)
  await setFreeformZoom(page, 400)
  const darkPath = await downloadCurrent()

  expect(readPngSize(await readFile(lightPath))).toEqual(readPngSize(await readFile(darkPath)))
  expect(await pngPixelDigest(page, lightPath)).toBe(await pngPixelDigest(page, darkPath))
  for (const [x, y] of [[10, 10], [540, 720], [1000, 1300]]) {
    expect(await samplePngPixel(page, lightPath, x, y)).toEqual(
      await samplePngPixel(page, darkPath, x, y),
    )
  }
})

test('nested group export stays identical across themes and preview zooms', async ({ page }) => {
  await openNestedV3Draft(page, `nested-group-export-${Date.now()}`)

  async function downloadCurrent() {
    await openExportMenu(page)
    const exportButton = page.getByTestId('freeform-primary-export')
    await expect(exportButton).toBeEnabled()
    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloadPromise
    const path = await download.path()
    if (!path) throw new Error('missing nested group PNG path')
    await expect(exportButton).toBeEnabled()
    return path
  }

  await setFreeformZoom(page, 50)
  const lightPath = await downloadCurrent()
  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await setFreeformZoom(page, 400)
  const darkPath = await downloadCurrent()

  expect(readPngSize(await readFile(lightPath))).toEqual({ width: 800, height: 600 })
  expect(readPngSize(await readFile(darkPath))).toEqual({ width: 800, height: 600 })
  expect(await pngPixelDigest(page, lightPath)).toBe(await pngPixelDigest(page, darkPath))
  for (const [x, y] of [[20, 20], [400, 300], [720, 520]]) {
    expect(await samplePngPixel(page, lightPath, x, y)).toEqual(
      await samplePngPixel(page, darkPath, x, y),
    )
  }
})

test('exports mixed-size slides as a zip after warning', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  const trigger = page.getByTestId('page-size-trigger')
  await trigger.click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await trigger.click()
  await page.getByRole('button', { name: '16:9', exact: true }).click()

  await openExportMenu(page)
  await page.getByTestId('freeform-export-all').click()
  await expect(page.getByRole('heading', { name: '包含不同尺寸页面' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '继续导出' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^freeform-slides-\d{4}-\d{2}-\d{2}\.zip$/)
  const path = await download.path()
  expect(path).toBeTruthy()
  const zip = await JSZip.loadAsync(await readFile(path!))
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort()
  expect(names).toEqual(['slide-01.png', 'slide-02.png'])

  const first = await zip.file('slide-01.png')!.async('uint8array')
  const second = await zip.file('slide-02.png')!.async('uint8array')
  expect(readPngSize(Buffer.from(first))).toEqual({ width: 1080, height: 1920 })
  expect(readPngSize(Buffer.from(second))).toEqual({ width: 1920, height: 1080 })
})

test('shows progress while exporting multiple freeform slides', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.getByRole('button', { name: '新增页面' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()

  const downloadPromise = page.waitForEvent('download')
  await openExportMenu(page)
  await expect(page.getByTestId('freeform-export-all')).toHaveText('打包下载全部 4 页')
  await page.getByTestId('freeform-export-all').click()
  // Progress shows on the trigger and on the button itself.
  await expect(page.getByTestId('freeform-export')).toHaveText(/导出 \d+\/4/)
  await expect(page.getByTestId('freeform-export-all')).toHaveText(/导出 \d+\/4/)
  await downloadPromise
})
