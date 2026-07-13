// Draft routes: list / get / upsert / delete — all scoped to the JWT's user.
//
// Drafts are opaque versioned envelopes: { id, title, schemaVersion, mode,
// document, updatedAt }. The server never interprets `document` — it stores the
// whole thing as JSON and hands it back verbatim. This keeps the backend stable
// no matter how the frontend document shapes (markdown-card / freeform-slide)
// evolve. Every query filters on user_id from the token (request.user.sub),
// never from the request body, so one user can't read or clobber another's.

import { randomUUID } from 'node:crypto'
import { stmts } from '../db.js'

const KNOWN_MODES = new Set(['markdown-card', 'freeform-slide'])

// DB row (snake_case, document as JSON string) -> frontend Draft envelope.
function toDraft(row) {
  return {
    id: row.id,
    title: row.title,
    schemaVersion: row.schema_version,
    mode: row.mode,
    document: JSON.parse(row.document),
    updatedAt: row.updated_at,
  }
}

// Derive a human title from a markdown document's first non-empty line.
function deriveMarkdownTitle(document) {
  const source = typeof document?.source === 'string' ? document.source : ''
  const line = source
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0)
  if (!line) return '未命名草稿'
  return line.length > 24 ? line.slice(0, 24) + '…' : line
}

// Derive a title from a freeform document (first slide's name).
function deriveFreeformTitle(document) {
  const name = document?.slides?.[0]?.name
  return (typeof name === 'string' && name.trim()) || '自由编辑作品'
}

function deriveTitle(mode, document) {
  return mode === 'freeform-slide' ? deriveFreeformTitle(document) : deriveMarkdownTitle(document)
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

  // POST /api/drafts  { ...envelope }  -> Draft   (upsert: new id if none supplied)
  fastify.post('/', async (request, reply) => {
    const b = request.body ?? {}

    const mode = KNOWN_MODES.has(b.mode) ? b.mode : null
    if (!mode) return reply.code(400).send({ error: '未知的草稿类型' })
    if (b.document == null || typeof b.document !== 'object') {
      return reply.code(400).send({ error: '缺少草稿内容' })
    }

    const row = {
      id: b.id || randomUUID(),
      user_id: request.user.sub,
      title: (typeof b.title === 'string' && b.title.trim()) || deriveTitle(mode, b.document),
      mode,
      schema_version: Number.isFinite(b.schemaVersion) ? b.schemaVersion : 2,
      document: JSON.stringify(b.document),
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
