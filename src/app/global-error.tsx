'use client'

import * as Sentry from '@sentry/nextjs'

import { useEffect } from 'react'

/**
 * 全局错误边界 — Next.js 15 + Sentry 官方模板
 * 捕获根布局之外的未处理错误并上报到 Sentry
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            fontFamily: 'system-ui, sans-serif',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>页面出错了</h1>
          <p style={{ color: '#666', marginBottom: '2rem' }}>
            我们已记录此错误，请稍后重试。
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.6rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: '#111827',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  )
}
