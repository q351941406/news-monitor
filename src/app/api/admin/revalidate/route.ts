import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorized, unauthorized } from '@/lib/admin-auth'
import { invalidateNewsCounts } from '@/lib/cache'
/**
 * 缓存失效 API —— 供定时任务（scrape/topic-aggregate）在 CI 独立进程跑完后调用
 * POST /api/admin/revalidate
 *
 * 为什么需要：unstable_cache 的 TTL 只能覆盖"用户写操作"（markAsRead 等），
 * 但数据源抓取在 GitHub Actions 独立进程运行，无法直接调 Next 的 revalidateTag，
 * 所以通过这个 HTTP 接口触发失效。
 *
 * 仅管理员可访问（x-admin-token header 校验，fail-closed）
 */
export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return unauthorized()
  }
  try {
    invalidateNewsCounts()
    return NextResponse.json({ success: true, revalidated: ['news-counts'] })
  } catch (err) {
    return NextResponse.json(
      { error: 'Revalidation failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
