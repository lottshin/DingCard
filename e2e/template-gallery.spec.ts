import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { duplicateCurrentPage, insertFreeformText, openFreeformTemplateGallery } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

async function samplePngPixel(
  page: import('@playwright/test').Page,
  filePath: string,
  x: number,
  y: number,
) {
  const buffer = await readFile(filePath)
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
  return page.evaluate(
    async ({ dataUrl, x, y }) => {
      const image = new Image()
      image.src = dataUrl
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no canvas context')
      context.drawImage(image, 0, 0)
      return Array.from(context.getImageData(x, y, 1, 1).data)
    },
    { dataUrl, x, y },
  )
}

type PixelExpectation = [x: number, y: number, rgba: number[]]

interface ExportScenario {
  templateIndex: number
  slides: Array<{
    slideIndex: number
    pixels: PixelExpectation[]
  }>
}

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

test('Markdown gallery renders three design systems and applies a complete document', async ({ page }) => {
  await page.goto('/#/edit')
  await page.getByTestId('markdown-template-button').click()

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.template-tile')).toHaveCount(3)
  await expect(dialog.locator('.template-tile-preview')).toHaveCount(3)
  await expect(dialog.locator('.template-detail-preview')).toBeVisible()
  await expect.poll(() => dialog.locator('.template-markdown-preview .card-content h1').count()).toBeGreaterThan(0)
  await expect(dialog.locator('.template-detail .card')).toHaveCSS('border-radius', '4px')
  await expect(dialog.locator('.template-markdown-preview .card[data-card-theme="template-editorial-archive"]')).toHaveCount(2)
  await expect(dialog.locator('.template-markdown-preview .card[data-card-theme="template-public-theatre"]')).toHaveCount(1)
  await expect(dialog.locator('.template-markdown-preview .card[data-card-theme="template-issue-cover"]')).toHaveCount(1)
  const editorialPreview = dialog.getByRole('button', { name: '预览编辑档案' })
  const theatrePreview = dialog.getByRole('button', { name: '预览公共剧场' })
  await expect(editorialPreview).toHaveAttribute('aria-pressed', 'true')
  await theatrePreview.click()
  await expect(theatrePreview).toHaveAttribute('aria-pressed', 'true')
  await expect(editorialPreview).toHaveAttribute('aria-pressed', 'false')
  await editorialPreview.click()

  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.cm-content')).toContainText('这周事情很多，我先删掉一半')
  await expect(page.locator('.pane-sub')).toContainText('4 页')
  await expect(page.getByRole('combobox', { name: '主题' })).toContainText('模板 · 编辑档案')
})

