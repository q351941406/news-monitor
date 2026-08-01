/**
 * Sentry 客户端配置
 * 由 Sentry SDK 在 Next.js 客户端启动时自动加载
 *
 * 不启用 = DSN 为空时，SDK 会变成 noop
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    debug: false,
    environment: process.env.NODE_ENV,
  })
}
