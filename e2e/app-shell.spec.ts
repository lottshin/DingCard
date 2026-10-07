import { expect, test, type Page } from '@playwright/test'
import { insertFreeformText } from './freeformTools'
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

async function typeInMarkdown(page: Page, text: string) {
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
}

test('a first visit lands on the login page; starting without an account is remembered', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('login-page')).toBeVisible()
  await expect(page.getByTestId('login-page').locator('.login-fan-card')).toHaveCount(5)

  await expect(page.getByTestId('login-guest')).toHaveText('不注册，直接开始')
  await page.getByTestId('login-guest').click()
  const workbench = page.getByTestId('workbench')
  await expect(workbench).toBeVisible()
  await expect(page.getByTestId('system-markdown')).toContainText('Markdown 卡片')
  await expect(page.getByTestId('system-freeform')).toContainText('自由编辑')
  await expect(workbench).toContainText('还没有项目')

  // The choice outlives the tab: a new visit goes straight to the workbench.
  const again = await page.context().newPage()
  await again.goto('/')
  await expect(again.getByTestId('workbench')).toBeVisible()
  await again.close()

  await page.getByTestId('workbench-login').click()
  await expect(page.getByTestId('login-page')).toBeVisible()
})

test('a guest\'s projects save on this device and show up in 我的项目', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('login-guest').click()
  await page.getByTestId('system-markdown').getByRole('button', { name: '小红书', exact: true }).click()
  await typeInMarkdown(page, '访客写下的一句话')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存到本机')

  await page.reload()
  await expect(page.getByTestId('workbench')).toHaveCount(0)
  await expect(page.locator('.cm-content')).toContainText('访客写下的一句话')
  await backToWorkbench(page)
  await page.getByRole('link', { name: /^我的项目/ }).click()
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  await expect(page.getByTestId('guest-left')).toHaveCount(0)
})

test('signing up offers to move the guest\'s work into the account', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('login-guest').click()
  await page.getByTestId('system-freeform').getByRole('button', { name: '3:4', exact: true }).click()
  await insertFreeformText(page)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存到本机')

  const username = uniqueName('mover')
  await page.getByTestId('account-login').click()
  const auth = page.getByRole('dialog', { name: '账户登录与注册' })
  await auth.getByRole('button', { name: '注册', exact: true }).click()
  await auth.getByLabel('用户名').fill(username)
  await auth.getByLabel('密码').fill('1234')
  await auth.getByRole('button', { name: '创建账号', exact: true }).click()

  const offer = page.getByTestId('guest-move-dialog')
  await expect(offer).toContainText('你没登录时做了 1 个项目')
  await expect(offer).toContainText(`放进「${username}」后`)
  await expect(offer.getByTestId('guest-move-confirm')).toBeFocused()
  await offer.getByTestId('guest-move-confirm').click()
  await expect(offer).toHaveCount(0)

  // The project on screen is the account's now, still open.
  await expect(page.getByTestId('account-menu')).toHaveAccessibleName(`账号菜单（${username}）`)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expect(page.getByTestId('freeform-element')).toHaveCount(1)
  await backToWorkbench(page)
  await page.getByRole('link', { name: /^我的项目/ }).click()
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  await expect(page.getByTestId('guest-left')).toHaveCount(0)

  // Nothing stayed behind for the guest.
  await page.getByTestId('workbench').getByRole('button', { name: `账号菜单（${username}）` }).click()
  await page.getByTestId('workbench-logout').click()
  await page.getByTestId('login-guest').click()
  await page.getByRole('link', { name: /^我的项目/ }).click()
  await expect(page.getByTestId('project-card')).toHaveCount(0)
})

test('keeping the guest\'s work on the device leaves a way to move it later', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('login-guest').click()
  await page.getByTestId('system-markdown').getByRole('button', { name: '小红书', exact: true }).click()
  await typeInMarkdown(page, '先留在这台设备')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存到本机')
  await backToWorkbench(page)

  const username = uniqueName('keeper')
  await page.getByTestId('workbench-login').click()
  const login = page.getByTestId('login-page')
  await login.getByRole('button', { name: '注册', exact: true }).click()
  await login.getByLabel('用户名').fill(username)
  await login.getByLabel('密码').fill('1234')
  await page.getByTestId('login-submit').click()
  const offer = page.getByTestId('guest-move-dialog')
  await offer.getByTestId('guest-move-keep').click()
  await expect(offer).toHaveCount(0)
  await expect(page.getByTestId('workbench')).toBeVisible()

  await page.getByRole('link', { name: /^我的项目/ }).click()
  await expect(page.getByTestId('project-card')).toHaveCount(0)
  const left = page.getByTestId('guest-left')
  await expect(left).toContainText('这台设备上还有 1 个没登录时做的项目')
  await left.getByTestId('guest-left-move').click()
  await page.getByTestId('guest-move-confirm').click()
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  await expect(left).toHaveCount(0)
})