test('Markdown cancel keeps the current unsaved content intact', async ({ page }) => {
  await page.goto('/#/edit')
  const weiboButton = page.getByRole('tablist', { name: '平台' })
    .getByRole('button', { name: '微博', exact: true })
  await weiboButton.click()
  const before = (await page.locator('.cm-content').innerText()).replace(/\s+/g, ' ').trim()

  await page.getByTestId('markdown-template-button').click()
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  const useButton = dialog.getByRole('button', { name: '使用这套模板', exact: true })
  await useButton.click()
  const confirm = page.getByRole('alertdialog', { name: '用这套模板新建项目？' })
  await expect(confirm).toBeVisible()
  const continueButton = confirm.getByRole('button', { name: '继续编辑', exact: true })
  const createButton = confirm.getByRole('button', { name: '用模板新建', exact: true })
  await expect(continueButton).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(createButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(continueButton).toBeFocused()
  await continueButton.click()

  await expect(confirm).toBeHidden()
  await expect(useButton).toBeFocused()

  await useButton.click()
  await expect(confirm).toBeVisible()
  await page.locator('.template-confirm-backdrop').click({ position: { x: 24, y: 24 } })
  await expect(confirm).toBeHidden()
  await expect(useButton).toBeFocused()
  await expect(weiboButton).toHaveClass(/on/)
  await expect.poll(async () => (await page.locator('.cm-content').innerText()).replace(/\s+/g, ' ').trim()).toBe(before)
})

test('gallery closes with keyboard or backdrop and restores the trigger focus', async ({ page }) => {
  await page.goto('/#/edit')
  const trigger = page.getByTestId('markdown-template-button')
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog.getByRole('button', { name: '关闭模板中心' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()

  await trigger.click()
  await page.locator('.template-backdrop').click({ position: { x: 2, y: 2 } })
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('Freeform gallery renders real layers and starts a fresh history', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await openFreeformTemplateGallery(page)

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog.locator('.template-tile')).toHaveCount(35)
  await expect(dialog.locator('.template-freeform-artboard')).toHaveCount(36)
  await expect(dialog.locator('.template-freeform-artboard .freeform-preview-element').first()).toBeVisible()

  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  await expect(page.locator('.freeform-workspace')).toHaveAttribute('data-history-depth', '0')
  await expect(page.locator('.freeform-thumb')).toHaveCount(3)
  await expect(page.locator('.freeform-thumb-art .freeform-preview-element').first()).toBeVisible()
  await expect(page.locator('.freeform-thumb-art .freeform-element')).toHaveCount(0)
  await expect(page.locator('.freeform-thumb-art [data-testid]')).toHaveCount(0)
  await expect(page.locator('.freeform-thumb-art [role="textbox"]')).toHaveCount(0)
  await expect(page.locator('.freeform-element')).not.toHaveCount(0)
  const editorNodeId = await page.getByTestId('freeform-canvas').locator('[data-scene-node-id]').first().getAttribute('data-scene-node-id')
  expect(editorNodeId).toBeTruthy()
  await expect(page.locator(`[data-scene-node-id="${editorNodeId}"]`)).toHaveCount(1)

  await page.setViewportSize({ width: 1024, height: 768 })
  // The page list settles a frame after the resize.
  await expect.poll(() => page.locator('.freeform-thumb').first().evaluate((thumbnail) => thumbnail.scrollWidth - thumbnail.clientWidth))
    .toBeLessThanOrEqual(1)
  const previewsFit = await page.locator('.freeform-thumb-art').evaluateAll((frames) => frames.every((frame) => {
    const artboard = frame.querySelector<HTMLElement>('.freeform-slide-preview-artboard')
    if (!artboard) return false
    const frameRect = frame.getBoundingClientRect()
    const artboardRect = artboard.getBoundingClientRect()
    return artboardRect.left >= frameRect.left - 1
      && artboardRect.top >= frameRect.top - 1
      && artboardRect.right <= frameRect.right + 1
      && artboardRect.bottom <= frameRect.bottom + 1
  }))
  expect(previewsFit).toBe(true)
  const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(documentOverflow).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 1440, height: 900 })

  await openFreeformTemplateGallery(page)
  const reopenedDialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await reopenedDialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: '用这套模板新建项目？' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page.locator('.freeform-thumb')).toHaveCount(3)
  await expect(page.locator('.freeform-workspace')).toHaveAttribute('data-history-depth', '0')
})

test('favorites shortlist templates and follow the browser across reloads', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await openFreeformTemplateGallery(page)
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog.locator('.template-tile')).toHaveCount(35)

  // A heart favorites its tile without picking it; the list itself stays whole.
  await page.getByTestId('template-favorite-skill-radar-freeform').click()
  await expect(page.getByTestId('template-favorite-skill-radar-freeform')).toHaveClass(/on/)
  await page.getByTestId('template-favorite-picks-freeform').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(35)

  // The 收藏 filter narrows to the hearts, in registry order.
  await page.getByTestId('template-filter-favorites').click()
  await expect(page.getByTestId('template-filter-favorites')).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.locator('.template-tile')).toHaveCount(2)
  await expect(dialog.locator('.template-tile h3')).toHaveText(['好物安利', '能力雷达'])

  // A keyword combines with the favorites filter like it does with a size.
  await page.getByTestId('template-search').fill('雷达')
  await expect(dialog.locator('.template-tile')).toHaveCount(1)
  await page.getByTestId('template-search').fill('')

  // Turning the filter off brings the whole list back.
  await page.getByTestId('template-filter-favorites').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(35)

  // The hearts live in this browser: a reload keeps the shortlist.
  await page.reload()
  await page.waitForSelector('.freeform-workspace')
  await openFreeformTemplateGallery(page)
  await page.getByTestId('template-filter-favorites').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(2)

  // Unfavoriting both hearts empties the shortlist with the filter still on.
  await page.getByTestId('template-favorite-picks-freeform').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(1)
  await page.getByTestId('template-favorite-skill-radar-freeform').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(0)
  await expect(page.getByTestId('template-search-empty')).toBeVisible()
})

