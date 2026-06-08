FROM oven/bun:1.3.14-alpine AS base
WORKDIR /app

# Copy the entire monorepo into the container.
# We rely on .dockerignore to exclude node_modules, .env files, and build artifacts.
COPY . .

# Install dependencies. --ignore-scripts skips postinstall (db:generate runs separately).
RUN bun install --ignore-scripts

# Generate Prisma client after dependencies are installed.
RUN bun run db:generate

# Set environment to production
ENV NODE_ENV=production
# Expose the default port (can be overridden via env)
EXPOSE 3001

# Run the API directly with bun
CMD ["bun", "run", "apps/api/src/index.ts"]
