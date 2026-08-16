#!/usr/bin/env bash
# E2E 专用生产启动脚本（与 Dockerfile runner 阶段一致）
#
# 背景：项目配置了 `output: 'standalone'`，官方不推荐 `next start`。
# 生产 Docker 用 `node .next/standalone/server.js` 启动，但 standalone
# 目录不含静态资源，需先复制 `.next/static` 与 `public`（见 Dockerfile）。
# 本脚本复刻这一过程，确保 E2E 跑在「生产启动方式」下，覆盖 CSP/RSC
# hydration 等运行时行为。
#
# 注意：必须显式设置 HOSTNAME=0.0.0.0。standalone server 读取
# process.env.HOSTNAME 作为监听地址，而沙盒/CI 容器里系统 HOSTNAME
# 环境变量默认是容器 hostname，会导致仅监听该 hostname、localhost 无法访问。
set -euo pipefail

cd "$(dirname "$0")/.."

# 前置：必须先 `npm run build` 生成 .next/standalone
if [ ! -f .next/standalone/server.js ]; then
  echo "❌ .next/standalone/server.js 不存在，请先运行 npm run build" >&2
  exit 1
fi

# 复制静态资源（幂等：重复执行覆盖即可）
cp -r .next/static .next/standalone/.next/static
if [ -d public ]; then
  cp -r public .next/standalone/public
fi

# 与 Dockerfile runner 阶段保持一致
export HOSTNAME=0.0.0.0
export PORT=3000

cd .next/standalone
exec node server.js
