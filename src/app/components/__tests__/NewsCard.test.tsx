// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NewsCard from '../NewsCard'

const baseItem = {
  id: 'github:owner/repo',
  source: 'github',
  title: 'Test Repo',
  url: 'https://github.com/owner/repo',
  rawData: { description: 'A test repo', stars: 1234 },
  summary: null,
  details: null,
  fetchedAt: 1700000000000,
  isRead: false,
}

describe('NewsCard', () => {
  const onMarkRead = vi.fn()
  const onMarkUnread = vi.fn()

  beforeEach(() => {
    onMarkRead.mockClear()
    onMarkUnread.mockClear()
  })

  it('渲染来源标签、标题与链接', () => {
    render(<NewsCard item={baseItem} onMarkRead={onMarkRead} onMarkUnread={onMarkUnread} />)
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('Test Repo')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Test Repo' })
    expect(link).toHaveAttribute('href', 'https://github.com/owner/repo')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('显示 GitHub stars 指标与描述', () => {
    render(<NewsCard item={baseItem} onMarkRead={onMarkRead} onMarkUnread={onMarkUnread} />)
    expect(screen.getByText('1,234 stars')).toBeInTheDocument()
    expect(screen.getByText('A test repo')).toBeInTheDocument()
  })

  it('未读时点击「标记已读」触发 onMarkRead', () => {
    render(<NewsCard item={baseItem} onMarkRead={onMarkRead} onMarkUnread={onMarkUnread} />)
    fireEvent.click(screen.getByRole('button', { name: /^已读$/ }))
    expect(onMarkRead).toHaveBeenCalledWith('github:owner/repo')
    expect(onMarkUnread).not.toHaveBeenCalled()
  })

  it('已读时点击「标记未读」触发 onMarkUnread', () => {
    const readItem = { ...baseItem, isRead: true }
    render(<NewsCard item={readItem} onMarkRead={onMarkRead} onMarkUnread={onMarkUnread} />)
    fireEvent.click(screen.getByRole('button', { name: /^未读$/ }))
    expect(onMarkUnread).toHaveBeenCalledWith('github:owner/repo')
    expect(onMarkRead).not.toHaveBeenCalled()
  })

  it('canOperate=false 时不渲染操作按钮', () => {
    render(
      <NewsCard
        item={baseItem}
        onMarkRead={onMarkRead}
        onMarkUnread={onMarkUnread}
        canOperate={false}
      />,
    )
    expect(screen.queryByRole('button', { name: /^已读$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^未读$/ })).not.toBeInTheDocument()
  })
})
