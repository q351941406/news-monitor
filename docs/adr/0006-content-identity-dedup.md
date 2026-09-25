# ADR-0006: 内容身份与两级去重

## 日期

2026-09-24

## 状态

已采纳

## 背景

抓取入库原本只有一层去重：`raw_items.id` 主键 + `storeRawItems` 的
`ON CONFLICT DO NOTHING`。对生产库（3059 条）做体检后，确认这条防线在三处会漏：

1. **GitHub 仓库名大小写漂移。** `id` 由 trending 页 href 原样拼接为
   `github:Owner/Repo`，而 GitHub 仓库名大小写不敏感。生产 293 条 github 记录中
   **116 条含大写**，说明大小写是常态；仓库改名或改大小写即会生成第二条 id 不同的
   同一仓库记录，之后被 AI 当作新内容重复聚合、重复展示。

2. **Product Hunt 同一产品多次 launch。** PH 允许同一产品 relaunch，每次生成新的
   post id，主键去重完全挡不住。实测 `ThreadLine` 以两个 post id 入库，随后被聚合进
   **同一个主题组**，首页展开即可看到两条同名同标语内容。

3. **垃圾内容批量重复。** 生产中有 5 条 gift card 类刷屏帖，其中 2 组标题与标语
   **完全相同**（`/products/gift-card-2125` 与 `-2131` 等）。

同时确认了一个**反例**，它决定了方案的形状：`/products/openai` 下并存
`GPT-5.6`、`Codex Micro`、`Health in ChatGPT` 三个独立产品，**共享同一 url**。
因此 url 不能作为去重键 —— 按 url 去重会误删真实内容。

## 决策

把「内容身份」补齐为两级，都落在数据库约束上（原子、无竞态、不依赖应用层自觉）：

- **L1 主键 `id`** —— 源内的天然身份。GitHub 部分做归一化：
  `github:${fullname.toLowerCase()}`（GitHub 语义本就大小写不敏感）。
  `title` / `url` / `raw_data.fullname` 仍保留 GitHub 上的真实写法，仅身份归一化。

- **L2 内容指纹唯一索引** —— 仅对 producthunt 生效：
  ```sql
  CREATE UNIQUE INDEX uniq_raw_items_ph_content_fingerprint
    ON raw_items (source, lower(btrim(title)), lower(btrim(raw_data->>'tagline')))
    WHERE source = 'producthunt'
      AND btrim(coalesce(title,'')) <> ''
      AND btrim(coalesce(raw_data->>'tagline','')) <> '';
  ```
  指纹选用「标题 + 标语」而非 url，正是为了避开上面 `openai` 那个反例。
  `ON CONFLICT DO NOTHING` 不带 conflict target 时会覆盖**全部**唯一索引（含部分索引），
  因此应用层无需改动即自动拦下。

迁移 `drizzle/0006_dedupe_and_normalize_ids.sql` 同时完成历史数据清理，
且幂等、可重复执行。清理策略是**保留最早入库的一条**（与 id 去重「先到先得」一致），
并把重复条目的 `topic_items` / `ai_analysis` 转移到保留条目后才删除，
避免丢关联。生产实测：删 3 行（3059 → 3056），github 大写 id 归零。

## 影响

- 正面：PH 同一产品的 relaunch 与完全重复的刷屏帖不再入库；GitHub 大小写/改名不再产生第二份。
- 正面：指纹判定要求「标题与标语均非空」，字段缺失的记录不参与比对，不会互相误杀。
- 正面：指纹按 `source` 限定，twitter（title 是作者名）与 github 不受影响。
- 风险：仓库**改名**（非改大小写）仍会产生新记录 —— GitHub 旧 URL 会 302 重定向到新名，
  想彻底解决需要解析重定向，代价高，暂不做。
- 风险：指纹抓不住「近似但不完全相同」的重复（如 tagline 略有差异的刷屏帖）。
  这是有意的保守取舍：只拦确定性重复，不猜。
- 风险：拦下的条目走 `onConflictDoNothing`，不推进 `fetched_at`。若某源连续多日
  全部被拦，`check-freshness` 的时间维度巡检可能报「长期无新内容」。属既有设计的
  已知权衡（见 `src/lib/scrape-guard.ts` 注释），实际概率极低。

## 配套约束：Web 端不提供删除能力

归档页只保留「恢复为未读」，`POST /api/archive` 不再接受 `delete` action，
`deleteItem` 已从 db 层移除（`src/app/api/archive/__tests__/route.test.ts` 里有回归
保护断言，重新引入会立刻变红）。Web 端的读状态只有「已读 / 未读」两态。

这条约束直接简化了本 ADR：`raw_items` 只增不减，抓取侧无需考虑「被删掉的内容又被
抓回来」，去重只需处理插入侧，**因而不需要 tombstone / 软删除表**。
