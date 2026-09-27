import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
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
  await page.goto('/')
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
  await page.goto('/')
  const weiboButton = page.getByRole('tablist', { name: '平台' })
    .getByRole('button', { name: '微博', exact: true })
  await weiboButton.click()
  const before = (await page.locator('.cm-content').innerText()).replace(/\s+/g, ' ').trim()

  await page.getByTestId('markdown-template-button').click()
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  const useButton = dialog.getByRole('button', { name: '使用这套模板', exact: true })
  await useButton.click()
  const confirm = page.getByRole('alertdialog', { name: '要新建一份模板作品吗？' })
  await expect(confirm).toBeVisible()
  const continueButton = confirm.getByRole('button', { name: '继续编辑', exact: true })
  const createButton = confirm.getByRole('button', { name: '新建模板作品', exact: true })
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
  await page.locator('.template-confirm-backdrop').click({ position: { x: 2, y: 2 } })
  await expect(confirm).toBeHidden()
  await expect(useButton).toBeFocused()
  await expect(weiboButton).toHaveClass(/on/)
  await expect.poll(async () => (await page.locator('.cm-content').innerText()).replace(/\s+/g, ' ').trim()).toBe(before)
})

test('gallery closes with keyboard or backdrop and restores the trigger focus', async ({ page }) => {
  await page.goto('/')
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
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByTestId('freeform-template-button').click()

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog.locator('.template-tile')).toHaveCount(4)
  await expect(dialog.locator('.template-freeform-artboard')).toHaveCount(5)
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
  const thumbnailOverflow = await page.locator('.freeform-thumb').first().evaluate((thumbnail) => thumbnail.scrollWidth - thumbnail.clientWidth)
  expect(thumbnailOverflow).toBeLessThanOrEqual(1)
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

  await page.getByTestId('freeform-template-button').click()
  const reopenedDialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await reopenedDialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: '要新建一份模板作品吗？' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page.locator('.freeform-thumb')).toHaveCount(3)
  await expect(page.locator('.freeform-workspace')).toHaveAttribute('data-history-depth', '0')
})

test('Freeform sidebar mounts scene nodes only near the visible thumbnails', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByTestId('freeform-template-button').click()
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()

  for (let index = 0; index < 10; index += 1) {
    await page.getByRole('button', { name: '复制页面', exact: true }).click()
  }

  const thumbnails = page.locator('.freeform-thumb')
  await expect(thumbnails).toHaveCount(13)
  await expect.poll(async () => thumbnails.evaluateAll((items) => (
    items.filter((item) => item.querySelector('.freeform-preview-element')).length
  ))).toBeLessThan(13)
  await expect(page.locator('.freeform-thumb.on .freeform-preview-element').first()).toBeVisible()
})

