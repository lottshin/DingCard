// Loopback-only static file server for the built frontend (dist/).
//
// The render page needs a real HTTP origin: Google Fonts fetches (character-
// subset embedding) and image loads do not work from file:// in Chromium.
// This keeps the MCP package dependency-free on the server side — node:http
// plus a small MIME table is all the render path needs.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
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

export interface StaticServerOptions {
  /** Listen on this port, falling back to a free one when it is taken; 0 (default) picks a free one. */
  port?: number
  /** Answers some requests itself, returning true when it did; the rest are files under the root. */
  handle?: (request: IncomingMessage, response: ServerResponse) => boolean
  /** Let the process exit while the server still listens. */
  unref?: boolean
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

export async function createStaticServer(rootDir: string, options: StaticServerOptions = {}): Promise<StaticServer> {
  const root = path.resolve(rootDir)
  const server: Server = createServer(async (req, res) => {
    if (options.handle?.(req, res)) return
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

  const port = options.port ?? 0
  try {
    await listen(server, port)
  } catch (error) {
    if (port === 0 || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
    await listen(server, 0)
  }
  if (options.unref) server.unref()

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