test('gallery search narrows the list by keyword and combines with the size filter', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await openFreeformTemplateGallery(page)

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog.locator('.template-tile')).toHaveCount(35)

  const search = dialog.getByTestId('template-search')

  // A keyword leaves the templates whose tags, titles, or descriptions
  // carry it (the picks template mentions 小红书 in its description).
  await search.fill('小红书')
  await expect(dialog.locator('.template-tile')).toHaveCount(3)
  await expect(dialog.locator('.template-tile h3')).toContainText(['干货笔记', '图片拼贴', '好物安利'])

  // Words from the description count too.
  await search.fill('柱状图')
  await expect(dialog.locator('.template-tile')).toHaveCount(1)
  await expect(dialog.locator('.template-tile h3')).toHaveText('数据盘点')

  // The keyword combines with a size filter; a miss explains itself.
  await search.fill('名片')
  await expect(dialog.locator('.template-tile')).toHaveCount(1)
  await dialog.getByTestId('template-format-story').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(0)
  await expect(dialog.getByTestId('template-search-empty')).toBeVisible()

  // Escape in the box clears the keyword first; the gallery stays open.
  await search.click()
  await page.keyboard.press('Escape')
  await expect(search).toHaveValue('')
  await expect(dialog.locator('.template-tile')).toHaveCount(10)

  // A second Escape closes the gallery.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('Freeform sidebar mounts scene nodes only near the visible thumbnails', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await openFreeformTemplateGallery(page)
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()

  // Enough pages to run well past the page list's visible stretch.
  for (let index = 0; index < 22; index += 1) {
    await duplicateCurrentPage(page)
  }

  const thumbnails = page.locator('.freeform-thumb')
  await expect(thumbnails).toHaveCount(25)
  await expect.poll(async () => thumbnails.evaluateAll((items) => (
    items.filter((item) => item.querySelector('.freeform-preview-element')).length
  ))).toBeLessThan(25)
  await expect(page.locator('.freeform-thumb.on .freeform-preview-element').first()).toBeVisible()
})

test('Freeform template exports keep full-bleed corners sealed', async ({ page }) => {
  const scenarios: ExportScenario[] = [
    // Editorial's quote band runs from edge to edge.
    {
      templateIndex: 0,
      slides: [{ slideIndex: 1, pixels: [[0, 1130, [231, 223, 207, 255]], [1079, 1130, [231, 223, 207, 255]]] }],
    },
    {
      templateIndex: 2,
      slides: [
        { slideIndex: 0, pixels: [[0, 0, [214, 59, 36, 255]]] },
        { slideIndex: 1, pixels: [[0, 0, [37, 80, 217, 255]], [0, 1439, [37, 80, 217, 255]]] },
        { slideIndex: 2, pixels: [[0, 0, [244, 197, 66, 255]], [1079, 0, [244, 197, 66, 255]]] },
      ],
    },
    {
      templateIndex: 3,
      slides: [{ slideIndex: 2, pixels: [[0, 0, [14, 24, 36, 255]], [1079, 0, [14, 24, 36, 255]]] }],
    },
    {
      templateIndex: 5,
      slides: [{ slideIndex: 2, pixels: [[0, 0, [13, 13, 13, 255]], [0, 1439, [13, 13, 13, 255]]] }],
    },
  ]

  for (const scenario of scenarios) {
    // A hash-only goto keeps the current document, so leave the app to get a fresh editor.
    await page.goto('about:blank')
    await page.goto('/#/edit/canvas')
    await openFreeformTemplateGallery(page)
    const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
    await dialog.locator('.template-tile-preview').nth(scenario.templateIndex).click()
    await dialog.locator('.template-use').click()
    await expect(page.locator('.freeform-thumb')).toHaveCount(3)

    for (const slide of scenario.slides) {
      await page.locator('.freeform-thumb').nth(slide.slideIndex).click()
      if (!await page.getByTestId('freeform-export-options').isVisible()) {
        await page.getByTestId('freeform-export').click()
      }
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTestId('freeform-primary-export').click(),
      ])
      const path = await download.path()
      expect(path).toBeTruthy()

      for (const [x, y, expected] of slide.pixels) {
        expect(await samplePngPixel(page, path!, x, y)).toEqual(expected)
      }
    }
  }
})

