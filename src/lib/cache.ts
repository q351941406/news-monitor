/**
 * 响应缓存工具
 *
 * 基于 Next.js unstable_cache 的轻量缓存：
 * - /api/news/counts 等高频读接口用 tag 缓存，TTL 60s
 * - 写操作（标记已读/未读/删除）完成后调 invalidateNewsCounts() 主动失效
 * - 定时任务（scrape/topic-aggregate）通过 /api/admin/revalidate 触发失效
 */
import { unstable_cache, revalidateTag } from 'next/cache'
import { getNewsCounts } from '@/lib/db'

/** counts 缓存 tag：写操作与数据源变更时统一失效 */
export const NEWS_COUNTS_TAG = 'news-counts'

/** 带缓存的未读/总数统计（TTL 60s，主动失效优先） */
export function getNewsCountsCached() {
  return unstable_cache(() => getNewsCounts(), ['news-counts'], {
    revalidate: 60,
    tags: [NEWS_COUNTS_TAG],
  })()
}

/** 数据变化后主动失效 counts 缓存 */
export function invalidateNewsCounts(): void {
  try {
    revalidateTag(NEWS_COUNTS_TAG)
  } catch {
    // 测试环境无 Next 运行时上下文（static generation store 缺失）会抛错；
    // 生产环境 route handler 中正常。吞掉即可——revalidateTag 是幂等的，
    // 失败仅意味着"本次缓存稍后按 TTL 过期"，无数据一致性风险。
  }
}
