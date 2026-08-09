// 从线上拉取 github 全部主题 + items，同步到本地 dev 库
import { Pool } from 'pg'
const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/news_monitor_dev',
})
const API = 'https://news.myaicode.qzz.io'
const tops = await (await fetch(`${API}/api/topics?source=github&showAll=true`)).json()
const groups = tops.data || []
console.log('主题数:', groups.length)
// 清空本地 github 数据
await pool.query(
  `DELETE FROM topic_items WHERE topic_id IN (SELECT id FROM topic_groups WHERE source='github')`,
)
await pool.query(`DELETE FROM topic_groups WHERE source='github'`)
await pool.query(
  `DELETE FROM ai_analysis WHERE item_id IN (SELECT id FROM raw_items WHERE source='github')`,
)
await pool.query(`DELETE FROM raw_items WHERE source='github'`)
let itemsTotal = 0,
  groupsTotal = 0
for (const g of groups) {
  // 插入主题组
  const gid = g.id
  await pool.query(
    `INSERT INTO topic_groups (id, source, topic, summary, created_at) VALUES ($1,'github',$2,$3,NOW()) ON CONFLICT (id) DO NOTHING`,
    [gid, g.topic, g.summary],
  )
  groupsTotal++
  // 拉该主题 items
  const gd = await (
    await fetch(`${API}/api/topics/${encodeURIComponent(gid)}/items?showAll=true`)
  ).json()
  for (const it of gd.items || []) {
    await pool.query(
      `INSERT INTO raw_items (id, source, title, url, raw_data, is_read, fetched_at)
       VALUES ($1,'github',$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [
        it.id,
        it.title,
        it.url,
        JSON.stringify({ readme: 'synced', description: it.title }),
        it.isRead ?? false,
        it.fetchedAt ?? Date.now(),
      ],
    )
    await pool.query(
      `INSERT INTO ai_analysis (item_id, summary, details, processed_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (item_id) DO NOTHING`,
      [it.id, it.summary || '无摘要', it.details || ''],
    )
    // 关联主题
    await pool.query(
      `INSERT INTO topic_items (topic_id, item_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [gid, it.id],
    )
    itemsTotal++
  }
}
console.log(`✅ 同步完成: ${groupsTotal} 主题, ${itemsTotal} items`)
await pool.end()
