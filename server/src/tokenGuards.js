// Scope guards for API tokens. They read `request.user` after whichever
// authenticate preHandler ran, so they work with the real auth plugin and the
// route tests' stand-ins alike.

/** Reject a token without the route's scope; a user session keeps full access. */
export function requireScope(scope) {
  return async (request, reply) => {
    if (request.user?.via === 'token' && !(request.user.scopes ?? []).includes(scope)) {
      return reply.code(403).send({
        error: `令牌没有 ${scope} 权限`,
        code: 'TOKEN_SCOPE_DENIED',
      })
    }
  }
}

/** Token management stays with the browser session: a token must not mint tokens. */
export async function sessionOnly(request, reply) {
  if (request.user?.via === 'token') {
    return reply.code(403).send({
      error: 'API 令牌不能管理令牌',
      code: 'TOKEN_MANAGEMENT_DENIED',
    })
  }
}
