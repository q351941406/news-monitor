import Link from 'next/link'
import { Clock, GitBranch, MessageCircle, Zap, ShieldCheck } from 'lucide-react'
import { getWorkflowSchedules, describeCron } from '@/lib/schedules'

/**
 * 定时任务配置页
 *
 * cron 与说明全部从 .github/workflows/*.yml 解析（Server Component，构建期求值），
 * 不再硬编码 —— 页面曾把 X 源写成「每小时整点」而实际每天 1 次（差 24 倍），
 * 且页脚 cron 示例也是错的。GitHub workflow 是 cron 的唯一事实源。
 * src/lib/__tests__/schedules.test.ts 固化了这条契约，抄错即红。
 */
const ICONS: Record<string, typeof GitBranch> = {
  'GitHub Trending': GitBranch,
  'X / Twitter': MessageCircle,
  'Product Hunt': Zap,
  数据新鲜度巡检: ShieldCheck,
}

const CRON_REFERENCE = [
  { expr: '* * * * *', desc: '分 时 日 月 周' },
  { expr: '0 * * * *', desc: '每小时整点' },
  { expr: '30 */6 * * *', desc: '每 6 小时（在 30 分）' },
  { expr: '0 13 * * *', desc: '每天 UTC 13:00' },
  { expr: '0 6,14,22 * * *', desc: '每天 3 次（6/14/22 点）' },
]

export default function SettingsPage() {
  const schedules = getWorkflowSchedules()

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="font-serif text-3xl font-bold text-stone-900">设置</h1>
          <p className="mt-2 text-stone-500">定时任务配置</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-6">
          {schedules.map((schedule) => {
            const Icon = ICONS[schedule.name] ?? Clock
            return (
              <div
                key={schedule.workflow}
                className="bg-white rounded-xl border border-stone-200 p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-stone-600" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-stone-900">{schedule.name}</h2>
                    <p className="mt-1 text-sm text-stone-500">
                      {schedule.crons.map((c) => describeCron(c)).join('；')}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-4">
                      {schedule.crons.map((cron) => (
                        <div key={cron} className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-stone-400" />
                          <code className="px-2 py-1 bg-stone-100 rounded text-sm font-mono text-stone-700">
                            {cron}
                          </code>
                        </div>
                      ))}
                      <span className="text-xs text-stone-400">{schedule.workflow}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-8 bg-white rounded-xl border border-stone-200 p-6">
          <h2 className="text-lg font-semibold text-stone-900 mb-1">Cron 表达式说明</h2>
          <p className="text-xs text-stone-400 mb-4">
            以上时间均为 UTC。本页信息直接读取自
            <code className="mx-1 px-1 bg-stone-100 rounded font-mono">.github/workflows/</code>
            ，与定时任务始终一致。
          </p>
          <div className="font-mono text-sm text-stone-600 space-y-2">
            {CRON_REFERENCE.map((item) => (
              <p key={item.expr}>
                <code>{item.expr}</code> = {item.desc}
              </p>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm text-stone-500 hover:text-stone-700 transition-colors">
            ← 返回首页
          </Link>
        </div>
      </main>
    </div>
  )
}
