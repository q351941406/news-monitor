// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import Header from '../Header'

/**
 * 回归测试：管理员登录的错误反馈
 *
 * 曾存在的 bug：`error` state 声明了却**从未**被置为 true
 * （`setError` 只在 input onChange 里设为 false），
 * 导致「Token 错误，请重试」是死代码 —— 用户永远看不到失败原因，
 * 叠加后端 403 被忽略，形成「随便输什么都能解锁」的假象。
 */
function renderHeader(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const props = {
    unreadCount: 3,
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

/** 打开登录框并输入 token，点「解锁」 */
async function attemptLogin(token: string) {
  fireEvent.click(screen.getByText('管理员登录'))
  const input = screen.getByPlaceholderText('输入管理员 Token')
  fireEvent.change(input, { target: { value: token } })
  // 点击会触发 async 校验 → promise resolve 后的 setState 需包在 act 中
  await act(async () => {
    fireEvent.click(screen.getByText('解锁'))
  })
}

describe('Header 管理员登录', () => {
  beforeEach(() => vi.clearAllMocks())

  it('登录失败时显示错误提示（此前是死代码，永远不显示）', async () => {
    const onLogin = vi.fn().mockResolvedValue(false)
    renderHeader({ onLogin })
    await attemptLogin('wrong-token')
    await waitFor(() => {
      expect(screen.getByText(/Token 错误/)).toBeInTheDocument()
    })
  })

  it('登录失败时保留输入框（不误判为成功而收起）', async () => {
    renderHeader({ onLogin: vi.fn().mockResolvedValue(false) })
    await attemptLogin('wrong-token')
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入管理员 Token')).toBeInTheDocument()
    })
  })

  it('登录成功时收起输入框且不显示错误', async () => {
    renderHeader({ onLogin: vi.fn().mockResolvedValue(true) })
    await attemptLogin('good-token')
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('输入管理员 Token')).not.toBeInTheDocument()
    })
    expect(screen.queryByText(/Token 错误/)).not.toBeInTheDocument()
  })

  it('onLogin 未被调用时不得进入管理员态（无 token 不提交）', () => {
    const onLogin = vi.fn()
    renderHeader({ onLogin })
    fireEvent.click(screen.getByText('管理员登录'))
    fireEvent.click(screen.getByText('解锁')) // 空输入
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('登录中禁用按钮并显示「校验中」，防止重复提交', async () => {
    let resolve!: (v: boolean) => void
    const onLogin = vi.fn().mockReturnValue(new Promise<boolean>((r) => (resolve = r)))
    renderHeader({ onLogin })
    fireEvent.click(screen.getByText('管理员登录'))
    fireEvent.change(screen.getByPlaceholderText('输入管理员 Token'), {
      target: { value: 'tok' },
    })
    await act(async () => {
      fireEvent.click(screen.getByText('解锁'))
    })

    expect(screen.getByText('校验中...')).toBeInTheDocument()
    expect(screen.getByText('校验中...')).toBeDisabled()

    // 校验期间再点一次不应产生第二次调用
    fireEvent.click(screen.getByText('校验中...'))
    expect(onLogin).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolve(true)
    })
    expect(screen.queryByText('校验中...')).not.toBeInTheDocument()
  })

  it('再次输入时清除上一次的错误提示', async () => {
    renderHeader({ onLogin: vi.fn().mockResolvedValue(false) })
    await attemptLogin('wrong')
    await waitFor(() => expect(screen.getByText(/Token 错误/)).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('输入管理员 Token'), {
      target: { value: 'wrong2' },
    })
    expect(screen.queryByText(/Token 错误/)).not.toBeInTheDocument()
  })
})
