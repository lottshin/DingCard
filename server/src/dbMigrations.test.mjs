import assert from 'node:assert/strict'
import test from 'node:test'

import Database from 'better-sqlite3'

import { ensureImageLeaseSchema } from './dbMigrations.js'

function createLegacyImagesDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      path TEXT NOT NULL,
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)
  return db
}

test('ensureImageLeaseSchema adds the lease column and backfills legacy rows', () => {
  const db = createLegacyImagesDb()
  db.prepare(`
    INSERT INTO images (id, user_id, path, mime, bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('image-1', 'user-1', '/uploads/image-1.png', 'image/png', 12, 100)

  ensureImageLeaseSchema(db, 1_000, 500)

  const columns = db.prepare('PRAGMA table_info(images)').all()
  assert.ok(columns.some((column) => column.name === 'lease_expires_at'))
  assert.deepEqual(
    db.prepare('SELECT id, lease_expires_at FROM images').get(),
    { id: 'image-1', lease_expires_at: 1_500 },
  )
  db.close()
})

test('ensureImageLeaseSchema is idempotent and never shortens a future lease', () => {
  const db = createLegacyImagesDb()
  ensureImageLeaseSchema(db, 1_000, 500)
  db.prepare(`
    INSERT INTO images (id, user_id, path, mime, bytes, created_at, lease_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('image-2', 'user-1', '/uploads/image-2.png', 'image/png', 12, 100, 9_000)

  ensureImageLeaseSchema(db, 1_000, 500)

  assert.equal(
    db.prepare('SELECT lease_expires_at FROM images WHERE id = ?').pluck().get('image-2'),
    9_000,
  )
  assert.equal(
    db.prepare("SELECT COUNT(*) FROM pragma_table_info('images') WHERE name = 'lease_expires_at'").pluck().get(),
    1,
  )
  db.close()
})

test('ensureImageLeaseSchema migrates an empty legacy table', () => {
  const db = createLegacyImagesDb()

  ensureImageLeaseSchema(db, 1_000, 500)

  assert.equal(
    db.prepare("SELECT COUNT(*) FROM pragma_table_info('images') WHERE name = 'lease_expires_at'").pluck().get(),
    1,
  )
  assert.equal(db.prepare('SELECT COUNT(*) FROM images').pluck().get(), 0)
  db.close()
})

test('ensureImageLeaseSchema rejects invalid lease inputs with stable errors', () => {
  const db = createLegacyImagesDb()

  assert.throws(
    () => ensureImageLeaseSchema(db, Number.NaN, 500),
    { name: 'TypeError', message: 'now must be a finite number' },
  )
  assert.throws(
    () => ensureImageLeaseSchema(db, 1_000, '500'),
    { name: 'TypeError', message: 'leaseMs must be a finite number' },
  )
  assert.throws(
    () => ensureImageLeaseSchema(db, 1_000, -1),
    { name: 'RangeError', message: 'leaseMs must be non-negative' },
  )
  db.close()
})
