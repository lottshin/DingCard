// SQLite factory. The default exports remain compatible, but are lazy so
// importing application modules does not create a database as a side effect.

import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { config as defaultConfig } from './config.js'
import { ensureImageLeaseSchema } from './dbMigrations.js'

export function createDatabase(appConfig = defaultConfig) {
  fs.mkdirSync(path.dirname(appConfig.dbPath), { recursive: true })
  fs.mkdirSync(appConfig.uploadsDir, { recursive: true })

  let database
  try {
    database = new Database(appConfig.dbPath)
    database.pragma('journal_mode = WAL')
    database.pragma('foreign_keys = ON')

    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id          TEXT PRIMARY KEY,
        username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pw_hash     TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS drafts (
        id             TEXT PRIMARY KEY,
        user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title          TEXT NOT NULL,
        mode           TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        document       TEXT NOT NULL,
        updated_at     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_drafts_user ON drafts(user_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS images (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        path             TEXT NOT NULL,
        mime             TEXT NOT NULL,
        bytes            INTEGER NOT NULL,
        created_at       INTEGER NOT NULL,
        lease_expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_images_user ON images(user_id);

      -- A library asset is a named pointer at one of the user's managed uploads.
      -- Image GC treats every asset path as referenced.
      CREATE TABLE IF NOT EXISTS assets (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        image_path  TEXT NOT NULL,
        name        TEXT NOT NULL,
        width       INTEGER NOT NULL,
        height      INTEGER NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id, created_at DESC);

      -- A share is an unguessable link showing a deck's exported pages. The
      -- pages are the user's managed uploads; image GC treats every share image
      -- path as referenced while the share row exists (revoking deletes it).
      CREATE TABLE IF NOT EXISTS shares (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token       TEXT NOT NULL UNIQUE,
        title       TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        expires_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS share_images (
        share_id    TEXT NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
        position    INTEGER NOT NULL,
        image_path  TEXT NOT NULL,
        PRIMARY KEY (share_id, position)
      );
      CREATE INDEX IF NOT EXISTS idx_share_images_path ON share_images(image_path);

      -- An API token is a scoped key an agent presents as a Bearer token
      -- instead of a user session; the value is shown once and only its
      -- SHA-256 hash is stored. Revocation keeps the row for the audit trail.
      CREATE TABLE IF NOT EXISTS api_tokens (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash   TEXT NOT NULL UNIQUE,
        name         TEXT NOT NULL,
        scopes       TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        last_used_at INTEGER,
        revoked_at   INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id, created_at DESC);
    `)

    ensureImageLeaseSchema(database, Date.now(), appConfig.imageLeaseMs)

    const imageByUserPath = database.prepare(
      'SELECT * FROM images WHERE user_id = ? AND path = ?',
    )
    const renewImageLease = database.prepare(`
      UPDATE images
      SET lease_expires_at = ?
      WHERE user_id = ? AND path = ?
    `)

    const renewImageLeases = database.transaction((userId, managedPaths, leaseExpiresAt) => {
      for (const managedPath of managedPaths) {
        if (!imageByUserPath.get(userId, managedPath)) {
          return { ok: false, changes: 0 }
        }
      }

      let changes = 0
      for (const managedPath of managedPaths) {
        changes += renewImageLease.run(leaseExpiresAt, userId, managedPath).changes
      }
      return { ok: true, changes }
    })

    const stmts = {
      insertUser: database.prepare(
        'INSERT INTO users (id, username, pw_hash, created_at) VALUES (@id, @username, @pw_hash, @created_at)',
      ),
      userByName: database.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
      userById: database.prepare('SELECT * FROM users WHERE id = ?'),

      listDrafts: database.prepare('SELECT * FROM drafts WHERE user_id = ? ORDER BY updated_at DESC'),
      draftById: database.prepare('SELECT * FROM drafts WHERE id = ? AND user_id = ?'),
      insertDraft: database.prepare(`
        INSERT INTO drafts (id, user_id, title, mode, schema_version, document, updated_at)
        VALUES (@id, @user_id, @title, @mode, @schema_version, @document, @updated_at)
      `),
      updateDraft: database.prepare(`
        UPDATE drafts SET
          title = @title, mode = @mode, schema_version = @schema_version,
          document = @document, updated_at = @updated_at
        WHERE id = @id AND user_id = @user_id
      `),
      deleteDraft: database.prepare('DELETE FROM drafts WHERE id = ? AND user_id = ?'),

      insertImage: database.prepare(`
        INSERT INTO images (id, user_id, path, mime, bytes, created_at, lease_expires_at)
        VALUES (@id, @user_id, @path, @mime, @bytes, @created_at, @lease_expires_at)
      `),
      imageById: database.prepare('SELECT * FROM images WHERE id = ? AND user_id = ?'),
      imageByUserPath,
      listImages: database.prepare('SELECT * FROM images WHERE user_id = ? ORDER BY created_at ASC'),
      listDraftDocuments: database.prepare('SELECT document FROM drafts WHERE user_id = ?'),
      renewImageLeases,
      deleteImage: database.prepare('DELETE FROM images WHERE id = ? AND user_id = ?'),
      userImageBytes: database.prepare(
        'SELECT COALESCE(SUM(bytes), 0) AS total FROM images WHERE user_id = ?',
      ),

      listAssets: database.prepare(`
        SELECT assets.*, images.bytes AS bytes
        FROM assets
        LEFT JOIN images ON images.user_id = assets.user_id AND images.path = assets.image_path
        WHERE assets.user_id = ?
        ORDER BY assets.created_at DESC
      `),
      assetById: database.prepare(`
        SELECT assets.*, images.bytes AS bytes
        FROM assets
        LEFT JOIN images ON images.user_id = assets.user_id AND images.path = assets.image_path
        WHERE assets.id = ? AND assets.user_id = ?
      `),
      insertAsset: database.prepare(`
        INSERT INTO assets (id, user_id, image_path, name, width, height, created_at)
        VALUES (@id, @user_id, @image_path, @name, @width, @height, @created_at)
      `),
      renameAsset: database.prepare('UPDATE assets SET name = ? WHERE id = ? AND user_id = ?'),
      deleteAsset: database.prepare('DELETE FROM assets WHERE id = ? AND user_id = ?'),
      listAssetPaths: database.prepare('SELECT image_path FROM assets WHERE user_id = ?'),

      shareByToken: database.prepare('SELECT * FROM shares WHERE token = ?'),
      shareImages: database.prepare(
        'SELECT image_path FROM share_images WHERE share_id = ? ORDER BY position',
      ),
      listShares: database.prepare(`
        SELECT shares.*, COUNT(share_images.position) AS image_count
        FROM shares
        LEFT JOIN share_images ON share_images.share_id = shares.id
        WHERE shares.user_id = ?
        GROUP BY shares.id
        ORDER BY shares.created_at DESC
      `),
      deleteShare: database.prepare('DELETE FROM shares WHERE id = ? AND user_id = ?'),
      listSharePaths: database.prepare(`
        SELECT share_images.image_path AS image_path
        FROM share_images
        JOIN shares ON shares.id = share_images.share_id
        WHERE shares.user_id = ?
      `),
      createShare: database.transaction((shareRow, imagePaths) => {
        database.prepare(`
          INSERT INTO shares (id, user_id, token, title, created_at, expires_at)
          VALUES (@id, @user_id, @token, @title, @created_at, @expires_at)
        `).run(shareRow)
        for (let position = 0; position < imagePaths.length; position++) {
          database.prepare(
            'INSERT INTO share_images (share_id, position, image_path) VALUES (?, ?, ?)',
          ).run(shareRow.id, position, imagePaths[position])
        }
      }),

      apiTokenByHash: database.prepare(
        'SELECT * FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL',
      ),
      listApiTokens: database.prepare(
        'SELECT * FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC',
      ),
      insertApiToken: database.prepare(`
        INSERT INTO api_tokens (id, user_id, token_hash, name, scopes, created_at)
        VALUES (@id, @user_id, @token_hash, @name, @scopes, @created_at)
      `),
      revokeApiToken: database.prepare(
        'UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
      ),
      touchApiToken: database.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?'),
    }

    return { db: database, stmts }
  } catch (error) {
    try {
      database?.close()
    } catch {
      // Preserve the original initialization error.
    }
    throw error
  }
}

let defaultResources
function getDefaultResources() {
  defaultResources ??= createDatabase(defaultConfig)
  return defaultResources
}

function lazyResource(name) {
  return new Proxy(Object.create(null), {
    get(_target, property) {
      const resource = getDefaultResources()[name]
      const value = Reflect.get(resource, property, resource)
      return typeof value === 'function' ? value.bind(resource) : value
    },
    set(_target, property, value) {
      getDefaultResources()[name][property] = value
      return true
    },
    has(_target, property) {
      return property in getDefaultResources()[name]
    },
    ownKeys() {
      return Reflect.ownKeys(getDefaultResources()[name])
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Object.getOwnPropertyDescriptor(getDefaultResources()[name], property)
      return descriptor ? { ...descriptor, configurable: true } : undefined
    },
  })
}

export const db = lazyResource('db')
export const stmts = lazyResource('stmts')