test('gallery stays inside desktop and narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/edit')
  await page.getByTestId('markdown-template-button').click()

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    const geometry = await page.locator('.template-dialog').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const body = element.querySelector('.template-dialog-body') as HTMLElement | null
      return {
        left: rect.left,
        right: rect.right,
        viewport: window.innerWidth,
        bodyOverflow: body ? body.scrollWidth - body.clientWidth : -1,
      }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport)
    expect(geometry.bodyOverflow).toBeLessThanOrEqual(1)
  }
})

async function registerUser(page: import('@playwright/test').Page, username: string) {
  await page.getByRole('button', { name: '注册' }).click()
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill('1234')
  await page.getByRole('button', { name: '创建账号' }).click()
  // The register request is still in flight when the click returns. Wait for
  // the session before acting as the new user: an import that races the login
  // saves into the guest's local store while the follow-up open reads the
  // account's and reports the project as missing. With guest work on the
  // canvas the login is held behind the guest-move offer instead.
  await expect(
    page.getByTestId('account-menu').or(page.getByTestId('guest-move-confirm')),
  ).toBeVisible()
}

test('templates come from the repository only; the editors offer no way to save one', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await expect(page.getByRole('button', { name: '存为模板' })).toHaveCount(0)
  await insertFreeformText(page)
  await openFreeformTemplateGallery(page)
  const gallery = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(gallery.locator('.template-tile')).toHaveCount(35)
  await expect(gallery.getByText('我的模板')).toHaveCount(0)
  await expect(gallery.getByRole('button', { name: '删除此模板' })).toHaveCount(0)
  await gallery.getByRole('button', { name: '使用这套模板', exact: true }).click()
  // A guest's canvas is saved on this device, and the confirmation says so.
  const confirm = page.getByRole('alertdialog', { name: '用这套模板新建项目？' })
  await expect(confirm).toContainText('当前项目已自动保存')
  await confirm.getByRole('button', { name: '继续编辑', exact: true }).click()
  await gallery.getByRole('button', { name: '关闭模板中心' }).click()
  await expect(page.getByTestId('freeform-element')).toHaveCount(1)

  await page.goto('/#/edit/md')
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await expect(page.getByRole('button', { name: '存为模板' })).toHaveCount(0)
  await page.getByTestId('markdown-template-button').click()
  await expect(gallery.locator('.template-tile')).toHaveCount(3)
})

test('a signed-in template swap keeps the saved project and opens the template as a new one', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await page.getByTestId('account-login').click()
  await registerUser(page, `tpl-swap-${Date.now()}`)
  await insertFreeformText(page)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await openFreeformTemplateGallery(page)
  const gallery = page.getByRole('dialog', { name: '从一套成品开始' })
  await gallery.getByRole('button', { name: '使用这套模板', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: '用这套模板新建项目？' })
  await expect(confirm).toContainText('当前项目已自动保存')
  await confirm.getByRole('button', { name: '用模板新建', exact: true }).click()
  await expect(gallery).toBeHidden()
  await expect(page.getByTestId('editor-title')).toHaveText('编辑部')
  // The template is not a project until it is edited.
  await expect(page.getByTestId('editor-save-state')).toHaveCount(0)
  await insertFreeformText(page)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.getByTestId('editor-home').click()
  await expect(page.getByTestId('project-card')).toHaveCount(2)
  await expect(page.getByTestId('workbench')).toContainText('编辑部')
})
