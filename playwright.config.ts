import { defineConfig } from '@playwright/test'

const E2E_PORT = 5373
const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`

// Drives the dev server with the system-installed Chrome (no Chromium download).
export default defineConfig({
  testDir: './e2e',
  // Heavy canvas tests can outrun 30s on a shared CI runner, so they get more
  // headroom; fast tests are unaffected (the timeout is per-test wall clock).
  timeout: 45_000,
  // Every test is a self-contained browser context (no shared storage or
  // files), so they all run in parallel: 3 workers on a CI runner (4 saturated
  // a 4-vCPU runner enough to time heavy canvas tests out), Playwright's
  // default (half the cores) locally. One retry on CI absorbs runner hiccups
  // without masking real failures (a retry is a fresh context).
  workers: process.env.CI ? 3 : undefined,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  projects: [
    {
      name: 'e2e',
      testIgnore: /editor-acceptance\.spec\.ts/,
    },
    {
      name: 'acceptance',
      testMatch: /editor-acceptance\.spec\.ts/,
      dependencies: ['e2e'],
    },
  ],
  use: {
    baseURL: E2E_ORIGIN,
    channel: 'chrome',
    headless: true,
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${E2E_PORT} --strictPort`,
    url: E2E_ORIGIN,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
