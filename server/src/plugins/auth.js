// Auth plugin: registers @fastify/jwt and exposes the `authenticate`
// preHandler.
//
// Routes that need a logged-in user add `{ preHandler: fastify.authenticate }`.
// On success `request.user` holds the JWT payload ({ sub: userId, username })
// or, for a Bearer API token (dc_…), { sub: userId, via: 'token', scopes }.
// API tokens are scoped elsewhere (server/src/tokenGuards.js); a JWT session
// is the user in person and is never scope-checked.

import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'

import { TOKEN_PREFIX, apiTokenHash } from '../apiToken.js'
import { config } from '../config.js'
import { stmts } from '../db.js'

// Stamp last_used_at at most once a minute: every request would rewrite the
// row for nothing.
const LAST_USED_GRANULARITY_MS = 60_000

async function authPlugin(fastify, options = {}) {
  const authConfig = options.config ?? config
  const routeStmts = options.stmts ?? stmts
  const now = options.now ?? Date.now
  fastify.register(jwt, {
    secret: authConfig.jwtSecret,
    sign: { expiresIn: authConfig.jwtExpiry },
  })

  // preHandler that rejects the request with 401 if the token is missing/invalid.
  fastify.decorate('authenticate', async (request, reply) => {
    const header = request.headers.authorization
    const value = typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : null
    if (value !== null && value.startsWith(TOKEN_PREFIX)) {
      const row = routeStmts.apiTokenByHash.get(apiTokenHash(value))
      if (!row) {
        return reply.code(401).send({ error: '未登录或登录已过期' })
      }
      if (row.last_used_at === null || now() - row.last_used_at >= LAST_USED_GRANULARITY_MS) {
        routeStmts.touchApiToken.run(now(), row.id)
      }
      request.user = {
        sub: row.user_id,
        via: 'token',
        scopes: row.scopes.split(',').filter(Boolean),
      }
      return
    }
    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ error: '未登录或登录已过期' })
    }
  })
}

export default fp(authPlugin)
