/**
 * AI 分析仓库 — 摘要和详情
 */
import { eq, isNull, and, desc } from 'drizzle-orm'
import { rawItems, aiAnalysis, type RawItem } from '../schema'
import { getDb } from './connection'

/** 存储 AI 分析结果 */
export async function storeAIAnalysis(
  itemId: string,
  summary: string,
  details?: string,
): Promise<void> {
  const db = getDb()
  await db
    .insert(aiAnalysis)
    .values({ itemId, summary, details: details || null })
    .onConflictDoUpdate({
      target: aiAnalysis.itemId,
      set: {
        summary,
        details: details || null,
        processedAt: new Date(),
      },
    })
}

/** 获取未处理 AI 摘要的项目 */
export async function getUnprocessedItems(source: string, limit: number = 20): Promise<RawItem[]> {
  const db = getDb()
  const results = await db
    .select()
    .from(rawItems)
    .leftJoin(aiAnalysis, eq(rawItems.id, aiAnalysis.itemId))
    .where(and(eq(rawItems.source, source), isNull(aiAnalysis.itemId)))
    .orderBy(desc(rawItems.fetchedAt))
    .limit(limit)
  return results.map((r) => r.raw_items)
}
