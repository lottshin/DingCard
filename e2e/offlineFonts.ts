import type { BrowserContext } from '@playwright/test'

export async function installOfflineFontRoutes(context: BrowserContext): Promise<void> {
  await context.route(/^https?:\/\/fonts\.googleapis\.com\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '',
    }),
  )
  await context.route(/^https?:\/\/fonts\.gstatic\.com\//, (route) => route.abort())
}
