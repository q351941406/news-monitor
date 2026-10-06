/**
 * Tailwind 配置
 *
 * fontFamily 必须在这里声明：globals.css 里虽然写了
 * `h1 { font-family: var(--font-newsreader) }`，但元素上带的是 Tailwind 的
 * `.font-serif`（ui-serif）utility —— class 选择器优先级高于元素选择器，
 * 会直接把它覆盖掉。结果是 next/font 配了、CSS 变量也生成了，页面却一直
 * 在用系统字体（实测渲染为 DejaVu Serif / Noto Sans CJK SC）。
 *
 * 把变量接到 utility 上，字体才真正生效，也与 globals.css 的意图一致。
 * 两个字体都只含拉丁字形，中文会自然回落到后面的 system-ui / sans-serif。
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-roboto)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-newsreader)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
