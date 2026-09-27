import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    // The browser pipeline test needs a built dist + system Chrome; it runs
    // via `npm run test:render` (vitest.render.config.ts) and in CI's
    // browser job only, never in the no-Chrome static job.
    exclude: ['src/render/render.test.ts', '**/node_modules/**'],
  },
})
