import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * 移动端适配回归防线（真实 Chromium + 375px 触屏视口）
 *
 * 覆盖单测与 jsdom 覆盖不到的窄屏运行时问题：
 * - 横向溢出：375px 下出现横向滚动条 = 布局崩了（最常见且最刺眼）
 * - 触控目标：关键操作按钮的实际可点区域（jsdom 不做布局，测不了）
 * - 抽屉交互：打开 / 点遮罩关闭 / Esc 关闭 / 锁背景滚动
 * - 桌面专属布局在小屏是否真的让位（仪表盘 7 列表格 → 卡片）
 * - hover-only 信息在触屏上是否有出口（图表数值）
 *
 * 独立 spec 文件 + test.use 而非新增 project：避免整个 e2e 套件在两个
 * 视口下重复跑一遍，CI 时间翻倍。
 */
const MOBILE = {
  viewport: { width: 375, height: 667 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
} as const

/** 页面横向溢出量（>0 即出现横向滚动条） */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const de = document.documentElement
    return de.scrollWidth - de.clientWidth
  })
}

/**
 * 元素的实际可点区域尺寸。
 *
 * 按文本内容定位而非 CSS 选择器：`:has-text()` 是 Playwright 私有语法，
 * 放进 page.evaluate 里会直接抛 "not a valid selector"。
 */
async function tapSizeOf(page: Page, text: string): Promise<{ w: number; h: number } | null> {
  return page.evaluate((t) => {
    const el = Array.from(document.querySelectorAll('button, a')).find((e) =>
      (e.textContent ?? '').includes(t),
    )
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  }, text)
}

const METRICS_FIXTURE = {
  recentRuns: [
    {
      id: 'r1',
      source: 'github',
      stage: 'scrape',
      status: 'success',
      itemsCount: 12,
      durationMs: 1500,
      error: null,
      startedAt: new Date().toISOString(),
    },
  ],
  dailyStats: [
    {
      date: '2026-09-01',
      source: 'github',
      totalRuns: 1,
      successes: 1,
      failures: 0,
      totalItems: 20,
    },
  ],
  sourceStats: [
    {
      source: 'github',
      lastRun: new Date().toISOString(),
      lastStatus: 'success',
      successRate: 100,
      totalItems: 20,
    },
  ],
  alerts: [],
  aiUsage: {
    todayCalls: 3,
    todayInputTokens: 1200,
    todayOutputTokens: 340,
    todayFailures: 0,
    totalCalls: 30,
    totalInputTokens: 12000,
    totalOutputTokens: 3400,
    totalFailures: 1,
    byOperation: [
      {
        operation: 'batchSummarize',
        calls: 3,
        inputTokens: 1200,
        outputTokens: 340,
        failures: 0,
        successRate: 100,
      },
    ],
    daily: [{ date: '2026-09-01', calls: 3, inputTokens: 1200, outputTokens: 340, failures: 0 }],
  },
}

test.describe('移动端适配', () => {
  test.use(MOBILE)

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('news_monitor_admin_token', 'e2e-mobile-token')
    })
  })

  for (const path of ['/', '/archive', '/settings']) {
    test(`${path} 在 375px 下无横向溢出`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (err) => pageErrors.push(err.message))

      await page.goto(path, { waitUntil: 'load' })

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
      expect(pageErrors).toEqual([])
    })
  }

  test('仪表盘在 375px 下用卡片展示运行日志，而非横向滚动的宽表格', async ({ page }) => {
    await page.route('**/api/admin/metrics', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(METRICS_FIXTURE),
      }),
    )

    await page.goto('/dashboard', { waitUntil: 'load' })

    // 窄屏看不到 7 列表格（它被 md: 断点隐藏）
    await expect(page.locator('table')).toBeHidden()
    // 但卡片列表可见且承载同一条运行记录
    await expect(page.getByText('成功').first()).toBeVisible()
    await expect(page.getByText('12 条')).toBeVisible()

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)

    // 触屏没有 hover：柱状图数值必须有非 hover 的可读版本
    await expect(page.getByText(/3 次/).first()).toBeVisible()
  })

  test('移动端抽屉：可打开、点遮罩关闭、打开时背景锁定滚动', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' })

    const toggle = page.getByRole('button', { name: '打开菜单' })
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await toggle.tap()
    const drawer = page.locator('#mobile-menu')
    await expect(drawer).toBeVisible()
    await expect(page.getByRole('button', { name: '关闭菜单' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    // 小屏曾经缺失的入口：设置
    await expect(drawer.getByRole('link', { name: /设置/ })).toBeVisible()

    // 展开时背景不可滚动（锁 body overflow）
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

    // 点遮罩关闭
    const backdrop = page.locator('#mobile-menu-backdrop')
    await expect(backdrop).toBeAttached()
    const box = await backdrop.boundingBox()
    expect(box).not.toBeNull()
    // 抽屉在 375x667 下高约 300px，从视口底部往上点必定落在遮罩而非抽屉上
    await backdrop.tap({ position: { x: 20, y: box!.height - 30 } })

    await expect(drawer).toBeHidden()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  })

  test('移动端抽屉：设置入口可导航到设置页', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' })
    await page.getByRole('button', { name: '打开菜单' }).tap()
    await page.locator('#mobile-menu').getByRole('link', { name: /设置/ }).tap()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  })

  test('关键操作按钮的触控区域不小于 44px', async ({ page }) => {
    // 访客态才有「管理员登录」按钮（管理员态顶栏换成徽章 + 退出）。
    // 注意 addInitScript 在**每次**导航都会重跑并写回 token，
    // 所以必须再注册一个「后执行」的移除脚本，顺序上覆盖掉它。
    await page.addInitScript(() => localStorage.removeItem('news_monitor_admin_token'))
    await page.goto('/archive', { waitUntil: 'load' })

    // 顶栏「管理员登录」——窄屏下原本只有约 36px 高
    const login = page.getByRole('button', { name: /管理员登录/ })
    await expect(login).toBeVisible()

    const size = await tapSizeOf(page, '管理员登录')
    expect(size).not.toBeNull()
    expect(size!.h).toBeGreaterThanOrEqual(44)
  })

  test('来源标签条可横向滚动，且不再留下可见滚动条', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' })
    const scroller = page.getByLabel('按来源筛选')
    await expect(scroller).toBeVisible()

    // scrollbar-hide 真正生效：scrollbarWidth 为 none
    // （此前该类只写了名字、从未定义，窄屏上留了一条 6px 灰条）
    const scrollbarWidth = await scroller.evaluate((el) => getComputedStyle(el).scrollbarWidth)
    expect(scrollbarWidth).toBe('none')
  })
})
