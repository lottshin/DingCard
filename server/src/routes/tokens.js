// API token routes: mint, list, and revoke the scoped keys agents present as
// a Bearer token instead of a user session. Only a signed-in browser session
// may manage them (a token must not mint tokens); the value is returned
// exactly once at creation and only its hash is stored.

import { randomUUID } from 'node:crypto'

import { TOKEN_SCOPES, apiTokenHash, newApiTokenValue } from '../apiToken.js'
import { stmts } from '../db.js'
import { sessionOnly } from '../tokenGuards.js'

const NAME_MAX = 60
const MAX_TOKENS = 10

function toApiToken(row) {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes.split(',').filter(Boolean),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

function tokenName(value) {
  if (typeof value !== 'string') return null
  const name = Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('')
  return name === '' ? null : name
}

function tokenScopes(value) {
  if (!Array.isArray(value) || value.length === 0) return null
  const scopes = []
  for (const scope of value) {
    if (typeof scope !== 'string' || !TOKEN_SCOPES.includes(scope)) return null
    if (!scopes.includes(scope)) scopes.push(scope)
  }
  return scopes
}

export default async function tokenRoutes(fastify, options = {}) {
  const routeStmts = options.stmts ?? stmts
  const now = options.now ?? Date.now
  const createValue = options.createApiTokenValue ?? newApiTokenValue

  fastify.addHook('preHandler', fastify.authenticate)
  fastify.addHook('preHandler', sessionOnly)

  // POST /api/tokens  { name, scopes }  ->  { id, name, scopes, createdAt, token }
  fastify.post('/', async (request, reply) => {
    const body = request.body ?? {}
    const name = tokenName(body.name)
    if (!name) return reply.code(400).send({ error: '令牌名称不能为空' })
    const scopes = tokenScopes(body.scopes)
    if (!scopes) {
      return reply.code(400).send({
        error: `scopes 必须是这些权限的非空子集：${TOKEN_SCOPES.join('、')}`,
      })
    }

    const userId = request.user.sub
    if (routeStmts.listApiTokens.all(userId).length >= MAX_TOKENS) {
      return reply.code(409).send({
        error: `最多同时保留 ${MAX_TOKENS} 个令牌，先撤销一个`,
        code: 'TOKEN_LIMIT_EXCEEDED',
      })
    }

    const row = {
      id: randomUUID(),
      user_id: userId,
      token_hash: '',
      name,
      scopes: scopes.join(','),
      created_at: now(),
    }
    // A value collision fails the UNIQUE constraint; retry with a fresh one.
    let value
    for (let attempt = 0; ; attempt++) {
      value = createValue()
      row.token_hash = apiTokenHash(value)
      try {
        routeStmts.insertApiToken.run(row)
        break
      } catch (err) {
        if (attempt >= 2 || !String(err?.code || '').includes('CONSTRAINT')) throw err
      }
    }
    return { id: row.id, name, scopes, createdAt: row.created_at, token: value }
  })

  // GET /api/tokens -> ApiToken[]  (newest first; never the values)
  fastify.get('/', async (request) => {
    return routeStmts.listApiTokens.all(request.user.sub).map(toApiToken)
  })

  // DELETE /api/tokens/:id -> { ok: true }; the token stops authenticating.
  fastify.delete('/:id', async (request, reply) => {
    const result = routeStmts.revokeApiToken.run(now(), request.params.id, request.user.sub)
    if (result.changes === 0) return reply.code(404).send({ error: '令牌不存在' })
    return { ok: true }
  })
}
