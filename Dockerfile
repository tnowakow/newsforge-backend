# NewsForge backend Dockerfile for Railway
# Multi-stage: build -> runtime
# Migrations + seed run at startup (need DATABASE_URL at runtime)

FROM node:22-alpine AS builder
ARG BUILD_TIME=1784264126

# OpenSSL required by Prisma engines
RUN apk add --no-cache openssl openssl-dev libc6-compat

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci --include=dev

COPY . .

# Generate Prisma client and build
RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build:shared
RUN npm run build:api
RUN npm -w @newsforge/web run build

# Runtime
FROM node:22-alpine

# OpenSSL + Chromium deps for Puppeteer/Prisma
RUN apk add --no-cache openssl libc6-compat chromium nss freetype harfbuzz ca-certificates ttf-freefont

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/src ./apps/api/src
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production

EXPOSE 3001

# Run migrations + seed at startup, then start the API
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && npx tsx prisma/seed.ts && node apps/api/dist/index.js"]
# Build trigger 1784263665
