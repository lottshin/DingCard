// "先逛逛" guest mode: lasts for this browser tab session only, so a fresh
// visit still lands on the login page.
const KEY = 'dingcard.guest.v1'

export function readGuest(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function writeGuest(value: boolean) {
  try {
    if (value) sessionStorage.setItem(KEY, '1')
    else sessionStorage.removeItem(KEY)
  } catch {
    // Storage blocked: guest mode then lasts until reload, which is fine.
  }
}
