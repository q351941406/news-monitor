# 发布与回滚流程

> 对应 [ADR-0008](../adr/0008-single-main-branch.md)：单 main 分支模型。

## 分支模型

只有 `main` 一个长期分支。环境由**部署目标**决定，不由分支决定：

| 环境      | 触发          | 地址                          | 数据库                      |
| --------- | ------------- | ----------------------------- | --------------------------- |
| 预览/验收 | 任意 PR       | Vercel 自动生成的 preview URL | Neon `preview` 分支（隔离） |
| 生产      | 合并到 `main` | `news.myaicode.qzz.io`        | Neon `main` 分支            |

`main` 永远绿：6 项 required checks + `strict`（必须基于最新 main）+ `enforce_admins`
（管理员也绕不过）。

## 发布流程

### 1. 开发 → 开 PR

```bash
git checkout -b fix/some-thing main
# ... 改动 ...
git push -u origin fix/some-thing
gh pr create --base main
```

### 2. 在 PR 里验收（这一步不能跳）

PR 会自动部署到 preview，且**数据库是隔离的**（Neon `preview` 分支），可以放心点。

- 打开 PR 页面底部的 Vercel 部署链接（或 `gh pr checks <n>` 里的 `Vercel` 项）
- 验收：功能是否正常、`/api/health` 是否 OK、有无 console 报错
- 记住：**数据来自预览库，不是生产数据**

### 3. 合并上线

```bash
gh pr merge <n> --squash --delete-branch
```

合并即触发生产部署。**Vercel 构建时会自动应用数据库迁移**（见 ADR-0007），
未声明的破坏性迁移已在 PR 阶段被 `db:check:safety` 拦下。

### 4. 发版标记（可选，推荐）

```bash
git tag v2026.09.25 && git push origin v2026.09.25
```

tag 指向 main 的某个 commit，方便日后对照「这个版本是什么时候上的」。

## 回滚

### 首选：Vercel Instant Rollback（秒级）

生产出问题时**先回滚部署、再排查原因**：

1. Vercel → 项目 `news` → Deployments
2. 找到上一个 `production` 且状态 READY 的部署
3. **⋯ → Promote to Production**（即 Instant Rollback）

秒级完成，且**不重新构建** —— 回滚到的是当时那个构建物。

### 如果问题在代码里

回滚部署后，在 `main` 上走正常 PR 流程修复。**不要 force push main**（分支保护也会拦）。

### 重要：迁移不回滚

Instant Rollback 只回滚**部署**，不回滚**数据库 schema**。这正是迁移必须向前兼容的原因
（ADR-0007）—— 回滚后的旧代码要能在新 schema 上正常跑。

## 高风险改动：Promote to Production

如果某次改动风险较高，希望「验收的就是上线的那个构建物」：

1. 在 PR 的 preview 部署上完成验收
2. 用 Vercel 的 **Promote to Production** 把该 preview 部署直接提升为生产
   —— 同一个构建物，不重新 build
3. 同时把 PR 合并到 `main`（保持代码与部署一致）

日常改动走常规流程即可（合并 main 自动部署），这条留给高风险改动。

## 与数据库迁移的关系

生产迁移由 Vercel 构建时执行（`buildCommand: build && migrate`），顺序是**先 build 后 migrate**，
因此迁移失败 → 构建失败 → 代码不部署（fail-closed）。

PR 阶段由 `db:check:safety` 拦截未声明的破坏性 DDL。详见 ADR-0007。

## 常见问题

**Q: 为什么不用 staging / preview 分支？**
见 ADR-0008 —— hotfix 要回灌两次、分支漂移、验收产物 ≠ 上线产物等代价大于收益。
PR preview 已经提供了隔离的验收环境（含数据库隔离）。

**Q: 验收时数据库是生产的吗？**
不是。preview 部署用 Neon `preview` 分支，可以随意操作，不影响生产数据。

**Q: 生产迁移失败会怎样？**
Vercel 构建失败 → 代码不部署 → 生产继续跑旧版本。`db:migrate:ci` 幂等，修好后重新部署即可。
