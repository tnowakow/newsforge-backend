#!/bin/sh
set -e

echo "=== NewsForge start.sh ==="
echo "Node: $(node --version)"
echo "NPM: $(npm --version)"

# Install dependencies
echo "Installing dependencies..."
npm ci --include=dev

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate --schema prisma/schema.prisma

# Build shared package and API
echo "Building shared package..."
npm run build:shared

echo "Building API..."
npm run build:api

# Build web frontend
echo "Building web frontend..."
npm -w @newsforge/web run build

# Run migrations
echo "Running Prisma migrations..."
npx prisma migrate deploy --schema prisma/schema.prisma

# Seed database
echo "Seeding database..."
npx tsx prisma/seed.ts

# Start the API server
echo "Starting NewsForge API on port 3001..."
node apps/api/dist/index.js
