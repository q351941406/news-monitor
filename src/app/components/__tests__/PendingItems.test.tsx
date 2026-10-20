// @vitest-environment jsdom
/**
 * 「待归组内容」组件测试
 *
 * 核心价值：锁死 2026-10 事故的修复契约 ——
 * 「未读但没归组」的条目必须**被渲染出来**，
 * 否则徽标上的数字在页面里找不到对应物（线上：GitHub 徽标 8、整页空白）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PendingItems, { type PendingItem } from '../PendingItems'

const items: PendingItem[] = [
  {
    id: 'github:owner/repo',
    source: 'github',
    title: 'owner/repo',
    url: 'https://github.com/owner/repo',
    summary: '这是 AI 生成的摘要',
    fetchedAt: Date.now(),
    isRead: false,
    pendingSummary: false,
  },
  {
    id: 'github:owner/new',
    source: 'github',
    title: 'owner/new',
    url: 'https://github.com/owner/new',
    summary: null,
    fetchedAt: Date.now(),
    isRead: false,
    pendingSummary: true,
  },
]

describe('PendingItems — 待归组内容', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('条目为空时不渲染任何东西', () => {
    const { container } = render(<PendingItems items={[]} onMarkRead={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('渲染分组标题与条数（徽标上的数字在这里有对应物）', () => {
    render(<PendingItems items={items} onMarkRead={() => {}} />)
    expect(screen.getByText('待归组内容')).toBeInTheDocument()
    expect(screen.getByText('2 条')).toBeInTheDocument()
  })

  it('标明「待摘要」与「待归组」两种状态', () => {
    render(<PendingItems items={items} onMarkRead={() => {}} />)
    expect(screen.getByText('1 条待摘要')).toBeInTheDocument()
  })

  it('默认折叠；展开后列出每条内容', () => {
    render(<PendingItems items={items} onMarkRead={() => {}} />)
    expect(screen.queryByText('这是 AI 生成的摘要')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /待归组内容/ }))
    expect(screen.getByText('这是 AI 生成的摘要')).toBeInTheDocument()
  })

  it('待摘要的条目展示其标题（没有摘要也要看得见）', () => {
    render(<PendingItems items={items} onMarkRead={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /待归组内容/ }))
    expect(screen.getByText('owner/new')).toBeInTheDocument()
    expect(screen.getAllByText('待摘要').length).toBeGreaterThan(0)
  })

  it('点「已读」回调对应 id', () => {
    const onMarkRead = vi.fn()
    render(<PendingItems items={items} onMarkRead={onMarkRead} />)
    fireEvent.click(screen.getByRole('button', { name: /待归组内容/ }))
    const buttons = screen.getAllByRole('button', { name: '标记为已读' })
    fireEvent.click(buttons[0])
    expect(onMarkRead).toHaveBeenCalledWith(items[0].id)
  })

  it('canOperate=false 时不显示操作按钮（访客只读）', () => {
    render(<PendingItems items={items} onMarkRead={() => {}} canOperate={false} />)
    fireEvent.click(screen.getByRole('button', { name: /待归组内容/ }))
    expect(screen.queryByRole('button', { name: '标记为已读' })).not.toBeInTheDocument()
  })

  it('展开某条时懒加载详情', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: items[0].id, details: '这是 AI 详情' } }),
    } as unknown as Response)
    render(<PendingItems items={items} onMarkRead={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /待归组内容/ }))
    fireEvent.click(screen.getByText('这是 AI 生成的摘要'))
    await waitFor(() => expect(screen.getByText('这是 AI 详情')).toBeInTheDocument())
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`/api/items/${items[0].id}`)
  })
})
