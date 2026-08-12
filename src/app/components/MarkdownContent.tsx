'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
/**
 * 预处理：修复 CommonMark 与中文排版的冲突。
 *
 * CommonMark 规定 closing `**` 前一个字符不能是标点，导致
 * AI 常生成的 `**适合人群：**预算...` 无法渲染为粗体。
 * 这里将"中文标点收尾的 strong"提前替换为 <strong>（配合
 * rehypeRaw + rehype-sanitize 白名单渲染，无 XSS 风险）。
 */
function normalizeChineseStrong(text: string): string {
  return text.replace(/\*\*([^*\n]+?[，。；：、！？）】」』])\*\*/g, '<strong>$1</strong>')
}
/**
 * 统一 Markdown 渲染组件
 *
 * - remark-gfm：表格、任务列表、删除线、自动链接
 * - remark-breaks：单换行 → <br>（AI 输出的 details 常以单换行分段）
 * - rehype-raw + sanitize：渲染预处理产出的 <strong> 等白名单标签
 * - 链接新窗口打开；表格加边框样式
 */
export default function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeRaw, rehypeSanitize]}
      components={{
        a: ({ ...props }) => (
          <a
            {...props}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          />
        ),
        p: ({ ...props }) => (
          <p {...props} className="text-sm text-stone-600 leading-relaxed mb-2" />
        ),
        table: ({ ...props }) => (
          <div className="overflow-x-auto mb-2">
            <table {...props} className="w-full text-xs border-collapse" />
          </div>
        ),
        th: ({ ...props }) => (
          <th
            {...props}
            className="border border-stone-300 px-2 py-1 bg-stone-100 text-left font-semibold"
          />
        ),
        td: ({ ...props }) => <td {...props} className="border border-stone-300 px-2 py-1" />,
      }}
    >
      {normalizeChineseStrong(content)}
    </ReactMarkdown>
  )
}
