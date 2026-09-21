import { test, expect } from '@playwright/test'

/**
 * 运维仪表盘回归防线 —— 覆盖 PR #14 事故（NEWS-MONITOR-3 `.map` 崩溃）
 *
 * 历史根因：`/api/admin/metrics` 返回 500 时，前端把 `{error}` 当 metrics 渲染，
 * `metrics.sourceStats.map` 直接崩溃。修复后增加了 res.ok 检查 + isValidMetrics 校验。
 * 这里用 page.route 在浏览器网络层拦截，复现事故现场，断言页面优雅降级而非崩溃。
 */
test.describe('运维仪表盘', () => {
  test.beforeEach(async ({ page }) => {
    // 设置管理员 token（任意值即可；metrics 请求会被下方 route 拦截，不经后端鉴权）
    await page.addInitScript(() => {
      localStorage.setItem('news_monitor_admin_token', 'e2e-test-token')
    })
  })

  test('metrics 返回 500 时页面优雅降级、不崩溃', async ({ page }) => {
    await page.route('**/api/admin/metrics', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      }),
    )
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/dashboard')

    // 仪表盘标题可见 = 未崩溃（修复后 500 被 res.ok 检查拦截，保留空态、不抛异常）
    await expect(page.getByRole('heading', { name: '运维仪表盘' })).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('metrics 返回结构异常 payload（200 + {error}）时页面不崩溃', async ({ page }) => {
    // 复现历史根因的另一形态：响应 200 但 body 不是合法 metrics 结构
    await page.route('**/api/admin/metrics', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      }),
    )
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/dashboard')

    await expect(page.getByRole('heading', { name: '运维仪表盘' })).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('metrics 正常时仪表盘渲染来源统计卡片', async ({ page }) => {
    await page.route('**/api/admin/metrics', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recentRuns: [],
          dailyStats: [],
          sourceStats: [
            {
              source: 'github',
              lastRun: '2026-08-16T00:00:00.000Z',
              lastStatus: 'success',
              successRate: 100,
              totalItems: 10,
            },
          ],
          alerts: [],
          aiUsage: {
            todayCalls: 1,
            todayInputTokens: 100,
            todayOutputTokens: 200,
            todayFailures: 0,
            totalCalls: 1,
            totalInputTokens: 100,
            totalOutputTokens: 200,
            totalFailures: 0,
            byOperation: [],
            daily: [],
          },
        }),
      }),
    )
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/dashboard')

    await expect(page.getByRole('heading', { name: '运维仪表盘' })).toBeVisible()
    await expect(page.getByText('GitHub')).toBeVisible()
    expect(pageErrors).toEqual([])
  })
})
