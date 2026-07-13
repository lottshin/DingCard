// SQLite layer. One file DB via better-sqlite3 (synchronous, fast, zero-config).
//
// Schema matches docs/backend-plan.md §3. Images store only a pointer (path +
// bytes); the binary lives on disk under uploadsDir and is served by Nginx.

import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

// Ensure data + uploads dirs exist before opening the db.
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })
fs.mkdirSync(config.uploadsDir, { recursive: true })

export const db = new Database(config.dbPath)

// WAL: better concurrent reads. foreign_keys: make ON DELETE CASCADE work.
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pw_hash     TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  -- Drafts are stored as opaque versioned envelopes. The backend is a dumb
  -- store: it never interprets what's inside the document column (a JSON string
  -- holding the whole workspace document — markdown-card OR freeform-slide).
  -- This keeps the schema stable however the frontend document shapes evolve.
  CREATE TABLE IF NOT EXISTS drafts (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    mode           TEXT NOT NULL,        -- 'markdown-card' | 'freeform-slide'
    schema_version INTEGER NOT NULL,
    document       TEXT NOT NULL,        -- entire document, JSON string
    updated_at     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_drafts_user ON drafts(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS images (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path        TEXT NOT NULL,
    mime        TEXT NOT NULL,
    bytes       INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_images_user ON images(user_id);
`)

// --- Prepared statements (compiled once, reused) ---------------------------

export const stmts = {
  // users
  insertUser: db.prepare(
    `INSERT INTO users (id, username, pw_hash, created_at) VALUES (@id, @username, @pw_hash, @created_at)`,
  ),
  userByName: db.prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`),
  userById: db.prepare(`SELECT * FROM users WHERE id = ?`),

  // drafts (generic versioned envelope; `document` is opaque JSON to the server)
  listDrafts: db.prepare(`SELECT * FROM drafts WHERE user_id = ? ORDER BY updated_at DESC`),
  draftById: db.prepare(`SELECT * FROM drafts WHERE id = ? AND user_id = ?`),
  upsertDraft: db.prepare(`
    INSERT INTO drafts (id, user_id, title, mode, schema_version, document, updated_at)
    VALUES (@id, @user_id, @title, @mode, @schema_version, @document, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      title = @title, mode = @mode, schema_version = @schema_version,
      document = @document, updated_at = @updated_at
  `),
  deleteDraft: db.prepare(`DELETE FROM drafts WHERE id = ? AND user_id = ?`),

  // images
  insertImage: db.prepare(`
    INSERT INTO images (id, user_id, path, mime, bytes, created_at)
    VALUES (@id, @user_id, @path, @mime, @bytes, @created_at)
  `),
  imageById: db.prepare(`SELECT * FROM images WHERE id = ? AND user_id = ?`),
  userImageBytes: db.prepare(
    `SELECT COALESCE(SUM(bytes), 0) AS total FROM images WHERE user_id = ?`,
  ),
}
