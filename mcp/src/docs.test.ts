// Doc-drift guards: the MCP's tool descriptions claim a document version and
// a node-type list, and both must follow the source types. These tests fail
// whenever the descriptions fall behind the code, so a version bump that
// forgets the docs cannot ship.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createDingcardServer, FREEFORM_NODE_TYPES } from './index'
import { LAYOUT_ISSUE_KINDS } from './core/layoutIssues'
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
    // Tool descriptions and get_guide sections are checked together: the
    // guide carries what descriptions once carried inline, so it must obey
    // the same drift rules.
    const texts: Array<[string, string]> = listing.tools.map((tool) => [tool.name, tool.description ?? ''])
    const guideListing = JSON.parse(((await (client.callTool({ name: 'get_guide', arguments: {} })) as Content).content[0].text ?? '{}')) as { sections: Array<{ id: string }> }
    const guideTexts: Array<[string, string]> = []
    for (const section of guideListing.sections) {
      const read = await (client.callTool({ name: 'get_guide', arguments: { section: section.id } })) as Content
      guideTexts.push([`get_guide:${section.id}`, JSON.parse(read.content[0].text ?? '{}').text ?? ''])
    }
    for (const [name, description] of [...texts, ...guideTexts]) {
      // Any "自由画布 vNN" claim must name the current version…
      for (const match of description.matchAll(/自由画布 v(\d+)/g)) {
        expect(match[1], `${name} 的版本说明落后了`).toBe(String(FREEFORM_DOCUMENT_VERSION))
      }
      // …and no example may pin another version.
      for (const match of description.matchAll(/documentVersion: (\d+)/g)) {
        expect(match[1], `${name} 的示例版本落后了`).toBe(String(FREEFORM_DOCUMENT_VERSION))
      }
      expect(description, `${name} 还带着 v1–v19 的旧迁移范围`).not.toContain('v1–v19')
      expect(description, `${name} 还在说 v20 文档`).not.toContain('v20 文档')
      expect(description, `${name} 里有没填上的占位符`).not.toContain('${')
    }
  })

  test('no description or resource shows a placeholder the code forgot to fill', async () => {
    // A '…${x}…' written with plain quotes reaches the model word for word.
    const client = await connect()
    const listing = await client.listTools()
    for (const tool of listing.tools) {
      expect(JSON.stringify(tool), `${tool.name} 的说明里有没填上的占位符`).not.toContain('${')
    }
    const { resources } = await client.listResources()
    for (const resource of resources) {
      const read = await client.readResource({ uri: resource.uri })
      for (const content of read.contents as unknown as Array<{ text?: string }>) {
        expect(content.text ?? '', `${resource.uri} 里有没填上的占位符`).not.toContain('${')
      }
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
    // Tool descriptions are a catalogue: what a tool does and which guide
    // section to read first. Long "how to write it" texts live in get_guide
    // and the schema resources, never back in descriptions. Per-tool caps
    // keep the catalogue from quietly growing back; a normal new tool whose
    // description genuinely needs more room may raise its own cap with a
    // note, the total cap stays.
    const client = await connect()
    const listing = await client.listTools()
    const total = listing.tools.reduce((sum, tool) => sum + JSON.stringify(tool).length, 0)
    expect(total).toBeLessThan(32000)
    for (const tool of listing.tools) {
      expect((tool.description ?? '').length, `${tool.name} 的说明超过 600 字，长内容进 get_guide`).toBeLessThanOrEqual(600)
      // Parameter descriptions are read too: the whole entry has a cap.
      expect(JSON.stringify(tool).length, `${tool.name} 连参数说明超过 3500 字，长内容进 get_guide`).toBeLessThanOrEqual(3500)
    }
  })

  test('get_guide covers the topics the descriptions point to', async () => {
    // The catalogue points at guide sections by id; a section renamed or
    // deleted behind a description's back breaks that pointer.
    const client = await connect()
    const listing = await client.listTools()
    const catalogue = (JSON.parse(((await (client.callTool({ name: 'get_guide', arguments: {} })) as Content).content[0].text ?? '{}')) as { sections: Array<{ id: string }> }).sections
    const ids = new Set(catalogue.map((section) => section.id))
    expect([...ids].sort()).toEqual([
      'actions', 'check', 'deck-content', 'document-model', 'html-import', 'outline', 'poster-content', 'render-export', 'templates',
    ])
    // get_guide's own description names every topic.
    const guideDescription = listing.tools.find((tool) => tool.name === 'get_guide')?.description ?? ''
    for (const id of ids) expect(guideDescription, `get_guide 的说明漏了主题 ${id}`).toContain(id)
    for (const tool of listing.tools) {
      for (const match of (tool.description ?? '').matchAll(/get_guide\("([a-z-]+)"\)/g)) {
        expect(ids.has(match[1]), `${tool.name} 指向的 get_guide 主题 ${match[1]} 不存在`).toBe(true)
      }
    }
  })

  test('the check topic explains exactly the kinds check_document reports', async () => {
    // One bullet per kind (or a pair sharing a line), none forgotten, none invented.
    const client = await connect()
    const read = await (client.callTool({ name: 'get_guide', arguments: { section: 'check' } })) as Content
    const text = String(JSON.parse(read.content[0].text ?? '{}').text)
    const listed = [...text.matchAll(/^- ([a-z-]+(?: \/ [a-z-]+)*)：/gm)].flatMap((match) => match[1].split(' / ')).sort()
    expect(listed).toEqual([...LAYOUT_ISSUE_KINDS].sort())
  })

  test('the docs name the current version wherever they claim one', () => {
    // Feature notes ("v34 表格元素") stay as history; what the docs say the
    // editor writes, reads, validates and renders must follow the constant.
    const current = FREEFORM_DOCUMENT_VERSION
    for (const name of ['docs/mcp.md', 'docs/backend-plan.md', 'docs/freeform-editor.md']) {
      const text = readFileSync(path.resolve(__dirname, '../..', name), 'utf8')
      const claims = [
        ...text.matchAll(/"?documentVersion"?`?: (\d+)/g),
        ...text.matchAll(/v(\d+) 文档/g),
        ...text.matchAll(/v(\d+) 场景树契约/g),
        ...text.matchAll(/迁移为 v(\d+)/g),
        ...text.matchAll(/到 v(\d+) 的迁移/g),
        ...text.matchAll(/`documentVersion` 写成 (\d+)/g),
        ...text.matchAll(/当前版本（v(\d+)）/g),
      ]
      expect(claims.length, `${name} 里没找到版本说明`).toBeGreaterThan(0)
      for (const match of claims) expect(Number(match[1]), `${name}：「${match[0]}」落后了`).toBe(current)
      // A migration range ends at the current version, or the one before it.
      for (const match of text.matchAll(/v1–v(\d+)/g)) {
        expect([current - 1, current], `${name}：「${match[0]}」落后了`).toContain(Number(match[1]))
      }
    }
  })

  test('the version constant still pins the document interface', () => {
    // Interpolated claims are only as fresh as this constant; sceneDocument's
    // type tests keep it welded to FreeformDocument['documentVersion'].
    expect(FREEFORM_DOCUMENT_VERSION).toBe(44)
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
        templates: Array<{ id: string; kind: string; format: string; title: string; description: string; uses: string[] }>
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
    expect(a4.templates.every((template) => template.format.includes('a4'))).toBe(true)

    const menus = await call({ q: '菜单' })
    expect(menus.templates.length).toBeGreaterThan(0)
    expect(menus.templates.length).toBeLessThan(all.templates.length)
    // A keyword finds a template by its words or by what it is for (a price list is filed under menus).
    for (const template of menus.templates) {
      expect(`${template.title} ${template.description} ${template.uses.join(' ')}`).toContain('菜单')
    }

    const combined = await call({ kind: 'poster', format: 'xhs' })
    expect(combined.templates.every(
      (template) => template.kind === 'poster' && template.format.includes('xhs'),
    )).toBe(true)

    const nothing = await call({ q: '不存在的关键词xyz' })
    expect(nothing.templates).toEqual([])
  })

  test('the default list stays short as templates are added', async () => {
    // Picking a template costs the model the whole default answer, and every
    // template added makes it longer, so a card holds only what picking needs
    // (capacity and the rest come by id) and the answer has a cap. Past it,
    // trim the cards or page the list rather than raising the cap.
    const client = await connect()
    const result = (await client.callTool({ name: 'list_templates', arguments: {} })) as Content
    const text = result.content[0].text ?? ''
    expect(text.length).toBeLessThan(20000)
    const { templates } = JSON.parse(text) as { templates: Array<Record<string, unknown>> }
    for (const card of templates) {
      expect(Object.keys(card).sort()).toEqual(['description', 'format', 'id', 'kind', 'styles', 'title', 'uses'])
    }
  })
})
