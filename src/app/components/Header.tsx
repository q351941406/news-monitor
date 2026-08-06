'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Menu, X, CheckCheck, RotateCcw, Settings, Activity, Lock, Unlock } from 'lucide-react'
interface HeaderProps {
  unreadCount: number
  showRead: boolean
  isAdmin: boolean
  onShowReadChange: (show: boolean) => void
  onMarkAllRead: () => void
  onResetAllRead: () => void
  onLogin: (token: string) => void
  onLogout: () => void
}
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

  const handleLogin = () => {
    if (!tokenInput.trim()) return
    onLogin(tokenInput.trim())
    setTokenInput('')
    setShowTokenInput(false)
  }

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl font-bold text-stone-900 tracking-tight">
              News Monitor
            </h1>
            {unreadCount > 0 && (
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
                {unreadCount} 未读
              </span>
            )}
            {isAdmin ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                <Unlock className="w-3 h-3" /> 管理员
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-500">
                <Lock className="w-3 h-3" /> 访客
              </span>
            )}
          </div>
          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors"
              title="运维仪表盘"
            >
              <Activity className="w-4 h-4" />
            </Link>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </Link>
            <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showRead}
                onChange={(e) => onShowReadChange(e.target.checked)}
                className="w-4 h-4 rounded border-stone-300 text-red-600 focus:ring-red-500"
              />
              显示已读
            </label>
            {isAdmin ? (
              <>
                <button
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  <CheckCheck className="w-4 h-4" />
                  全部已读
                </button>
                <button
                  onClick={onResetAllRead}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  撤销已读
                </button>
                <button
                  onClick={onLogout}
                  className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
                  title="退出管理员模式"
                >
                  退出
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowTokenInput(!showTokenInput)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-stone-500 hover:text-stone-800 transition-colors"
              >
                <Lock className="w-4 h-4" />
                管理员登录
              </button>
            )}
          </div>
          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-stone-600 hover:text-stone-900"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {/* Token Input */}
        {showTokenInput && (
          <div className="py-3 border-t border-stone-100">
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
                className="flex-1 px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                onClick={handleLogin}
                className="px-4 py-2 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-700 transition-colors"
              >
                解锁
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">Token 错误，请重试</p>}
          </div>
        )}
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-stone-100">
            <div className="flex flex-col gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Activity className="w-4 h-4" />
                运维仪表盘
              </Link>
              <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRead}
                  onChange={(e) => onShowReadChange(e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-red-600 focus:ring-red-500"
                />
                显示已读
              </label>
              {isAdmin ? (
                <>
                  <button
                    onClick={() => {
                      onMarkAllRead()
                      setMobileMenuOpen(false)
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <CheckCheck className="w-4 h-4" />
                    全部已读
                  </button>
                  <button
                    onClick={() => {
                      onResetAllRead()
                      setMobileMenuOpen(false)
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    撤销已读
                  </button>
                  <button
                    onClick={() => {
                      onLogout()
                      setMobileMenuOpen(false)
                    }}
                    className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    退出管理员模式
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowTokenInput(!showTokenInput)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm text-stone-500 hover:text-stone-800 transition-colors"
                >
                  <Lock className="w-4 h-4" />
                  管理员登录
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
