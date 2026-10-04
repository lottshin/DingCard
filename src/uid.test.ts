import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomId } from './uid'

const realCrypto = globalThis.crypto
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('randomId', () => {
  it('returns a v4 UUID when crypto.randomUUID is available', () => {
    expect(realCrypto.randomUUID).toBeTypeOf('function')
    expect(randomId()).toMatch(UUID_V4)
  })

  it('falls back to getRandomValues in non-secure contexts', () => {
    // A plain-HTTP LAN address is not a secure context: randomUUID is
    // missing there, but getRandomValues is always available.
    vi.stubGlobal('crypto', {
      getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
    })
    const first = randomId()
    const second = randomId()
    expect(first).toMatch(UUID_V4)
    expect(second).toMatch(UUID_V4)
    expect(first).not.toBe(second)
  })
})
