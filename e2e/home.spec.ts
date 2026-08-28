import { test, expect } from '@playwright/test'

/**
 * 首页真实浏览器冒烟 + 运行时回归防线
 *
 * 覆盖 PR #15 事故（CSP 拦截 RSC inline script → "Connection closed"）：
 * 只有真实 Chromium 才会执行 CSP 策略并走 SSR → RSC 流式渲染 → hydration 全链路，
 * jsdom 组件测试与 next build 都无法发现这类运行时故障。
 */
test.describe('首页', () => {
  test('加载正常：无 CSP 拦截、无 Connection closed、无未捕获异常', async ({ page }) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/')

    // 站点标题（Header）可见
    await expect(page.getByRole('heading', { name: 'News Monitor' })).toBeVisible()

    // 空库时展示空态（证明 SSR 数据流完整到达客户端并完成 hydration，而非错误边界兜底）
    await expect(page.getByText(/暂无数据|没有未读内容/)).toBeVisible()

    // 无未捕获异常（覆盖 "Connection closed"、`.map` 崩溃等运行时错误）
    expect(pageErrors).toEqual([])

    // 无 CSP 拦截相关错误（PR #15 事故的回归防线）
    const cspRelated = consoleErrors.filter(
      (e) => e.includes('Content Security Policy') || e.includes('Connection closed'),
    )
    expect(cspRelated).toEqual([])
  })

  test('访问 404 页面不崩溃（错误边界降级而非白屏）', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    const res = await page.goto('/this-route-does-not-exist')

    expect(res?.status()).toBe(404)
    expect(pageErrors).toEqual([])
  })
})
