# 叮卡后端镜像 —— Fastify + SQLite。
#
# 多阶段构建:
#   deps  阶段只装生产依赖(含 better-sqlite3 的原生模块编译/预编译)
#   final 阶段拷贝 node_modules + 源码,以非 root 用户运行
#
# 基础镜像用 Debian slim(node:20-slim)而非 Alpine:better-sqlite3 是原生
# 模块,glibc 环境有现成预编译包,免装编译链、免踩 musl 重编译的坑。

# ---- deps: 安装生产依赖 --------------------------------------------------
FROM node:20-slim AS deps
WORKDIR /app

# 只拷贝清单文件,借助 Docker 层缓存:依赖没变则跳过重装。
COPY package.json package-lock.json ./

# npm ci 严格按 lockfile 安装,--omit=dev 只装生产依赖。
RUN npm ci --omit=dev

# ---- final: 运行镜像 -----------------------------------------------------
FROM node:20-slim AS final

# 生产环境标记(config.js 据此强制校验 JWT_SECRET 等)。
ENV NODE_ENV=production

WORKDIR /app

# 从 deps 阶段拷贝已装好的依赖,再拷贝源码。
# /app 保持 root 属主、对运行用户只读 —— 进程改不了自己的代码,更安全;
# 也避免 chown -R 递归复制整个 node_modules 撑大镜像。
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# 数据目录(SQLite 库 + 上传图片)。容器内固定为 /data,由 compose 挂载到宿主机
# 数据卷持久化。只有这里需要运行时可写,故只把 /data 交给非 root 用户 node。
# (compose 挂载命名卷时会沿用镜像里 /data 的属主,保证卷可写。)
RUN mkdir -p /data/uploads && chown -R node:node /data
ENV DATA_DIR=/data

# 以内置的非 root 用户 node 运行,降低容器逃逸风险。
USER node

# 后端监听端口。0.0.0.0 让容器网络内的 Nginx 能访问(见 compose)。
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

# 健康检查:直接打 /api/health。Node 20 自带 fetch,无需额外依赖。
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
