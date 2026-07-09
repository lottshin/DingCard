// Client-only "auth" backed by localStorage.
//
// ⚠️ THIS IS NOT REAL AUTHENTICATION. There is no backend: accounts, password
// hashes, and the active session all live in the browser. Anyone with devtools
// can read or forge them, and nothing syncs across devices. It exists purely as
// a UX shell — named accounts + per-user draft namespaces — so it can later be
// swapped for a real auth API without touching the calling code.
//
// The public surface (register/login/logout/current) is deliberately shaped
// like an async API so a server implementation can drop in behind it.

const USERS_KEY = 'slicer.users.v1'
const SESSION_KEY = 'slicer.session.v1'

export interface User {
  id: string
  username: string
  createdAt: number
}

// Stored record includes a weak hash; kept separate from the User we hand out.
interface StoredUser extends User {
  pwHash: string
}

function loadUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

/**
 * Non-cryptographic hash. This does NOT protect the password — it only avoids
 * storing it as literal plaintext. A real backend must use bcrypt/argon2 etc.
 */
async function weakHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function publicUser(u: StoredUser): User {
  return { id: u.id, username: u.username, createdAt: u.createdAt }
}

export async function register(username: string, password: string): Promise<User> {
  const name = username.trim()
  if (name.length < 2) throw new Error('用户名至少 2 个字符')
  if (password.length < 4) throw new Error('密码至少 4 个字符')

  const users = loadUsers()
  if (users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
    throw new Error('该用户名已被占用')
  }

  const user: StoredUser = {
    id: crypto.randomUUID(),
    username: name,
    createdAt: Date.now(),
    pwHash: await weakHash(password),
  }
  users.push(user)
  saveUsers(users)
  localStorage.setItem(SESSION_KEY, user.id)
  return publicUser(user)
}

export async function login(username: string, password: string): Promise<User> {
  const users = loadUsers()
  const user = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())
  if (!user) throw new Error('用户名或密码不正确')
  if (user.pwHash !== (await weakHash(password))) throw new Error('用户名或密码不正确')
  localStorage.setItem(SESSION_KEY, user.id)
  return publicUser(user)
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

/** The currently signed-in user, or null. Reads synchronously from storage. */
export function current(): User | null {
  const id = localStorage.getItem(SESSION_KEY)
  if (!id) return null
  const user = loadUsers().find((u) => u.id === id)
  return user ? publicUser(user) : null
}
