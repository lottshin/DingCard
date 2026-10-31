import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { buildApp } from './app.js'
import { config } from './config.js'

test('a cross-origin client from CORS_ORIGINS may also PATCH and DELETE', async (t) => {
  const uploadsDir = await mkdtemp(path.join(tmpdir(), 'dingcard-cors-'))
  t.after(() => rm(uploadsDir, { recursive: true, force: true }))
  const origin = 'http://localhost:5173'
  const app = await buildApp({
    config: { ...config, corsOrigins: [origin], uploadsDir, webRoot: '', imageRuntime: false },
    stmts: {},
  })
  t.after(() => app.close())

  for (const method of ['PATCH', 'DELETE']) {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/drafts/draft-1',
      headers: {
        origin,
        'access-control-request-method': method,
        'access-control-request-headers': 'authorization,content-type',
      },
    })
    assert.equal(response.statusCode, 204, method)
    assert.equal(response.headers['access-control-allow-origin'], origin, method)
    assert.match(response.headers['access-control-allow-methods'], new RegExp(`\\b${method}\\b`), method)
  }
})
