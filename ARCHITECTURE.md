# News Monitor 架构概览

## 数据流

```
外部源 (GitHub/PH/Twitter)
    │
    ▼ fetch()     ← 纯数据转换，不写 DB
src/sources/
    │
    ▼ storeRawItems()
src/lib/db/news-repo.ts
    │
    ▼ AI 处理
src/lib/ai-service.ts → generateBatchSummary()
    │
    ▼ storeAIAnalysis()
src/lib/db/ai-repo.ts
    │
    ▼ 主题聚合（队列式增量，每次消费一批）
getAggregationBatch(source, 100)   ← 新数据优先 + 最旧未聚合补足
    │
    ▼ generateTopicAggregation(items, existingTopics)
src/lib/ai-service.ts  ← prompt 注入「已有主题」历史上下文，优先归并
    │
    ▼ storeTopicGroups() 增量 upsert（同名主题复用，不重建）
    + deleteEmptyTopics() 删空主题
    + markItemsAggregated() 标记已聚合（队列轮转）
src/lib/db/topic-repo.ts
    │
    ▼ Web 展示（三级懒加载：组列表 → 组内 items → 单条原文）
src/app/ → API routes → 前端组件
```

## 模块结构

### src/sources/

数据源适配器，实现 NewsSource 接口，不包含 DB 副作用。

### src/lib/db/

仓库模块，每个模块一个职责：

- connection.ts: 共享连接
- news-repo.ts: 原始数据 CRUD
- ai-repo.ts: AI 分析存储
- read-repo.ts: 阅读状态
- topic-repo.ts: 主题聚合
- stats-repo.ts: 统计清理

### src/lib/ai-service.ts

AIService 接口 + 生产实现，可 mock。

### scripts/

独立 CLI 脚本，由 GitHub Actions 调度。

## 测试策略

| 层        | 类型     | 依赖            | Mock 边界                                                                 |
| --------- | -------- | --------------- | ------------------------------------------------------------------------- |
| AIService | 单元测试 | 无              | vi.mock('ai')（LLM 调用）                                                 |
| DB 仓库   | 集成测试 | 真实 PostgreSQL | 无（建表复用 drizzle/*.sql 迁移）                                         |
| Sources   | 单元测试 | 无              | vi.stubGlobal('fetch') / mock child_process                               |
| Sources   | 集成测试 | 真实 PostgreSQL | fetch / execSync（端到端链路测试）                                        |
| 全测试    | 全局     | vitest.setup.ts | 所有测试**永不真实调用 LLM**：全局 mock 'ai' 模块，忘写 mock 时抛哨兵错误 |

### 集成测试基建（db-test-helper）

- 每个测试文件（vitest worker）创建**独立 Postgres schema**（`test_<pid>_<rand>`），
  search_path 定向实现并行隔离、互不干扰
- 建表复用 `scripts/migrate-core.ts` 执行 `drizzle/*.sql` 全部迁移（0000→0005），
  测试环境 = 生产迁移后状态，单一真相、永不漂移
- 迁移核心同时被 `migrate-ci.ts`（生产/CI）复用，支持 schema 重写（drizzle-kit 生成的
  外键硬编码 "public". 前缀在测试 schema 下被重写指向本 worker schema）

### 端到端链路测试（e2e-pipeline*.test.ts）

覆盖真实主链路（外部网络边界 mock、内部全真实）：
数据源抓取(mock fetch/CLI) → storeRawItems(真DB) → AI摘要落库 → 主题聚合 → API 读取

- e2e-pipeline.test.ts：GitHub（mock HTML）+ Product Hunt（mock GraphQL）
- e2e-pipeline-twitter.test.ts：Twitter（mock child_process，独立文件避免文件级
  vi.mock('@/lib/retry') 污染其它用例）

## 关键决策

参见 docs/adr/：

- 0001: 使用 pg 驱动
- 0002: 拆分 db.ts
- 0003: 创建 AIService 接缝
- 0004: 净化 Source 接口
