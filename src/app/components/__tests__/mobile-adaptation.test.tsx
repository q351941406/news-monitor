// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import Header from '../Header'
import SourceTabs from '../SourceTabs'
import TopicGroup from '../TopicGroup'

/**
 * 移动端适配回归测试
 *
 * 这些断言守的都是「在窄屏上真的会出问题」的具体缺陷，不是样式快照：
 * jsdom 不做布局，所以无法测视觉，只能锁住「该有的结构 / 类名」不丢。
 * 真正的窄屏渲染验证由 e2e/mobile.spec.ts（真实 Chromium + 375px 视口）兜底。
 */

function renderHeader(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const props = {
    unreadCount: 7,
    showRead: false,
    isAdmin: false,
    onShowReadChange: vi.fn(),
    onMarkAllRead: vi.fn(),
    onResetAllRead: vi.fn(),
    onLogin: vi.fn().mockResolvedValue(true),
    onLogout: vi.fn(),
    ...overrides,
  }
  render(<Header {...props} />)
  return props
}

/**
 * 打开移动端菜单，返回抽屉作用域。
 *
 * 桌面操作区与移动抽屉始终同时存在于 DOM（靠 `hidden md:flex` 区分），
 * jsdom 不做样式计算，因此查询必须限定在抽屉内，否则会命中多个元素
 * —— 真实浏览器里 display:none 的那半边读屏软件不会播报。
 */
function openMobileMenu() {
  fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
  return within(document.getElementById('mobile-menu') as HTMLElement)
}

