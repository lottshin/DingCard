import { expect, test } from '@playwright/test'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

test('header auth dialog exposes modal semantics, traps focus, and restores its trigger on Escape', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const trigger = page.getByTestId('account-login')
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
  await expect(dialog).toHaveAttribute('role', 'dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')

  const loginButtons = dialog.getByRole('button', { name: '登录', exact: true })
  const loginTab = loginButtons.first()
  const registerTab = dialog.getByRole('button', { name: '注册', exact: true })
  const username = dialog.getByLabel('用户名')
  const password = dialog.getByLabel('密码')
  const cancel = dialog.getByRole('button', { name: '取消', exact: true })
  const submit = loginButtons.last()

  await expect(username).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(registerTab).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(loginTab).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(submit).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(loginTab).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(registerTab).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(username).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(password).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(submit).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(loginTab).toBeFocused()

  await username.focus()
  await username.evaluate((element) => {
    const testWindow = window as typeof window & {
      __authEscapeState?: { defaultPrevented: boolean; leakedToDocument: number }
    }
    const state = { defaultPrevented: false, leakedToDocument: 0 }
    testWindow.__authEscapeState = state
    element.closest('#root')?.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape') return
        state.defaultPrevented = event.defaultPrevented
      },
      { once: true },
    )
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') state.leakedToDocument += 1
      },
      { once: true },
    )
  })

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const testWindow = window as typeof window & {
          __authEscapeState?: { defaultPrevented: boolean; leakedToDocument: number }
        }
        return testWindow.__authEscapeState
      }),
    )
    .toEqual({ defaultPrevented: true, leakedToDocument: 0 })
})

test('auth dialog includes visible control types and skips hidden or inert sentinels in both directions', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('account-login').click()

  const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
  await dialog.evaluate((sheet) => {
    const foot = sheet.querySelector('.sheet-foot')
    if (!foot) throw new Error('auth dialog footer not found')

    const sentinels = document.createElement('div')
    sentinels.dataset.testid = 'auth-focus-sentinels'

    const textarea = document.createElement('textarea')
    textarea.setAttribute('aria-label', '焦点测试文本域')

    const select = document.createElement('select')
    select.setAttribute('aria-label', '焦点测试选择框')
    select.append(new Option('焦点测试选项', 'focus-option'))

    const tabindexSentinel = document.createElement('div')
    tabindexSentinel.tabIndex = 0
    tabindexSentinel.dataset.testid = 'auth-tabindex-sentinel'
    tabindexSentinel.textContent = 'tabindex focus sentinel'

    const hiddenSentinel = document.createElement('button')
    hiddenSentinel.type = 'button'
    hiddenSentinel.hidden = true
    hiddenSentinel.dataset.testid = 'auth-hidden-sentinel'
    hiddenSentinel.textContent = 'hidden focus sentinel'

    const visibilityHiddenSentinel = document.createElement('button')
    visibilityHiddenSentinel.type = 'button'
    visibilityHiddenSentinel.style.visibility = 'hidden'
    visibilityHiddenSentinel.dataset.testid = 'auth-visibility-hidden-sentinel'
    visibilityHiddenSentinel.textContent = 'visibility hidden focus sentinel'

    const inertAncestor = document.createElement('div')
    inertAncestor.setAttribute('inert', '')
    const inertSentinel = document.createElement('button')
    inertSentinel.type = 'button'
    inertSentinel.dataset.testid = 'auth-inert-sentinel'
    inertSentinel.textContent = 'inert focus sentinel'
    inertAncestor.append(inertSentinel)

    sentinels.append(
      textarea,
      select,
      tabindexSentinel,
      hiddenSentinel,
      visibilityHiddenSentinel,
      inertAncestor,
    )
    foot.before(sentinels)
  })

  const loginButtons = dialog.getByRole('button', { name: '登录', exact: true })
  const loginTab = loginButtons.first()
  const registerTab = dialog.getByRole('button', { name: '注册', exact: true })
  const username = dialog.getByLabel('用户名')
  const password = dialog.getByLabel('密码')
  const textarea = dialog.getByLabel('焦点测试文本域')
  const select = dialog.getByLabel('焦点测试选择框')
  const tabindexSentinel = dialog.getByTestId('auth-tabindex-sentinel')
  const cancel = dialog.getByRole('button', { name: '取消', exact: true })
  const submit = loginButtons.last()

  await expect(textarea).toBeVisible()
  await expect(select).toBeVisible()
  await expect(tabindexSentinel).toBeVisible()
  await expect(dialog.getByTestId('auth-hidden-sentinel')).toBeHidden()
  await expect(dialog.getByTestId('auth-visibility-hidden-sentinel')).toBeHidden()
  await expect(dialog.getByTestId('auth-inert-sentinel')).toBeVisible()

  await expect(username).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(password).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(textarea).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(select).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(tabindexSentinel).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(submit).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(loginTab).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(registerTab).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(username).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  await expect(registerTab).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(loginTab).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(submit).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(tabindexSentinel).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(select).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(textarea).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(password).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(username).toBeFocused()
})

