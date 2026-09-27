// Loopback-only static file server for the built frontend (dist/).
//
// The render page needs a real HTTP origin: Google Fonts fetches (character-
// subset embedding) and image loads do not work from file:// in Chromium.
// This keeps the MCP package dependency-free on the server side — node:http
// plus a small MIME table is all the render path needs.

import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

export interface StaticServer {
  port: number
  close: () => Promise<void>
}

export async function createStaticServer(rootDir: string): Promise<StaticServer> {
  const root = path.resolve(rootDir)
  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      let pathname = decodeURIComponent(url.pathname)
      if (pathname.endsWith('/')) pathname += 'index.html'
      // Strip the leading slash so path.resolve anchors at the served root,
      // then re-anchor and reject anything that escaped it.
      const relative = pathname.replace(/^\/+/, '')
      if (relative.includes('\0')) {
        res.writeHead(400).end('bad request')
        return
      }
      const resolved = path.resolve(root, relative)
      if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        res.writeHead(403).end('forbidden')
        return
      }
      const body = await readFile(resolved)
      res.writeHead(200, {
        'content-type': MIME_TYPES[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream',
        'content-length': body.length,
      })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('静态服务器未能获得监听端口')
  }

  return {
    port: address.port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}
