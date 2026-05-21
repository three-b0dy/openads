#!/bin/sh

# 确保环境变量正确
export NODE_ENV=production

# 运行 Prisma 数据库推送（自动同步 schema，在单租户/Saas 下非常省心）
echo "==> Pushing database schema..."
bun run db:push --accept-data-loss

# 1. 在后台启动 API 服务 (端口 3001)
echo "==> Starting API server on port 3001..."
bun run --cwd apps/api src/index.ts &
API_PID=$!

# 2. 在后台启动前端静态网页服务器 (端口 5183)
echo "==> Starting Web server on port 5183..."
sirv apps/app/dist --port 5183 --single --host 0.0.0.0 &
WEB_PID=$!

# 3. 进程健康监控循环 (POSIX 兼容，完美支持 Alpine Linux)
echo "==> Application service monitor started."
while kill -0 $API_PID 2>/dev/null && kill -0 $WEB_PID 2>/dev/null; do
  sleep 3
done

# 4. 如果走到这里，说明其中一个服务挂掉了，退出容器触发 Dokploy 重启
echo "==> ERROR: One of the background services (API or Web) crashed!"
echo "==> Cleaning up remaining processes..."

kill $API_PID $WEB_PID 2>/dev/null
exit 1
