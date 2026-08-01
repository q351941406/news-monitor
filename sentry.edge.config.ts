/**
 * Sentry Edge runtime 配置
 * 用于 Next.js middleware 和 edge API routes
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    debug: false,
  })
}
