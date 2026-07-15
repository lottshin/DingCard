import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Integration config — runs the app against the REAL backend.
 *
 * Two servers are started (Playwright waits for both):
 *   1. Fastify + SQLite backend on :3100, with a throwaway temp DATA_DIR and
 *      CORS opened to the frontend origin.
 *   2. Vite dev server on :5273, built with VITE_API_BASE pointing at the
 *      backend so the app runs in REMOTE mode.
 *
 * Kept separate from playwright.config.ts (which tests the default LOCAL mode)
 * so the two suites never share ports, servers, or storage.
 */

const BACKEND_PORT = 3100
const FRONTEND_PORT = 5273
const FRONTEND_ORIGIN = `http://localhost:${FRONTEND_PORT}`
const API_BASE = `http://localhost:${BACKEND_PORT}`

// A throwaway data dir per run so the SQLite db + uploads never touch real data.
const dataDir = mkdtempSync(path.join(tmpdir(), 'dinka-it-'))

export default defineConfig({
  testDir: './e2e-integration',
  timeout: 30_000,
  fullyParallel: false,
  // One worker: the backend is a single shared SQLite instance.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: FRONTEND_ORIGIN,
    channel: 'chrome',
    headless: true,
  },
  webServer: [
    {
      // Real backend. NODE_ENV=production forces a real JWT_SECRET check.
      command: 'npm --prefix server run start',
      url: `${API_BASE}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'production',
        JWT_SECRET: 'integration-test-secret-not-for-prod',
        DATA_DIR: dataDir,
        PORT: String(BACKEND_PORT),
        HOST: '127.0.0.1',
        CORS_ORIGINS: FRONTEND_ORIGIN,
      },
    },
    {
      // Frontend in remote mode.
      command: `npm run dev -- --port ${FRONTEND_PORT} --strictPort`,
      url: FRONTEND_ORIGIN,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_API_BASE: API_BASE,
      },
    },
  ],
})
