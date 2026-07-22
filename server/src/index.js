// DingCard backend process entry.

import { buildApp } from './app.js'
import { config } from './config.js'

let app
try {
  app = await buildApp()
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  if (app) {
    app.log.error(error)
    try {
      await app.close()
    } catch (closeError) {
      app.log.error(closeError)
    }
  } else {
    console.error('Server startup failed', error)
  }
  process.exitCode = 1
}