test('each editor is its own entry, opened straight from a link without an account', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('account-login')).toBeVisible()
  // No switch between the two systems: one editor, one top bar.
  await expect(page.getByRole('tab', { name: /Markdown 卡片/ })).toHaveCount(0)
  await expect(page.getByTestId('app-header')).toHaveCount(1)
  await expect(page.getByTestId('editor-title')).toHaveText('未命名设计')
  // Nothing to save until the first edit.
  await expect(page.getByTestId('editor-save-state')).toHaveCount(0)

  await page.goto('/#/edit/md')
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await expect(page.getByTestId('freeform-toolbar')).toHaveCount(0)
  await expect(page.getByTestId('app-header')).toHaveCount(1)
  await backToWorkbench(page)
  await expect(page.getByTestId('system-markdown')).toBeVisible()

  // A bare #/edit settles on an editor.
  await page.goto('/#/edit')
  await expect(page).toHaveURL(/#\/edit\/md$/)
})

test('new projects carry their platform and page size and save themselves once edited', async ({ page }) => {
  const username = await registerOnLoginPage(page)
  await expect(page.locator('.hello')).toContainText(username)

  await page.getByTestId('system-markdown').getByRole('button', { name: '微博', exact: true }).click()
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await expect(page).toHaveURL(/#\/edit\/md$/)
  await expect(page.getByRole('tablist', { name: '平台' }).getByRole('button', { name: '微博', exact: true })).toHaveClass(/\bon\b/)
  await expect(page.getByTestId('editor-title')).toHaveText('标题')
  // Nothing is stored until the first edit.
  await expect(page.getByTestId('editor-save-state')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '保存草稿' })).toHaveCount(0)
  await typeInMarkdown(page, '第一段正文')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await backToWorkbench(page)
  await page.getByTestId('system-freeform').getByRole('button', { name: '9:16', exact: true }).click()
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText('9:16 · 1080×1920px')
  await insertFreeformText(page)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await backToWorkbench(page)
  await expect(page.getByTestId('project-card')).toHaveCount(2)
  // The sidebar has a single 我的项目 entry; the system filter lives on the page.
  await expect(page.getByRole('navigation', { name: '工作台导航' }).getByRole('link')).toHaveText(['首页', /^我的项目/, '模板中心', /^素材库/])
  await page.getByRole('link', { name: /^我的项目/ }).click()
  await page.getByRole('group', { name: '按系统筛选' }).getByRole('button', { name: /^Markdown 卡片/ }).click()
  await expect(page).toHaveURL(/#\/projects\?system=md$/)
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  await expect(page.getByTestId('project-card')).toHaveAttribute('data-system', 'markdown-card')

  await page.getByTestId('project-card').getByRole('button', { name: /^打开/ }).click()
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await expect(page.getByTestId('editor-title')).toHaveText('标题')
  await expect(page.locator('.cm-content')).toContainText('第一段正文')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
})

test('edits made right before leaving the editor still reach the project', async ({ page }) => {
  await registerOnLoginPage(page)
  await page.getByTestId('system-freeform').getByRole('button', { name: '1:1', exact: true }).click()
  await insertFreeformText(page)
  await insertFreeformText(page)
  // Leave before the autosave pause runs out.
  await backToWorkbench(page)
  await page.getByRole('link', { name: /^我的项目/ }).click()
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  await page.getByTestId('project-card').getByRole('button', { name: /^打开/ }).click()
  await expect(page.getByTestId('freeform-element')).toHaveCount(2)
})

test('projects are renamed from the editor title or the project card', async ({ page }) => {
  await registerOnLoginPage(page)
  await page.getByTestId('system-freeform').getByRole('button', { name: '3:4', exact: true }).click()
  await expect(page.getByTestId('editor-title')).toHaveText('未命名设计')
  await page.getByTestId('editor-title').click()
  const input = page.getByTestId('editor-title-input')
  await expect(input).toBeFocused()
  await input.fill('春季海报')
  await input.press('Enter')
  await expect(page.getByTestId('editor-title')).toHaveText('春季海报')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  // Escape keeps the old name.
  await page.getByTestId('editor-title').click()
  await page.getByTestId('editor-title-input').fill('不要这个')
  await page.getByTestId('editor-title-input').press('Escape')
  await expect(page.getByTestId('editor-title')).toHaveText('春季海报')

  await backToWorkbench(page)
  const card = page.getByTestId('project-card')
  await expect(card).toContainText('春季海报')
  await card.getByRole('button', { name: /更多操作/ }).click()
  await page.getByRole('menuitem', { name: '重命名' }).click()
  const rename = card.getByRole('textbox', { name: '项目名称' })
  await rename.fill('春季海报 · 终稿')
  await rename.press('Enter')
  await expect(card).toContainText('春季海报 · 终稿')

  // The open editor follows the rename instead of writing the old name back.
  await card.getByRole('button', { name: /^打开/ }).click()
  await expect(page.getByTestId('editor-title')).toHaveText('春季海报 · 终稿')
  await insertFreeformText(page)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await backToWorkbench(page)
  await expect(page.getByTestId('project-card')).toContainText('春季海报 · 终稿')
})

