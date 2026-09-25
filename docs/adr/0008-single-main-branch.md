# ADR-0008: 单 main 分支 + 环境靠部署目标（拒绝多分支环境模型）

## 日期

2026-09-25

## 状态

已采纳

## 背景

维护者提出「用两个分支代表两个环境」，并要求 main 永远绿。评估过程中出现过三种候选：

1. **三分支三级 promote**：`main` → `preview` → `production`
2. **两分支 promote**：`preview`（集成）→ `main`（生产）
3. **单 main + PR preview**（原状）

需要点明：**GitHub Flow 的官方定义就是单一长期分支**，环境由*部署目标*区分而非分支。
「用分支代表环境」实际是 GitLab Flow 的 environment-branches 模式 —— 两者互斥，
必须选一个。

## 决策

**保持单 main 分支（GitHub Flow），不引入环境分支。**

```
feature ──PR──▶ [Vercel preview + Neon preview 库] ──验收──▶ main ──▶ 生产
```

| 环境      | 由什么决定                         | 数据库                        |
| --------- | ---------------------------------- | ----------------------------- |
| 预览/验收 | PR 触发的 Vercel preview 部署      | Neon `preview` 分支（已隔离） |
| 生产      | 合并 `main` 触发的 production 部署 | Neon `main` 分支              |

### 为什么拒绝环境分支

**1. hotfix 路径被拉长，而紧急时人一定会绕过它。**
CI 实测耗时 2 分钟。三分支下修一个线上 bug 要走 3 个 PR、3 次 CI、2 次人工验收；
单 main 只要 1 个 PR。更要紧的是：**紧急时没人等得起 promote 两跳**，hotfix 会直接落在
生产分支上 —— 于是生产领先于 main，下次 promote 需要人工回灌。模型会在压力下**自我
瓦解**，而且越紧急绕过越多、漂移越严重。

**2. 验收环境会变成两套。**
Vercel 已为每个 PR 自动提供 preview 部署，且数据库隔离（Neon `preview` 分支）。
再加 `preview` 分支的固定环境，会出现三类 preview 部署（PR / `preview` 分支 / `main`
分支），反而更难判断该看哪个。

**3. 验收的产物与生产跑的产物不是同一个。**
Vercel 每次 build 都是独立 artifact。多分支 promote 意味着多次 build，在验收环境通过的
那个构建物并非生产实际运行的 —— 削弱验收有效性。这与 DORA 的
「build once, deploy anywhere」相悖。

**4. 审计并不会变好。**
「生产跑的是 `production` 分支 HEAD」与「生产跑的是 main 的 commit `abc1234`」
**信息量相同** —— Vercel 部署记录本就绑定 commit SHA。

**5. 结构性代价换不来对应收益。**
三分支还额外带来：三分支长期漂移、hotfix 双回灌、以及 Vercel 只支持一个
`productionBranch`（另两个环境只能靠分支 URL 模拟，并非真正独立的环境）。

### 保留了什么

- **PR preview 作为验收环境**（已有，含数据库隔离）
- **main 永远绿**：6 项 required checks + `strict` + `enforce_admins`（管理员也绕不过）
- 发版时打 git tag（`vYYYY.MM.DD`）便于对照

### 如果将来确实需要更强的环境隔离

用平台原生机制，而不是分支：

- **Instant Rollback**：秒级回滚到任意历史部署（多分支模型回滚需再走一次 promote）
- **Promote to Production**：把已验证的 preview 部署直接提升为生产，**同一个构建物、
  不重新 build** —— 正好解决上面第 3 点

## 影响

- 正面：hotfix 路径最短（1 个 PR）；无分支漂移；配合 Promote to Production 时验收产物即上线产物
- 正面：`main` 是唯一真相源，「生产跑的是哪段代码」只有一个答案
- 权衡：没有「每个环境一个分支名」这种形式化的审计视角 —— 用 Vercel 部署记录 + git tag 替代
- **已评估并明确拒绝**：三分支三级 promote、两分支 promote（理由见上）

## 相关

- `docs/ops/release-flow.md`（发布与回滚流程）
- ADR-0007（迁移与部署策略）
- `docs/ops/branch-protection.md`
