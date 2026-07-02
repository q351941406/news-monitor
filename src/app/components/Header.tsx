'use client'

import { useState } from 'react'
import { Menu, X, CheckCheck, RotateCcw, Settings } from 'lucide-react'

interface HeaderProps {
  unreadCount: number
  totalCount: number
  showRead: boolean
  onShowReadChange: (show: boolean) => void
  onMarkAllRead: () => void
  onResetAllRead: () => void
}

export default function Header({
  unreadCount,
  totalCount,
  showRead,
  onShowReadChange,
  onMarkAllRead,
  onResetAllRead,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl font-bold text-stone-900 tracking-tight">
              News Monitor
            </h1>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
              {unreadCount} 未读
            </span>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showRead}
                onChange={(e) => onShowReadChange(e.target.checked)}
                className="w-4 h-4 rounded border-stone-300 text-red-600 focus:ring-red-500"
              />
              显示已读
            </label>
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
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-stone-600 hover:text-stone-900"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-stone-100">
            <div className="flex flex-col gap-4">
              <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRead}
                  onChange={(e) => onShowReadChange(e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-red-600 focus:ring-red-500"
                />
                显示已读
              </label>
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
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
