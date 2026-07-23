# ADR-0004: 净化 Source 接口

## 日期

2026-07-23

## 状态

已采纳

## 背景

NewsSource.fetch() 在内部调用 storeRawItems() 写数据库，违反了"接口即测试表面"原则。

## 决策

从 fetch() 中移除 DB 副作用，由调用方 scripts/scrape.ts 统一处理。

## 影响

- 正面：Sources 变成纯数据转换器，可测试
- 正面：调用方控制数据流向
- 正面：符合单一职责原则
