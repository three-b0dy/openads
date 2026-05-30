FROM oven/bun:1 AS base
WORKDIR /app

# Copy the entire monorepo into the container
# We rely on .dockerignore to exclude node_modules, .env files, and build artifacts
COPY . .

# Install dependencies for the monorepo.
# This will also run the postinstall script (db:generate) to generate the Prisma client.
RUN bun install --frozen-lockfile

# Set environment to production
ENV NODE_ENV=production
# Expose the default port (can be overridden via env)
EXPOSE 3001

# Run the API directly with bun
CMD ["bun", "run", "apps/api/src/index.ts"]
