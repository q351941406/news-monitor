import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['src/**/db/__tests__/*.test.ts', 'node_modules'],
    coverage: {
      provider: 'v8',
      include: ['src/**', 'scripts/**'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/db/__tests__/**',
        'src/app/components/**',
        // 定时任务脚本：由 GitHub Actions 调度执行，非 vitest 单测目标
        'scripts/**',
        // 无测试的 UI 展示层
        'src/app/**/page.tsx',
        'src/app/layout.tsx',
        'src/app/global-error.tsx',
      ],
      // 覆盖率门槛 — 唯一事实源（CI 通过 test:coverage:check 读取此处）
      // 实测基准 (2026-08): lines 31.9% / branches 39.9% / functions 31.3% / statements 32.9%
      // 门槛设为实测 -2% 缓冲，后续每个 sprint 逐步上调
      thresholds: {
        lines: 30,
        branches: 38,
        functions: 30,
        statements: 31,
        // 只对 src/ 应用门槛，scripts/ 暂时豁免
        perFile: false,
      },
      // 覆盖率低于门槛时让 build/test 失败
      reportsDirectory: 'coverage/unit',
      reporter: ['text', 'json-summary', 'html', 'json'],
      reportOnFailure: true,
    },
  },
})
