// What 「接入 AI」 hands out: how each MCP client starts the dingcard-mcp
// package from npm. The README and docs/mcp.md「客户端接入」 carry the same
// mcpServers block.

/** The MCP server's npm package (mcp/package.json). */
export const MCP_PACKAGE = 'dingcard-mcp'

/** The MCP guide: every tool, environment variable and client. */
export const MCP_GUIDE_URL = 'https://github.com/lottshin/DingCard/blob/master/docs/mcp.md'

export type AiClientId = 'claude-code' | 'codex' | 'cursor' | 'claude-desktop'

export interface AiClient {
  id: AiClientId
  /** The product's own name, the same in every language. */
  name: string
  /** A command run once in a terminal, or a block for the client's MCP config file. */
  kind: 'command' | 'config'
  snippet: string
}

/** The mcpServers block Cursor, Claude Desktop and most other clients read. */
export const MCP_SERVERS_JSON = `{
  "mcpServers": {
    "dingcard": {
      "command": "npx",
      "args": ["-y", "${MCP_PACKAGE}"]
    }
  }
}`

export const AI_CLIENTS: readonly AiClient[] = [
  { id: 'claude-code', name: 'Claude Code', kind: 'command', snippet: `claude mcp add dingcard -- npx -y ${MCP_PACKAGE}` },
  { id: 'codex', name: 'Codex', kind: 'command', snippet: `codex mcp add dingcard -- npx -y ${MCP_PACKAGE}` },
  { id: 'cursor', name: 'Cursor', kind: 'config', snippet: MCP_SERVERS_JSON },
  { id: 'claude-desktop', name: 'Claude Desktop', kind: 'config', snippet: MCP_SERVERS_JSON },
]

export function isAiClientId(value: unknown): value is AiClientId {
  return AI_CLIENTS.some((client) => client.id === value)
}
