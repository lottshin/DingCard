// "不注册，直接开始": the choice is remembered on this device, so a returning
// visitor goes straight to the workbench. Signing in clears it; signing out
// then lands on the login page again.
const KEY = 'dingcard.guest.v1'
// When an account last said "keep them on this device" to moving guest work in.
const DECLINED_KEY = 'dingcard.guest-move-declined.v1'

export function readGuest(): boolean {
  try {
    if (localStorage.getItem(KEY) === '1') return true
  } catch {
    // Fall through to the tab-scoped flag older builds wrote.
  }
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function writeGuest(value: boolean) {
  try {
    if (value) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: guest mode then lasts until reload, which is fine.
  }
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clean up.
  }
}

function readDeclinedMap(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DECLINED_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, number> : {}
  } catch {
    return {}
  }
}

/** When `userId` last chose to keep this device's guest work out of the account; 0 if never. */
export function readGuestMoveDeclined(userId: string): number {
  const value = readDeclinedMap()[userId]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function writeGuestMoveDeclined(userId: string, at: number) {
  try {
    localStorage.setItem(DECLINED_KEY, JSON.stringify({ ...readDeclinedMap(), [userId]: at }))
  } catch {
    // Storage blocked: the offer simply comes back next time.
  }
}
