// Draft routes: list / get / create-or-update / delete — all scoped to the JWT's user.
//
// Drafts are opaque versioned envelopes: { id, title, schemaVersion, mode,
// document, updatedAt }. The server never interprets `document` — it stores the
// whole thing as JSON and hands it back verbatim. This keeps the backend stable
// no matter how the frontend document shapes (markdown-card / freeform-slide)
// evolve. Every query filters on user_id from the token (request.user.sub),
// never from the request body, so one user can't read or clobber another's.

import { randomUUID } from 'node:crypto'
import { stmts } from '../db.js'
import { requireScope } from '../tokenGuards.js'

const KNOWN_MODES = new Set(['markdown-card', 'freeform-slide'])

// A saved document may carry pictures as data URLs (an agent's write-back
// embeds them), so the same headroom as the deck render route applies.
const MAX_BODY_BYTES = 8 * 1024 * 1024

// Version history: an editor autosaves every few seconds, so a snapshot is
// only taken when the newest one is older than this, keeping this many.
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000
const MAX_VERSIONS = 30

/**
 * Freeze a draft's previous content before it is overwritten: at most one
 * snapshot per interval, keeping the newest MAX_VERSIONS. The version's
 * created_at is the content's own updated_at, so the list reads "the version
 * as of that time".
 */
function snapshotDraftVersion(routeStmts, previous, at) {
  const latest = routeStmts.latestDraftVersionAt.get(previous.id, previous.user_id)
  if (latest && at - latest.created_at < SNAPSHOT_INTERVAL_MS) return
  routeStmts.insertDraftVersion.run({
    id: randomUUID(),
    draft_id: previous.id,
    user_id: previous.user_id,
    title: previous.title,
    mode: previous.mode,
    schema_version: previous.schema_version,
    document: previous.document,
    created_at: previous.updated_at,
  })
  routeStmts.pruneDraftVersions.run(previous.id, previous.user_id, previous.id, previous.user_id, MAX_VERSIONS)
}

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

export default async function draftRoutes(fastify, options = {}) {
  if (typeof options.assetLock?.run !== 'function') {
    throw new TypeError('options.assetLock.run must be a function')
  }
  if (typeof options.reclaimImages !== 'function') {
    throw new TypeError('options.reclaimImages must be a function')
  }

  const routeStmts = options.stmts ?? stmts
  const now = options.now ?? Date.now
  const { assetLock, reclaimImages } = options

  // Everything here requires a logged-in user.
  fastify.addHook('preHandler', fastify.authenticate)
  // API tokens are scoped; a browser session is never checked here.
  fastify.addHook('preHandler', requireScope('drafts'))

  // GET /api/drafts -> Draft[]  (newest first)
  fastify.get('/', async (request) => {
    return routeStmts.listDrafts.all(request.user.sub).map(toDraft)
  })

  // GET /api/drafts/:id -> Draft
  fastify.get('/:id', async (request, reply) => {
    const row = routeStmts.draftById.get(request.params.id, request.user.sub)
    if (!row) return reply.code(404).send({ error: '草稿不存在' })
    return toDraft(row)
  })

  // POST /api/drafts  { ...envelope }  -> Draft
  // Omitted id creates a draft; a supplied id updates only the current user's draft.
  fastify.post('/', { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    const b = request.body ?? {}

    const mode = KNOWN_MODES.has(b.mode) ? b.mode : null
    if (!mode) return reply.code(400).send({ error: '未知的草稿类型' })
    if (b.document == null || typeof b.document !== 'object') {
      return reply.code(400).send({ error: '缺少草稿内容' })
    }

    const hasId = Object.prototype.hasOwnProperty.call(b, 'id')
    if (hasId && (typeof b.id !== 'string' || !b.id.trim())) {
      return reply.code(400).send({ error: '无效的草稿 ID' })
    }

    const row = {
      id: hasId ? b.id.trim() : randomUUID(),
      user_id: request.user.sub,
      title: (typeof b.title === 'string' && b.title.trim()) || deriveTitle(mode, b.document),
      mode,
      schema_version: Number.isFinite(b.schemaVersion) ? b.schemaVersion : 2,
      document: JSON.stringify(b.document),
      updated_at: now(),
    }

    return assetLock.run(request.user.sub, async () => {
      if (hasId) {
        const previous = routeStmts.draftById.get(row.id, row.user_id)
        if (!previous) {
          return reply.code(404).send({ error: '草稿不存在' })
        }
        snapshotDraftVersion(routeStmts, previous, row.updated_at)
        const result = await routeStmts.updateDraft.run(row)
        if (result.changes === 0) {
          return reply.code(404).send({ error: '草稿不存在' })
        }
      } else {
        await routeStmts.insertDraft.run(row)
      }
      return toDraft(row)
    })
  })

  // GET /api/drafts/:id/versions -> version metadata, newest first
  // (documents stay behind their own endpoint; a version list is cheap).
  fastify.get('/:id/versions', async (request, reply) => {
    const draft = routeStmts.draftById.get(request.params.id, request.user.sub)
    if (!draft) return reply.code(404).send({ error: '草稿不存在' })
    return routeStmts.listDraftVersions.all(draft.id, request.user.sub).map((version) => ({
      id: version.id,
      title: version.title,
      mode: version.mode,
      schemaVersion: version.schema_version,
      createdAt: version.created_at,
    }))
  })

  // GET /api/drafts/:id/versions/:versionId -> the full version envelope
  fastify.get('/:id/versions/:versionId', async (request, reply) => {
    const draft = routeStmts.draftById.get(request.params.id, request.user.sub)
    if (!draft) return reply.code(404).send({ error: '草稿不存在' })
    const version = routeStmts.draftVersionById.get(request.params.versionId, draft.id, request.user.sub)
    if (!version) return reply.code(404).send({ error: '版本不存在' })
    return {
      id: version.id,
      title: version.title,
      mode: version.mode,
      schemaVersion: version.schema_version,
      document: JSON.parse(version.document),
      createdAt: version.created_at,
    }
  })

  // POST /api/drafts/:id/versions/:versionId/restore -> Draft
  // Writes the version's content back as the current draft; the content being
  // replaced becomes a version too (the same interval applies).
  fastify.post('/:id/versions/:versionId/restore', async (request, reply) => {
    const userId = request.user.sub
    return assetLock.run(userId, async () => {
      const draft = routeStmts.draftById.get(request.params.id, userId)
      if (!draft) return reply.code(404).send({ error: '草稿不存在' })
      const version = routeStmts.draftVersionById.get(request.params.versionId, draft.id, userId)
      if (!version) return reply.code(404).send({ error: '版本不存在' })
      snapshotDraftVersion(routeStmts, draft, now())
      const row = {
        id: draft.id,
        user_id: userId,
        title: version.title,
        mode: version.mode,
        schema_version: version.schema_version,
        document: version.document,
        updated_at: now(),
      }
      await routeStmts.updateDraft.run(row)
      return toDraft(row)
    })
  })

  // DELETE /api/drafts/:id -> { ok: true }
  fastify.delete('/:id', async (request) => {
    const userId = request.user.sub
    return assetLock.run(userId, async () => {
      await routeStmts.deleteDraft.run(request.params.id, userId)
      await routeStmts.deleteDraftVersions.run(request.params.id, userId)
      try {
        await reclaimImages(userId)
      } catch (err) {
        try {
          fastify.log.error({ err, userId }, 'image GC failed after draft deletion')
        } catch {
          // The completed draft deletion remains authoritative even if logging fails.
        }
      }
      return { ok: true }
    })
  })
}
