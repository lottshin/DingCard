function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`)
  }
}

export function ensureImageLeaseSchema(db, now, leaseMs) {
  assertFiniteNumber(now, 'now')
  assertFiniteNumber(leaseMs, 'leaseMs')
  if (leaseMs < 0) {
    throw new RangeError('leaseMs must be non-negative')
  }

  const migrate = db.transaction(() => {
    const columns = db.prepare('PRAGMA table_info(images)').all()
    const newlyAddedLeaseColumn = !columns.some(
      (column) => column.name === 'lease_expires_at',
    )
    if (newlyAddedLeaseColumn) {
      db.exec('ALTER TABLE images ADD COLUMN lease_expires_at INTEGER')
    }

    const leaseExpiresAt = now + leaseMs
    db.prepare(`
      UPDATE images
      SET lease_expires_at = ?
      WHERE lease_expires_at IS NULL
    `).run(leaseExpiresAt)
  })

  migrate()
}

/**
 * The share view counter: one per successful public page render. Added after
 * the first release, so existing databases get the column here.
 */
export function ensureShareViewsSchema(db) {
  const columns = db.prepare('PRAGMA table_info(shares)').all()
  if (!columns.some((column) => column.name === 'views')) {
    db.exec('ALTER TABLE shares ADD COLUMN views INTEGER NOT NULL DEFAULT 0')
  }
}

/**
 * The drafts trash: a deleted draft keeps its row with `deleted_at` set —
 * restorable for a retention window, then purged for real (with its
 * versions). Image reference scanning reads every row, so a trashed draft
 * keeps its pictures alive until it is purged. NULL means live.
 */
export function ensureDraftTrashSchema(db) {
  const columns = db.prepare('PRAGMA table_info(drafts)').all()
  if (!columns.some((column) => column.name === 'deleted_at')) {
    db.exec('ALTER TABLE drafts ADD COLUMN deleted_at INTEGER')
  }
}
