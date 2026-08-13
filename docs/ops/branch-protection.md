# 分支保护（Branch Protection）配置

> 对应 DevOps 审查项：「分支保护从未生效（静默失效）」。
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

## 需要启用的保护项

GitHub 仓库 → Settings → Branches → Branch protection rules → **Add rule**，
`Branch name pattern` 填 `main`：

| 保护项 | 建议值 | 说明 |
| ------ | ------ | ---- |
| Require a pull request before merging | ✅（1 approval） | 强制走 PR 流程 |
| Require status checks to pass | ✅ | 见下方 contexts 列表 |
| Require conversation resolution | 可选 | |
| Require signed commits | 可选 | |
| Do not allow bypassing the above settings | ✅ | 防止 admin 绕过 |
| Restrict who can push to matching branches | ✅（仅维护者） | 禁止直接 push main |
| Allow force pushes | ❌ | |
| Allow deletions | ❌ | |

## required status checks（contexts）

CI 中在 push + PR 都会运行、且应作为合并门禁的 job：

| context | 来源 workflow | 内容 |
| ------- | ------------- | ---- |
| `unit` | `test.yml` | lint + typecheck + 单测 + `db:check` |
| `integration` | `test.yml` | 集成测试 + 覆盖率门槛（≥80%） |
| `semgrep` | `security.yml` | SAST 静态安全扫描 |
| `gitleaks` | `gitleaks.yml` | 密钥泄露扫描 |

> 不纳入的 job：
> - `npm-audit` —— 报告模式（`|| true`）不阻断，不能作为门禁；
> - `dependency-review` —— 仅 PR 触发，作为 required 会导致 push 场景缺少该 check。

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
  -f 'required_status_checks[contexts][]=semgrep' \
  -f 'required_status_checks[contexts][]=gitleaks' \
  -F 'enforce_admins=true' \
  -F 'restrictions=null' \
  -F 'required_linear_history=false' \
  -F 'allow_force_pushes=false' \
  -F 'allow_deletions=false'
```

> 注：`gh api` 使用当前 `gh auth` 登录的 token，需具备 `repo` scope 且为管理员；
> 用浏览器 UI 手动配置效果等价。

## 验证

配置完成后回到 Settings → Branches，确认 main 分支规则已列出上述 4 个 contexts；
并在任一 PR 中确认这 4 个 check 全部通过后才允许 merge。
