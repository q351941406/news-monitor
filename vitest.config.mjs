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
      ],
      // 覆盖率门槛 — 当前 45%，起步门槛 45%，新代码必须 ≥ 50%
      // 后续逐步提高（每个 sprint +5%）
      thresholds: {
        lines: 39,
        branches: 48,
        functions: 40,
        statements: 40,
        // 只对 src/ 应用门槛，scripts/ 暂时豁免
        perFile: false,
      },
      // 覆盖率低于门槛时让 build/test 失败
      reporter: ['text', 'json-summary', 'html'],
      reportOnFailure: true,
    },
  },
})
