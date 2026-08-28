# Testing Standards

## 测试分层

### 单元测试 (npm test)

- 测试纯逻辑，不依赖外部服务
- Mock 只在系统边界（外部 API、CLI）
- 运行在 vitest.config.mjs，排除集成测试

### 集成测试 (npm run test:integration)

- 使用真实 PostgreSQL 数据库
- 通过公共接口验证行为
- 运行在 vitest.config.integration.mjs
- **建表复用生产迁移**：每个测试文件创建独立 schema，执行 drizzle/*.sql 全部迁移
  建表（scripts/migrate-core.ts），测试环境 = 生产迁移后状态
- **端到端链路测试**（e2e-pipeline*.test.ts）：数据源抓取(mock fetch/CLI) →
  存储 → AI 摘要落库 → 主题聚合 → API 读取，串起真实主链路

### E2E 测试 (npm run test:e2e)

- 使用 Playwright + 真实 Chromium，跑在「生产构建 + 生产启动方式」上
  （next build → scripts/start-e2e.sh 复制静态资源 → node .next/standalone/server.js，
  与 Dockerfile runner 阶段一致，而非 `next start`）
- 需要真实 PostgreSQL（空库即可，页面渲染空态）
- 覆盖 jsdom/单测/集成测试都验证不到的**浏览器运行时行为**：
  - CSP 拦截 inline script → "Connection closed"（对应 PR #15 事故）
  - 页面级渲染崩溃（对应 PR #14 dashboard `.map` 事故）
  - SSR + RSC 流式渲染 + hydration 全链路
- 断言约定：
  - 页面核心 UI 可见（标题/空态）
  - 无未捕获异常（`page.on('pageerror')` 为空）
  - 无 CSP / "Connection closed" 相关 console error
- 用 `page.route` mock 后端接口，模拟异常响应（500、结构错误 payload）验证优雅降级

### LLM 全局防护（所有测试）

- vitest.setup.ts 全局 mock `ai` 模块：generateText 默认抛哨兵错误
- **测试环境永不真实调用 LLM API**；文件级 vi.mock('ai') 可覆盖全局
  （如 ai-service.test.ts 测试重试/分批时显式提供假响应）

## Mock 原则 (来自 tdd/mocking.md)

- 仅在系统边界 mock：外部 API、CLI、LLM
- 不 mock 内部模块、自己的类、数据库
- 使用 vi.mock() 在模块级别替换

## 测试命名

- 文件: `*.test.ts`，放在 `__tests__/` 目录
- describe: 模块名
- it: 描述行为（"用户可以用有效购物车结账"）

## 好测试的特征

- 通过公共接口验证
- 不测实现细节
- 经得起重构
- 一个测试一个逻辑断言

## 覆盖策略

- 核心逻辑：AIService、DB 仓库、Sources → 必须覆盖
- 边界情况：空数据、API 错误、缺少配置 → 必须覆盖
- UI 交互组件：有交互逻辑（useState/onClick/回调）的组件覆盖（jsdom + Testing Library）；
  纯展示组件（如 MarkdownContent）用 SSR 渲染即可
- 组件测试用文件级 `// @vitest-environment jsdom` 注释，不污染全局 node 环境
- 页面级组件（page.tsx / 数据加载 / 错误降级）与浏览器运行时（CSP/hydration）→ 由 E2E 覆盖，
  page.tsx 继续排除在单测覆盖率统计之外，但 E2E 是 CI 硬门禁
