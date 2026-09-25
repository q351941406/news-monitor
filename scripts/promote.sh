#!/usr/bin/env bash
#
# 三分支 promote 助手
#
# 本仓库用三个长期分支对应三个环境，逐级 promote：
#
#   feature ──PR──▶ main ──PR──▶ preview ──PR──▶ production
#                    │            │                │
#                  集成        预发布验收         生产
#
# 用法：
#   bash scripts/promote.sh preview     # main → preview
#   bash scripts/promote.sh production  # preview → production
#
# 脚本只创建 PR，**不自动合并** —— 合并前请先验收目标环境的部署。
set -euo pipefail

TARGET="${1:-}"
case "$TARGET" in
  preview)    SOURCE=main ;;
  production) SOURCE=preview ;;
  *)
    echo "用法: $0 <preview|production>" >&2
    exit 1
    ;;
esac

command -v gh >/dev/null 2>&1 || { echo "需要 gh CLI（https://cli.github.com）" >&2; exit 1; }

existing=$(gh pr list --base "$TARGET" --head "$SOURCE" --state open --json number -q '.[0].number // empty')
if [ -n "$existing" ]; then
  echo "已存在 $SOURCE → $TARGET 的 PR #$existing，未重复创建："
  gh pr view "$existing" --json url -q .url
  exit 0
fi

if [ "$TARGET" = "production" ]; then
  CHECKLIST="- [ ] 预发布环境（preview）已验收通过
- [ ] 确认本次上线的迁移向前兼容（见 ADR-0007）"
else
  CHECKLIST="- [ ] main 上的 CI 全绿
- [ ] 本次改动无需人工验收的迁移（见 ADR-0007）"
fi

gh pr create --base "$TARGET" --head "$SOURCE" \
  --title "promote: $SOURCE → $TARGET" \
  --body "$(printf '%s\n' \
    "## promote \`$SOURCE\` → \`$TARGET\`" \
    "" \
    "按三分支模型逐级 promote。**禁止跳级** —— \`promote-guard\` 会拦下非法的来源分支。" \
    "" \
    "### 合并前检查" \
    "" \
    "$CHECKLIST" \
    "" \
    "### 合并方式" \
    "" \
    "用 **Create a merge commit**（\`gh pr merge <n> --merge\`），不要 squash：" \
    "promote 需要保留原始提交历史，squash 会把多个提交压成一个、导致分支历史与来源分叉。" \
    "" \
    "> preview / production 的保护规则**不启用** \`strict\`（要求分支最新）：promote 是单向的，" \
    "> 启用后会出现「preview 的 promote merge commit 不在 main 上 → main 不满足 strict」的死锁。")"

echo
echo "PR 已创建。验收目标环境后用 merge commit 合并："
echo "  gh pr merge <number> --merge"
