FROM oven/bun:1.3.14-alpine AS base
WORKDIR /app

# Copy package manifests first for layer caching.
# bun install only re-runs when these files change.
COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json ./apps/api/
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

RUN bun install --ignore-scripts

# Copy source after dependencies are installed.
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN bun run db:generate

ENV NODE_ENV=production
EXPOSE 3001

CMD ["bun", "run", "apps/api/src/index.ts"]
