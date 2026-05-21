# ==========================================
# Stage 1: Build & Prepare Workspace
# ==========================================
FROM oven/bun:1.3.14-alpine AS builder

WORKDIR /app

# 1. 复制依赖描述文件，最大限度利用 Docker 层缓存
COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/app/package.json ./apps/app/
COPY packages/auth/package.json ./packages/auth/
COPY packages/db/package.json ./packages/db/
COPY packages/emails/package.json ./packages/emails/
COPY packages/events/package.json ./packages/events/
COPY packages/logger/package.json ./packages/logger/
COPY packages/redis/package.json ./packages/redis/
COPY packages/s3/package.json ./packages/s3/
COPY packages/stripe/package.json ./packages/stripe/
COPY packages/trpc/package.json ./packages/trpc/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/

# 安装所有依赖（锁版本）
RUN bun install --frozen-lockfile --ignore-scripts

# 2. 复制全部源码并进行编译
COPY packages/ ./packages/
COPY apps/ ./apps/

# 生成 Prisma 客户端
RUN bun run db:generate

# 接收 Dokploy 的构建参数以编译进前端包中
ARG VITE_BASE_URL
ARG VITE_API_URL
ENV VITE_BASE_URL=$VITE_BASE_URL
ENV VITE_API_URL=$VITE_API_URL

# 编译前端 SPA 应用 (产物保存在 apps/app/dist)
RUN bun run build --filter=@openads/app


# ==========================================
# Stage 2: Production Runner (极简安全镜像)
# ==========================================
FROM oven/bun:1.3.14-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production


# 从 builder 阶段仅复制运行必需的文件
COPY --from=builder /app/package.json /app/bun.lock /app/turbo.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/apps/app/dist ./apps/app/dist
COPY --from=builder /app/apps/app/package.json ./apps/app/package.json

# 复制并配置启动脚本
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

# 提前创建日志目录，并将所有权赋予非 root 用户 bun
RUN mkdir -p /app/apps/api/logs && chown -R bun:bun /app

# 声明端口
EXPOSE 3001 5183

# 切换为 Bun 官方镜像内置的安全非 root 用户 "bun"
USER bun

CMD ["./docker-entrypoint.sh"]
