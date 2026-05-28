# ==================== 第一阶段：构建 ====================
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖文件，利用 Docker 层缓存
COPY package.json package-lock.json ./
RUN npm install

# 声明构建参数：由 docker build --build-arg 传入
ARG DEPLOY_ENV
ENV DEPLOY_ENV=$DEPLOY_ENV

# 复制源码并构建
COPY . .
RUN npm run build

# ==================== 第二阶段：运行 ====================
# 只保留 Nginx + dist，丢弃 node_modules 和 Node.js（体积从 ~1GB → ~20MB）
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
