// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import HomeView from '../HomeView'

/**
 * 展开交互不得移动页面滚动位置
 *
 * 曾存在的 bug：SourceTabs 为「让选中标签滚入可视区」在 effect 里调用
 * `el.scrollIntoView({ block: 'nearest' })`。该 API 会滚动**所有**可滚动祖先，
 * 包含 <html> 本身 —— 用户在页面下方展开任意主题组时，effect 因 sources 换了
 * 引用而重跑，页面被「平滑滚回顶部」，被点击的那一行从屏幕 y=200 掉到 y=700+。
 *
 * 这里锁死的是行为契约：SourceTabs 只允许横向滚动自己的滚动容器，
 * 任何影响页面滚动的调用都是回归。
 */

const initialTopics = {
  github: [
    { id: 'topic:1', topic: 'AI 编程助手', summary: '摘要一', unreadCount: 3, totalCount: 3 },
    { id: 'topic:2', topic: 'React 组件库', summary: '摘要二', unreadCount: 2, totalCount: 2 },
    { id: 'topic:3', topic: '游戏外挂脚本', summary: '摘要三', unreadCount: 1, totalCount: 1 },
  ],
  producthunt: [] as {
    id: string
    topic: string
    summary: string
    unreadCount: number
    totalCount: number
  }[],
  twitter: [] as {
    id: string
    topic: string
    summary: string
    unreadCount: number
    totalCount: number
  }[],
}
const initialCounts = {
  github: { total: 6, unread: 6 },
  producthunt: { total: 0, unread: 0 },
  twitter: { total: 0, unread: 0 },
}

const groupItems = [
  {
    id: 'github:i1',
    source: 'github',
    title: '条目一',
    url: 'https://example.com/1',
    rawData: {},
    summary: '条目一摘要',
    details: null,
    fetchedAt: 1,
    isRead: false,
  },
]

/** jsdom 不实现 scrollIntoView，这里补一个可观测的替身 */
let scrollIntoViewSpy: ReturnType<typeof vi.fn>
const originalScrollIntoView = Element.prototype.scrollIntoView

beforeEach(() => {
  scrollIntoViewSpy = vi.fn()
  ;(Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollIntoViewSpy
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/items')) {
      return { ok: true, json: async () => ({ items: groupItems }) } as Response
    }
    return { ok: true, json: async () => ({ data: {} }) } as Response
  }) as unknown as typeof fetch
})

afterEach(() => {
  if (originalScrollIntoView) {
    Element.prototype.scrollIntoView = originalScrollIntoView
  } else {
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView
  }
})

function renderHome() {
  return render(
    <HomeView initialTopics={initialTopics} initialCounts={initialCounts} initialShowRead={true} />,
  )
}

describe('首页展开交互不移动页面滚动位置', () => {
  it('展开主题组时不得调用 scrollIntoView（该 API 会连带滚动整个页面）', async () => {
    renderHome()
    const header = screen.getByRole('button', { name: /AI 编程助手/ })
    fireEvent.click(header)

    await waitFor(() => expect(header).toHaveAttribute('aria-expanded', 'true'))

    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })

  it('展开组后再展开另一组，同样不得调用 scrollIntoView', async () => {
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: /AI 编程助手/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /AI 编程助手/ })).toHaveAttribute(
        'aria-expanded',
        'true',
      ),
    )
    scrollIntoViewSpy.mockClear()

    fireEvent.click(screen.getByRole('button', { name: /React 组件库/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /React 组件库/ })).toHaveAttribute(
        'aria-expanded',
        'true',
      ),
    )

    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })

  it('展开组内条目（懒加载详情）同样不得调用 scrollIntoView', async () => {
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: /AI 编程助手/ }))
    await waitFor(() => expect(screen.getByText('条目一摘要')).toBeInTheDocument())
    scrollIntoViewSpy.mockClear()

    fireEvent.click(screen.getByText('条目一摘要'))
    await waitFor(() => expect(screen.getByText('原文')).toBeInTheDocument())

    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })
})

