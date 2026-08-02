import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
})

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // 允许 dev 依赖中有 unused vars（被 eslint-disable 标注的场景）
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // next-env.d.ts 由 Next.js 自动生成，含 triple-slash reference
    ignores: ['next-env.d.ts'],
  },
]

export default eslintConfig
