import { expect, test } from '@playwright/test'
import { installOfflineFontRoutes } from './offlineFonts'

declare global {
  interface Window {
    __cmView?: {
      state: { doc: { toString(): string } }
      dispatch(spec: unknown): void
    }
  }
}

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  await page.goto('/')
  await page.waitForFunction(() => !!window.__cmView)
})

async function setDoc(page: import('@playwright/test').Page, text: string) {
  await page.evaluate((nextSource) => {
    const view = window.__cmView!
    const length = view.state.doc.toString().length
    view.dispatch({ changes: { from: 0, to: length, insert: nextSource } })
  }, text)
}

async function chooseTheme(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('combobox', { name: '主题' }).click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

test('template pagination assigns roles from real markdown blocks', async ({ page }) => {
  await chooseTheme(page, '模板 · 公共剧场')
  await setDoc(page, [
    '# 城市里的公共座椅',
    '',
    '从一条街的停留方式开始观察。',
    '',
    '---',
    '',
    '## 路过与停下',
    '',
    '中间页只保留正文，让阅读节奏慢下来。',
    '',
    '---',
    '',
    '> 一把椅子决定了人能不能在这里多待十分钟。',
    '',
    '---',
    '',
    '- 看座椅朝向',
    '- 看树荫覆盖',
    '- 看人与街道的距离',
    '',
    '---',
    '',
    '观察到这里，下一次散步会多一个视角。',
  ].join('\n'))

  await expect(page.locator('.page-dot')).toHaveCount(5)
  const expectedRoles = ['cover', 'article', 'quote', 'list', 'close']

  for (const [index, role] of expectedRoles.entries()) {
    await page.locator('.page-dot').nth(index).click()
    await expect(page.locator('.stage .card')).toHaveAttribute('data-page-role', role)
    await expect(page.locator('.stage .card')).toHaveAttribute('data-page-index', String(index))
    await expect(page.locator('.stage .card')).toHaveAttribute('data-page-count', '5')
  }
})
