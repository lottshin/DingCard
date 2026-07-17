import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { installOfflineFontRoutes } from './offlineFonts'

test.use({ viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

interface RuntimeIssue {
  source: 'console' | 'pageerror' | 'requestfailed'
  detail: string
}

function collectRuntimeIssues(page: Page): RuntimeIssue[] {
  const issues: RuntimeIssue[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.push({ source: 'console', detail: message.text() })
    }
  })
  page.on('pageerror', (error) => {
    issues.push({ source: 'pageerror', detail: error.message })
  })
  page.on('requestfailed', (request) => {
    issues.push({
      source: 'requestfailed',
      detail: `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'unknown failure'}`,
    })
  })
  return issues
}

function readPngDimensions(buffer: Buffer) {
  expect(buffer.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(buffer.subarray(12, 16).toString('ascii')).toBe('IHDR')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

async function expectEditorControlsAccessible(page: Page) {
  await expect(page.locator('select:visible')).toHaveCount(0)
  await expect(page.locator('input[type="color"]:visible')).toHaveCount(0)
  await expect(page.locator('input[type="file"]:visible')).toHaveCount(0)

  const ranges = page.locator('input[type="range"]:visible')
  expect(await ranges.count()).toBeGreaterThan(0)
  for (let index = 0; index < await ranges.count(); index += 1) {
    await expect(ranges.nth(index)).toHaveCSS('appearance', 'none')
  }

  const controls = page.locator(
    'button:visible, input:visible, textarea:visible, [role="button"]:visible, [role="combobox"]:visible, [role="textbox"]:visible, [contenteditable="true"]:visible',
  )
  expect(await controls.count()).toBeGreaterThan(0)
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index)
    const description = await control.evaluate((element) => {
      const html = element as HTMLElement
      return `${html.tagName.toLowerCase()}.${html.className || '(no-class)'}`
    })
    await expect(control, `${description} 缺少可访问名称`).toHaveAccessibleName(/\S/)
  }
}

async function expectNoDocumentOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const overflow = (element: HTMLElement) => ({
          horizontal: Math.max(0, element.scrollWidth - element.clientWidth),
          vertical: Math.max(0, element.scrollHeight - element.clientHeight),
        })
        return {
          body: overflow(document.body),
          root: overflow(document.documentElement),
        }
      }),
    )
    .toEqual({
      body: { horizontal: 0, vertical: 0 },
      root: { horizontal: 0, vertical: 0 },
    })
}

async function expectEditorLayout(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const viewport = { width: window.innerWidth, height: window.innerHeight }
        const targets = [
          ['header', '[data-testid="app-header"]'],
          ['toolbar', '[data-testid="freeform-toolbar"]'],
          ['rail', '.freeform-rail'],
          ['stage', '.freeform-stage-pane'],
          ['inspector', '.freeform-inspector'],
        ] as const
        const issues: string[] = []
        const rects = targets.map(([name, selector]) => {
          const element = document.querySelector<HTMLElement>(selector)
          if (!element) {
            issues.push(`${name} missing`)
            return null
          }
          const rect = element.getBoundingClientRect()
          if (
            rect.left < -1 ||
            rect.top < -1 ||
            rect.right > viewport.width + 1 ||
            rect.bottom > viewport.height + 1 ||
            rect.width <= 0 ||
            rect.height <= 0
          ) {
            issues.push(`${name} outside viewport`)
          }
          return { name, rect }
        }).filter((entry): entry is NonNullable<typeof entry> => entry !== null)

        for (let first = 0; first < rects.length; first += 1) {
          for (let second = first + 1; second < rects.length; second += 1) {
            const a = rects[first]
            const b = rects[second]
            const overlapWidth = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
            const overlapHeight = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
            if (overlapWidth > 1 && overlapHeight > 1) {
              issues.push(`${a.name} overlaps ${b.name}`)
            }
          }
        }

        const toolbar = document.querySelector<HTMLElement>('[data-testid="freeform-toolbar"]')
        const toolbarControls = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-testid="app-header"] button, [data-testid="freeform-toolbar"] button, .freeform-stage-head button',
          ),
        )
          .filter((control) => {
            const style = getComputedStyle(control)
            const rect = control.getBoundingClientRect()
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
          })
          .map((control) => ({
            label: (control.getAttribute('aria-label') ?? control.textContent ?? control.tagName)
              .replace(/\s+/g, ' ')
              .trim(),
            rect: control.getBoundingClientRect(),
          }))

        if (toolbarControls.length === 0) issues.push('toolbar controls missing')
        for (const control of toolbarControls) {
          if (
            control.rect.left < -1 ||
            control.rect.top < -1 ||
            control.rect.right > viewport.width + 1 ||
            control.rect.bottom > viewport.height + 1
          ) {
            issues.push(`${control.label} outside viewport`)
          }
        }
        for (let first = 0; first < toolbarControls.length; first += 1) {
          for (let second = first + 1; second < toolbarControls.length; second += 1) {
            const a = toolbarControls[first]
            const b = toolbarControls[second]
            const overlapWidth = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
            const overlapHeight = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
            if (overlapWidth > 1 && overlapHeight > 1) {
              issues.push(`${a.label} overlaps ${b.label}`)
            }
          }
        }

        if (toolbar && toolbar.scrollWidth - toolbar.clientWidth > 1) {
          issues.push('toolbar overflows horizontally')
        }
        return issues
      }),
    )
    .toEqual([])
}

