// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PromptEditor from '../PromptEditor'

const payload = {
  key: 'github-single-summary',
  template: '默认模板正文 {{title}}',
  isCustom: false,
  maxLength: 20000,
  variables: [{ name: 'title', desc: '仓库标题' }],
}

function mockFetchOnce(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('PromptEditor', () => {
  it('访客态：只展示登录入口，不发任何请求', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<PromptEditor />)
    expect(screen.getByLabelText('管理员 Token')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('管理员态：加载模板并展示变量说明', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    mockFetchOnce(200, payload)
    render(<PromptEditor />)
    const textarea = (await screen.findByLabelText(/模板正文/)) as HTMLTextAreaElement
    expect(textarea.value).toBe('默认模板正文 {{title}}')
    expect(screen.getByText('默认模板')).toBeInTheDocument()
    expect(screen.getByText('{{title}}')).toBeInTheDocument()
  })

  it('token 失效（403）时退回登录态', async () => {
    localStorage.setItem('news_monitor_admin_token', 'bad')
    mockFetchOnce(403, { error: 'Forbidden' })
    render(<PromptEditor />)
    await waitFor(() => {
      expect(screen.getByLabelText('管理员 Token')).toBeInTheDocument()
    })
  })

  it('加载失败展示错误提示', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network down')))
    render(<PromptEditor />)
    await waitFor(() => {
      expect(screen.getByText('模板加载失败，请稍后重试')).toBeInTheDocument()
    })
  })

  it('登录流程：token 有效则解锁并记住', async () => {
    // 登录试读一次 + 解锁后加载一次，共两次 GET，都返回模板
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(payload) }),
    )
    render(<PromptEditor />)
    fireEvent.change(screen.getByLabelText('管理员 Token'), { target: { value: 't' } })
    fireEvent.click(screen.getByRole('button', { name: '解锁' }))
    await screen.findByLabelText(/模板正文/)
    expect(localStorage.getItem('news_monitor_admin_token')).toBe('t')
  })

  it('登录失败展示错误', async () => {
    mockFetchOnce(403, { error: 'Forbidden' })
    render(<PromptEditor />)
    fireEvent.change(screen.getByLabelText('管理员 Token'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: '解锁' }))
    await waitFor(() => {
      expect(screen.getByText('Token 错误，请重试')).toBeInTheDocument()
    })
  })

  it('编辑后保存：PUT 成功并提示生效说明', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    const textarea = await screen.findByLabelText(/模板正文/)
    // 未改动时保存按钮不可点
    expect(screen.getByRole('button', { name: '保存模板' })).toBeDisabled()
    fireEvent.change(textarea, { target: { value: '定制 {{title}}' } })
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }))
    await waitFor(() => {
      expect(screen.getByText(/已保存，下次 AI 富化运行时生效/)).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/admin/prompts',
      expect.objectContaining({ method: 'PUT' }),
    )
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(sent).toMatchObject({ key: 'github-single-summary', template: '定制 {{title}}' })
  })

  it('保存被服务端拒绝时展示错误信息', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: '模板不能为空' }),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    const textarea = await screen.findByLabelText(/模板正文/)
    fireEvent.change(textarea, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }))
    await waitFor(() => {
      expect(screen.getByText('模板不能为空')).toBeInTheDocument()
    })
  })

  it('效果测试：用草稿模板对仓库跑一次并展示结果', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            summary: '这是摘要',
            details: '这是详情',
            raw: '{"summary":"这是摘要","details":"这是详情"}',
            renderedPrompt: '完整 prompt…',
            repo: {
              fullName: 'owner/repo',
              url: 'https://github.com/owner/repo',
              description: 'desc',
              language: 'TypeScript',
              stars: 10,
            },
            durationMs: 1234,
          }),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    await screen.findByLabelText(/模板正文/)
    // 链接为空时测试按钮不可点
    expect(screen.getByRole('button', { name: '测试' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('测试用 GitHub 仓库链接'), {
      target: { value: 'https://github.com/owner/repo' },
    })
    fireEvent.click(screen.getByRole('button', { name: '测试' }))
    // 结果展示：摘要 + 详情 + 仓库链接 + 耗时 + 可展开的 prompt
    await waitFor(() => {
      expect(screen.getByText('这是摘要')).toBeInTheDocument()
    })
    expect(screen.getByText('这是详情')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'owner/repo' })).toHaveAttribute(
      'href',
      'https://github.com/owner/repo',
    )
    expect(screen.getByText('1.2s')).toBeInTheDocument()
    expect(screen.getByText('完整 prompt…')).toBeInTheDocument()
    expect(screen.getByText('{"summary":"这是摘要","details":"这是详情"}')).toBeInTheDocument()
    // 请求体里带的是当前草稿模板（未保存也可测）
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(sent).toMatchObject({
      key: 'github-single-summary',
      template: '默认模板正文 {{title}}',
      url: 'https://github.com/owner/repo',
    })
  })

  it('效果测试：改过的草稿会被送去测试（而非已保存版）', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            summary: 's',
            details: '',
            renderedPrompt: 'p',
            repo: {
              fullName: 'o/r',
              url: 'https://github.com/o/r',
              description: '',
              language: '',
              stars: 0,
            },
            durationMs: 100,
          }),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    const textarea = await screen.findByLabelText(/模板正文/)
    fireEvent.change(textarea, { target: { value: '草稿版 {{title}}' } })
    fireEvent.change(screen.getByLabelText('测试用 GitHub 仓库链接'), {
      target: { value: 'https://github.com/owner/repo' },
    })
    fireEvent.click(screen.getByRole('button', { name: '测试' }))
    await waitFor(() => {
      expect(screen.getByText('s')).toBeInTheDocument()
    })
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(sent.template).toBe('草稿版 {{title}}')
  })

  it('效果测试：服务端错误展示可读信息', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: () => Promise.resolve({ error: '仓库不存在或为私有仓库，请检查链接' }),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    await screen.findByLabelText(/模板正文/)
    fireEvent.change(screen.getByLabelText('测试用 GitHub 仓库链接'), {
      target: { value: 'https://github.com/owner/nope' },
    })
    fireEvent.click(screen.getByRole('button', { name: '测试' }))
    await waitFor(() => {
      expect(screen.getByText('仓库不存在或为私有仓库，请检查链接')).toBeInTheDocument()
    })
  })

  it('效果测试：网关无响应体时给重试建议而非秃状态码', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error('not json')),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    await screen.findByLabelText(/模板正文/)
    fireEvent.change(screen.getByLabelText('测试用 GitHub 仓库链接'), {
      target: { value: 'https://github.com/owner/repo' },
    })
    fireEvent.click(screen.getByRole('button', { name: '测试' }))
    await waitFor(() => {
      expect(screen.getByText(/网关无响应.*HTTP 502/)).toBeInTheDocument()
    })
  })

  it('已定制时可恢复默认', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const custom = { ...payload, isCustom: true, template: '定制' }
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(custom) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    fireEvent.click(await screen.findByRole('button', { name: '恢复默认' }))
    await waitFor(() => {
      expect(screen.getByText('已恢复默认模板')).toBeInTheDocument()
    })
    expect(fetchMock.mock.calls[1][0]).toContain('/api/admin/prompts?key=github-single-summary')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' })
  })
})

