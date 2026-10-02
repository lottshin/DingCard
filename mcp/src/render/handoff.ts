// Handing a document to the DingCard editor in one step. The server keeps the
// document at a loopback URL; the editor's import route
// (#/edit/canvas/import?url=…) fetches it and opens it as a new project. With
// no DINGCARD_APP_URL the same loopback server also serves the built editor,
// on a fixed port, so the hand-off works offline and the projects it makes
// stay in one origin's storage.

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FreeformDocument } from '../../../src/freeform/types'
import { builtFrontendDir } from './renderer'
import { createStaticServer } from './staticServer'

/** The editor's port when the server serves it itself (DINGCARD_APP_PORT overrides). */
const DEFAULT_APP_PORT = 5390
/** How many handed-off documents stay fetchable; the oldest goes first. */
const KEPT_DOCUMENTS = 16

interface HandOffServer {
  origin: string
  documents: Map<string, string>
}

let running: Promise<HandOffServer> | null = null

function appPort(): number {
  const value = Number.parseInt(process.env.DINGCARD_APP_PORT ?? '', 10)
  return Number.isInteger(value) && value >= 0 && value <= 65_535 ? value : DEFAULT_APP_PORT
}

async function startServer(): Promise<HandOffServer> {
  const documents = new Map<string, string>()
  // Any page may read a handed-off document (its URL is unguessable), including a deployed
  // editor on https: Chrome asks loopback servers to allow private network access.
  const handle = (request: IncomingMessage, response: ServerResponse): boolean => {
    const match = /^\/documents\/([0-9a-f-]{36})\.json$/.exec(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
    if (!match) return false
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET',
      'access-control-allow-headers': '*',
      'access-control-allow-private-network': 'true',
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, headers).end()
      return true
    }
    const body = documents.get(match[1])
    if (body === undefined) {
      response.writeHead(404, headers).end('not found')
      return true
    }
    response.writeHead(200, { ...headers, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(body)
    return true
  }
  const servesEditor = !process.env.DINGCARD_APP_URL?.trim()
  const root = servesEditor ? await builtFrontendDir() : process.cwd()
  // Without the editor to serve, nothing but documents is answered.
  const server = await createStaticServer(root, {
    port: servesEditor ? appPort() : 0,
    unref: true,
    handle: servesEditor ? handle : (request, response) => handle(request, response) || Boolean(response.writeHead(404).end('not found')),
  })
  return { origin: `http://127.0.0.1:${server.port}`, documents }
}

export interface HandOff {
  /** Opens the document in the editor. */
  url: string
  /** Where the editor fetches the document from. */
  documentUrl: string
  /** The editor it opens in. */
  appUrl: string
}

/** Make the document fetchable and build the editor URL that imports it. */
export async function handOff(document: FreeformDocument, options: { title?: string; appUrl?: string } = {}): Promise<HandOff> {
  running ??= startServer().catch((error: unknown) => {
    running = null
    throw error
  })
  const server = await running
  const token = randomUUID()
  server.documents.set(token, JSON.stringify(document))
  while (server.documents.size > KEPT_DOCUMENTS) {
    const oldest = server.documents.keys().next().value
    if (oldest === undefined) break
    server.documents.delete(oldest)
  }
  const appUrl = (options.appUrl?.trim() || process.env.DINGCARD_APP_URL?.trim() || server.origin).replace(/\/+$/, '')
  const documentUrl = `${server.origin}/documents/${token}.json`
  const query = new URLSearchParams({ url: documentUrl })
  if (options.title?.trim()) query.set('title', options.title.trim())
  return { url: `${appUrl}/#/edit/canvas/import?${query.toString()}`, documentUrl, appUrl }
}

/** Open a URL in the default browser; false when no opener could be started. */
export function openInBrowser(url: string): boolean {
  const [command, args] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]]
      : ['xdg-open', [url]]
  try {
    const child = spawn(command, args as string[], { detached: true, stdio: 'ignore' })
    child.on('error', () => undefined)
    child.unref()
    return true
  } catch {
    return false
  }
}
