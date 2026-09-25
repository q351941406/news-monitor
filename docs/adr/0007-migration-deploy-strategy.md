# ADR-0007: 迁移与部署策略 —— release-phase 自动迁移 + PR 阶段兼容性门禁

## 日期

2026-09-25

## 状态

已采纳

## 背景

生产 schema 由 Vercel 构建时自动迁移：

```jsonc
// vercel.json
"buildCommand": "npm run build && npm run db:migrate:ci"
```

顺序（**先 build、后 migrate**）是刻意的：代码编译不过就不会触碰生产库；迁移失败则
构建失败、代码不部署 —— 即 fail-closed。这是 Heroku / Vercel 语境下的 release phase 模式。

但它带来两个硬约束：

1. 迁移与部署同批生效，部署切换窗口内新旧代码可能并存 → **迁移必须向前兼容**。
2. 破坏性变更（drop 列 / 改类型 / 收紧约束）会让旧代码读到不兼容的 schema，
   而且**回滚代码救不了** —— schema 已经变了。

原先这条纪律只是 README 里的一句 ⚠️，**没有任何机制阻止破坏性迁移被合并**。
2026-09 的体检就撞上了实例：本仓库自己的 `drizzle/0002_drop_news_items.sql`
就是破坏性的（`DROP TABLE IF EXISTS news_items`）—— 靠自觉是靠不住的。

## 决策

1. **保留 Vercel `buildCommand` 里的自动迁移，不拆成独立 workflow。**
   拆开会让 Vercel 部署不再等待迁移，产生「代码已上线、schema 未跟上」的窗口，
   安全性反而下降。这里的耦合是**特性**，不是缺陷。

2. **迁移必须向前兼容**（additive / expand-contract）：先加后删，破坏性变更拆成多个 PR。

3. **把纪律变成 PR 门禁。** 新增 `scripts/check-migration-safety.ts`，在 CI 的 `unit` job
   里对**本次改动引入的迁移**做破坏性 DDL 检测，命中即失败，除非该迁移文件显式声明：

   ```
   -- breaking: <理由与 expand-contract 计划>
   ```

   选择「显式声明放行」而非「一律禁止」：破坏性变更有合法场景（contract 阶段），
   需要的是让人停下来确认并写下计划，不是禁止。

4. **不加人工审批 gate。** 理由：Vercel 部署不经过 GitHub Environment（仓库里那几个
   `Production` environment 是 Vercel 集成自动建的，给它们加 required reviewers
   拦不住 Vercel 部署）。真正有效的拦截点是**合并前的 CI** —— shift-left 比部署时审批
   更早、更便宜，也不需要有人守着。

## 影响

- 正面：破坏性迁移在 PR 阶段被拦下，不再依赖人的记忆
- 正面：显式声明迫使作者写下 expand-contract 计划，留下可审计的决策记录
- 正面：门禁只作用于本次改动引入的迁移文件，历史迁移（如 0002）不受影响
- 权衡：`CREATE INDEX`（非 CONCURRENTLY）与 `ADD CONSTRAINT` 只作提示不阻塞 ——
  本项目表量级小（数千行），持锁时间可忽略；换来的是门禁不被噪声淹没而失去信任
- 风险：门禁依赖 git 基线。CI 必须 `fetch-depth: 0`（已在 `test.yml` 配好）；
  基线无法确定时脚本**显式失败而非静默跳过** —— 静默失效是本项目明确要避免的反模式
  （见 `src/lib/scrape-guard.ts` 与 `scripts/ai-process.ts` 的同类教训）

## 相关

- README「自动迁移（生产部署）」
- `scripts/check-migration-safety.ts`、`scripts/__tests__/check-migration-safety.test.ts`
- ADR-0006（内容身份与两级去重）—— 迁移 `0006` 即按本策略走 additive 路径
