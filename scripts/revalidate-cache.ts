/**
 * 定时任务完成后触发 Next.js 缓存失效
 *
 * 用法：在 scripts 主流程完成后调用
 *   await revalidateCacheAfterRun('scrape')
 *
 * 依赖环境变量（可选）：
 *   REVALIDATE_URL  — 生产站的 /api/admin/revalidate 地址，如 https://news.myaicode.qzz.io/api/admin/revalidate
 *   ADMIN_TOKEN     — 管理员 token（与生产 ADMIN_TOKEN 一致）
 *
 * 未配置时静默跳过（向后兼容：本地跑脚本不影响）
 */
export async function revalidateCacheAfterRun(stage: string): Promise<void> {
  const url = process.env.REVALIDATE_URL
  const token = process.env.ADMIN_TOKEN
  if (!url || !token) {
    console.log(`  ⏭ Revalidate skipped (REVALIDATE_URL/ADMIN_TOKEN not configured)`)
    return
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-admin-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
    if (!res.ok) {
      console.error(`  ⚠️ Revalidate failed: HTTP ${res.status}`)
    } else {
      console.log(`  ✅ Cache revalidated (${stage})`)
    }
  } catch (err) {
    console.error(`  ⚠️ Revalidate request failed: ${err instanceof Error ? err.message : err}`)
  }
}
