# syntax=docker/dockerfile:1.7
# ============================================================
# News Monitor - Production Dockerfile
# Multi-stage build: deps -> builder -> runner
# Target: Next.js 15 standalone output (minimal image size)
#
# 注意: Next.js 15 + experimental.serverActions 时需要
# NEXT_PRIVATE_STANDALONE=1 才能生成 .next/standalone 目录。
# ============================================================
# ---------- Stage 1: deps ----------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat wget
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
# ---------- Stage 2: builder ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# build-time flags
ENV NEXT_TELEMETRY_DISABLED=1
# 强制 Next.js 15 生成 .next/standalone 目录（否则 Docker 构建会失败）
ENV NEXT_PRIVATE_STANDALONE=1
ENV NODE_ENV=production
RUN npm run build
# ---------- Stage 3: runner ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# 非 root 用户运行（安全基线）
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
# 仅复制运行所需产物（standalone 输出 + 静态资源 + 抓取脚本）
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
USER nextjs
EXPOSE 3000
# 健康检查（依赖 /api/health 端点）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
