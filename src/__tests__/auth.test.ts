import { afterEach, describe, expect, it, vi } from 'vitest'
import { current } from '../auth'

const USERS_KEY = 'slicer.users.v1'
const SESSION_KEY = 'slicer.session.v1'

function stubStorage(values: Record<string, string | null>) {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values[key] ?? null),
  })
}

describe('current auth user fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['non-array JSON', '{}'],
    ['null JSON', 'null'],
    ['records with invalid fields', '[{"id":1,"username":null}]'],
  ])('returns null for %s instead of crashing app startup', (_label, users) => {
    stubStorage({
      [USERS_KEY]: users,
      [SESSION_KEY]: 'user-1',
    })

    expect(current()).toBeNull()
  })

  it('returns null when storage access itself fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new DOMException('storage blocked', 'SecurityError')
      }),
    })

    expect(current()).toBeNull()
  })

  it('returns the valid session user while ignoring malformed records', () => {
    stubStorage({
      [USERS_KEY]: JSON.stringify([
        { id: 1, username: null },
        { id: 'user-1', username: 'Alice', createdAt: 42, pwHash: 'hash' },
      ]),
      [SESSION_KEY]: 'user-1',
    })

    expect(current()).toEqual({ id: 'user-1', username: 'Alice', createdAt: 42 })
  })
})
