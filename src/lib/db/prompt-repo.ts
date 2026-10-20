/**
 * 提示词模板仓库 — ai_prompts 表的存取
 *
 * 约定（见 drizzle/0007_ai_prompts.sql）：
 * - 表里只存「被手动定制过」的模板；无行 = 未定制，用默认模板
 * - 读失败（DB 不可用）永远回退为「未定制」，绝不阻断 AI 主流程：
 *   提示词只是配置，配置读不到时用默认值继续跑，和埋点模块同哲学
 */
import { eq } from 'drizzle-orm'
import { aiPrompts } from '../schema'
import { getDb } from './connection'

/** 读取定制模板。无定制 / 无 DB 配置 / DB 异常时返回 null（调用方用默认模板） */
export async function getCustomPromptTemplate(key: string): Promise<string | null> {
  // 单测与无 DB 环境：连池都别建，直接回退默认（避免连接超时拖慢流程）
  if (!process.env.DATABASE_URL) return null
  try {
    const db = getDb()
    const rows = await db.select().from(aiPrompts).where(eq(aiPrompts.key, key)).limit(1)
    return rows[0]?.template ?? null
  } catch (err) {
    console.warn('[prompt-repo] 读取定制模板失败，回退默认模板:', err)
    return null
  }
}

/** 保存定制模板（upsert：首次保存即插入，之后覆盖并刷新 updatedAt） */
export async function saveCustomPromptTemplate(key: string, template: string): Promise<void> {
  const db = getDb()
  await db
    .insert(aiPrompts)
    .values({ key, template, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: aiPrompts.key,
      set: { template, updatedAt: new Date() },
    })
}

/** 删除定制（恢复默认模板）：删行即可，读侧「无行 = 默认」 */
export async function deleteCustomPromptTemplate(key: string): Promise<void> {
  const db = getDb()
  await db.delete(aiPrompts).where(eq(aiPrompts.key, key))
}
