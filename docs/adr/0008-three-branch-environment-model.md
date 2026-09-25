# ADR-0008: 三分支环境模型（main → preview → production）

## 日期

2026-09-25

## 状态

已采纳

## 背景

仓库原先只有 `main` 一个长期分支：PR 部署到 Vercel preview（数据库用 Neon `preview`
分支隔离），合并 `main` 即上生产。这是 GitHub Flow 的标准形态 —— main 永远可部署。

维护者要求：**「用两个分支代表两个环境」**，且 **main 保持永远绿**。

需要点明：这两条与 GitHub Flow 的定义**互相冲突**。GitHub Flow 的核心就是**单一长期
分支**，环境由*部署目标*区分而非分支；「用分支代表环境」实际是 GitLab Flow 的
environment-branches 模式。经权衡后选择后者，并在此如实记录代价。

## 决策

采用三个长期分支，逐级 promote：

```
feature ──PR──▶ main ──PR──▶ preview ──PR──▶ production
                 │            │                 │
               集成        预发布验收          生产
```

| 分支         | 角色                   | Vercel 部署                               | 数据库（Neon） |
| ------------ | ---------------------- | ----------------------------------------- | -------------- |
| `main`       | 集成（feature 合入处） | preview 部署                              | `preview` 分支 |
| `preview`    | 预发布（人工验收）     | preview 部署（分支固定 URL）              | `preview` 分支 |
| `production` | 生产                   | **production 部署**（`productionBranch`） | `main` 分支    |

> `main` 与 `preview` 共用 Neon `preview` 库：Vercel 的 preview 环境变量对**所有**非生产
> 分支生效，无法只给 `main` 单独配 `DATABASE_URL`。两个非生产环境共用预发布库，可接受。

### 配套机制

1. **`promote-guard`（CI job）**：`preview` 只接受来自 `main` 的 PR，`production` 只接受
   来自 `preview` 的 PR，禁止跳级；对 `main` 允许任意 feature 分支。
2. **`scripts/promote.sh`**：一行命令创建 promote PR。**不自动合并**，保留人工验收环节。
3. **分支保护**：三个分支都要求 6 项 required checks；`main` 额外启用 `strict`。
   `preview` / `production` **不启用** `strict`（原因见下）。
4. **promote 用 merge commit（不用 squash）**：保留原始提交 SHA，便于回答
   「生产上跑的代码来自哪个 main 提交」。

### 为什么 preview / production 不启用 strict

`strict` 要求 PR 的 head 分支包含 base 的最新提交。而 promote 是**单向**的
（main → preview → production），merge commit 只会出现在下游分支。若启用 strict，
下游分支的 merge commit 不在上游，上游便不满足「包含 base 最新提交」——
下一次 promote 会**死锁**。因此 strict 只在 `main` 上启用（用于约束 feature PR）。

## 影响

### 代价（明确接受）

- **hotfix 要回灌两次**：生产出事在 `production` 修，还需合回 `preview` 与 `main`；
  若在 `main` 修，则要 promote 两跳才到生产。**紧急情况下这是最痛的地方。**
- **分支漂移**：三个分支内容长期不完全一致，promote 时可能出现意外冲突。
- **失去「构建一次、到处部署」**：Vercel 每次 build 产生不同 artifact，三个环境的产物
  并非同一个构建物。这与 DORA 推荐的做法相反。
- **preview 职责重叠**：Vercel 已为每个 PR 提供 preview 部署，`preview` 分支的固定环境
  与之功能重叠。
- **Vercel 只支持一个 `productionBranch`**：`main` / `preview` 都属 preview 部署类型，
  靠分支 URL 区分，并非真正独立的 Vercel 环境。

### 收益

- 每个环境对应一个分支名，审计时「这个环境跑的是哪段代码」一眼可见
- 生产上线必须经过预发布验收，形成明确的人工 gate
- `main` 保持永远绿：只接受 feature 的 PR，且 6 项 checks 全绿才能合并

### 紧急发布路径

三分支模型下必须保留快速通道。紧急时**不要**绕过 `promote-guard`（它是有意的 gate），
而是按顺序快速 promote 两次，每跳只跑一次 CI、不混入其它改动。若生产已坏且需立即回滚，
用 Vercel 的 Instant Rollback 回滚**部署**（秒级），再补 promote 流程 ——
**不要**在 `production` 分支上 force push。

## 相关

- `scripts/promote.sh`
- `.github/workflows/test.yml` 的 `promote-guard` job
- `docs/ops/branch-protection.md`
- ADR-0007（迁移与部署策略）—— 迁移由 Vercel 构建时执行，三环境共用同一套迁移文件
