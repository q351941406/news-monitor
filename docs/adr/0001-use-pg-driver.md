# ADR-0001: 使用 pg 驱动替代 @neondatabase/serverless

## 日期

2026-07-23

## 状态

已采纳

## 背景

最初使用 @neondatabase/serverless 驱动，但 GitHub Actions 中的标准 PostgreSQL 服务容器无法连接（该驱动仅支持 Neon 的 HTTP 协议）。

## 决策

使用 pg (node-postgres) + drizzle-orm/node-postgres 替代。

## 影响

- 正面：兼容 Neon 和标准 PostgreSQL，CI 可用
- 正面：连接池管理更成熟
- 风险：需确保生产环境的 DATABASE_URL 支持 pg 协议
