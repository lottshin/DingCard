import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Two entries: the app (index.html) and the headless render page used by
      // the dingcard-mcp automation surface (render.html).
      input: {
        main: 'index.html',
        render: 'render.html',
      },
    },
  },
})
