# 分支保护（Branch Protection）配置

> 对应 DevOps 审查项：「分支保护从未生效（静默失效）」。

> **当前状态：✅ 已配置生效**（2026-08-13，通过 API 一次性配置）。以下为配置参考，**无需重复操作**；如需调整规则，按文末步骤执行即可。
> 更新日期：2026-08-13

## 为什么改为手动配置，而不是自动同步

历史上存在 `.github/workflows/sync-branch-protection.yml`，尝试在 workflow 变更时自动
同步 required status checks。但它用 `secrets.GITHUB_TOKEN` 调用分支保护 API。

GitHub 明确限制：**`GITHUB_TOKEN` 无法修改分支保护设置**（该 API 需要
`administration: write` 权限，且仅 PAT / GitHub App token 可用）。再叠加 job 上的
`continue-on-error: true`，结果是 workflow 显示绿色、实际从未生效 —— 属于「静默失效」
反模式。因此删除该 workflow，改为一次性手动配置。

分支保护的 contexts（job 名）在 CI 稳定后极少变动，手动配置一次的维护成本可忽略；
而常驻一个 admin 权限的 PAT 反而扩大攻击面，得不偿失。

## 三分支模型（2026-09-25 起）

本仓库用三个长期分支对应三个环境，逐级 promote：

```
feature ──PR──▶ main ──PR──▶ preview ──PR──▶ production
                 │            │                 │
               集成        预发布验收          生产
```

| 分支         | 角色       | `strict` | 说明                                                  |
| ------------ | ---------- | -------- | ----------------------------------------------------- |
| `main`       | 集成       | ✅       | feature PR 必须基于最新 main，防止基于旧代码合并      |
| `preview`    | 预发布验收 | ❌       | promote 是单向的，启用 strict 会让下一次 promote 死锁 |
| `production` | 生产       | ❌       | 同上                                                  |

三个分支都要求同一组 required status checks（含 `promote-guard`，它拦住跳级上线）。

设计与代价见 [ADR-0008](../adr/0008-three-branch-environment-model.md)。

## 需要启用的保护项

GitHub 仓库 → Settings → Branches → Branch protection rules → **Add rule**，
`Branch name pattern` 填 `main`：

| 保护项                                     | 建议值           | 说明                 |
| ------------------------------------------ | ---------------- | -------------------- |
| Require a pull request before merging      | ✅（1 approval） | 强制走 PR 流程       |
| Require status checks to pass              | ✅（6 项）       | 见下方 contexts 列表 |
| Require conversation resolution            | 可选             |                      |
| Require signed commits                     | 可选             |                      |
| Do not allow bypassing the above settings  | ✅               | 防止 admin 绕过      |
| Restrict who can push to matching branches | ✅（仅维护者）   | 禁止直接 push main   |
| Allow force pushes                         | ❌               |                      |
| Allow deletions                            | ❌               |                      |

## required status checks（contexts）

CI 中在 push + PR 都会运行、且应作为合并门禁的 job：

| context             | 来源 workflow  | 内容                                             |
| ------------------- | -------------- | ------------------------------------------------ |
| `unit`              | `test.yml`     | lint + typecheck + 单测 + `db:check`             |
| `integration`       | `test.yml`     | 集成测试 + 覆盖率门槛（≥80%）                    |
| **`build`**         | `test.yml`     | 生产构建（构建期失败早发现）                     |
| **`e2e`**           | `test.yml`     | Playwright 真实浏览器 E2E（生产构建 + Chromium） |
| `Semgrep SAST Scan` | `security.yml` | SAST 静态安全扫描（job `semgrep` 带 name 覆盖）  |
| `Secret Scanning`   | `gitleaks.yml` | 密钥泄露扫描（job `gitleaks` 带 name 覆盖）      |
| `promote-guard`     | `test.yml`     | 三分支 promote 流向守卫（禁止跳级上线）          |

> **2026-09-21 更新**：补入 `build` 与 `e2e`（此前缺失）。这两项补上之前，
> **PR 可以构建失败或 UI 运行时崩溃却正常合并** —— 这正是 NEWS-MONITOR-3/4
> 两起生产事故的成因（CI 全绿上线崩溃）。`e2e` 由 PR #38 引入。
>
> 实证验证（PR #40，临时 PR）：加入后观察到 `mergeState` 由 **BLOCKED → CLEAN**，
> 确认门禁真实拦截；非「永久绿的假门禁」。

> 不纳入的 job（**刻意排除，勿再加**）：
>
> - `npm-audit` —— 报告模式（`|| true`）**永不失败**，设为 required 会变成永久绿的
>   假门禁（正是本项目反复出现的「静默失效」反模式）；
> - `dependency-review` —— 仅 PR 触发，且 `continue-on-error: true`。
>   作为 required 会导致 push 场景缺少该 check；且它本身不阻断。

## 一键配置（gh CLI）

如果你有带 `repo` scope 的 PAT（权限高于 GITHUB_TOKEN），可用 `gh api` 直接配置，省去点 UI。
将 `{owner}` / `{repo}` 替换为实际值（本仓库为 `q351941406` / `news-monitor`）：

```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -F "required_status_checks[strict]=true" \
  -f 'required_status_checks[contexts][]=unit' \
  -f 'required_status_checks[contexts][]=integration' \
  -f 'required_status_checks[contexts][]=build' \
  -f 'required_status_checks[contexts][]=e2e' \
  -f 'required_status_checks[contexts][]=Semgrep SAST Scan' \
  -f 'required_status_checks[contexts][]=Secret Scanning' \
  -F 'enforce_admins=true' \
  -F 'restrictions=null' \
  -F 'required_linear_history=false' \
  -F 'allow_force_pushes=false' \
  -F 'allow_deletions=false'
```

> 注：`gh api` 使用当前 `gh auth` 登录的 token，需具备 `repo` scope 且为管理员；
> 用浏览器 UI 手动配置效果等价。
>
> ⚠️ **踩坑**：该 API 会要求 `required_pull_request_reviews` 与 `restrictions` 一起提交。
> 用 `-F 'restrictions='` 传空串会被拒（`"" is not an object`），
> 必须改用 JSON body 显式传 `null`。

## 验证

配置完成后回到 Settings → Branches，确认 main 分支规则已列出上述 **6 个** contexts。

**务必用真实 PR 实证，不要只看配置页面**（配置存在 ≠ 门禁有效）：

```bash
gh api repos/{owner}/{repo}/branches/main/protection --jq '.required_status_checks.contexts'
gh pr view <N> --json mergeStateStatus    # 期望：检查未跑完时为 BLOCKED，全绿后 CLEAN
```

2026-09-21 实测：加入 `build` / `e2e` 后，PR #40 的 `mergeState` 由 **BLOCKED → CLEAN**，
证明门禁真实拦截。
