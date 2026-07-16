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
    if (!columns.some((column) => column.name === 'lease_expires_at')) {
      db.exec('ALTER TABLE images ADD COLUMN lease_expires_at INTEGER')
    }

    const leaseExpiresAt = now + leaseMs
    db.prepare(`
      UPDATE images
      SET lease_expires_at = ?
      WHERE lease_expires_at IS NULL OR lease_expires_at < ?
    `).run(leaseExpiresAt, leaseExpiresAt)
  })

  migrate()
}
