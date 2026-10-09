// Doc-drift guards: the MCP's tool descriptions claim a document version and
// a node-type list, and both must follow the source types. These tests fail
// whenever the descriptions fall behind the code, so a version bump that
// forgets the docs cannot ship.

import { describe, expect, test } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createDingcardServer, FREEFORM_NODE_TYPES } from './index'
import { FREEFORM_DOCUMENT_VERSION } from '../../src/freeform/types'

type Content = { content: Array<{ type: string; text?: string }> }

async function connect(): Promise<Client> {
  const server: McpServer = createDingcardServer()
  const client = new Client({ name: 'dingcard-mcp-docs-test', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

describe('dingcard-mcp tool descriptions stay current', () => {
  test('every freeform version claim names the current documentVersion', async () => {
    const client = await connect()
    const listing = await client.listTools()
    expect(listing.tools.length).toBeGreaterThan(0)
    for (const tool of listing.tools) {
      const description = tool.description ?? ''
      // Any "自由画布 vNN" claim must name the current version…
      for (const match of description.matchAll(/自由画布 v(\d+)/g)) {
        expect(match[1], `${tool.name} 的版本说明落后了`).toBe(String(FREEFORM_DOCUMENT_VERSION))
      }
      // …and no example may pin another version.
      for (const match of description.matchAll(/documentVersion: (\d+)/g)) {
        expect(match[1], `${tool.name} 的示例版本落后了`).toBe(String(FREEFORM_DOCUMENT_VERSION))
      }
      expect(description, `${tool.name} 还带着 v1–v19 的旧迁移范围`).not.toContain('v1–v19')
      expect(description, `${tool.name} 还在说 v20 文档`).not.toContain('v20 文档')
    }
  })

  test('the schema resource covers exactly the scene node types', async () => {
    const client = await connect()
    // The one full copy of the document model lives in this resource; the
    // tool descriptions point here.
    const resource = await client.readResource({ uri: 'dingcard://schema/freeform' })
    expect(resource.contents).toHaveLength(1)
    // The SDK's declared type says `text`; older runtimes deliver `blob`.
    const content = resource.contents[0] as unknown as { text?: string; blob?: string }
    const hint = String(content.text ?? content.blob)
    // The hint's node bullets must be exactly the scene's node types —
    // no type forgotten, none invented.
    const listed = [...hint.matchAll(/^- (\w+)：/gm)].map((match) => match[1]).sort()
    expect(listed).toEqual([...FREEFORM_NODE_TYPES].sort())
    // The header count agrees with the bullet list.
    expect(hint).toContain(`节点 ${FREEFORM_NODE_TYPES.length} 选一`)
  })

  test('the tool list stays small enough to read', async () => {
    // The five document tools once carried the full schema hint each
    // (90,991 chars). The single copy now lives in the resource; this cap
    // keeps descriptions from quietly growing back.
    const client = await connect()
    const listing = await client.listTools()
    const total = listing.tools.reduce((sum, tool) => sum + JSON.stringify(tool).length, 0)
    expect(total).toBeLessThan(36000)
  })

  test('the version constant still pins the document interface', () => {
    // Interpolated claims are only as fresh as this constant; sceneDocument's
    // type tests keep it welded to FreeformDocument['documentVersion'].
    expect(FREEFORM_DOCUMENT_VERSION).toBe(39)
  })
})

describe('list_templates filters', () => {
  test('narrows by kind, format substring, and keyword', async () => {
    const client = await connect()
    const call = async (args: Record<string, unknown>) => {
      const result = (await client.callTool({
        name: 'list_templates',
        arguments: args,
      })) as Content
      return JSON.parse(result.content[0].text ?? '{}') as {
        templates: Array<{ id: string; kind: string; format: { id: string }; title: string; tags: string[] }>
      }
    }

    const all = await call({})
    expect(all.templates.length).toBeGreaterThan(5)

    const decks = await call({ kind: 'deck' })
    expect(decks.templates.length).toBeGreaterThan(0)
    expect(decks.templates.length).toBeLessThan(all.templates.length)
    expect(decks.templates.every((template) => template.kind === 'deck')).toBe(true)

    const posters = await call({ kind: 'poster' })
    expect(posters.templates.length).toBeGreaterThan(0)
    expect(posters.templates.every((template) => template.kind === 'poster')).toBe(true)
    expect(decks.templates.length + posters.templates.length).toBe(all.templates.length)

    const a4 = await call({ format: 'a4' })
    expect(a4.templates.length).toBeGreaterThan(0)
    expect(a4.templates.length).toBeLessThan(all.templates.length)
    expect(a4.templates.every((template) => template.format.id.includes('a4'))).toBe(true)

    const menus = await call({ q: '菜单' })
    expect(menus.templates.length).toBeGreaterThan(0)
    expect(menus.templates.length).toBeLessThan(all.templates.length)
    for (const template of menus.templates) {
      expect(`${template.title} ${template.tags.join(' ')}`).toContain('菜单')
    }

    const combined = await call({ kind: 'poster', format: 'xhs' })
    expect(combined.templates.every(
      (template) => template.kind === 'poster' && template.format.id.includes('xhs'),
    )).toBe(true)

    const nothing = await call({ q: '不存在的关键词xyz' })
    expect(nothing.templates).toEqual([])
  })
})
