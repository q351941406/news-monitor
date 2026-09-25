/**
 * 定时任务计划 —— 从 workflow 文件解析，而非硬编码
 *
 * 存在的理由（真实 Bug）：
 * src/app/settings/page.tsx 曾硬编码 cron 文案，与实际 workflow 严重不符：
 *   X / Twitter  页面写「每小时整点」`0 * * * *`，实际 `30 3 * * *`（每天 1 次，差 24 倍）
 *   Product Hunt 页面写「每小时整点」`0 * * * *`，实际 30 分-每6小时（每天 4 次，差 6 倍）
 * 连同页脚的 cron 说明示例也是错的。用户看页面得到的是错误信息。
 *
 * 根因：GitHub workflow 是 cron 的**唯一事实源**，但页面另抄了一份，且无机器校验。
 * 这与抓取管道事故同源——「把契约分置两处却无校验」。
 *
 * 现在页面与契约测试都从 workflow 读取，抄错即红。
 */
import fs from 'fs'

export interface WorkflowSchedule {
  /** 数据源显示名 */
  name: string
  /** workflow 文件名（如 scrape-github.yml） */
  workflow: string
  /** workflow 的 name 字段（用于展示） */
  workflowName: string
  /** workflow 里声明的 cron 表达式列表 */
  crons: string[]
}

/** 允许作为计划来源的 workflow 文件名白名单（同时杜绝路径穿越） */
const SCHEDULE_WORKFLOWS: Array<{ file: string; name: string }> = [
  { file: '.github/workflows/scrape-github.yml', name: 'GitHub Trending' },
  { file: '.github/workflows/scrape-twitter.yml', name: 'X / Twitter' },
  { file: '.github/workflows/scrape-producthunt.yml', name: 'Product Hunt' },
  { file: '.github/workflows/enrich.yml', name: '内容富化（摘要 + 主题聚合）' },
  { file: '.github/workflows/freshness-check.yml', name: '数据新鲜度巡检' },
]

/**
 * 从 workflow YAML 文本中提取 schedule.cron 表达式。
 *
 * 只做定点提取而非完整 YAML 解析：cron 一定是 `- cron: '...'` 形式，
 * 且必须位于 `schedule:` 段内——避免误取其它上下文里的同名字段。
 */
export function parseCronFromWorkflow(content: string): string[] {
  const lines = content.split('\n')
  const crons: string[] = []
  let inSchedule = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('schedule:')) {
      inSchedule = true
      continue
    }
    if (inSchedule) {
      // 缩进回到同级或更浅的键 → 离开 schedule 段
      if (/^[a-z]/.test(trimmed) && !trimmed.startsWith('-')) {
        inSchedule = false
        continue
      }
      const m = trimmed.match(/^-\s*cron:\s*['"]?([^'"]+?)['"]?\s*$/)
      if (m) crons.push(m[1].trim())
    }
  }
  return crons
}

/** 从 workflow 文本提取顶层 `name:` 字段 */
export function parseWorkflowName(content: string): string {
  for (const line of content.split('\n')) {
    const m = line.match(/^name:\s*(.+)$/)
    if (m) return m[1].trim()
  }
  return ''
}

/**
 * 从磁盘读取所有计划 workflow。
 *
 * 注意：这是**构建期**能力，不是运行时能力。Next.js 的 `output: standalone`
 * 与 Docker 镜像运行时并不保证包含 `.github/` 目录，所以调用方必须在模块
 * 加载期（构建期）就求值成常量 —— 见下方 SCHEDULES 与 getWorkflowSchedules。
 */
export function readWorkflowSchedules(): WorkflowSchedule[] {
  return SCHEDULE_WORKFLOWS.map(({ file, name }) => {
    // file 是上方硬编码的字面量，不含任何外部输入，
    // 因此无需 path.join 拼接（也避免触发 path-traversal 规则）。
    const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : ''
    return {
      name,
      workflow: file.replace('.github/workflows/', ''),
      workflowName: parseWorkflowName(content),
      crons: parseCronFromWorkflow(content),
    }
  }).filter((s) => s.crons.length > 0)
}

/**
 * 构建期快照。
 *
 * 模块顶层执行 → 只在构建阶段跑一次，结果被内联进产物。
 * 运行时的 settings 页读这个常量，不再触碰文件系统。
 * 盘上文件缺失（如运行时产物）也不会让页面抛错，只会返回空数组。
 */
const BUILD_TIME_SCHEDULES: WorkflowSchedule[] = (() => {
  try {
    return readWorkflowSchedules()
  } catch {
    // 构建期若读不到（例如被裁剪的构建上下文），退化为空 —— 页面仍可渲染
    return []
  }
})()

/**
 * 返回设置页要展示的定时任务。
 *
 * 默认返回构建期快照（生产路径）；
 * 传入 workflowsDir 时实时读取，仅供测试与脚本使用。
 */
export function getWorkflowSchedules(): WorkflowSchedule[] {
  return BUILD_TIME_SCHEDULES
}

/**
 * 把 cron 渲染成人话。
 * 覆盖本项目实际用到的形式；未知形式退化为「按 cron 表达式调度」而非编造。
 */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return '按 cron 表达式调度'
  const [min, hour] = parts

  if (hour === '*') return `${min === '0' ? '每小时整点' : `每小时第 ${min} 分`}`

  // 每天固定多小时：0 6,14,22 * * * → 每天 3 次
  if (hour.includes(',')) {
    const hours = hour.split(',').map((h) => h.padStart(2, '0'))
    return `每天 ${hours.length} 次（UTC ${hours.join(':00 / ')}:00）`
  }

  // 每 N 小时：*/6 → 每天 4 次
  const step = hour.match(/^\*\/(\d+)$/)
  if (step) return `每 ${step[1]} 小时`

  // 固定小时
  if (/^\d+$/.test(hour)) {
    const h = hour.padStart(2, '0')
    const m = (min === '0' ? '00' : min).padStart(2, '0')
    return `每天 UTC ${h}:${m}`
  }

  return '按 cron 表达式调度'
}
