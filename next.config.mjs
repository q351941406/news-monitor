/**
 * Next.js 配置（含 Sentry 包装）
 */
import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output 让 `next build` 生成 server.js + 必要依赖到 .next/standalone
  // Docker 构建时只需 COPY 该目录，大幅减小镜像体积
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
    // 让 instrumentation hook 生效 (Next.js 15)
    instrumentationHook: true,
  },
}

export default withSentryConfig(nextConfig, {
  // 禁用 telemetry 提示横幅
  silent: true,
  // 组织/项目默认值，应用启动时会从 SENTRY_ORG / SENTRY_PROJECT 环境变量读取
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // 不在 build 时上传 source maps 到 Sentry（需要 SENTRY_AUTH_TOKEN）
  // 想启用时配置 SENTRY_AUTH_TOKEN 并改为 true
  widenClientFileUpload: false,
  hideSourceMaps: true,
  disableLogger: true,
})
