import Link from 'next/link'
import { Clock, GitBranch, MessageCircle, Zap } from 'lucide-react'

const schedules = [
  {
    name: 'GitHub Trending',
    icon: GitBranch,
    cron: '0 13 * * *',
    description: '每天 UTC 13:00（北京时间 21:00）',
    workflow: 'scrape-github.yml',
  },
  {
    name: 'X / Twitter',
    icon: MessageCircle,
    cron: '0 * * * *',
    description: '每小时整点',
    workflow: 'scrape-twitter.yml',
  },
  {
    name: 'Product Hunt',
    icon: Zap,
    cron: '0 * * * *',
    description: '每小时整点',
    workflow: 'scrape-producthunt.yml',
  },
]

export default function SettingsPage() {
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
            const Icon = schedule.icon
            return (
              <div key={schedule.name} className="bg-white rounded-xl border border-stone-200 p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-stone-600" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-stone-900">{schedule.name}</h2>
                    <p className="mt-1 text-sm text-stone-500">{schedule.description}</p>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-stone-400" />
                        <code className="px-2 py-1 bg-stone-100 rounded text-sm font-mono text-stone-700">
                          {schedule.cron}
                        </code>
                      </div>
                      <span className="text-xs text-stone-400">{schedule.workflow}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-8 bg-white rounded-xl border border-stone-200 p-6">
          <h2 className="text-lg font-semibold text-stone-900 mb-4">Cron 表达式说明</h2>
          <div className="font-mono text-sm text-stone-600 space-y-2">
            <p>
              <code>* * * * *</code> = 分 时 日 月 周
            </p>
            <p>
              <code>0 * * * *</code> = 每小时整点
            </p>
            <p>
              <code>0 13 * * *</code> = 每天 13:00 UTC
            </p>
            <p>
              <code>0 */4 * * *</code> = 每 4 小时
            </p>
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