test('editor acceptance preserves styled artwork through auth, draft restore, responsive layout, and export', async ({ page }, testInfo) => {
  const runtimeIssues = collectRuntimeIssues(page)
  const uniqueText = `验收旅程-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const username = `editor-acceptance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  await expect(page.locator('.freeform-stage-scroll')).toHaveAttribute('aria-busy', 'false')

  await page.getByTestId('page-size-trigger').click()
  await page.getByTestId('page-size-popover').getByRole('button', { name: '9:16', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText('9:16 · 1080×1920px')

  await page.getByTestId('page-size-trigger').click()
  const sizePopover = page.getByTestId('page-size-popover')
  await sizePopover.getByLabel('宽度 px').fill('100')
  await sizePopover.getByLabel('高度 px').fill('200')
  await sizePopover.getByRole('button', { name: '应用尺寸', exact: true }).click()
  await expect(sizePopover).toBeVisible()
  await expect(sizePopover.getByRole('alert')).toContainText('128')
  await expect(page.getByTestId('freeform-slide-size')).toHaveText('9:16 · 1080×1920px')
  await page.keyboard.press('Escape')
  await expect(sizePopover).toBeHidden()

  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-canvas')).toHaveCSS('background-image', /linear-gradient/)

  await page.getByTestId('insert-text').click()
  const textElement = page.getByTestId('freeform-element').last()
  const textBox = page.getByTestId('freeform-textbox').last()
  await textBox.fill(uniqueText)
  await expect(textBox).toContainText(uniqueText)
  await page.getByTestId('text-fill-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(textBox).toHaveCSS('background-image', /linear-gradient/)

  const fontSelect = page.getByTestId('freeform-font-select')
  await fontSelect.click()
  await page.getByRole('option', { name: '思源宋体', exact: true }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(fontSelect).toHaveText('思源宋体')
  await expect(textElement).toHaveAttribute('data-selected', 'true')
  await expect(textBox).toHaveCSS(
    'font-family',
    /^(?:"Noto Serif SC"|'Noto Serif SC'|Noto Serif SC)(?:\s*,|$)/,
  )

  await expectEditorControlsAccessible(page)
  await expectNoDocumentOverflow(page)
  await expectEditorLayout(page)

  const saveButton = page.getByRole('button', { name: '保存草稿', exact: true })
  await saveButton.click()
  const authDialog = page.getByRole('dialog', { name: '账户登录与注册' })
  await expect(authDialog).toBeVisible()
  await expect(authDialog).toContainText('账号仅保存在此浏览器本地')
  await authDialog.getByRole('button', { name: '注册', exact: true }).click()
  await authDialog.getByLabel('用户名').fill(username)
  await authDialog.getByLabel('密码').fill('1234')
  await authDialog.getByRole('button', { name: '创建账号', exact: true }).click()
  await expect(authDialog).toBeHidden()
  await expect(page.getByTestId('account-logout')).toHaveAccessibleName(`退出登录（${username}）`)

  await saveButton.click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
  await expect(page.getByRole('button', { name: '草稿 · 1', exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByTestId('account-logout')).toHaveAccessibleName(`退出登录（${username}）`)
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByRole('button', { name: '草稿 · 1', exact: true }).click()
  const draft = page.locator('.draft-item').filter({ hasText: 'Page 1' })
  await expect(draft).toContainText('自由编辑 · 1 页')
  await draft.click()

  const restoredTextElement = page.getByTestId('freeform-element').last()
  const restoredTextBox = page.getByTestId('freeform-textbox').last()
  await restoredTextElement.click()
  await expect(restoredTextElement).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId('freeform-font-select')).toHaveText('思源宋体')
  await expect(restoredTextBox).toContainText(uniqueText)
  await expect(restoredTextBox).toHaveCSS(
    'font-family',
    /^(?:"Noto Serif SC"|'Noto Serif SC'|Noto Serif SC)(?:\s*,|$)/,
  )
  await expect(restoredTextBox).toHaveCSS('background-image', /linear-gradient/)
  await expect(page.getByTestId('freeform-canvas')).toHaveCSS('background-image', /linear-gradient/)
  await expect(page.getByTestId('freeform-slide-size')).toHaveText('9:16 · 1080×1920px')
  await expect(page.getByTestId('freeform-canvas')).toHaveCSS('width', '1080px')
  await expect(page.getByTestId('freeform-canvas')).toHaveCSS('height', '1920px')

  await page.setViewportSize({ width: 1366, height: 768 })
  if ((await page.locator('html').getAttribute('data-theme')) !== 'dark') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expectNoDocumentOverflow(page)
  await expectEditorLayout(page)

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expectNoDocumentOverflow(page)
  await expectEditorLayout(page)

  const exportButton = page.getByTestId('freeform-primary-export')
  await expect(exportButton).toBeEnabled()
  const exportStartedAt = performance.now()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportButton.click(),
  ])
  const downloadPath = await download.path()
  const exportDurationMs = performance.now() - exportStartedAt
  testInfo.annotations.push({
    type: 'export-duration-ms',
    description: exportDurationMs.toFixed(1),
  })
  expect(exportDurationMs, `导出耗时 ${exportDurationMs.toFixed(1)}ms 超过 5000ms`).toBeLessThanOrEqual(5_000)
  expect(download.suggestedFilename()).toBe('slide-01.png')
  expect(downloadPath).toBeTruthy()
  expect(readPngDimensions(await readFile(downloadPath!))).toEqual({ width: 1080, height: 1920 })
  await expect(exportButton).toBeEnabled()

  expect(runtimeIssues, runtimeIssues.map((issue) => `${issue.source}: ${issue.detail}`).join('\n')).toEqual([])
})
