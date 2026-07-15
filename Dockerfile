# 叮卡前端镜像 —— 构建 React 产物,用 Nginx 出静态页 + 反代后端。
#
# 多阶段构建:
#   build 阶段用 Node 打包出 dist/(静态文件)
#   final 阶段用 nginx 出 dist/,并反代 /api 到后端容器、直出 /uploads
#
# 前后端同源:浏览器所有请求都经这一个 Nginx,VITE_API_BASE=/ 让前端用同源
# 相对路径(/api/... 与 /uploads/...),因此不需要 CORS。

# ---- build: 打包前端静态产物 --------------------------------------------
FROM node:20-slim AS build
WORKDIR /app

# 先只拷清单装依赖,借助层缓存:依赖没变则跳过重装。
COPY package.json package-lock.json ./
RUN npm ci

# 再拷源码构建。VITE_API_BASE 是构建期注入(Vite 把它固化进静态文件),
# 默认 "/" = 同源部署。前后端分离域名时可在 build 时用 --build-arg 覆盖。
COPY . .
ARG VITE_API_BASE=/
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# ---- final: Nginx 出静态页 ----------------------------------------------
FROM nginx:1.27-alpine AS final

# 用我们的配置替换默认站点(SPA 回退 + /api 反代 + /uploads 直出)。
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# 只拷贝构建产物,不带任何源码或 node_modules。
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx 官方镜像自带 CMD(前台运行),无需覆盖。
