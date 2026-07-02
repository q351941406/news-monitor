'use client'

interface SourceTabsProps {
  sources: { id: string; label: string; icon: string; count: number; unread: number }[]
  activeSource: string
  onSourceChange: (source: string) => void
}

export default function SourceTabs({ sources, activeSource, onSourceChange }: SourceTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <button
        onClick={() => onSourceChange('all')}
        className={`flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
          activeSource === 'all'
            ? 'bg-stone-900 text-white'
            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
        }`}
      >
        全部
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs ${
          activeSource === 'all' ? 'bg-white/20' : 'bg-stone-200'
        }`}>
          {sources.reduce((sum, s) => sum + s.unread, 0)}
        </span>
      </button>
      {sources.map(source => (
        <button
          key={source.id}
          onClick={() => onSourceChange(source.id)}
          className={`flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            activeSource === source.id
              ? 'bg-stone-900 text-white'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          <span>{source.icon}</span>
          {source.label}
          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs ${
            activeSource === source.id ? 'bg-white/20' : 'bg-stone-200'
          }`}>
            {source.unread}
          </span>
        </button>
      ))}
    </div>
  )
}
