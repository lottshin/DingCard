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

test('Markdown gallery renders the nine looks and applies a complete document', async ({ page }) => {
  await page.goto('/#/edit')
  await page.getByTestId('markdown-template-button').click()

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.template-tile')).toHaveCount(9)
  await expect(dialog.locator('.template-tile-preview')).toHaveCount(9)
  await expect(dialog.locator('.template-detail-preview')).toBeVisible()
  await expect.poll(() => dialog.locator('.template-markdown-preview .card-content h1').count()).toBeGreaterThan(0)
  // Each tile is its template's look; the detail repeats the picked one.
  await expect(dialog.locator('.template-markdown-preview .card[data-look="column"]')).toHaveCount(2)
  for (const look of ['memo', 'letter', 'night', 'aurora', 'doc', 'xuan', 'swiss', 'journal']) {
    await expect(dialog.locator(`.template-markdown-preview .card[data-look="${look}"]`)).toHaveCount(1)
  }
  const columnPreview = dialog.getByRole('button', { name: '预览专栏' })
  const memoPreview = dialog.getByRole('button', { name: '预览备忘录' })
  await expect(columnPreview).toHaveAttribute('aria-pressed', 'true')
  await memoPreview.click()
  await expect(memoPreview).toHaveAttribute('aria-pressed', 'true')
  await expect(columnPreview).toHaveAttribute('aria-pressed', 'false')
  await columnPreview.click()

  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.cm-content')).toContainText('在城市里慢慢走')
  await expect(page.getByRole('combobox', { name: '主题' })).toContainText('专栏')
})

test('只换样式 sets the open article in a template\'s look and keeps its words', async ({ page }) => {
  await page.goto('/#/edit')
  await page.waitForFunction(() => !!(window as unknown as { __cmView?: unknown }).__cmView)
  await page.evaluate(() => {
    const view = (window as unknown as { __cmView: { state: { doc: { toString(): string } }; dispatch(spec: unknown): void } }).__cmView
    view.dispatch({ changes: { from: 0, to: view.state.doc.toString().length, insert: '# 我自己的文章\n\n第一段正文。' } })
  })
  await page.getByTestId('markdown-template-button').click()
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await dialog.getByRole('button', { name: '预览宣纸' }).click()
  await dialog.getByTestId('template-apply-look').click()
  // No question asked: nothing is replaced but the look.
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(dialog).toBeHidden()
  await expect(page.locator('.cm-content')).toContainText('我自己的文章')
  await expect(page.getByRole('combobox', { name: '主题' })).toContainText('宣纸')
  await expect(page.locator('.stage .card')).toHaveAttribute('data-look', 'xuan')
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
  await expect(dialog.locator('.template-tile')).toHaveCount(75)
  await expect(dialog.locator('.template-freeform-artboard')).toHaveCount(76)
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
  await expect(dialog.locator('.template-tile')).toHaveCount(75)

  // A heart favorites its tile without picking it; the list itself stays whole.
  await page.getByTestId('template-favorite-podcast-cover-freeform').click()
  await expect(page.getByTestId('template-favorite-podcast-cover-freeform')).toHaveClass(/on/)
  await page.getByTestId('template-favorite-autumn-market-freeform').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(75)

  // The 收藏 filter narrows to the hearts, in registry order.
  await page.getByTestId('template-filter-favorites').click()
  await expect(page.getByTestId('template-filter-favorites')).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.locator('.template-tile')).toHaveCount(2)
  await expect(dialog.locator('.template-tile h3')).toHaveText(['秋日市集', '播客封面'])

  // A keyword combines with the favorites filter like it does with a size.
  await page.getByTestId('template-search').fill('包豪斯')
  await expect(dialog.locator('.template-tile')).toHaveCount(1)
  await page.getByTestId('template-search').fill('')

  // Turning the filter off brings the whole list back.
  await page.getByTestId('template-filter-favorites').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(75)

  // The hearts live in this browser: a reload keeps the shortlist.
  await page.reload()
  await page.waitForSelector('.freeform-workspace')
  await openFreeformTemplateGallery(page)
  await page.getByTestId('template-filter-favorites').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(2)

  // Unfavoriting both hearts empties the shortlist with the filter still on.
  await page.getByTestId('template-favorite-autumn-market-freeform').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(1)
  await page.getByTestId('template-favorite-podcast-cover-freeform').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(0)
  await expect(page.getByTestId('template-search-empty')).toBeVisible()
})

test('gallery search narrows the list by keyword and combines with the size filter', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await openFreeformTemplateGallery(page)

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog.locator('.template-tile')).toHaveCount(75)

  const search = dialog.getByTestId('template-search')

  // A keyword finds titles, tags, sizes and what a template is for, best match
  // first: everything drawn at 小红书's 3:4, the covers tagged 小红书 leading.
  await search.fill('小红书')
  await expect(dialog.locator('.template-tile h3').nth(0)).toHaveText('干货笔记')
  await expect(dialog.locator('.template-tile h3').nth(1)).toHaveText('图片拼贴')
  await expect(dialog.locator('.template-tile h3')).toContainText(['编辑部'])

  // Words from the description count too.
  await search.fill('柱状图')
  await expect(dialog.locator('.template-tile')).toHaveCount(1)
  await expect(dialog.locator('.template-tile h3')).toHaveText('数据盘点')

  // The keyword combines with a size filter; a miss explains itself.
  await search.fill('包豪斯')
  await expect(dialog.locator('.template-tile')).toHaveCount(1)
  await dialog.getByTestId('template-format-story').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(0)
  await expect(dialog.getByTestId('template-search-empty')).toBeVisible()

  // Escape in the box clears the keyword first; the gallery stays open.
  await search.click()
  await page.keyboard.press('Escape')
  await expect(search).toHaveValue('')
  await expect(dialog.locator('.template-tile')).toHaveCount(23)

  // A second Escape closes the gallery.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('gallery uses narrow the list to one kind of template', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await openFreeformTemplateGallery(page)
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  const uses = dialog.getByRole('group', { name: '按用途筛选' })
  await expect(uses.getByRole('button')).toHaveText(['全部', '图文套图', '社交配图', '活动海报', '营销电商', '菜单价目', '节日节气', '邀请贺卡', '办公学习'])
  await dialog.getByTestId('template-gallery-use-menu').click()
  await expect(dialog.locator('.template-tile h3')).toHaveText(['菜单', '甜品菜单', '价目表'])
  // The detail follows the list.
  await expect(dialog.locator('.template-detail-series')).toHaveText('菜单')
  await dialog.getByTestId('template-format-a4').click()
  await expect(dialog.locator('.template-tile')).toHaveCount(2)
  await uses.getByRole('button', { name: '全部', exact: true }).click()
  // Every A4 page: 菜单, 甜品菜单, 简历, 红头通知, 年度报告 and 宣传单.
  await expect(dialog.locator('.template-tile')).toHaveCount(6)
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
    // Brutalist's closing sidebar.
    {
      templateIndex: 4,
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
  await expect(gallery.locator('.template-tile')).toHaveCount(75)
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
  await expect(gallery.locator('.template-tile')).toHaveCount(9)
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