test('Freeform template exports keep full-bleed corners sealed', async ({ page }) => {
  const scenarios: ExportScenario[] = [
    {
      templateIndex: 0,
      slides: [{ slideIndex: 2, pixels: [[1079, 0, [217, 72, 54, 255]], [1079, 1439, [217, 72, 54, 255]]] }],
    },
    {
      templateIndex: 1,
      slides: [{ slideIndex: 0, pixels: [[0, 0, [23, 74, 56, 255]], [0, 1439, [23, 74, 56, 255]]] }],
    },
    {
      templateIndex: 2,
      slides: [
        { slideIndex: 0, pixels: [[1079, 0, [228, 71, 47, 255]]] },
        { slideIndex: 1, pixels: [[0, 0, [36, 87, 214, 255]], [0, 1439, [36, 87, 214, 255]]] },
        { slideIndex: 2, pixels: [[0, 0, [242, 200, 75, 255]], [1079, 0, [242, 200, 75, 255]]] },
      ],
    },
    {
      templateIndex: 3,
      slides: [
        { slideIndex: 0, pixels: [[0, 0, [236, 232, 220, 255]], [1079, 0, [236, 232, 220, 255]]] },
        { slideIndex: 2, pixels: [[0, 0, [17, 24, 32, 255]], [1079, 0, [17, 24, 32, 255]]] },
      ],
    },
  ]

  for (const scenario of scenarios) {
    await page.goto('/')
    await page.getByTestId('workspace-tab-freeform').click()
    await page.getByTestId('freeform-template-button').click()
    const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
    await dialog.locator('.template-tile-preview').nth(scenario.templateIndex).click()
    await dialog.locator('.template-use').click()
    await expect(page.locator('.freeform-thumb')).toHaveCount(3)

    for (const slide of scenario.slides) {
      await page.locator('.freeform-thumb').nth(slide.slideIndex).click()
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
  await page.goto('/')
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
}

test('Freeform work saves a user template, reuses it, and deletes it', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await page.getByTestId('insert-text').click()
  await expect(
    page.getByTestId('freeform-element').filter({ hasText: '双击编辑文本' }),
  ).toBeVisible()

  const saveTemplateButton = page.getByTestId('freeform-save-template-button')
  await saveTemplateButton.click()
  await registerUser(page, `tpl-f-${Date.now()}`)
  await saveTemplateButton.click()

  const saveDialog = page.getByRole('dialog', { name: '存为模板' })
  await expect(saveDialog).toBeVisible()
  await saveDialog.getByTestId('save-template-name-input').fill('我的画布模板')
  await saveDialog.getByTestId('save-template-confirm').click()
  await expect(saveDialog).toBeHidden()
  await expect(page.getByRole('alert')).toContainText('已存为模板「我的画布模板」')

  // Replace the content so only the template can restore it.
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await page.getByTestId('insert-shape').click()
  await page.getByRole('menuitem', { name: '矩形' }).click()
  await expect(page.getByTestId('freeform-element')).toHaveCount(1)

  await page.getByTestId('freeform-template-button').click()
  const gallery = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(gallery.locator('.template-tile')).toHaveCount(5)
  await expect(gallery.getByText('我的模板')).toBeVisible()
  await expect(gallery.locator('.template-tile').first()).toContainText('我的画布模板')
  await gallery.getByRole('button', { name: '预览我的画布模板' }).click()
  await expect(gallery.locator('.template-detail-preview')).toContainText('双击编辑文本')
  await expect(gallery.getByRole('button', { name: '删除此模板' })).toBeVisible()
  await gallery.getByRole('button', { name: '使用这套模板', exact: true }).click()
  await page.getByRole('button', { name: '新建模板作品' }).click()
  await expect(gallery).toBeHidden()
  await expect(
    page.getByTestId('freeform-element').filter({ hasText: '双击编辑文本' }),
  ).toBeVisible()
  await expect(page.getByTestId('freeform-element')).toHaveCount(1)
  await expect(page.locator('.freeform-workspace')).toHaveAttribute('data-history-depth', '0')

  // Deleting the template removes the whole user group again.
  await page.getByTestId('freeform-template-button').click()
  await expect(gallery.locator('.template-tile')).toHaveCount(5)
  await gallery.getByRole('button', { name: '预览我的画布模板' }).click()
  await gallery.getByRole('button', { name: '删除此模板' }).click()
  await expect(gallery.locator('.template-tile')).toHaveCount(4)
  await expect(gallery.getByText('我的模板')).toBeHidden()
  await gallery.getByRole('button', { name: '关闭模板中心' }).click()
  await expect(gallery).toBeHidden()
})

test('Markdown work saves a user template with the live source and reuses it', async ({ page }) => {
  await page.goto('/')
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('# 独一无二标题\n\n这份内容要存成模板。')

  const saveTemplateButton = page.getByTestId('markdown-save-template-button')
  await saveTemplateButton.click()
  await registerUser(page, `tpl-m-${Date.now()}`)
  await saveTemplateButton.click()

  const saveDialog = page.getByRole('dialog', { name: '存为模板' })
  await expect(saveDialog).toBeVisible()
  await expect(saveDialog.getByTestId('save-template-name-input')).toHaveValue('独一无二标题')
  await saveDialog.getByTestId('save-template-name-input').fill('我的图文模板')
  await saveDialog.getByTestId('save-template-confirm').click()
  await expect(saveDialog).toBeHidden()
  await expect(page.getByRole('alert')).toContainText('已存为模板')

  // Replace the source so only the template can restore it.
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('# 完全不同')
  await expect(editor).toContainText('完全不同')

  await page.getByTestId('markdown-template-button').click()
  const gallery = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(gallery.locator('.template-tile')).toHaveCount(4)
  await expect(gallery.getByText('我的模板')).toBeVisible()
  await expect(gallery.locator('.template-tile').first()).toContainText('我的图文模板')
  await gallery.getByRole('button', { name: '预览我的图文模板' }).click()
  await expect(gallery.locator('.template-markdown-preview.detail')).toContainText('独一无二标题')
  await gallery.getByRole('button', { name: '使用这套模板', exact: true }).click()
  await page.getByRole('button', { name: '新建模板作品' }).click()
  await expect(gallery).toBeHidden()
  await expect(editor).toContainText('独一无二标题')
  await expect(editor).not.toContainText('完全不同')
  await expect(page.locator('.pane-sub')).toContainText('1 页')

  // Deleting the template removes the whole user group again.
  await page.getByTestId('markdown-template-button').click()
  await expect(gallery.locator('.template-tile')).toHaveCount(4)
  await gallery.getByRole('button', { name: '预览我的图文模板' }).click()
  await gallery.getByRole('button', { name: '删除此模板' }).click()
  await expect(gallery.locator('.template-tile')).toHaveCount(3)
  await expect(gallery.getByText('我的模板')).toBeHidden()
  await gallery.getByRole('button', { name: '关闭模板中心' }).click()
  await expect(gallery).toBeHidden()
})
