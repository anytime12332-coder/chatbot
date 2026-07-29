# Stage 1: Build frontend
FROM node:18-alpine AS frontend-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Production server
FROM node:18-alpine AS production
WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json* ./server/
WORKDIR /app/server
RUN npm install --production

# Generate Prisma client
COPY server/prisma ./prisma
RUN npx prisma generate

# Copy server source
COPY server/src ./src

# Copy built frontend
COPY --from=frontend-build /app/client/dist /app/client/dist

# Startup script:
# 1. Try migrate deploy first (for existing DBs with migration history)
# 2. If that fails, use db push (for fresh DBs, forces schema sync)
# 3. Seed the database
# 4. Start the server
RUN printf '#!/bin/sh\n\
cd /app/server\n\
echo "=== Step 1: Database migration ==="\n\
npx prisma migrate deploy 2>&1 || (echo "migrate failed, trying db push..." && npx prisma db push --accept-data-loss 2>&1) || echo "WARNING: DB sync failed"\n\
echo "=== Step 2: Seed database ==="\n\
node src/seed.js 2>&1 || echo "WARNING: Seed failed"\n\
echo "=== Step 3: Start server ==="\n\
exec node src/index.js\n' > /app/start.sh && chmod +x /app/start.sh

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["/app/start.sh"]
