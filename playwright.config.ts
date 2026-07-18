import { defineConfig } from '@playwright/test'

const E2E_PORT = 5373
const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`

// Drives the dev server with the system-installed Chrome (no Chromium download).
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
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
