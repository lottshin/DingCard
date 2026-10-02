import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { installOfflineFontRoutes } from './offlineFonts'

// PDF keeps every page in one file, each page as large as its card; 拼成一张长图
// stacks the pages into one tall picture.

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

async function openEditorial(page: Page) {
  await page.goto('/#/edit/canvas/template/editorial-freeform')
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(3)
  await expect(page.getByTestId('freeform-export')).toBeEnabled()
}

async function openExportMenu(page: Page) {
  const options = page.getByTestId('freeform-export-options')
  if (!(await options.isVisible())) await page.getByTestId('freeform-export').click()
  await expect(options).toBeVisible()
  return options
}

async function download(page: Page, testId: string) {
  const downloaded = page.waitForEvent('download')
  await (await openExportMenu(page)).getByTestId(testId).click()
  const file = await downloaded
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) }
}

function pngSize(bytes: Buffer) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

const today = () => new Date().toISOString().slice(0, 10)

test('PDF puts every page in one file, each as large as its card', async ({ page }) => {
  await openEditorial(page)
  const options = await openExportMenu(page)
  await options.getByTestId('export-format-pdf').click()
  await expect(options.getByTestId('export-quality-range')).toBeVisible()
  await expect(options.getByTestId('freeform-export-long')).toHaveCount(0)
  await expect(options.getByTestId('freeform-export-all')).toHaveText(/下载全部 3 页/)

  const all = await download(page, 'freeform-export-all')
  expect(all.name).toBe(`freeform-slides-${today()}.pdf`)
  const source = all.bytes.toString('latin1')
  expect(source.startsWith('%PDF-1.4')).toBe(true)
  expect(source).toContain('/Count 3')
  // 1080×1440 px pages are 810×1080 pt (96 px to the inch).
  expect(source.match(/\/MediaBox \[0 0 810 1080\]/g)).toHaveLength(3)

  const one = await download(page, 'freeform-primary-export')
  expect(one.name).toBe('slide-01.pdf')
  expect(one.bytes.toString('latin1')).toContain('/Count 1')
})

test('拼成一张长图 stacks every page into one picture, at the chosen scale and format', async ({ page }) => {
  await openEditorial(page)
  const options = await openExportMenu(page)
  await expect(options.getByTestId('export-format-png')).toHaveClass(/on/)

  const long = await download(page, 'freeform-export-long')
  expect(long.name).toBe(`freeform-long-${today()}.png`)
  expect(pngSize(long.bytes)).toEqual({ width: 1080, height: 3 * 1440 })

  await (await openExportMenu(page)).getByTestId('export-scale-2x').click()
  const large = await download(page, 'freeform-export-long')
  expect(pngSize(large.bytes)).toEqual({ width: 2160, height: 2 * 3 * 1440 })

  await (await openExportMenu(page)).getByTestId('export-format-jpeg').click()
  const jpeg = await download(page, 'freeform-export-long')
  expect(jpeg.name).toBe(`freeform-long-${today()}.jpg`)
  expect([jpeg.bytes[0], jpeg.bytes[1]]).toEqual([0xff, 0xd8])
})
