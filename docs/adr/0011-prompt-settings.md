# ADR-0011: 提示词模板设置页可配（DB 覆盖默认值）

## 日期

2026-10-16

## 状态

已采纳（第一期：仅 GitHub 单条摘要）

## 背景

提示词硬编码在 `src/lib/ai-service.ts` 的 buildXxxPrompt 里，
改一句提示词就要走一次代码发布（改代码 → 过 6 项 checks → 合并 → 等部署）。
调提示词本该是高频低风险的手工活，却背上了发版的重量。

## 决策

**模板进库、默认在代码**（`ai_prompts` 表 + `src/lib/prompts.ts`）：

- 表里只存「被手动定制过」的模板；无行 = 未定制，用代码里的默认模板
  （默认模板与历史硬编码逐字等价，未定制时 AI 行为零回归）
- 设置页（`/settings`）加提示词编辑岛：管理员查看 / 保存 / 恢复默认
- `ai-service.ts` 按 key 读库渲染，进程内缓存 60s（富化任务每天一次，
  最多 60s 生效延迟可接受；也避免逐条 50 次查库）
- 读失败永远回退默认模板：提示词只是配置，配置读不到不阻断 AI 主流程
  （与用量埋点的 fire-and-forget 同哲学，纵深两层：repo 内吞错 + service 兜底）

## 备选（已拒绝）

- **环境变量放模板**：改一次要重新部署，且 Vercel 环境变量有长度与可见性约束，
  不如 DB 行灵活
- **模板里不做变量、整段 prompt 存库**：数据组装（README 截断 24000、缺失项省略）
  是防超限的 correctness 逻辑，必须留在代码里；模板只负责措辞，
  用 `{{变量}}` 占位
- **读不到模板时让任务失败**：提示词缺失不该有失败语义，默认模板永远可用

## 效果测试（2026-10-16 追加）

设置页的模板编辑器旁设「效果测试」区：粘贴 GitHub 仓库链接，
用**当前草稿模板**（无需先保存）对真实仓库跑一次 AI，
展示摘要 / 详情 + 实际渲染出的完整 prompt。

- 取数：元数据走 GitHub REST API（未登录 60 次/小时，手动点测足够；
  配 `GITHUB_TOKEN` 则用其额度），README 复用抓取侧的 raw.githubusercontent
  逻辑（不占 API 额度）
- 调用链与生产共用 `runSingleSummaryPrompt`（从 `generateSingleSummary` 抽出），
  测到的就是跑出来的；用量记为独立 operation `singleSummaryTest`，
  测试消耗在仪表盘 AI 卡片里单独可见
- 链接只允许 `github.com/owner/repo`（段白名单校验），README 截断等
  防超限逻辑与生产一致

## 后果

- 批量摘要 / 主题聚合照此键扩展即可（`github-single-summary` 之外加 key + 默认模板）
- 新增表是纯 additive 迁移（`CREATE TABLE IF NOT EXISTS`），expand-contract 门禁天然通过
- 约束：模板只管措辞，不管 JSON 输出契约（结构化输出由 `Output.object` schema 保证）
