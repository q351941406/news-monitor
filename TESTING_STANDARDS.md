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
- UI 组件：不强制覆盖
