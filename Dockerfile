FROM node:20-slim AS frontend-build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_API_BASE=/
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM node:20-slim AS server-deps
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-slim AS final

ENV NODE_ENV=production \
    DINGCARD_IMAGE=1 \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_ROOT=/app/dist

WORKDIR /app

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY --from=frontend-build /app/dist ./dist

RUN mkdir -p /data/uploads && chown -R node:node /data

WORKDIR /app/server
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