describe('Header 移动端菜单', () => {
  beforeEach(() => vi.clearAllMocks())

  it('移动菜单里提供「设置」入口（此前只有桌面端有，小屏用户走不到设置页）', () => {
    renderHeader()
    // 菜单未打开时抽屉不存在
    expect(document.getElementById('mobile-menu')).toBeNull()
    const menu = openMobileMenu()
    expect(menu.getByRole('link', { name: /设置/ })).toHaveAttribute('href', '/settings')
  })

  it('菜单同时覆盖归档与仪表盘入口', () => {
    renderHeader()
    const menu = openMobileMenu()
    expect(menu.getByRole('link', { name: /历史归档/ })).toHaveAttribute('href', '/archive')
    expect(menu.getByRole('link', { name: /运维仪表盘/ })).toHaveAttribute('href', '/dashboard')
  })

  it('汉堡按钮带 aria-expanded，随开关状态变化', () => {
    renderHeader()
    const btn = screen.getByRole('button', { name: '打开菜单' })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).toHaveAttribute('aria-controls', 'mobile-menu')
    openMobileMenu()
    expect(screen.getByRole('button', { name: '关闭菜单' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('Esc 可关闭菜单（触屏没有 Esc 键，但外接键盘/读屏用户依赖它）', () => {
    renderHeader()
    openMobileMenu()
    expect(document.getElementById('mobile-menu')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.getElementById('mobile-menu')).toBeNull()
  })

  it('打开菜单时锁定 body 滚动，关闭后恢复', () => {
    renderHeader()
    expect(document.body.style.overflow).toBe('')
    openMobileMenu()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.body.style.overflow).toBe('')
  })

  it('管理员态下移动菜单给出全部已读 / 撤销已读 / 退出', () => {
    const onMarkAllRead = vi.fn()
    renderHeader({ isAdmin: true, onMarkAllRead })
    const menu = openMobileMenu()
    fireEvent.click(menu.getByRole('button', { name: /全部已读/ }))
    expect(onMarkAllRead).toHaveBeenCalledTimes(1)
    // 执行动作后菜单自动收起，避免遮挡内容
    expect(document.getElementById('mobile-menu')).toBeNull()
  })

  it('移动菜单项保持 ≥44px 触控高度', () => {
    renderHeader()
    const menu = openMobileMenu()
    expect(menu.getByRole('link', { name: /历史归档/ }).className).toContain('min-h-11')
    expect(menu.getByRole('link', { name: /设置/ }).className).toContain('min-h-11')
  })

  it('未读数在移动端也有呈现（此前 hidden sm 让小屏完全看不到）', () => {
    renderHeader({ unreadCount: 12 })
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})

const sources = [
  { id: 'github', label: 'GitHub', icon: '🐙', count: 10, unread: 3 },
  { id: 'producthunt', label: 'Product Hunt', icon: '🚀', count: 5, unread: 1 },
  { id: 'twitter', label: 'X / Twitter', icon: '𝕏', count: 2, unread: 0 },
]

describe('SourceTabs 窄屏', () => {
  it('滚动容器带 scrollbar-hide（该类此前只写不定义，iOS 上留一条 6px 灰条）', () => {
    const { container } = render(
      <SourceTabs sources={sources} activeSource="all" onSourceChange={() => {}} />,
    )
    expect(container.querySelector('.scrollbar-hide')).toBeTruthy()
  })

  it('滚动容器启用横向滚动与吸附', () => {
    const { container } = render(
      <SourceTabs sources={sources} activeSource="all" onSourceChange={() => {}} />,
    )
    const scroller = container.querySelector('.overflow-x-auto') as HTMLElement
    expect(scroller).toBeTruthy()
    expect(scroller.className).toContain('overscroll-x-contain')
    expect(scroller.className).toContain('snap-x')
  })

  it('用 aria-pressed 表达选中态（读屏可播报当前来源）', () => {
    render(<SourceTabs sources={sources} activeSource="github" onSourceChange={() => {}} />)
    expect(screen.getByRole('button', { name: /GitHub/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /全部/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('标签触控高度在窄屏下不低于 40px', () => {
    render(<SourceTabs sources={sources} activeSource="all" onSourceChange={() => {}} />)
    expect(screen.getByRole('button', { name: /全部/ }).className).toContain('py-2.5')
  })

  it('jsdom 无 scrollIntoView 时不抛错（真实浏览器才有该 API）', () => {
    expect(() =>
      render(<SourceTabs sources={sources} activeSource="twitter" onSourceChange={() => {}} />),
    ).not.toThrow()
  })
})

const baseGroupProps = {
  id: 'topic:1',
  topic: 'AI 编程助手 Skills',
  icon: '🤖',
  loading: false,
  unreadCount: 2,
  totalCount: 2,
  isExpanded: true,
  onToggle: vi.fn(),
  onMarkRead: vi.fn(),
  onMarkUnread: vi.fn(),
  onMarkGroupRead: vi.fn(),
  canOperate: true,
}

const items = [
  {
    id: 'github:a/b',
    source: 'github',
    title: 'repo',
    url: 'https://github.com/a/b',
    summary: '摘要 A',
    fetchedAt: 1700000000000,
    isRead: false,
  },
]

describe('TopicGroup 触控与可访问性', () => {
  beforeEach(() => vi.clearAllMocks())

  it('组头可聚焦且能响应 Enter 展开（此前只有 onClick，键盘完全不可达）', () => {
    const onToggle = vi.fn()
    render(<TopicGroup {...baseGroupProps} onToggle={onToggle} items={items} />)
    const header = screen.getByRole('button', { name: /AI 编程助手 Skills/ })
    expect(header).toHaveAttribute('tabindex', '0')
    expect(header).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(header, { key: 'Enter' })
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('条目行同样支持键盘展开', () => {
    render(<TopicGroup {...baseGroupProps} items={items} />)
    const row = screen.getByText('摘要 A').closest('[role="button"]') as HTMLElement
    fireEvent.keyDown(row, { key: ' ' })
    // 展开后详情区域出现（fetch 失败也不影响结构）
    expect(row).toHaveAttribute('aria-expanded', 'true')
  })

  it('已读/未读按钮用伪元素外扩热区，不改动紧凑排版', () => {
    render(<TopicGroup {...baseGroupProps} items={items} />)
    const btn = screen.getByRole('button', { name: '标记为已读' })
    expect(btn.className).toContain('before:-inset-2')
    expect(btn.className).toContain('before:content-')
  })

  it('点击已读按钮不会连带触发条目展开', () => {
    const onMarkRead = vi.fn()
    render(<TopicGroup {...baseGroupProps} items={items} onMarkRead={onMarkRead} />)
    fireEvent.click(screen.getByRole('button', { name: '标记为已读' }))
    expect(onMarkRead).toHaveBeenCalledWith('github:a/b')
  })

  it('窄屏不使用嵌套滚动容器（避免与页面竖滑抢手势）', () => {
    const { container } = render(
      <TopicGroup {...baseGroupProps} items={items} groupSummary="组概括" />,
    )
    // 桌面端才恢复内部滚动
    const inner = Array.from(container.querySelectorAll('.prose'))
    inner.forEach((el) => expect(el.className).toContain('sm:overflow-y-auto'))
  })
})
