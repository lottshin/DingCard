// Auth plugin: registers @fastify/jwt and exposes an `authenticate` preHandler.
//
// Routes that need a logged-in user add `{ preHandler: fastify.authenticate }`.
// On success `request.user` holds the JWT payload ({ sub: userId, username }).

import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { config } from '../config.js'

async function authPlugin(fastify, options = {}) {
  const authConfig = options.config ?? config
  fastify.register(jwt, {
    secret: authConfig.jwtSecret,
    sign: { expiresIn: authConfig.jwtExpiry },
  })

  // preHandler that rejects the request with 401 if the token is missing/invalid.
  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ error: '未登录或登录已过期' })
    }
  })
}

export default fp(authPlugin)