test('templates start a new project in the matching editor', async ({ page }) => {
  await registerOnLoginPage(page)
  await page.getByRole('link', { name: '模板中心' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '模板中心' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: '贡献模板' }).getByRole('link', { name: '查看贡献指南' }))
    .toHaveAttribute('href', /docs\/templates\.md$/)
  await page.getByRole('group', { name: '按系统筛选' }).getByRole('button', { name: /^自由编辑/ }).click()
  await expect(page).toHaveURL(/#\/templates\?system=canvas$/)
  // Eight decks and twenty-five posters.
  await expect(page.getByTestId('template-card')).toHaveCount(36)

  await page.getByRole('button', { name: '用「夜航」新建项目' }).click()
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(3)
  await expect(page.getByTestId('editor-title')).toHaveText('夜航')
})

test('a new project asks first when the open one could not be saved', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('login-guest').click()
  await page.getByTestId('system-markdown').getByRole('button', { name: '小红书', exact: true }).click()
  // This browser refuses to store anything more.
  await page.evaluate(() => {
    Storage.prototype.setItem = function setItem() {
      throw new DOMException('full', 'QuotaExceededError')
    }
  })
  const editor = page.locator('.cm-content')
  await typeInMarkdown(page, '存不下的一句话')
  await expect(page.getByTestId('editor-save-state')).toContainText('保存失败')

  await backToWorkbench(page)
  await page.getByTestId('system-markdown').getByRole('button', { name: '推特', exact: true }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('没保存的修改')
  await confirm.getByRole('button', { name: '回去看看' }).click()
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await expect(editor).toContainText('存不下的一句话')

  await backToWorkbench(page)
  await page.getByTestId('system-markdown').getByRole('button', { name: '推特', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '丢掉改动，继续' }).click()
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await expect(editor).not.toContainText('存不下的一句话')
})

