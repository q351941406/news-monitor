import type { Metadata } from 'next'
import { Newsreader, Roboto } from 'next/font/google'
import './globals.css'

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
})

const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-roboto',
})

export const metadata: Metadata = {
  title: 'News Monitor',
  description: '热点新闻监控与领域知识发现',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className={`${newsreader.variable} ${roboto.variable}`}>
      <body className="font-sans antialiased bg-stone-50 text-stone-900">
        {children}
      </body>
    </html>
  )
}
