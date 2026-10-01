// MCP-layer test: connects a real SDK client to the server over in-memory
// transport and exercises every offline tool end to end (tool registration,
// zod argument parsing, JSON result payloads). render_document, render_markdown
// and check_document need a browser and are covered by the pipeline test instead.

import { describe, expect, test } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createDingcardServer } from './index'
import { instantiateTemplate } from './core/templates'

function parseContent(result: { content: Array<{ type: string; text?: string }> }): unknown {
  expect(result.content).toHaveLength(1)
  expect(result.content[0].type).toBe('text')
  return JSON.parse(result.content[0].text ?? '')
}

async function connect(): Promise<Client> {
  const server: McpServer = createDingcardServer()
  const client = new Client({ name: 'dingcard-mcp-test', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

describe('dingcard-mcp tool layer', () => {
  test('exposes the eleven tools', async () => {
    const client = await connect()
    const listing = await client.listTools()
    const names = listing.tools.map((tool) => tool.name).sort()
    expect(names).toEqual([
      'apply_actions',
      'check_document',
      'create_document_from_content',
      'create_document_from_outline',
      'create_document_from_template',
      'inspect_document',
      'list_icons',
      'list_templates',
      'render_document',
      'render_markdown',
      'validate_document',
    ])
    for (const tool of listing.tools) {
      expect(tool.description?.length ?? 0).toBeGreaterThan(40)
    }
    await client.close()
  })

  test('list_templates returns the registry', async () => {
    const client = await connect()
    const response = await client.callTool({ name: 'list_templates', arguments: {} })
    const parsed = parseContent(response as { content: Array<{ type: string; text?: string }> })
    const templates = (parsed as { templates: Array<{ id: string; capacity?: { sectionPoints: number; sectionQuote: boolean } }> }).templates
    expect(templates.map((template) => template.id)).toContain('editorial-freeform')
    // Freeform templates say how much a page holds, so a client can pick one for its content.
    expect(templates.find((template) => template.id === 'editorial-freeform')?.capacity)
      .toMatchObject({ sectionPoints: 3, sectionQuote: true })
    expect(templates.find((template) => template.id === 'editorial-archive-markdown')?.capacity).toBeUndefined()
    await client.close()
  })

  test('create → inspect → apply_actions round trip', async () => {
    const client = await connect()

    const created = parseContent(
      (await client.callTool({
        name: 'create_document_from_template',
        arguments: { templateId: 'editorial-freeform' },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as { workspace: string; document: unknown }
    expect(created.workspace).toBe('freeform')

    const inspected = parseContent(
      (await client.callTool({
        name: 'inspect_document',
        arguments: { document: created.document },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as { ok: boolean; slides: Array<{ nodes: Array<{ id: string; name: string; text?: string }> }> }
    expect(inspected.ok).toBe(true)
    expect(inspected.slides).toHaveLength(3)
    const titleNode = inspected.slides[0].nodes.find((node) => node.name === '主标题')
    expect(titleNode).toBeDefined()

    const edited = parseContent(
      (await client.callTool({
        name: 'apply_actions',
        arguments: {
          document: created.document,
          actions: [
            {
              type: 'node/update-content',
              slideId: (created.document as { slides: Array<{ id: string }> }).slides[0].id,
              updates: [{ path: [titleNode!.id], patch: { text: 'AI 改写的标题' } }],
            },
          ],
        },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as { ok: boolean; changes: boolean[]; document: unknown }
    expect(edited.ok).toBe(true)
    expect(edited.changes).toEqual([true])

    const validated = parseContent(
      (await client.callTool({
        name: 'validate_document',
        arguments: { document: edited.document },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as { ok: boolean }
    expect(validated.ok).toBe(true)
    await client.close()
  })

  test('creates a multi-slide card set from a markdown outline', async () => {
    const client = await connect()

    const created = parseContent(
      (await client.callTool({
        name: 'create_document_from_outline',
        arguments: {
          outline: '# 大纲标题\n\n## 第一节\n- 要点一\n- 要点二\n\n## 第二节\n正文一行',
          templateId: 'editorial-freeform',
        },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as {
      ok: boolean
      document: { documentVersion: number; slides: Array<{ id: string }> }
      summary: { slideCount: number; coverTitle: string; pages: Array<{ title: string; role: string }> }
    }
    expect(created.ok).toBe(true)
    expect(created.document.documentVersion).toBe(15)
    // Cover and two sections: the outline asked for no closing page.
    expect(created.document.slides).toHaveLength(3)
    expect(created.summary.slideCount).toBe(3)
    expect(created.summary.coverTitle).toBe('大纲标题')
    expect(created.summary.pages.map((page) => page.title)).toEqual(['大纲标题', '第一节', '第二节'])

    const validated = parseContent(
      (await client.callTool({
        name: 'validate_document',
        arguments: { document: created.document },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as { ok: boolean }
    expect(validated.ok).toBe(true)
    await client.close()
  })

  test('creates a card set from structured content', async () => {
    const client = await connect()
    const created = parseContent(
      (await client.callTool({
        name: 'create_document_from_content',
        arguments: {
          templateId: 'checklist-freeform',
          content: {
            title: '开工清单',
            subtitle: '三件事做完再动手',
            pages: [{ title: '准备', points: ['列目标：一句话写清楚', '找素材'] }],
            ending: { title: '可以开工了', points: ['目标清楚', '素材齐全'] },
          },
        },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as { ok: boolean; document: { slides: unknown[] }; summary: { pages: Array<{ role: string }> } }
    expect(created.ok).toBe(true)
    expect(created.document.slides).toHaveLength(3)
    expect(created.summary.pages.map((page) => page.role)).toEqual(['cover', 'section', 'ending'])

    const rejected = parseContent(
      (await client.callTool({
        name: 'create_document_from_content',
        arguments: { templateId: 'no-such-template', content: { title: 'a', pages: [{ title: 'b' }] } },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as { ok: boolean; error: string }
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toContain('list_templates')
    await client.close()
  })

  test('exposes schema, templates, and examples as MCP resources', async () => {
    const client = await connect()
    const listing = await client.listResources()
    const uris = listing.resources.map((resource) => resource.uri).sort()
    expect(uris).toEqual([
      'dingcard://examples/freeform',
      'dingcard://examples/markdown',
      'dingcard://icons',
      'dingcard://schema/actions',
      'dingcard://schema/freeform',
      'dingcard://templates',
    ])
    for (const resource of listing.resources) {
      expect(resource.description?.length ?? 0).toBeGreaterThan(4)
    }

    const readText = async (uri: string): Promise<string> => {
      const result = await client.readResource({ uri })
      expect(result.contents).toHaveLength(1)
      const content = result.contents[0]
      if (!('text' in content) || typeof content.text !== 'string') {
        throw new Error(`resource ${uri} did not return text`)
      }
      return content.text
    }

    const templates = JSON.parse(await readText('dingcard://templates')) as {
      templates: Array<{ id: string }>
    }
    expect(templates.templates.map((template) => template.id)).toContain('editorial-freeform')

    expect(await readText('dingcard://schema/freeform')).toContain('documentVersion')
    expect(await readText('dingcard://schema/freeform')).toContain('- path：')

    const icons = JSON.parse(await readText('dingcard://icons')) as {
      style: { viewBox: { width: number } }
      icons: Array<{ id: string; d: string }>
    }
    expect(icons.style.viewBox.width).toBe(24)
    expect(icons.icons.length).toBeGreaterThan(90)
    expect(icons.icons.every((icon) => icon.d.startsWith('M'))).toBe(true)

    const document = JSON.parse(await readText('dingcard://examples/freeform')) as {
      documentVersion: number
    }
    expect(document.documentVersion).toBe(15)

    const envelope = JSON.parse(await readText('dingcard://examples/markdown')) as {
      source: string
    }
    expect(envelope.source).toContain('#')
    await client.close()
  })

  test('list_icons lists names, searches drawings, and its example inserts as a path', async () => {
    const client = await connect()
    const call = async (args: Record<string, unknown>) => parseContent(
      (await client.callTool({ name: 'list_icons', arguments: args })) as { content: Array<{ type: string; text?: string }> },
    ) as {
      ok: boolean
      total: number
      icons: Array<{ id: string; zh: string; d?: string }>
      missing?: string[]
      example?: Record<string, unknown>
    }

    const catalogue = await call({})
    expect(catalogue.total).toBe(catalogue.icons.length)
    expect(catalogue.icons.find((icon) => icon.id === 'check')).toEqual({ id: 'check', zh: '对勾', en: 'Check' })

    const found = await call({ query: '勾' })
    expect(found.icons[0]).toMatchObject({ id: 'check', d: 'M20 6 9 17l-5-5' })
    expect((await call({ query: '没有这种图标' })).icons).toEqual([])

    const picked = await call({ ids: ['star', 'nope'] })
    expect(picked.icons.map((icon) => icon.id)).toEqual(['star'])
    expect(picked.missing).toEqual(['nope'])

    const created = instantiateTemplate('editorial-freeform')
    if (created.workspace !== 'freeform') throw new Error('expected a freeform template')
    const slideId = created.document.slides[0].id
    const applied = parseContent(
      (await client.callTool({
        name: 'apply_actions',
        arguments: {
          document: created.document,
          actions: [{ type: 'node/insert-children', slideId, parentPath: [], nodes: [picked.example] }],
        },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as { ok: boolean; changes: boolean[]; document: unknown }
    expect(applied.changes).toEqual([true])

    const inspected = parseContent(
      (await client.callTool({ name: 'inspect_document', arguments: { document: applied.document } })) as {
        content: Array<{ type: string; text?: string }>
      },
    ) as { slides: Array<{ nodes: Array<{ id: string; type: string; icon?: string }> }> }
    expect(inspected.slides[0].nodes.at(-1)).toMatchObject({ id: 'icon-star', type: 'path', icon: 'star' })
    await client.close()
  })

  test('invalid template ids return isError results with available ids', async () => {
    const client = await connect()
    const response = await client.callTool({
      name: 'create_document_from_template',
      arguments: { templateId: 'does-not-exist' },
    })
    expect((response as { isError?: boolean }).isError).toBe(true)
    const content = (response as { content: Array<{ type: string; text?: string }> }).content
    expect(content[0].text ?? '').toContain('可用模板')
    await client.close()
  })

  test('validate_document rejects malformed payloads with ok=false (not a protocol error)', async () => {
    const client = await connect()
    const response = await client.callTool({
      name: 'validate_document',
      arguments: { document: { documentVersion: 4, slides: 'nope' } },
    })
    expect((response as { isError?: boolean }).isError).not.toBe(true)
    const parsed = parseContent(response as { content: Array<{ type: string; text?: string }> })
    expect(parsed).toMatchObject({ ok: false })
    await client.close()
  })
})

describe('server module guards', () => {
  test('does not start stdio when imported (server exported for testing)', () => {
    // If the entry guard failed, connecting stdio in a test process would hang
    // or consume stdin; importing the module (done above) without hanging is
    // the assertion. StdioServerTransport import stays unused otherwise.
    expect(StdioServerTransport).toBeDefined()
    expect(typeof instantiateTemplate).toBe('function')
  })
})
