import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { repoRootFrom } from './renderer'

describe('repoRootFrom', () => {
  const checkout = mkdtempSync(path.join(tmpdir(), 'dingcard-checkout-'))
  writeFileSync(path.join(checkout, 'package.json'), '{}')
  mkdirSync(path.join(checkout, 'mcp', 'dist'), { recursive: true })
  writeFileSync(path.join(checkout, 'mcp', 'package.json'), '{}')
  afterAll(() => rmSync(checkout, { recursive: true, force: true }))

  it('finds the checkout from its own mcp/dist', () => {
    expect(repoRootFrom(path.join(checkout, 'mcp', 'dist'))).toBe(checkout)
  })

  it('does not climb out of node_modules into a checkout around an installed package', () => {
    // Glama clones the repository into /app and installs dingcard-mcp inside it.
    const installed = path.join(checkout, '.dingcard-mcp', 'node_modules', 'dingcard-mcp', 'dist')
    mkdirSync(installed, { recursive: true })
    expect(repoRootFrom(installed)).toBeNull()
  })
})
