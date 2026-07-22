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
