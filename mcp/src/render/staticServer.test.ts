import { afterAll, describe, expect, test } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { createStaticServer, type StaticServer } from './staticServer'

const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'dingcard-static-'))
writeFileSync(path.join(fixtureRoot, 'render.html'), '<!doctype html><title>render</title>')
writeFileSync(path.join(fixtureRoot, 'app.js'), 'console.log("ok")')
writeFileSync(path.join(fixtureRoot, 'style.css'), 'body{margin:0}')
writeFileSync(path.join(fixtureRoot, 'secret.txt'), 'top secret')

let server: StaticServer | null = null

async function runningServer(): Promise<StaticServer> {
  if (!server) server = await createStaticServer(fixtureRoot)
  return server
}

afterAll(async () => {
  await server?.close()
})

describe('createStaticServer', () => {
  test('serves files with the right MIME types', async () => {
    const staticServer = await runningServer()
    const base = `http://127.0.0.1:${staticServer.port}`

    const html = await fetch(`${base}/render.html`)
    expect(html.status).toBe(200)
    expect(html.headers.get('content-type')).toContain('text/html')

    const js = await fetch(`${base}/app.js`)
    expect(js.status).toBe(200)
    expect(js.headers.get('content-type')).toContain('text/javascript')

    const css = await fetch(`${base}/style.css`)
    expect(css.status).toBe(200)
    expect(css.headers.get('content-type')).toContain('text/css')
  })

  test('answers 404 for missing files', async () => {
    const staticServer = await runningServer()
    const response = await fetch(`http://127.0.0.1:${staticServer.port}/missing.png`)
    expect(response.status).toBe(404)
  })

  test('refuses path traversal outside the served root', async () => {
    const staticServer = await runningServer()
    const { port } = staticServer

    // fetch() normalizes ../ client-side, so send the raw escaped form the
    // way a hostile client would.
    const escape = await new Promise<number>((resolve, reject) => {
      const request = http.get(
        { host: '127.0.0.1', port, path: '/..%2Fsecret.txt' },
        (response) => {
          response.resume()
          response.on('end', () => resolve(response.statusCode ?? 0))
        },
      )
      request.once('error', reject)
    })
    expect(escape).toBe(403)
  })

  test('listens on an ephemeral loopback port and closes cleanly', async () => {
    const ephemeral = await createStaticServer(fixtureRoot)
    expect(ephemeral.port).toBeGreaterThan(0)
    const probe = await fetch(`http://127.0.0.1:${ephemeral.port}/render.html`)
    expect(probe.status).toBe(200)
    await ephemeral.close()
    await expect(fetch(`http://127.0.0.1:${ephemeral.port}/render.html`)).rejects.toThrow()
  })
})
