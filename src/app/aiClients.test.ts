import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AI_CLIENTS, MCP_PACKAGE, MCP_SERVERS_JSON, isAiClientId } from './aiClients'

describe('aiClients', () => {
  it('names the package the MCP server is published as', () => {
    const mcpPackage = JSON.parse(readFileSync('mcp/package.json', 'utf8')) as { name: string }

    expect(MCP_PACKAGE).toBe(mcpPackage.name)
  })

  it('gives config clients an mcpServers block that starts the package with npx', () => {
    expect(JSON.parse(MCP_SERVERS_JSON)).toEqual({
      mcpServers: { dingcard: { command: 'npx', args: ['-y', 'dingcard-mcp'] } },
    })
    for (const client of AI_CLIENTS.filter((item) => item.kind === 'config')) {
      expect(client.snippet).toBe(MCP_SERVERS_JSON)
    }
  })

  it('gives terminal clients one command that passes -y to npx, not to the client', () => {
    expect(AI_CLIENTS.find((client) => client.id === 'claude-code')?.snippet).toBe('claude mcp add dingcard -- npx -y dingcard-mcp')
    expect(AI_CLIENTS.find((client) => client.id === 'codex')?.snippet).toBe('codex mcp add dingcard -- npx -y dingcard-mcp')
  })

  it('knows its own client ids and nothing else', () => {
    expect(AI_CLIENTS.map((client) => client.id)).toEqual(['claude-code', 'codex', 'cursor', 'claude-desktop'])
    expect(isAiClientId('cursor')).toBe(true)
    expect(isAiClientId('vscode')).toBe(false)
    expect(isAiClientId(null)).toBe(false)
  })
})
