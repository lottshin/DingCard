// Draft routes: list / get / upsert / delete — all scoped to the JWT's user.
//
// Every query filters on user_id taken from the token (request.user.sub), never
// from the request body, so one user can't read or clobber another's drafts.

import { randomUUID } from 'node:crypto'
import { stmts } from '../db.js'

// DB row (snake_case) -> frontend Draft (camelCase). profile is stored as a JSON
// string; parse it back into the object the client expects.
function toDraft(row) {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    platformId: row.platform_id,
    themeId: row.theme_id,
    fontFamily: row.font_family,
    profile: JSON.parse(row.profile),
    updatedAt: row.updated_at,
  }
}

// Derive a human title from the first non-empty line of the source.
function deriveTitle(source) {
  const line = String(source)
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0)
  if (!line) return '未命名草稿'
  return line.length > 24 ? line.slice(0, 24) + '…' : line
}

export default async function draftRoutes(fastify) {
  // Everything here requires a logged-in user.
  fastify.addHook('preHandler', fastify.authenticate)

  // GET /api/drafts -> Draft[]  (newest first)
  fastify.get('/', async (request) => {
    return stmts.listDrafts.all(request.user.sub).map(toDraft)
  })

  // GET /api/drafts/:id -> Draft
  fastify.get('/:id', async (request, reply) => {
    const row = stmts.draftById.get(request.params.id, request.user.sub)
    if (!row) return reply.code(404).send({ error: '草稿不存在' })
    return toDraft(row)
  })

  // POST /api/drafts  { ...draft }  -> Draft   (upsert: new id if none supplied)
  fastify.post('/', async (request) => {
    const b = request.body ?? {}
    const row = {
      id: b.id || randomUUID(),
      user_id: request.user.sub,
      title: (b.title || '').trim() || deriveTitle(b.source ?? ''),
      source: b.source ?? '',
      platform_id: b.platformId ?? '',
      theme_id: b.themeId ?? '',
      font_family: b.fontFamily ?? '',
      profile: JSON.stringify(b.profile ?? {}),
      updated_at: Date.now(),
    }
    stmts.upsertDraft.run(row)
    return toDraft(row)
  })

  // DELETE /api/drafts/:id -> { ok: true }
  fastify.delete('/:id', async (request) => {
    stmts.deleteDraft.run(request.params.id, request.user.sub)
    return { ok: true }
  })
}
