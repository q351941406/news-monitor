'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Menu,
  X,
  CheckCheck,
  RotateCcw,
  Settings,
  Activity,
  Archive,
  Lock,
  Unlock,
} from 'lucide-react'

interface HeaderProps {
  unreadCount: number
  showRead: boolean
  isAdmin: boolean
  onShowReadChange: (show: boolean) => void
  onMarkAllRead: () => void
  onResetAllRead: () => void
  onLogin: (token: string) => Promise<boolean>
  onLogout: () => void
}

/** 移动端菜单项的最小可点高度（iOS HIG / WCAG 2.5.8 建议 ≥44px） */
const TAP_MIN = 'min-h-11'

export default function Header({
  unreadCount,
  showRead,
  isAdmin,
  onShowReadChange,
  onMarkAllRead,
  onResetAllRead,
  onLogin,
  onLogout,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [error, setError] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const menuPanelRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])

  /**
   * 移动端抽屉的交互约束。
   *
   * 此前菜单只能在「再点一次汉堡」或点某一项时关闭：
   * - 按 Esc / 返回手势（安卓）关不掉，菜单糊在内容上无法操作
   * - 打开时页面仍可滚动，触屏上手指会同时拖动抽屉和背景
   */
  useEffect(() => {
    if (!mobileMenuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMobileMenu()
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    // 锁背景滚动：抽屉展开时，手指不应把背后的页面一起拖走
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [mobileMenuOpen, closeMobileMenu])

  /**
   * 登录：等待父组件完成校验后再决定是否收起输入框。
   *
   * 曾存在的 bug：`error` state 声明了却从未被置为 true（`setError` 只在
   * input onChange 里被设为 false），导致「Token 错误，请重试」是死代码，
   * 用户永远看不到失败原因。现在由 onLogin 的返回值驱动。
   */
  const handleLogin = async () => {
    if (!tokenInput.trim() || submitting) return
    setSubmitting(true)
    const ok = await onLogin(tokenInput.trim())
    setSubmitting(false)
    if (ok) {
      setTokenInput('')
      setShowTokenInput(false)
      setError(false)
    } else {
      setError(true)
    }
  }

  /** 移动端菜单项统一点击处理：执行动作后收起抽屉 */
  const runAndClose = (fn: () => void) => {
    fn()
    closeMobileMenu()
  }

  return (
    <>
      {/*
          抽屉展开时顶栏必须不透明：毛玻璃的 bg-white/80 会让下方抽屉内容
          （3 条未读 / 各菜单项）直接透上来，读起来像两层文字叠在一起。
          backdrop-blur 在不支持的浏览器上还会整体退化成半透明。
        */}
      <header
        className={`sticky top-0 z-50 border-b border-stone-200 transition-colors ${
          mobileMenuOpen ? 'bg-white' : 'bg-white/80 backdrop-blur-md'
        }`}
      >
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <h1 className="truncate font-serif text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
                News Monitor
              </h1>
              {unreadCount > 0 && (
                // 移动端只留红点数字（桌面带「未读」二字）：375px 宽下四个元素
                // 勉强并排，加两个字就会把汉堡按钮挤出屏幕
                <span className="inline-flex shrink-0 items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium tabular-nums text-red-700 sm:hidden">
                  {unreadCount}
                  <span className="sr-only"> 条未读</span>
                </span>
              )}
              {unreadCount > 0 && (
                <span className="hidden items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium tabular-nums text-red-700 sm:inline-flex">
                  {unreadCount} 未读
                </span>
              )}
              <span
                className={`hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex ${
                  isAdmin ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'
                }`}
              >
                {isAdmin ? (
                  <>
                    <Unlock className="w-3 h-3" aria-hidden /> 管理员
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3" aria-hidden /> 访客
                  </>
                )}
              </span>
            </div>

            {/* Desktop Actions */}
            <div className="hidden items-center gap-4 md:flex">
              <Link
                href="/archive"
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-stone-600 transition-colors hover:text-stone-900"
                title="历史归档"
              >
                <Archive className="w-4 h-4" />
                历史归档
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-stone-600 transition-colors hover:text-stone-900"
                title="运维仪表盘"
              >
                <Activity className="w-4 h-4" />
              </Link>
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-stone-600 transition-colors hover:text-stone-900"
                title="设置"
              >
                <Settings className="w-4 h-4" />
              </Link>
              <ShowReadToggle showRead={showRead} onShowReadChange={onShowReadChange} />
              {isAdmin ? (
                <>
                  <button
                    onClick={onMarkAllRead}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                  >
                    <CheckCheck className="w-4 h-4" />
                    全部已读
                  </button>
                  <button
                    onClick={onResetAllRead}
                    className="inline-flex items-center gap-2 rounded-lg bg-stone-100 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200"
                  >
                    <RotateCcw className="w-4 h-4" />
                    撤销已读
                  </button>
                  <button
                    onClick={onLogout}
                    className="text-xs text-stone-400 transition-colors hover:text-stone-600"
                    title="退出管理员模式"
                  >
                    退出
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowTokenInput(!showTokenInput)}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm text-stone-500 transition-colors hover:text-stone-800"
                >
                  <Lock className="w-4 h-4" />
                  管理员登录
                </button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              ref={menuButtonRef}
              type="button"
              className={`-mr-2 flex shrink-0 items-center justify-center rounded-lg p-2 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 md:hidden ${
                mobileMenuOpen ? 'bg-stone-100 text-stone-900' : ''
              }`}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={mobileMenuOpen ? '关闭菜单' : '打开菜单'}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" aria-hidden />
              ) : (
                <Menu className="w-6 h-6" aria-hidden />
              )}
            </button>
          </div>

          {/* Token Input */}
          {showTokenInput && (
            <div className="border-t border-stone-100 py-3">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value)
                    setError(false)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="输入管理员 Token"
                  aria-label="管理员 Token"
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-red-500 sm:text-sm"
                />
                <button
                  onClick={handleLogin}
                  disabled={submitting}
                  className={`${TAP_MIN} shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50`}
                >
                  {submitting ? '校验中...' : '解锁'}
                </button>
              </div>
              {error && (
                <p className="mt-2 text-xs text-red-600">
                  Token 错误，请重试（连续多次失败会被临时限制访问）
                </p>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Mobile Menu — 全屏遮罩 + 抽屉面板 */}
      {mobileMenuOpen && (
        <>
          <div
            id="mobile-menu-backdrop"
            className="fixed inset-0 top-16 z-40 bg-stone-900/20 md:hidden"
            onClick={closeMobileMenu}
            aria-hidden
          />
          <div
            ref={menuPanelRef}
            id="mobile-menu"
            role="dialog"
            aria-label="站点菜单"
            className="fixed inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-b border-stone-200 bg-white shadow-lg md:hidden"
          >
            <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    isAdmin ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'
                  }`}
                >
                  {isAdmin ? (
                    <>
                      <Unlock className="w-3 h-3" aria-hidden /> 管理员
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3" aria-hidden /> 访客
                    </>
                  )}
                </span>
                {unreadCount > 0 && (
                  <span className="text-xs tabular-nums text-stone-500">{unreadCount} 条未读</span>
                )}
              </div>

              <Link
                href="/archive"
                className={`${TAP_MIN} inline-flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 active:bg-stone-200`}
                onClick={closeMobileMenu}
              >
                <Archive className="w-4 h-4 text-stone-400" aria-hidden />
                历史归档
              </Link>
              <Link
                href="/dashboard"
                className={`${TAP_MIN} inline-flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 active:bg-stone-200`}
                onClick={closeMobileMenu}
              >
                <Activity className="w-4 h-4 text-stone-400" aria-hidden />
                运维仪表盘
              </Link>
              {/*
                设置入口此前只存在于桌面端操作区，移动端汉堡菜单里漏了它 ——
                小屏用户根本走不到「设置」页。
              */}
              <Link
                href="/settings"
                className={`${TAP_MIN} inline-flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 active:bg-stone-200`}
                onClick={closeMobileMenu}
              >
                <Settings className="w-4 h-4 text-stone-400" aria-hidden />
                设置
              </Link>

              <div className="my-1 border-t border-stone-100" />

              <label
                className={`${TAP_MIN} flex cursor-pointer items-center gap-3 rounded-lg px-4 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-100`}
              >
                <input
                  type="checkbox"
                  checked={showRead}
                  onChange={(e) => onShowReadChange(e.target.checked)}
                  className="h-5 w-5 shrink-0 rounded border-stone-300 text-red-600 focus:ring-red-500"
                />
                显示已读
              </label>

              {isAdmin ? (
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => runAndClose(onMarkAllRead)}
                    className={`${TAP_MIN} inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors active:bg-red-700`}
                  >
                    <CheckCheck className="w-4 h-4" aria-hidden />
                    全部已读
                  </button>
                  <button
                    onClick={() => runAndClose(onResetAllRead)}
                    className={`${TAP_MIN} inline-flex items-center justify-center gap-2 rounded-lg bg-stone-100 px-4 py-2 text-sm font-medium text-stone-600 transition-colors active:bg-stone-200`}
                  >
                    <RotateCcw className="w-4 h-4" aria-hidden />
                    撤销已读
                  </button>
                  <button
                    onClick={() => runAndClose(onLogout)}
                    className={`${TAP_MIN} inline-flex items-center justify-center px-4 py-2 text-sm text-stone-500 transition-colors active:bg-stone-200`}
                  >
                    退出管理员模式
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowTokenInput(!showTokenInput)}
                  className={`${TAP_MIN} inline-flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-stone-600 transition-colors active:bg-stone-100`}
                >
                  <Lock className="w-4 h-4 text-stone-400" aria-hidden />
                  管理员登录
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

/** 「显示已读」开关（桌面 / 移动共用，移动端加大到 20px 便于点中） */
function ShowReadToggle({
  showRead,
  onShowReadChange,
}: {
  showRead: boolean
  onShowReadChange: (show: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
      <input
        type="checkbox"
        checked={showRead}
        onChange={(e) => onShowReadChange(e.target.checked)}
        className="h-4 w-4 rounded border-stone-300 text-red-600 focus:ring-red-500"
      />
      显示已读
    </label>
  )
}
