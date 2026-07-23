# ADR-0002: 拆分 db.ts 为多个仓库模块

## 日期

2026-07-23

## 状态

已采纳

## 背景

db.ts 包含 15 个函数，331 行，是一个 God 对象，难以测试和维护。

## 决策

拆分为 5 个按职责划分的模块：connection、news-repo、ai-repo、read-repo、topic-repo、stats-repo。

## 影响

- 正面：每个模块接口小、实现深，符合 codebase-design 原则
- 正面：可独立测试
- 正面：保持向后兼容（index.ts 统一导出）
