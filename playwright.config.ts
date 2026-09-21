import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 配置
 *
 * 目标：用真实 Chromium 跑「生产构建 + 生产启动方式」，覆盖 jsdom/单测/集成
 * 测试都覆盖不到的浏览器运行时行为：
 * - CSP 拦截 inline script → "Connection closed"（PR #15 事故）
 * - 页面级渲染崩溃（PR #14 dashboard `.map` 事故）
 *
 * webServer 通过 `npm run start:e2e` 启动（= scripts/start-e2e.sh，与
 * Dockerfile 一致用 `node .next/standalone/server.js`，需先 `npm run build`），
 * 以 /api/health 探活。health 会真实探测 DB（SELECT 1），DB 未就绪时返回 503，
 * Playwright 会持续重试，因此 E2E 天然要求 DB 已迁移就绪。
 */
const PORT = Number(process.env.PORT ?? 3000)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start:e2e',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
