import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MarkdownContent from '../MarkdownContent'

const render = (md: string) => renderToStaticMarkup(<MarkdownContent content={md} />)

describe('MarkdownContent', () => {
  describe('基础 markdown', () => {
    it('渲染粗体', () => {
      const html = render('**粗体** 文本')
      expect(html).toContain('<strong>粗体</strong>')
      expect(html).not.toContain('**粗体**')
    })

    it('渲染行内代码', () => {
      const html = render('使用 `npm install` 安装')
      expect(html).toContain('<code>npm install</code>')
    })

    it('渲染链接且新窗口打开', () => {
      const html = render('[文档](https://example.com)')
      expect(html).toContain('<a href="https://example.com"')
      expect(html).toContain('target="_blank"')
      expect(html).toContain('rel="noopener noreferrer"')
    })
  })

  describe('中文 strong 兼容（CommonMark 标点冲突）', () => {
    it('渲染 `**适合人群：**内容`（closing 前中文标点 + 后无空格）', () => {
      // CommonMark 规定 closing ** 前不能是标点，AI 常输出此格式，需预处理兜底
      const html = render('**适合人群：**预算很低、能够自行配置 Hysteria2 的用户。')
      expect(html).toContain('<strong>适合人群：</strong>')
      expect(html).not.toContain('**适合人群')
    })

    it('渲染中文问号/句号收尾的 strong', () => {
      expect(render('**注意：**高温')).toContain('<strong>注意：</strong>')
      expect(render('**警告！**危险')).toContain('<strong>警告！</strong>')
      expect(render('**结论。**结束')).toContain('<strong>结论。</strong>')
    })

    it('不影响正常 strong（无标点）', () => {
      expect(render('**普通粗体**')).toContain('<strong>普通粗体</strong>')
    })
  })

  describe('GFM 扩展', () => {
    it('渲染表格', () => {
      const html = render('| A | B |\n|---|---|\n| 1 | 2 |')
      expect(html).toContain('<table')
      expect(html).toMatch(/<th[^>]*>A<\/th>/)
      expect(html).toMatch(/<td[^>]*>1<\/td>/)
      expect(html).not.toContain('|---|')
    })

    it('渲染任务列表为 checkbox', () => {
      const html = render('- [x] 完成\n- [ ] 未完成')
      expect(html).toContain('type="checkbox"')
      expect(html).toContain('checked=""')
      expect(html).not.toContain('[x] 完成')
    })

    it('渲染删除线', () => {
      const html = render('~~删除线~~')
      expect(html).toContain('<del>删除线</del>')
    })

    it('自动链接 URL', () => {
      const html = render('访问 https://example.com 查看')
      expect(html).toContain('<a href="https://example.com"')
      expect(html).toContain('>https://example.com</a>')
    })
  })

  describe('AI 输出场景', () => {
    it('单换行转 <br>（AI details 常用单换行分段）', () => {
      const html = render('第一行\n第二行')
      expect(html).toMatch(/<br\s*\/?>/)
      expect(html).toContain('第一行')
      expect(html).toContain('第二行')
    })

    it('完整 AI 输出：粗体 + 列表', () => {
      const md = '**适合人群：**预算很低的用户。\n\n- 支持多协议\n- 无限流量'
      const html = render(md)
      expect(html).toContain('<strong>适合人群：</strong>')
      expect(html).toContain('<li>支持多协议</li>')
      expect(html).toContain('<li>无限流量</li>')
    })
  })

  describe('安全', () => {
    it('剥离 <script>（rehype-sanitize 白名单）', () => {
      const html = render('<script>alert(1)</script>正常文本')
      expect(html).not.toContain('<script')
      expect(html).toContain('正常文本')
    })

    it('剥离事件属性与危险标签', () => {
      const html = render('<img src="x" onerror="alert(1)"><iframe src="evil"></iframe>')
      expect(html).not.toContain('onerror')
      expect(html).not.toContain('<iframe')
    })
  })
})
