# 04 - 重构脚本使用 AIService

Type: task
Status: claimed
Blocked by: 01, 02

## 目标

重构 `scripts/ai-process.ts` 和 `scripts/topic-aggregate.ts` 使用共享的 AIService，消除重复代码。

## 完成条件

- 脚本使用 AIService 而非自建 AI 客户端
- 脚本只负责编排和结果处理
- 原有功能不变
