# Code Quality Improvement

## 目标

建立测试基础设施、深化 AI 管线、拆分 db.ts、净化 Source 接口，使代码库可测试、可维护。

## 计划

### Phase 1: 测试基础设施 + AIService 接缝

- 01-setup-vitest: 安装 Vitest，配置测试环境
- 02-create-ai-service: 创建 AIService 接口 + 生产实现
- 03-refactor-scripts: 重构 ai-process.ts / topic-aggregate.ts 使用 AIService
- 04-write-tests: 为 AI 管线写测试（mock AIService）
- 05-setup-pre-commit: 配 Husky + lint-staged + typecheck + test

### Phase 2: 深化 db.ts

- 06-split-db: 拆分 db.ts 为 4 个仓库模块
- 07-db-tests: 为仓库模块写测试

### Phase 3: 净化 Source 接口

- 08-clean-sources: 从 fetch() 中移除 DB 副作用
- 09-source-tests: 为数据源写测试（mock HTTP）

## 上下文

- 前端 UI 不碰，只改代码质量
- 使用本地 issue tracker: `.scratch/code-quality-improvement/issues/`
- 所有测试使用 mock，不调真实 API
