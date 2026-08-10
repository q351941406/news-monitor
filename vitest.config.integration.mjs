import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/db/__tests__/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      // 集成测试统计：db 层 + API 路由 + 集成测试可触达的业务代码
      include: ['src/**', 'scripts/**'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/db/__tests__/**',
        'src/app/components/**',
        'scripts/**',
        'src/app/**/page.tsx',
        'src/app/layout.tsx',
        'src/app/global-error.tsx',
      ],
      reportsDirectory: 'coverage/integration',
      reporter: ['json-summary', 'json'],
      // 合并后总门槛由 scripts/merge-coverage.ts 统一检查
    },
  },
})
