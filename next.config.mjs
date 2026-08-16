/**
 * Next.js 配置（含 Sentry 包装）
 */
import { withSentryConfig } from '@sentry/nextjs'

const securityHeaders = [
  // 防点击劫持：禁止任何页面用 iframe 嵌套本站
  { key: 'X-Frame-Options', value: 'DENY' },
  // 防 MIME 嗅探：浏览器不得猜测文件类型（避免 text 被当 JS 执行）
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // 控制 Referer 泄漏：跨站跳转只带 origin，不带完整 URL 路径
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // 强制 HTTPS：禁止降级到 HTTP（避免中间人篡改）
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // CSP：声明页面允许加载的资源来源（防 XSS 注入）
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js App Router 用 inline script（self.__next_f.push）注入 RSC 流式数据，
      // 未配 nonce 时 script-src 必须允许 'unsafe-inline'，否则 hydration 中断报 "Connection closed"。
      // static.cloudflareinsights.com 是 Cloudflare Web Analytics 的 beacon 脚本。
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://pbs.twimg.com https://ph-uploads.imgix.net https://raw.githubusercontent.com https://avatars.githubusercontent.com",
      "font-src 'self' https://fonts.gstatic.com",
      // 注意：Sentry ingest 域名 o<orgid>.ingest.sentry.io 已被 https://*.sentry.io 覆盖；
      // 原先的 https://o*.ingest.sentry.io 是非法 host-source（通配符不能嵌在 host 中间），会被浏览器忽略
      "connect-src 'self' https://*.sentry.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output 让 `next build` 生成 server.js + 必要依赖到 .next/standalone
  // Docker 构建时只需 COPY 该目录，大幅减小镜像体积
  output: 'standalone',
  // 全站安全响应头（验证: securityheaders.com）
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
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