/**
 * 分支覆盖：把「错误怎么呈现」「哪些操作会被拦下」钉死
 *
 * 这些分支的共同点是**静默失败风险**：比如 token 为空时若不拦下，
 * 就会发出一个必然 403 的请求；效果测试拿不到可读错误时若直接显示状态码，
 * 用户会看到「502」这种没法行动的裸数字。
 */
describe('PromptEditor —— 分支覆盖', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('加载返回 500（��� 403）时提示加载失败', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    mockFetchOnce(500, { error: 'boom' })
    render(<PromptEditor />)
    await waitFor(() => {
      expect(screen.getByText('模板加载失败，请稍后重试')).toBeInTheDocument()
    })
  })

  it('token 为空时点登录不发出任何请求', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<PromptEditor />)
    fireEvent.click(screen.getByRole('button', { name: '解锁' }))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('在 token 输入框按回车可触发登录', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    const input = screen.getByLabelText('管理员 Token')
    fireEvent.change(input, { target: { value: 't' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
  })

  it('在非回车键上不触发登录', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<PromptEditor />)
    const input = screen.getByLabelText('管理员 Token')
    fireEvent.change(input, { target: { value: 't' } })
    fireEvent.keyDown(input, { key: 'a' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('保存失败时优先展示服务端给出的错误文案', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: '模板超过长度上限' }),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    await screen.findByLabelText(/模板正文/)
    fireEvent.change(screen.getByLabelText(/模板正文/), { target: { value: '改过的模板' } })
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }))
    await waitFor(() => {
      expect(screen.getByText('模板超过长度上限')).toBeInTheDocument()
    })
  })

  it('保存失败且服务端没给错误文案时，给出带状态码的兜底提示', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    await screen.findByLabelText(/模板正文/)
    fireEvent.change(screen.getByLabelText(/模板正文/), { target: { value: '改过的模板' } })
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }))
    await waitFor(() => {
      expect(screen.getByText(/保存失败（HTTP 500）/)).toBeInTheDocument()
    })
  })

  it('恢复默认失败时提示错误', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const custom = { ...payload, isCustom: true, template: '定制' }
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(custom) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    await screen.findByLabelText(/模板正文/)
    fireEvent.click(screen.getByRole('button', { name: /恢复默认/ }))
    await waitFor(() => {
      expect(screen.getByText('恢复失败，请稍后重试')).toBeInTheDocument()
    })
  })

  it('测试链接为空时「测试」按钮不可用（不会发出无意义请求）', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    await screen.findByLabelText(/模板正文/)
    expect(screen.getByRole('button', { name: '测试' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('效果测试 504 时给出超时建议', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
      .mockResolvedValueOnce({
        ok: false,
        status: 504,
        json: () => Promise.resolve({}),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    await screen.findByLabelText(/模板正文/)
    fireEvent.change(screen.getByLabelText('测试用 GitHub 仓库链接'), {
      target: { value: 'https://github.com/owner/repo' },
    })
    fireEvent.click(screen.getByRole('button', { name: '测试' }))
    await waitFor(() => {
      expect(screen.getByText(/请求超时/)).toBeInTheDocument()
    })
  })

  it('效果测试 503 时给出服务不可用提示', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve({}) })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    await screen.findByLabelText(/模板正文/)
    fireEvent.change(screen.getByLabelText('测试用 GitHub 仓库链接'), {
      target: { value: 'https://github.com/owner/repo' },
    })
    fireEvent.click(screen.getByRole('button', { name: '测试' }))
    await waitFor(() => {
      expect(screen.getByText(/服务暂不可用/)).toBeInTheDocument()
    })
  })

  it('效果测试请求在链接框按回车可触发', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(payload) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ repo: { url: 'https://github.com/owner/repo' }, summary: 's' }),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<PromptEditor />)
    await screen.findByLabelText(/模板正文/)
    const input = screen.getByLabelText('测试用 GitHub 仓库链接')
    fireEvent.change(input, { target: { value: 'https://github.com/owner/repo' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  it('未登记的提示词 key 直接显示 key 本身', async () => {
    localStorage.setItem('news_monitor_admin_token', 't')
    mockFetchOnce(200, { ...payload, key: 'unknown-key' })
    render(<PromptEditor />)
    await waitFor(() => {
      expect(screen.getByText('unknown-key')).toBeInTheDocument()
    })
  })
})