describe('整组移出列表时的焦点兜底', () => {
  beforeEach(() => {
    localStorage.setItem('news_monitor_admin_token', 'test-token')
  })

  const oneUnread = [
    { id: 'topic:1', topic: 'AI 编程助手', summary: '摘要一', unreadCount: 1, totalCount: 1 },
    { id: 'topic:2', topic: 'React 组件库', summary: '摘要二', unreadCount: 1, totalCount: 1 },
  ]

  function renderUnreadOnly() {
    return render(
      <HomeView
        initialTopics={{ github: oneUnread, producthunt: [], twitter: [] }}
        initialCounts={initialCounts}
        initialShowRead={false}
      />,
    )
  }

  async function actAll() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
  }

  it('点「全部已读」导致整组消失后，焦点不得掉回 body', async () => {
    const { container } = renderUnreadOnly()
    const firstGroup = () => within(container.querySelectorAll('main section')[0] as HTMLElement)

    fireEvent.click(screen.getByRole('button', { name: /AI 编程助手/ }))
    await waitFor(() => expect(firstGroup().getByText('全部已读')).toBeInTheDocument())

    // 真实点击会先聚焦该按钮；复现浏览器行为
    const btn = firstGroup().getByText('全部已读')
    btn.focus()
    expect(document.activeElement).toBe(btn)

    fireEvent.click(btn)
    await actAll()

    // 该组 unreadCount 归零后从列表消失，按钮被卸载
    expect(container.querySelectorAll('main section').length).toBe(1)
    // 曾存在的 bug：焦点掉回 <body>，键盘用户下一次 Tab 会从页面开头开始
    expect(document.activeElement).not.toBe(document.body)
  })

  it('焦点回到新元素时不得牵动页面滚动', async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
    const { container } = renderUnreadOnly()
    const firstGroup = () => within(container.querySelectorAll('main section')[0] as HTMLElement)

    fireEvent.click(screen.getByRole('button', { name: /AI 编程助手/ }))
    await waitFor(() => expect(firstGroup().getByText('全部已读')).toBeInTheDocument())

    // 真实鼠标点击会先聚焦按钮再触发 click，这里复现该顺序
    const btn = firstGroup().getByText('全部已读')
    btn.focus()
    focusSpy.mockClear()
    fireEvent.click(btn)
    await actAll()

    const calls = focusSpy.mock.calls.filter((c) => c.length > 0)
    expect(calls.length).toBeGreaterThan(0)
    // 每次接管焦点都必须显式 preventScroll，否则浏览器会把它滚进视口
    for (const call of calls) {
      expect(call[0]).toMatchObject({ preventScroll: true })
    }
  })

  it('焦点未丢失时不干预：组内还有别的未读时，焦点留在原按钮上', async () => {
    // 该组有 2 条未读 —— 标记其中一条后组不会消失，按钮也不会被卸载
    const twoItems = [
      { ...groupItems[0], id: 'github:i1' },
      { ...groupItems[0], id: 'github:i2', summary: '条目二摘要' },
    ]
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/items'))
        return { ok: true, json: async () => ({ items: twoItems }) } as Response
      return { ok: true, json: async () => ({ data: {} }) } as Response
    }) as unknown as typeof fetch

    const { container } = render(
      <HomeView
        initialTopics={{
          github: [
            {
              id: 'topic:1',
              topic: 'AI 编程助手',
              summary: '摘要一',
              unreadCount: 2,
              totalCount: 2,
            },
            {
              id: 'topic:2',
              topic: 'React 组件库',
              summary: '摘要二',
              unreadCount: 1,
              totalCount: 1,
            },
          ],
          producthunt: [],
          twitter: [],
        }}
        initialCounts={initialCounts}
        initialShowRead={false}
      />,
    )
    const firstGroup = () => within(container.querySelectorAll('main section')[0] as HTMLElement)

    fireEvent.click(screen.getByRole('button', { name: /AI 编程助手/ }))
    await waitFor(() =>
      expect(firstGroup().getAllByLabelText('标记为已读').length).toBeGreaterThan(0),
    )

    const itemBtn = firstGroup().getAllByLabelText('标记为已读')[0]
    itemBtn.focus()
    fireEvent.click(itemBtn)
    await actAll()

    // 组仍在，按钮只是文案从「已读」翻成「未读」；焦点必须留在它身上
    expect(container.querySelectorAll('main section').length).toBe(2)
    expect(document.activeElement).toBe(firstGroup().getAllByLabelText('标记为未读')[0])
  })
})
