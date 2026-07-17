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

test('auth modal isolates existing background notices and renders above them', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await page.locator('.app-shell').evaluate((shell) => {
    const notice = document.createElement('div')
    notice.className = 'operation-notice operation-notice--global'
    notice.dataset.testid = 'auth-coexisting-notice'
    notice.setAttribute('aria-hidden', 'false')
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.testid = 'auth-coexisting-notice-button'
    button.textContent = '关闭共存提示'
    notice.append(button)
    shell.append(notice)
  })

  const notice = page.getByTestId('auth-coexisting-notice')
  const noticeButton = page.getByTestId('auth-coexisting-notice-button')
  await noticeButton.focus()
  await expect(noticeButton).toBeFocused()
  await page.getByTestId('account-login').click()

  const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
  const backdrop = page.locator('.sheet-backdrop')
  const header = page.getByTestId('app-header')
  const activeWorkspace = page.locator('#workspace-panel-markdown')
  const modalState = await page.evaluate(() => ({
    backdrop: Number.parseInt(
      getComputedStyle(document.querySelector<HTMLElement>('.sheet-backdrop')!).zIndex,
      10,
    ),
    notice: Number.parseInt(
      getComputedStyle(document.querySelector<HTMLElement>('[data-testid="auth-coexisting-notice"]')!).zIndex,
      10,
    ),
    noticeInert: document
      .querySelector<HTMLElement>('[data-testid="auth-coexisting-notice"]')!
      .hasAttribute('inert'),
    noticeAriaHidden: document
      .querySelector<HTMLElement>('[data-testid="auth-coexisting-notice"]')!
      .getAttribute('aria-hidden'),
    headerInert: document.querySelector<HTMLElement>('[data-testid="app-header"]')!.hasAttribute('inert'),
    headerAriaHidden: document
      .querySelector<HTMLElement>('[data-testid="app-header"]')!
      .getAttribute('aria-hidden'),
    workspaceInert: document
      .querySelector<HTMLElement>('#workspace-panel-markdown')!
      .hasAttribute('inert'),
    workspaceAriaHidden: document
      .querySelector<HTMLElement>('#workspace-panel-markdown')!
      .getAttribute('aria-hidden'),
  }))

  expect.soft(modalState.backdrop).toBeGreaterThan(modalState.notice)
  expect.soft(modalState.noticeInert).toBe(true)
  expect.soft(modalState.noticeAriaHidden).toBe('true')
  expect.soft(modalState.headerInert).toBe(true)
  expect.soft(modalState.headerAriaHidden).toBe('true')
  expect.soft(modalState.workspaceInert).toBe(true)
  expect.soft(modalState.workspaceAriaHidden).toBe('true')
  await expect(backdrop).toBeVisible()

  await noticeButton.focus()
  await expect.soft(dialog.getByLabel('用户名')).toBeFocused()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  const restoredState = await page.evaluate(() => ({
    noticeInert: document
      .querySelector<HTMLElement>('[data-testid="auth-coexisting-notice"]')!
      .hasAttribute('inert'),
    noticeAriaHidden: document
      .querySelector<HTMLElement>('[data-testid="auth-coexisting-notice"]')!
      .getAttribute('aria-hidden'),
    headerInert: document.querySelector<HTMLElement>('[data-testid="app-header"]')!.hasAttribute('inert'),
    headerAriaHidden: document
      .querySelector<HTMLElement>('[data-testid="app-header"]')!
      .getAttribute('aria-hidden'),
  }))
  expect(restoredState).toEqual({
    noticeInert: false,
    noticeAriaHidden: 'false',
    headerInert: false,
    headerAriaHidden: null,
  })
})

test('auth dialog recaptures late external focus before Tab or Escape can bypass it', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const trigger = page.getByTestId('account-login')
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
  const username = dialog.getByLabel('用户名')
  const registerTab = dialog.getByRole('button', { name: '注册', exact: true })

  await page.locator('.app-shell').evaluate((shell) => {
    const lateButton = document.createElement('button')
    lateButton.type = 'button'
    lateButton.dataset.testid = 'auth-late-external-button'
    lateButton.textContent = '晚出现的外部按钮'
    shell.append(lateButton)
  })
  const lateButton = page.getByTestId('auth-late-external-button')
  await expect(lateButton).not.toHaveAttribute('inert', '')

  await lateButton.focus()
  await expect.soft(username).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect.soft(registerTab).toBeFocused()

  await lateButton.focus()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await lateButton.focus()
  await expect(lateButton).toBeFocused()
})

test('auth request remembers a click invoker without DOM focus and ignores repeated requests', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const trigger = page.getByTestId('account-login')
  await trigger.evaluate((button) => {
    document.body.tabIndex = -1
    document.body.focus()
    document.body.removeAttribute('tabindex')
    if (document.activeElement !== document.body) throw new Error('body did not receive focus')
    button.click()
  })

  const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
  await expect(dialog.getByLabel('用户名')).toBeFocused()
  const repeatedRequest = page
    .locator('#workspace-panel-markdown button')
    .filter({ hasText: /^保存草稿$/ })
    .first()
  await repeatedRequest.evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })

  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('invalid auth openers fall back to the selected workspace tab', async ({ page }) => {
  for (const invalidState of ['hidden', 'disabled', 'disconnected'] as const) {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    const trigger = page.getByTestId('account-login')
    const selectedWorkspaceTab = page.getByTestId('workspace-tab-markdown')
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
    await trigger.evaluate((button, state) => {
      if (state === 'hidden') button.hidden = true
      if (state === 'disabled') button.disabled = true
      if (state === 'disconnected') button.remove()
    }, invalidState)

    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(selectedWorkspaceTab).toBeFocused()
  }
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

  await saveButton.click()
  await dialog.getByRole('button', { name: '注册', exact: true }).click()
  await dialog.getByLabel('用户名').fill('freeform-auth-focus-user')
  await dialog.getByLabel('密码').fill('1234')
  await dialog.getByRole('button', { name: '创建账号', exact: true }).click()
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

  const trigger = page.getByTestId('account-login')
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '账户登录与注册' })
  const loginButtons = dialog.getByRole('button', { name: '登录', exact: true })
  const loginTab = loginButtons.first()
  const submit = dialog.locator('button[type="submit"]')
  const cancel = dialog.getByRole('button', { name: '取消', exact: true })

  await dialog.getByLabel('用户名').fill('existing-user')
  await dialog.getByLabel('密码').fill('wrong-password')
  await submit.focus()
  await page.keyboard.press('Enter')
  await expect(submit).toBeDisabled()
  await expect(cancel).toBeFocused()
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
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
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
  const firstLogout = page.getByTestId('account-logout')
  await expect(firstLogout).toBeVisible()
  await expect(firstLogout).toBeFocused()

  await firstLogout.click()
  await expect(page.getByTestId('account-login')).toBeVisible()
  await page.getByTestId('account-login').click()
  await dialog.getByLabel('用户名').fill('auth-e2e-user')
  await dialog.getByLabel('密码').fill('1234')
  await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
  await expect(dialog).toBeHidden()
  const secondLogout = page.getByTestId('account-logout')
  await expect(secondLogout).toBeVisible()
  await expect(secondLogout).toBeFocused()
})
