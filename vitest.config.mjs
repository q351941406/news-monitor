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
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    exclude: ['src/**/db/__tests__/*.test.ts', 'node_modules'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/db/__tests__/**',
        'src/app/components/**',
        // 无测试的 UI 展示层
        'src/app/**/page.tsx',
        'src/app/layout.tsx',
        'src/app/global-error.tsx',
      ],
      // 覆盖率门槛**不在这里设**：unit 阶段单独跑时，DB 相关文件（src/lib/db/**、
      // src/app/api/**）由集成测试覆盖，unit 阶段它们的覆盖率天然是 0% ——
      // 在这里设阈值只会得到一个"随测试分布漂移"的假门槛。
      //
      // 唯一事实源是 scripts/merge-coverage.ts（unit ∪ integration 合并后，
      // 四项全 ≥ 90%），由 CI 的 coverage job 执行；不达标 → 退出码 1 → 红 → 禁止合并。
      //
      // 历史上这里曾写着 30/31/38/30（2026-08 的实测基准 -2% 缓冲），
      // 早已名存虚亡 —— 留着只会让人以为"有两道门禁"，实际只有一道。
      thresholds: {
        lines: 0,
        branches: 0,
        functions: 0,
        statements: 0,
        perFile: false,
      },
      // 覆盖率低于门槛时让 build/test 失败
      reportsDirectory: 'coverage/unit',
      reporter: ['text', 'json-summary', 'html', 'json'],
      reportOnFailure: true,
    },
  },
})
