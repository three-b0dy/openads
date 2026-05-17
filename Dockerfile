FROM oven/bun:1-alpine

WORKDIR /app

# 安装必要的依赖
COPY package.json bun.lock turbo.json ./
COPY apps/ apps/
COPY packages/ packages/

# 安装所有依赖并生成 Prisma Client
RUN bun install
RUN bun run db:generate

# 编译前端应用
RUN bun run build --filter=@openads/app

# 全局安装静态文件服务器
RUN bun add -g sirv-cli

# 复制启动脚本
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

EXPOSE 3001 5183

CMD ["./docker-entrypoint.sh"]
