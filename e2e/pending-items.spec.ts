import { test, expect } from '@playwright/test'
import { Pool } from 'pg'

/**
 * 「徽标有数字、列表没内容」的回归防线
 *
 * 真实事故（2026-10-20 生产实测）：
 *   GitHub 徽标显示 8，但列表整页空白 —— 内容已入库（raw_items 有 365 条），
 *   却没挂上任何主题组（topic_groups 为 0），于是：
 *     - 徽标按 raw_items 计数 → 显示 8
 *     - 列表按 topic_groups 渲染 → 什么都没有
 *     - 归档页只收已读条目 → 这 8 条未读的全站无处可寻
 *
 * 这里用真实 DB 造出同样的现场（未读、没有主题组），
 * 断言**徽标上的每个数字都能在页面上找到对应内容**。
 *
 * 注意：SSR 用的是未缓存的 getNewsCounts（page.tsx 直接调用），
 * 不受 /api/news/counts 的 60s 缓存影响。
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const PREFIX = `e2e-pending-${Date.now()}`

const ITEMS = [
  { id: `${PREFIX}:a`, title: `${PREFIX}-仓库A`, hoursAgo: 2 },
  { id: `${PREFIX}:b`, title: `${PREFIX}-仓库B`, hoursAgo: 3 },
  { id: `${PREFIX}:c`, title: `${PREFIX}-仓库C`, hoursAgo: 4 },
]

test.describe('待归组内容（徽标数字必须在页面上有对应物）', () => {
  test.beforeAll(async () => {
    const now = Date.now()
    for (const item of ITEMS) {
      await pool.query(
        `INSERT INTO raw_items (id, source, title, url, raw_data, is_read, fetched_at)
         VALUES ($1, 'github', $2, $3, $4, FALSE, $5)`,
        [
          item.id,
          item.title,
          `https://github.com/${item.id}`,
          JSON.stringify({ readme: `# ${item.title}` }),
          now - item.hoursAgo * 60 * 60 * 1000,
        ],
      )
    }
  })

  test.afterAll(async () => {
    await pool.query('DELETE FROM raw_items WHERE id LIKE $1', [`${PREFIX}:%`])
    await pool.end()
  })

  test('未读但没归组的条目会被渲染成「待归组内容」分组', async ({ page }) => {
    // 该源当前所有「未读且未归组」的条目数
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt
       FROM raw_items ri
       WHERE ri.source = 'github' AND ri.is_read = FALSE
         AND NOT EXISTS (SELECT 1 FROM topic_items ti WHERE ti.item_id = ri.id)`,
    )
    const expected = rows[0].cnt

    await page.goto('/')

    // 待归组分组存在，且条数与 DB 一致
    const pending = page.getByRole('button', { name: /待归组内容/ })
    await expect(pending).toBeVisible()
    await expect(pending).toContainText(`${expected} 条`)

    // 展开后，每条未归组内容都能被看到
    await pending.click()
    for (const item of ITEMS) {
      await expect(page.getByText(item.title, { exact: false }).first()).toBeVisible()
    }
  })

  test('徽标上的未读数字不再伴随「整页空白」', async ({ page }) => {
    await page.goto('/')
    // 页面要么有主题组，要么有待归组分组 —— 不能是两者皆无的空白页
    const hasTopics = await page.locator('main section[data-topic-id]').count()
    const hasPending = await page.locator('[data-pending-items="true"]').count()
    expect(hasTopics + hasPending).toBeGreaterThan(0)
  })
})
