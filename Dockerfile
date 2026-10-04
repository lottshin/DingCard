FROM node:22-slim AS frontend-build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.node.json vite.config.ts index.html render.html ./
COPY public ./public
COPY src ./src
ARG VITE_API_BASE=/
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM node:22-slim AS server-deps
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# The server-side render library (mcp/dist/render.mjs): the same headless
# pipeline the MCP server uses, bundled once and shipped inside the image.
FROM node:22-slim AS render-lib
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.node.json ./
COPY src ./src
COPY mcp/package.json mcp/package-lock.json mcp/tsconfig.json ./mcp/
COPY mcp/src ./mcp/src
WORKDIR /app/mcp
RUN npm ci && npm run build

FROM node:22-slim AS final

ENV NODE_ENV=production \
    DINGCARD_IMAGE=1 \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_ROOT=/app/dist \
    DINGCARD_DIST_DIR=/app/dist \
    PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

WORKDIR /app

# Headless Chromium for POST /api/decks: the exact build matching the
# server's playwright-core driver — the version is read from the installed
# package, so browser and driver cannot drift apart — plus CJK fonts so
# Chinese cards render correctly inside the container.
COPY --from=server-deps /app/server/node_modules/playwright-core/package.json ./server/node_modules/playwright-core/package.json
RUN PLAYWRIGHT_DRIVER="$(node -e "console.log(require('./server/node_modules/playwright-core/package.json').version)")" \
    && npx --yes "playwright@${PLAYWRIGHT_DRIVER}" install --with-deps chromium \
    && apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY --from=frontend-build /app/dist ./dist
COPY --from=render-lib /app/mcp/dist/render.mjs ./mcp/dist/render.mjs
# render.mjs keeps playwright-core external; the server's node_modules serves it.
RUN ln -s /app/server/node_modules /app/mcp/node_modules

RUN mkdir -p /data/uploads && chown -R node:node /data

WORKDIR /app/server
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