test('signed-in edits are already saved, so a new project opens without asking', async ({ page }) => {
  await registerOnLoginPage(page)
  await page.getByTestId('system-markdown').getByRole('button', { name: '小红书', exact: true }).click()
  await typeInMarkdown(page, '自动保存的一句话')
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await backToWorkbench(page)
  await page.getByTestId('system-markdown').getByRole('button', { name: '推特', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.locator('.cm-content')).not.toContainText('自动保存的一句话')
  await backToWorkbench(page)
  await expect(page.getByTestId('project-card')).toHaveCount(1)
})

test('projects can be duplicated and deleted from the workbench', async ({ page }) => {
  await registerOnLoginPage(page)
  await page.getByTestId('system-freeform').getByRole('button', { name: '1:1', exact: true }).click()
  await insertFreeformText(page)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
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

test('deleting the open project clears the editor instead of saving it back', async ({ page }) => {
  await registerOnLoginPage(page)
  await page.getByTestId('system-freeform').getByRole('button', { name: '1:1', exact: true }).click()
  await insertFreeformText(page)
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await backToWorkbench(page)

  const cards = page.getByTestId('project-card')
  await cards.first().getByRole('button', { name: /更多操作/ }).click()
  await page.getByRole('menuitem', { name: '删除' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(cards).toHaveCount(0)

  await page.goto('/#/edit/canvas')
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await page.getByTestId('editor-home').click()
  await expect(page.getByTestId('project-card')).toHaveCount(0)
})

test('a JSON document dropped on 我的项目 becomes a project and opens', async ({ page }) => {
  await registerOnLoginPage(page)
  await page.getByRole('link', { name: /^我的项目/ }).click()
  const document = {
    source: '# 从 MCP 来的长文\n\n正文。',
    platformId: 'rednote',
    themeId: 'light',
    fontFamily: "'Noto Sans SC', sans-serif",
    profile: {
      nickname: '叮卡',
      handle: 'dingcard',
      location: '',
      avatarColor: '#f97316',
      avatarImage: null,
      verified: false,
      headerFirstPageOnly: false,
    },
    radius: 18,
  }
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'mcp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  })
  await expect(page.getByTestId('markdown-toolbar')).toBeVisible()
  await expect(page.getByTestId('editor-title')).toHaveText('从 MCP 来的长文')
  await backToWorkbench(page)
  await expect(page.getByTestId('project-card')).toHaveCount(1)

  await page.getByRole('link', { name: /^我的项目/ }).click()
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"nope":true}'),
  })
  await expect(page.getByRole('alert')).toContainText('无法识别的文档')
})

test('templates saved by older versions turn into projects', async ({ page }) => {
  await registerOnLoginPage(page)
  await page.evaluate(() => {
    const userId = localStorage.getItem('slicer.session.v1')
    const slide = {
      id: 'legacy-slide',
      name: '旧模板页',
      width: 1080,
      height: 1440,
      background: { type: 'solid', color: '#ffffff' },
      nodes: [],
    }
    localStorage.setItem(`slicer.user-templates.${userId}`, JSON.stringify([{
      id: 'legacy-template',
      name: '我的旧模板',
      createdAt: 1,
      pageCount: 1,
      draft: {
        id: 'legacy-draft',
        title: '我的旧模板',
        schemaVersion: 2,
        updatedAt: 1,
        mode: 'freeform-slide',
        document: { documentVersion: 14, activeSlideId: 'legacy-slide', slides: [slide] },
      },
    }]))
  })
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('你存过的 1 个模板已经放进「我的项目」')
  await expect(page.getByTestId('project-card')).toContainText('我的旧模板')
  const remaining = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('slicer.user-templates.')))
  expect(remaining).toEqual([])
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

test('the sidebar collapses to an icon rail and remembers it', async ({ page }) => {
  await registerOnLoginPage(page)
  const workbench = page.getByTestId('workbench')
  const sidebar = page.getByRole('complementary', { name: '主导航' })
  const expandedWidth = (await sidebar.boundingBox())!.width

  await page.getByTestId('sidebar-toggle').click()
  await expect(workbench).toHaveClass(/is-collapsed/)
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(expandedWidth / 2)
  await expect(page.getByTestId('sidebar-toggle')).toHaveAttribute('aria-label', '展开侧栏')
  // Links keep their names for assistive tech and tooltips while the labels are hidden.
  await expect(sidebar.getByRole('link', { name: '模板中心' })).toHaveAttribute('title', '模板中心')

  await page.reload()
  await expect(page.getByTestId('workbench')).toHaveClass(/is-collapsed/)
  await page.getByTestId('sidebar-toggle').click()
  await expect(page.getByTestId('workbench')).not.toHaveClass(/is-collapsed/)
})

async function chooseLanguage(page: Page, name: '中文' | 'English') {
  const trigger = page.getByTestId('language-menu')
  await trigger.click()
  const menu = page.getByRole('menu', { name: /界面语言|Language/ })
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitemradio', { name }).click()
  await expect(menu).toHaveCount(0)
}

test('the interface language is picked from a list at the top right and remembered', async ({ page }) => {
  await page.goto('/')
  const login = page.getByTestId('login-page')
  // The trigger shows the current language; the list opens on click.
  await expect(page.getByTestId('language-menu')).toHaveText('中文')
  await page.getByTestId('language-menu').click()
  const menu = page.getByRole('menu', { name: '界面语言' })
  await expect(menu.getByRole('menuitemradio', { name: '中文' })).toHaveAttribute('aria-checked', 'true')
  await expect(menu.getByRole('menuitemradio', { name: '中文' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitemradio', { name: 'English' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(page.getByTestId('language-menu')).toBeFocused()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')

  await chooseLanguage(page, 'English')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(login.getByRole('heading', { level: 1 })).toHaveText('Welcome back')
  await expect(page.getByTestId('login-guest')).toHaveText('Start without an account')

  await page.reload()
  await expect(page.getByTestId('login-guest')).toHaveText('Start without an account')
  await page.getByTestId('login-guest').click()
  await expect(page.getByRole('link', { name: 'My projects' })).toBeVisible()
  await expect(page.getByTestId('system-markdown')).toContainText('Markdown Cards')
  // The workbench keeps the menu in its top bar, not in the sidebar.
  const topbar = page.getByTestId('workbench-topbar')
  await expect(topbar.getByTestId('language-menu')).toHaveText('English')
  await expect(page.getByRole('complementary', { name: 'Main navigation' }).getByTestId('language-menu')).toHaveCount(0)

  await page.getByTestId('system-freeform').getByRole('button', { name: '3:4', exact: true }).click()
  await expect(page.getByTestId('freeform-text-tool')).toHaveText('Text')
  await expect(page.getByTestId('editor-title')).toHaveText('Untitled design')
  await expect(page.getByTestId('freeform-export')).toHaveText(/Export/)

  const header = page.getByTestId('app-header')
  await header.getByTestId('language-menu').click()
  await page.getByRole('menu', { name: 'Language' }).getByRole('menuitemradio', { name: '中文' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByTestId('freeform-text-tool')).toHaveText('文字')
  await expect(page.getByTestId('freeform-export')).toHaveText(/导出/)
})
