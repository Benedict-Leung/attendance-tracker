# syntax=docker/dockerfile:1

ARG NODE_VERSION=25
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app

# 1. Install pnpm
RUN npm install -g pnpm

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# Production
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nodeuser -G nodejs -u 1001
USER nodeuser

COPY --chown=nodeuser:nodejs --from=build /app/.next/standalone ./
COPY --chown=nodeuser:nodejs --from=build /app/.next/static ./.next/static
COPY --chown=nodeuser:nodejs --from=build /app/public ./public

EXPOSE 3000

CMD ["node","server.js"]