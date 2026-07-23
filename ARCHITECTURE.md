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
    ▼ 主题聚合
src/lib/ai-service.ts → generateTopicAggregation()
    │
    ▼ storeTopicGroups()
src/lib/db/topic-repo.ts
    │
    ▼ Web 展示
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

| 层        | 类型     | 依赖            | Mock                     |
| --------- | -------- | --------------- | ------------------------ |
| AIService | 单元测试 | 无              | vi.mock('ai')            |
| DB 仓库   | 集成测试 | 真实 PostgreSQL | 无                       |
| Sources   | 单元测试 | 无              | vi.stubGlobal('fetch')   |
| Sources   | 单元测试 | 无              | vi.mock('child_process') |

## 关键决策

参见 docs/adr/：

- 0001: 使用 pg 驱动
- 0002: 拆分 db.ts
- 0003: 创建 AIService 接缝
- 0004: 净化 Source 接口
