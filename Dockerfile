# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/cli/package.json ./packages/cli/
COPY packages/demo-mcp-server/package.json ./packages/demo-mcp-server/
COPY packages/test-harness/package.json ./packages/test-harness/

RUN npm ci

# Copy source code
COPY . .

# Build shared packages first
RUN npm run build -w @latch/shared

# Build the Next.js app
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy migration scripts and drizzle config
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/lib/db ./lib/db
COPY --from=builder /app/package.json ./

# Install only production dependencies needed for migrations
RUN npm install drizzle-kit drizzle-orm postgres dotenv --omit=dev

# Copy startup script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
