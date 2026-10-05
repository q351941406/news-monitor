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

/**
 * 交互不得牵动页面滚动位置
 *
 * 曾存在的 bug：SourceTabs 用 `el.scrollIntoView({ block: 'nearest' })`
 * 把选中标签滚入可视区，而该 API 会滚动**所有**可滚动祖先（含 <html>），
 * 且 effect 把父组件每次渲染都新建的 `sources` 数组列为依赖 —— 于是展开
 * 任意主题组都会触发它，页面被「平滑滚回顶部」，用户点的那一行瞬间飞出视口。
 *
 * 这类「API 副作用」jsdom 测不到（它没有布局、也没有真实滚动），必须由真实
 * Chromium 兜底。这里在页面脚本执行前替换 scrollIntoView 做记录：修复后整个
 * 组件不应再调用它，故该断言与「库里有数据」无关，空库下同样有效。
 */
test.describe('页面滚动稳定性', () => {
  test('切换来源筛选不得调用 scrollIntoView（该 API 会连带滚动整个页面）', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __sivCalls?: unknown[] }
      w.__sivCalls = []
      const original = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = function patched(this: Element, ...args: unknown[]) {
        w.__sivCalls?.push({ tag: this.tagName, args: JSON.stringify(args) })
        return original?.apply(this, args as [boolean | ScrollIntoViewOptions])
      }
    })

    await page.goto('/')
    const tabs = page.locator('[aria-label="按来源筛选"]').getByRole('button')
    const count = await tabs.count()
    expect(count).toBeGreaterThan(1)

    // 逐个切换来源：修复前每次都会命中那个 effect
    for (let i = 1; i < count; i++) {
      await tabs.nth(i).click()
    }
    await page.waitForTimeout(1000)

    const calls = await page.evaluate(
      () => (window as unknown as { __sivCalls?: unknown[] }).__sivCalls ?? [],
    )
    expect(calls).toEqual([])
  })
})
