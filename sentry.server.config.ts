/**
 * Sentry 服务端配置（Node.js runtime）
 * 由 Sentry SDK 在 Next.js 服务端启动时自动加载
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
    debug: false,
    environment: process.env.NODE_ENV,
    // 过滤掉已知的噪音错误
    ignoreErrors: [
      // Next.js 的 HMR 噪音
      'AbortError',
      // 健康检查不应上报
      'ECONNRESET',
    ],
    beforeSendTransaction(event) {
      // 健康检查事务不上报
      if (event.transaction === '/api/health') return null
      return event
    },
  })
}
