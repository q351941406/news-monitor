# 07 - 净化 Source 接口，移除 DB 副作用

Type: task
Status: claimed
Blocked by: 06

## 目标

当前 `NewsSource.fetch()` 会偷偷调用 `storeRawItems()` 写 DB，违反"接口即测试表面"原则。
改为：fetch() 只返回数据，调用者决定是否写入。

## 改动

1. 从 github.ts / producthunt.ts / twitter.ts 中移除 `storeRawItems()` 调用
2. `scripts/scrape.ts` 中在 fetch() 后调用 `storeRawItems()`
3. 来源变成纯数据获取器，可测试

## 完成条件

- fetch() 不再有 DB 副作用
- 功能不变
- 测试通过
