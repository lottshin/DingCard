import { defineConfig } from 'vitest/config'

// Browser render-pipeline config: template document → headless Chrome → PNG.
// Requires a built dist/ (auto-built once by the renderer if missing) and a
// system Chrome. Tests carry their own long timeouts for the one-time build.

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/render/render.test.ts'],
  },
})
