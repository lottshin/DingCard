// The documents a server keeps for its client. Every tool that makes or
// changes a freeform document keeps the result under a short id and answers
// with the id, so a client passes `documentId` from call to call instead of
// the whole document — which, with pictures embedded, runs to megabytes of
// context. A client can still send a document inline or point at a JSON
// file, and ask for the whole document back (get_document).

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { FreeformDocument } from '../../../src/freeform/types'

/** How many documents a server keeps; the one used longest ago goes first. */
const STORE_LIMIT = 32
/** The largest document file read from disk. */
const MAX_DOCUMENT_FILE_BYTES = 64 * 1024 * 1024

export interface StoredDocument {
  documentId: string
  /** Counts the changes since the document was kept: 1, then one more per edit. */
  version: number
  document: FreeformDocument
}

export class DocumentStore {
  private readonly entries = new Map<string, { version: number; document: FreeformDocument }>()

  constructor(private readonly limit = STORE_LIMIT) {}

  /** Keep a new document under a new id. */
  add(document: FreeformDocument): StoredDocument {
    return this.keep(`doc_${randomBytes(6).toString('hex')}`, document, 1)
  }

  /** Replace a kept document with its edited version. */
  update(documentId: string, document: FreeformDocument): StoredDocument {
    return this.keep(documentId, document, (this.entries.get(documentId)?.version ?? 0) + 1)
  }

  get(documentId: string): StoredDocument | null {
    const entry = this.entries.get(documentId)
    if (!entry) return null
    this.entries.delete(documentId)
    this.entries.set(documentId, entry)
    return { documentId, ...entry }
  }

  private keep(documentId: string, document: FreeformDocument, version: number): StoredDocument {
    this.entries.delete(documentId)
    this.entries.set(documentId, { version, document })
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    return { documentId, version, document }
  }
}

/** Where a tool's document comes from: exactly one of these. */
export interface DocumentInput {
  documentId?: string
  document?: unknown
  documentPath?: string
}

export type ResolvedInput =
  | {
      ok: true
      value: unknown
      /** The kept document this input names, which an edit updates in place. */
      documentId: string | null
      /** Where relative picture paths in it are read from. */
      baseDir: string
    }
  | { ok: false; error: string }

/** A path with ~ expanded, made absolute against `base`. */
export function expandPath(value: string, base = process.cwd()): string {
  const home = value === '~' || value.startsWith('~/') || value.startsWith('~\\')
  return path.resolve(base, home ? path.join(os.homedir(), value.slice(1)) : value)
}

/** The document a tool was given: kept under documentId, inline, or in a JSON file. */
export async function resolveDocumentInput(input: DocumentInput, store: DocumentStore): Promise<ResolvedInput> {
  const given = [input.documentId, input.document, input.documentPath].filter((part) => part !== undefined)
  if (given.length !== 1) {
    return { ok: false, error: '请只给 documentId、document、documentPath 三者之一（推荐 documentId：创建或修改文档的工具都会返回它）' }
  }
  if (input.documentId !== undefined) {
    const kept = store.get(input.documentId)
    if (!kept) {
      return {
        ok: false,
        error: `没有 documentId 为 ${input.documentId} 的文档：服务器重启后会清空，或已被更新的文档挤掉（最多保留 ${STORE_LIMIT} 份）。请重新创建，或用 document / documentPath 传入`,
      }
    }
    return { ok: true, value: kept.document, documentId: kept.documentId, baseDir: process.cwd() }
  }
  if (input.documentPath !== undefined) {
    const file = expandPath(input.documentPath)
    try {
      const info = await stat(file)
      if (!info.isFile()) return { ok: false, error: `documentPath 不是文件：${file}` }
      if (info.size > MAX_DOCUMENT_FILE_BYTES) return { ok: false, error: `文档文件太大（超过 64 MB）：${file}` }
      return { ok: true, value: JSON.parse(await readFile(file, 'utf8')), documentId: null, baseDir: path.dirname(file) }
    } catch (error) {
      const reason = error instanceof SyntaxError ? '不是有效的 JSON' : error instanceof Error ? error.message : String(error)
      return { ok: false, error: `读不了 documentPath ${file}：${reason}` }
    }
  }
  return { ok: true, value: input.document, documentId: null, baseDir: process.cwd() }
}

/** Write a document as a JSON file (folders created as needed). */
export async function writeDocumentFile(document: FreeformDocument, filePath: string): Promise<{ path: string; bytes: number }> {
  const file = expandPath(filePath)
  await mkdir(path.dirname(file), { recursive: true })
  const text = `${JSON.stringify(document, null, 2)}\n`
  await writeFile(file, text, 'utf8')
  return { path: file, bytes: Buffer.byteLength(text) }
}
