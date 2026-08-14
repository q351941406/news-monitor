// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SourceTabs from '../SourceTabs'

const sources = [
  { id: 'github', label: 'GitHub', icon: '🐙', count: 10, unread: 3 },
  { id: 'producthunt', label: 'Product Hunt', icon: '🚀', count: 5, unread: 1 },
]

describe('SourceTabs', () => {
  it('渲染「全部」与各来源标签及未读数', () => {
    render(<SourceTabs sources={sources} activeSource="all" onSourceChange={() => {}} />)
    expect(screen.getByText('全部')).toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('Product Hunt')).toBeInTheDocument()
    // 「全部」徽标 = 未读总和 3+1=4
    expect(screen.getAllByText('4').length).toBeGreaterThan(0)
    // 各来源徽标显示自己的未读数
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('点击「全部」触发 onSourceChange("all")', () => {
    const onChange = vi.fn()
    render(<SourceTabs sources={sources} activeSource="github" onSourceChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /全部/ }))
    expect(onChange).toHaveBeenCalledWith('all')
  })

  it('点击具体来源触发 onSourceChange(id)', () => {
    const onChange = vi.fn()
    render(<SourceTabs sources={sources} activeSource="all" onSourceChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Product Hunt/ }))
    expect(onChange).toHaveBeenCalledWith('producthunt')
  })

  it('激活态来源有高亮样式类', () => {
    render(<SourceTabs sources={sources} activeSource="github" onSourceChange={() => {}} />)
    const activeBtn = screen.getByRole('button', { name: /GitHub/ })
    expect(activeBtn.className).toContain('bg-stone-900')
  })
})
