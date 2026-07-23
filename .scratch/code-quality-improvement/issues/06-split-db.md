# 06 - 拆分 db.ts 为 4 个仓库模块

Type: task
Status: claimed
Blocked by: 01, 04

## 目标

将 331 行的 `src/lib/db.ts` 按职责拆分为多个仓库模块，每个模块接口小、实现深。

## 拆分方案

- `src/lib/db/connection.ts` — 共享 DB 连接
- `src/lib/db/news-repo.ts` — 新闻 CRUD（storeRawItems, getNews, existsItem, getAllNews）
- `src/lib/db/ai-repo.ts` — AI 分析（storeAIAnalysis, getUnprocessedItems）
- `src/lib/db/read-repo.ts` — 阅读状态（markAsRead, markAsUnread, markAllAsRead, resetAllRead）
- `src/lib/db/topic-repo.ts` — 主题聚合（storeTopicGroups, getTopicGroups, initDatabase）
- `src/lib/db/stats-repo.ts` — 统计 + 清理（getUnreadCount, cleanupOldData）
- `src/lib/db/index.ts` — 重新导出，保持向后兼容

## 完成条件

- 所有已有功能不变
- 所有 import 路径兼容
- 测试通过
- TypeScript 编译通过
