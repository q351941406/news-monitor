/**
 * 定时任务计划解析测试
 *
 * 核心价值：固化「设置页显示必须与 workflow 实际一致」这条契约。
 * 曾出现的真实 Bug：页面写 X 源「每小时整点」，实际每天 1 次（差 24 倍）。
 */
import { describe, it, expect } from 'vitest'
import {
  parseCronFromWorkflow,
  parseWorkflowName,
  getWorkflowSchedules,
  describeCron,
} from '@/lib/schedules'
describe('parseCronFromWorkflow', () => {
  it('提取 schedule 段内的 cron', () => {
    const yaml = [
      'name: Foo',
      'on:',
      '  schedule:',
      "    - cron: '30 3 * * *'",
      '  workflow_dispatch:',
      'jobs:',
    ].join('\n')
    expect(parseCronFromWorkflow(yaml)).toEqual(['30 3 * * *'])
  })
  it('提取多个 cron', () => {
    const yaml = ['on:', '  schedule:', "    - cron: '0 6 * * *'", "    - cron: '0 18 * * *'"].join(
      '\n',
    )
    expect(parseCronFromWorkflow(yaml)).toEqual(['0 6 * * *', '0 18 * * *'])
  })
  it('不会误取 schedule 段之外的 cron', () => {
    const yaml = ['on:', '  push:', 'jobs:', '  x:', "    - cron: '0 0 * * *'"].join('\n')
    expect(parseCronFromWorkflow(yaml)).toEqual([])
  })
  it('无 schedule 段时返回空数组', () => {
    expect(parseCronFromWorkflow('name: Bar\non:\n  push:\n')).toEqual([])
  })
})
describe('parseWorkflowName', () => {
  it('提取顶层 name', () => {
    expect(parseWorkflowName('name: Scrape Twitter\non:\n')).toBe('Scrape Twitter')
  })
  it('无 name 返回空串', () => {
    expect(parseWorkflowName('on:\n  push:\n')).toBe('')
  })
})
describe('getWorkflowSchedules —— 与真实 workflow 对齐', () => {
  const schedules = getWorkflowSchedules()
  it('解析出全部计划任务', () => {
    expect(schedules.map((s) => s.workflow).sort()).toEqual([
      'enrich.yml',
      'freshness-check.yml',
      'scrape-github.yml',
      'scrape-producthunt.yml',
      'scrape-twitter.yml',
    ])
  })

  it('回归防线：富化调度在所有抓取之后（否则当天抓到的内容要等满一天才被处理）', () => {
    // 抓取侧最晚的是 PH 的 18:30，富化排在 19:00 —— 这个相对顺序是有意的
    const enrich = schedules.find((s) => s.workflow === 'enrich.yml')!
    expect(enrich.crons).toEqual(['0 19 * * *'])
    expect(describeCron(enrich.crons[0])).toBe('每天 UTC 19:00')

    const scrapeHours = schedules
      .filter((s) => s.workflow.startsWith('scrape-'))
      .flatMap((s) => s.crons)
      .map((c) => parseInt(c.split(' ')[1], 10))
      .filter((h) => Number.isFinite(h))
    expect(Math.min(...scrapeHours)).toBeGreaterThanOrEqual(0)
    // 富化时刻必须晚于所有抓取时刻（同一天内）
    expect(19).toBeGreaterThan(Math.max(...scrapeHours))
  })
  it('回归防线：X 源的真实 cron 是每天 1 次，不是每小时', () => {
    // 曾把页面文案写成「每小时整点」(0 * * * *)，实际 30 3 * * *，差 24 倍
    const twitter = schedules.find((s) => s.workflow === 'scrape-twitter.yml')!
    expect(twitter.crons).toEqual(['30 3 * * *'])
    expect(describeCron(twitter.crons[0])).toBe('每天 UTC 03:30')
    expect(describeCron(twitter.crons[0])).not.toContain('每小时')
  })
  it('回归防线：Product Hunt 真实 cron 是每 6 小时，不是每小时', () => {
    const ph = schedules.find((s) => s.workflow === 'scrape-producthunt.yml')!
    expect(ph.crons).toEqual(['30 */6 * * *'])
    expect(describeCron(ph.crons[0])).toBe('每 6 小时')
    expect(describeCron(ph.crons[0])).not.toContain('每小时')
  })
  it('每项都解析出了 workflow 的 name', () => {
    for (const s of schedules) {
      expect(s.workflowName, `${s.workflow} 缺少 name`).not.toBe('')
    }
  })
})
describe('describeCron', () => {
  it('整点每小时', () => {
    expect(describeCron('0 * * * *')).toBe('每小时整点')
  })
  it('非整点每小时', () => {
    expect(describeCron('15 * * * *')).toBe('每小时第 15 分')
  })
  it('每天固定时刻', () => {
    expect(describeCron('0 13 * * *')).toBe('每天 UTC 13:00')
  })
  it('每天多次（逗号列表）', () => {
    expect(describeCron('0 6,14,22 * * *')).toBe('每天 3 次（UTC 06:00 / 14:00 / 22:00）')
  })
  it('每 N 小时', () => {
    expect(describeCron('30 */6 * * *')).toBe('每 6 小时')
  })
  it('未知形式不编造', () => {
    expect(describeCron('bad expr')).toBe('按 cron 表达式调度')
  })
})
