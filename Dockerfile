# Writium – backend + static frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Backend deps
COPY package.json package-lock.json ./
RUN npm ci

# Source and build backend
COPY . .
RUN npm run build

# Frontend deps and static export
RUN cd frontend && npm ci
RUN node scripts/build-frontend.mjs

# ---
FROM node:20-alpine

WORKDIR /app

# Production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY schema ./schema

ENV NODE_ENV=production
EXPOSE 3002

CMD ["node", "dist/server.js"]
