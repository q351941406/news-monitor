# ADR-0003: 创建 AIService 接缝

## 日期

2026-07-23

## 状态

已采纳

## 背景

ai-process.ts 和 topic-aggregate.ts 各自构建 AI 客户端、分批逻辑、重试逻辑，代码重复且无法测试。

## 决策

创建 AIService 接口，封装 AI 调用逻辑。生产实现调用 DeepSeek/Anthropic，测试时 mock。

## 影响

- 正面：AI 管线可测试（mock LLM 调用）
- 正面：消除重复代码
- 正面：换 LLM 厂商只需改一个模块
