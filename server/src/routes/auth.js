// Auth routes: register / login / me.
//
// Passwords are hashed with bcrypt (never stored plaintext, never SHA-256).
// On register/login we sign a JWT carrying { sub: userId, username }; the client
// sends it back as `Authorization: Bearer <token>` on subsequent requests.

import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { stmts } from '../db.js'
import { config } from '../config.js'

// Shape the DB row into the public user object the frontend expects.
function publicUser(row) {
  return { id: row.id, username: row.username, createdAt: row.created_at }
}

export default async function authRoutes(fastify, options = {}) {
  const routeConfig = options.config ?? config
  const routeStmts = options.stmts ?? stmts

  // POST /api/auth/register  { username, password } -> { user, token }
  fastify.post('/register', async (request, reply) => {
    const username = String(request.body?.username ?? '').trim()
    const password = String(request.body?.password ?? '')

    if (username.length < 2) return reply.code(400).send({ error: '用户名至少 2 个字符' })
    if (password.length < 4) return reply.code(400).send({ error: '密码至少 4 个字符' })

    if (routeStmts.userByName.get(username)) {
      return reply.code(409).send({ error: '该用户名已被占用' })
    }

    const row = {
      id: randomUUID(),
      username,
      pw_hash: await bcrypt.hash(password, routeConfig.bcryptCost),
      created_at: Date.now(),
    }
    routeStmts.insertUser.run(row)

    const token = await reply.jwtSign({ sub: row.id, username: row.username })
    return { user: publicUser(row), token }
  })

  // POST /api/auth/login  { username, password } -> { user, token }
  fastify.post('/login', async (request, reply) => {
    const username = String(request.body?.username ?? '').trim()
    const password = String(request.body?.password ?? '')

    const row = routeStmts.userByName.get(username)
    // Compare even when the user is missing? bcrypt needs a hash; just fail fast
    // but keep the same generic message so we don't leak which usernames exist.
    if (!row || !(await bcrypt.compare(password, row.pw_hash))) {
      return reply.code(401).send({ error: '用户名或密码不正确' })
    }

    const token = await reply.jwtSign({ sub: row.id, username: row.username })
    return { user: publicUser(row), token }
  })

  // GET /api/auth/me -> { user }   (requires a valid token)
  fastify.get('/me', { preHandler: fastify.authenticate }, async (request, reply) => {
    const row = routeStmts.userById.get(request.user.sub)
    if (!row) return reply.code(401).send({ error: '用户不存在' })
    return { user: publicUser(row) }
  })
}
