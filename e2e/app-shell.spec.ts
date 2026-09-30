import { expect, test, type Page } from '@playwright/test'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

function uniqueName(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

async function registerOnLoginPage(page: Page, username = uniqueName('shell')) {
  await page.goto('/')
  const login = page.getByTestId('login-page')
  await expect(login).toBeVisible()
  await login.getByRole('button', { name: '注册', exact: true }).click()
  await login.getByLabel('用户名').fill(username)
  await login.getByLabel('密码').fill('1234')
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('workbench')).toBeVisible()
  return username
}

async function backToWorkbench(page: Page) {
  await page.getByTestId('editor-home').click()
  await expect(page.getByTestId('workbench')).toBeVisible()
}

test('a first visit lands on the login page and guests can look around', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('login-page')).toBeVisible()
  await expect(page.getByTestId('login-page').locator('.login-fan-card')).toHaveCount(5)

  await page.getByTestId('login-guest').click()
  const workbench = page.getByTestId('workbench')
  await expect(workbench).toBeVisible()
  await expect(page.getByTestId('system-markdown')).toContainText('Markdown 卡片')
  await expect(page.getByTestId('system-freeform')).toContainText('自由编辑')
  await expect(workbench).toContainText('登录后，保存的项目会出现在这里')

  await page.reload()
  await expect(page.getByTestId('workbench')).toBeVisible()

  await page.getByTestId('workbench-login').click()
  await expect(page.getByTestId('login-page')).toBeVisible()
})

test('editor links open straight into the editor without an account', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('workspace-tab-freeform')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('account-login')).toBeVisible()

  await page.getByTestId('workspace-tab-markdown').click()
  await expect(page).toHaveURL(/#\/edit\/md$/)
  await backToWorkbench(page)
  await expect(page.getByTestId('system-markdown')).toBeVisible()
})

test('new projects carry their platform and page size into the editors and show up once saved', async ({ page }) => {
  const username = await registerOnLoginPage(page)
  await expect(page.locator('.hello')).toContainText(username)

  await page.getByTestId('system-markdown').getByRole('button', { name: '微博', exact: true }).click()
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await expect(page).toHaveURL(/#\/edit\/md$/)
  await expect(page.getByRole('tablist', { name: '平台' }).getByRole('button', { name: '微博', exact: true })).toHaveClass(/\bon\b/)
  await expect(page.getByTestId('editor-title')).toHaveText('标题')
  await expect(page.getByTestId('editor-save-state')).toHaveCount(0)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.locator('.pane-sub')).toContainText('已保存')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await backToWorkbench(page)
  await page.getByTestId('system-freeform').getByRole('button', { name: '9:16', exact: true }).click()
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText('9:16 · 1080×1920px')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')

  await backToWorkbench(page)
  await expect(page.getByTestId('project-card')).toHaveCount(2)
  await page.getByRole('link', { name: /^Markdown 卡片/ }).click()
  await expect(page).toHaveURL(/#\/projects\?system=md$/)
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  await expect(page.getByTestId('project-card')).toHaveAttribute('data-system', 'markdown-card')

  await page.getByTestId('project-card').getByRole('button', { name: /^打开/ }).click()
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await expect(page.getByTestId('editor-title')).toHaveText('标题')
})

test('templates start a new project in the matching editor', async ({ page }) => {
  await registerOnLoginPage(page)
  await page.getByRole('link', { name: '模板中心' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '模板中心' })).toBeVisible()
  await page.getByRole('group', { name: '按系统筛选' }).getByRole('button', { name: /^自由编辑/ }).click()
  await expect(page).toHaveURL(/#\/templates\?system=canvas$/)
  await expect(page.getByTestId('template-card')).toHaveCount(8)

  await page.getByRole('button', { name: '用「夜航」新建项目' }).click()
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(3)
})

test('opening another project asks before throwing away unsaved edits', async ({ page }) => {
  await registerOnLoginPage(page)
  await page.getByTestId('system-markdown').getByRole('button', { name: '小红书', exact: true }).click()
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.type('还没保存的一句话')
  await expect(page.getByTestId('editor-save-state')).toHaveText('未保存')

  await backToWorkbench(page)
  await page.getByTestId('system-markdown').getByRole('button', { name: '推特', exact: true }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('未保存的修改')
  await confirm.getByRole('button', { name: '回去保存' }).click()
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await expect(editor).toContainText('还没保存的一句话')

  await backToWorkbench(page)
  await page.getByTestId('system-markdown').getByRole('button', { name: '推特', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '丢掉改动，继续' }).click()
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await expect(editor).not.toContainText('还没保存的一句话')
})

test('projects can be duplicated and deleted from the workbench', async ({ page }) => {
  await registerOnLoginPage(page)
  await page.getByTestId('system-freeform').getByRole('button', { name: '1:1', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
  await backToWorkbench(page)

  const cards = page.getByTestId('project-card')
  await expect(cards).toHaveCount(1)
  await cards.first().getByRole('button', { name: /更多操作/ }).click()
  await page.getByRole('menuitem', { name: '复制一份' }).click()
  await expect(cards).toHaveCount(2)
  await expect(page.getByTestId('workbench')).toContainText('副本')

  await cards.first().getByRole('button', { name: /更多操作/ }).click()
  await page.getByRole('menuitem', { name: '删除' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(cards).toHaveCount(1)
})

test('the command palette finds projects and runs actions', async ({ page }) => {
  await registerOnLoginPage(page)
  await page.keyboard.press('ControlOrMeta+K')
  const palette = page.getByRole('dialog', { name: '搜索与命令' })
  await expect(palette).toBeVisible()
  await palette.getByRole('combobox').fill('自由编辑')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
})

test('logging out of the workbench returns to the login page', async ({ page }) => {
  const username = await registerOnLoginPage(page)
  await page.getByRole('button', { name: `账号菜单（${username}）` }).click()
  await page.getByTestId('workbench-logout').click()
  await expect(page.getByTestId('login-page')).toBeVisible()
})
