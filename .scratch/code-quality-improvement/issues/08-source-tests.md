# 08 - 为 Sources 写测试（mock 外部 HTTP/CLI）

Type: task
Status: claimed
Blocked by: 07

## 目标

为三个数据源写测试，mock 外部 API 调用，验证解析逻辑。

## 测试计划

- github.ts: mock fetch（GitHub API + README 请求）
- producthunt.ts: mock fetch（PH GraphQL API）
- twitter.ts: mock execSync（twitter-cli 输出）

## 完成条件

- 覆盖正常数据和边界情况
- 不真的调外部 API
- 测试通过
