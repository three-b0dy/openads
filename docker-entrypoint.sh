#!/bin/sh

# 确保环境变量被加载
export NODE_ENV=production

# 运行 Prisma 数据库推送（自动建表）
echo "Pushing database schema..."
bun run db:push --accept-data-loss

# 后台启动 API 服务 (端口 3001)
echo "Starting API server..."
bun run --cwd apps/api src/index.ts &

# 前台启动前端静态服务器 (端口 5183, 单页应用模式路由 fallback)
echo "Starting Web server..."
sirv apps/app/dist --port 5183 --single --host 0.0.0.0