test('freeform save restores its own button after cancel, Escape, and backdrop close', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()

  const saveButton = page.getByRole('button', { name: '保存草稿', exact: true })
  const dialog = page.getByRole('dialog', { name: '账户登录与注册' })

  await saveButton.focus()
  await expect(saveButton).toBeFocused()
  await saveButton.click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(saveButton).toBeFocused()

  await saveButton.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(saveButton).toBeFocused()

  await saveButton.click()
  await expect(dialog).toBeVisible()
  await page.locator('.sheet-backdrop').click({ position: { x: 4, y: 4 } })
  await expect(dialog).toBeHidden()
  await expect(saveButton).toBeFocused()
})

test('busy and failed local login keep only enabled controls in the dialog focus loop', async ({ page }) => {
  await page.addInitScript(() => {
    const subtle = crypto.subtle
    const originalDigest = subtle.digest.bind(subtle)
    let releaseDigest = () => {}
    const digestGate = new Promise<void>((resolve) => {
      releaseDigest = resolve
    })
    Object.defineProperty(subtle, 'digest', {
      configurable: true,
      value: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        await digestGate
        return originalDigest(algorithm, data)
      },
    })
    Object.defineProperty(window, '__releaseAuthDigest', {
      configurable: true,
      value: releaseDigest,
    })
  })

  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem(
      'slicer.users.v1',
      JSON.stringify([
        {
          id: 'auth-e2e-existing-user',
          username: 'existing-user',
          createdAt: Date.now(),
          pwHash: 'not-the-entered-password',
        },
      ]),
    )
  })

  await page.getByTestId('account-login').click()
  const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
  const loginButtons = dialog.getByRole('button', { name: '登录', exact: true })
  const loginTab = loginButtons.first()
  const submit = dialog.locator('button[type="submit"]')
  const cancel = dialog.getByRole('button', { name: '取消', exact: true })

  await dialog.getByLabel('用户名').fill('existing-user')
  await dialog.getByLabel('密码').fill('wrong-password')
  await submit.click()
  await expect(submit).toBeDisabled()

  await cancel.focus()
  await page.keyboard.press('Tab')
  await expect(loginTab).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(cancel).toBeFocused()

  await page.evaluate(() => {
    const testWindow = window as typeof window & { __releaseAuthDigest?: () => void }
    testWindow.__releaseAuthDigest?.()
  })

  const alert = dialog.getByRole('alert')
  await expect(alert).toHaveAttribute('aria-live', 'polite')
  await expect(alert).toHaveText('用户名或密码不正确')
  await expect(dialog).toBeVisible()
  await expect(submit).toBeEnabled()

  await submit.focus()
  await page.keyboard.press('Tab')
  await expect(loginTab).toBeFocused()
})

test('existing local registration and login flows still succeed', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
  await page.getByTestId('account-login').click()
  await dialog.getByRole('button', { name: '注册', exact: true }).click()
  await dialog.getByLabel('用户名').fill('auth-e2e-user')
  await dialog.getByLabel('密码').fill('1234')
  await dialog.getByRole('button', { name: '创建账号', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('account-logout')).toBeVisible()

  await page.getByTestId('account-logout').click()
  await expect(page.getByTestId('account-login')).toBeVisible()
  await page.getByTestId('account-login').click()
  await dialog.getByLabel('用户名').fill('auth-e2e-user')
  await dialog.getByLabel('密码').fill('1234')
  await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('account-logout')).toBeVisible()
})
