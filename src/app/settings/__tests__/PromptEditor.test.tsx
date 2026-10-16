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
