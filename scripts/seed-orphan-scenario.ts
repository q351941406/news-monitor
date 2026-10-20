/**
 * 种子数据：**复现 2026-10 线上事故的形态**
 *
 * 用法: npx tsx scripts/seed-orphan-scenario.ts
 *
 * 复现的现场（2026-10-20 生产实测）：
 *   github：365 条原始数据、8 条未读、**0 个主题组**
 *     → 徽标显示 8，列表整页空白，且这 8 条全站无处可寻
 *   producthunt / twitter：正常有主题组
 *
 * 用途：本地验证「待归组内容」分组确实把这些条目渲染出来了
 * （而不是只验证代码不报错）。同时作为回归夹具保留。
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const HOUR = 60 * 60 * 1000

/** 生产现场的 8 条未读（2 条刚抓到没摘要、6 条有摘要但从未落组） */
const GITHUB_UNREAD: Array<{ id: string; title: string; hoursAgo: number; summarized: boolean }> = [
  {
    id: 'github:withmarbleapp/os-taxonomy',
    title: 'withmarbleapp/os-taxonomy',
    hoursAgo: 2,
    summarized: false,
  },
  {
    id: 'github:headroomlabs-ai/headroom',
    title: 'headroomlabs-ai/headroom',
    hoursAgo: 2,
    summarized: false,
  },
  {
    id: 'github:mlabonne/llm-course',
    title: 'mlabonne/llm-course',
    hoursAgo: 26,
    summarized: true,
  },
  { id: 'github:kruk2/jasna', title: 'Kruk2/jasna', hoursAgo: 26, summarized: true },
  {
    id: 'github:deepseek-ai/deepgemm',
    title: 'deepseek-ai/DeepGEMM',
    hoursAgo: 200,
    summarized: true,
  },
  { id: 'github:willfaust/madeira', title: 'willfaust/Madeira', hoursAgo: 300, summarized: true },
  { id: 'github:openbao/openbao', title: 'openbao/openbao', hoursAgo: 400, summarized: true },
  {
    id: 'github:alishahryar1/free-claude-code',
    title: 'Alishahryar1/free-claude-code',
    hoursAgo: 500,
    summarized: true,
  },
]

async function main() {
  const now = Date.now()

  // 清空（可重复执行）
  await pool.query('TRUNCATE topic_items, topic_groups, ai_analysis, raw_items CASCADE')

  // ── github：365 条，8 条未读，0 个主题组 ──────────────────────────
  for (let i = 0; i < 357; i++) {
    const id = `github:owner/repo-${i}`
    await pool.query(
      `INSERT INTO raw_items (id, source, title, url, raw_data, is_read, fetched_at)
       VALUES ($1, 'github', $2, $3, $4, TRUE, $5)`,
      [
        id,
        `owner/repo-${i}`,
        `https://github.com/owner/repo-${i}`,
        JSON.stringify({ readme: `# repo-${i}` }),
        now - (i + 10) * HOUR,
      ],
    )
    await pool.query(`INSERT INTO ai_analysis (item_id, summary, details) VALUES ($1, $2, $3)`, [
      id,
      `已读条目的摘要 ${i}`,
      `已读条目的详情 ${i}`,
    ])
  }
  for (const item of GITHUB_UNREAD) {
    await pool.query(
      `INSERT INTO raw_items (id, source, title, url, raw_data, is_read, fetched_at)
       VALUES ($1, 'github', $2, $3, $4, FALSE, $5)`,
      [
        item.id,
        item.title,
        `https://github.com/${item.title}`,
        JSON.stringify({ readme: `# ${item.title}` }),
        now - item.hoursAgo * HOUR,
      ],
    )
    if (item.summarized) {
      await pool.query(`INSERT INTO ai_analysis (item_id, summary, details) VALUES ($1, $2, $3)`, [
        item.id,
        `${item.title}：一个还没被归入任何主题的仓库摘要。`,
        `${item.title} 的补充细节。`,
      ])
    }
  }

  // ── producthunt / twitter：正常有主题组（对照） ──────────────────
  for (const [source, prefix, groups] of [
    ['producthunt', 'ph', ['AI 编码工具', '开发者效率工具']],
    ['twitter', 'x', ['Claude Code 生态']],
  ] as const) {
    for (let g = 0; g < groups.length; g++) {
      const topicId = `${source}:topic:seed:${g}`
      await pool.query(
        `INSERT INTO topic_groups (id, source, topic, summary) VALUES ($1, $2, $3, $4)`,
        [topicId, source, groups[g], `${groups[g]} 的概括`],
      )
      for (let i = 0; i < 5; i++) {
        const id = `${prefix}:seed:${g}:${i}`
        await pool.query(
          `INSERT INTO raw_items (id, source, title, url, raw_data, is_read, fetched_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id,
            source,
            `${groups[g]} 条目 ${i}`,
            `https://example.com/${id}`,
            JSON.stringify({ text: `内容 ${i}` }),
            i % 2 === 0,
            now - (i + 1) * HOUR,
          ],
        )
        await pool.query(
          `INSERT INTO ai_analysis (item_id, summary, details) VALUES ($1, $2, $3)`,
          [id, `${groups[g]} 的摘要 ${i}`, '详情'],
        )
        await pool.query(`INSERT INTO topic_items (topic_id, item_id) VALUES ($1, $2)`, [
          topicId,
          id,
        ])
      }
    }
  }

  const { rows } = await pool.query(
    `SELECT ri.source, COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ri.is_read = FALSE)::int AS unread
     FROM raw_items ri GROUP BY ri.source`,
  )
  console.log('✅ 已复现线上事故形态：')
  for (const r of rows) console.log(`   ${r.source}: total=${r.total} unread=${r.unread}`)
  const { rows: g } = await pool.query(
    `SELECT source, COUNT(*)::int FROM topic_groups GROUP BY source`,
  )
  console.log('   主题组：', g.map((r) => `${r.source}=${r.count}`).join(' '))
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
