# 备份与灾难恢复 (DR) — 运维文档

> 本文档对应 DevOps 审查 P0 项：「没有备份/恢复策略的文档和演练」。
> 更新日期：2026-08-06

## 1. 数据存储现状

| 数据 | 位置 | 关键性 |
| ---- | ---- | ------ |
| 新闻条目 / AI 分析 / 主题 | Neon PostgreSQL（生产） | 🔴 核心 |
| 运行日志 run_logs | 同库 | 🟡 可重建 |
| Sentry 事件 | Sentry 平台 | 🟢 非持久 |

## 2. Neon 备份机制（平台自带）

Neon 提供**自动 PITR（时间点恢复）**：
- 默认保留最近 **7 天** 的历史，可恢复到任意时间点
- 每天自动快照 + WAL 归档
- 无需手动备份，但需**验证恢复能力**

## 3. 恢复流程（RTO ≈ 15-30 分钟）

### 场景 A：误删数据 / 数据损坏（恢复时间点）
1. 登录 Neon Console → 选择项目 → **Branching / Restore**
2. 选择恢复时间点（最多 7 天前）
3. 创建恢复分支 → 验证数据 → 切换到新分支
4. 更新 Vercel 与 GitHub Actions 中的 `DATABASE_URL` secrets

### 场景 B：整个数据库丢失
1. Neon Console → 项目 → **Restore from backup**
2. 选最近可用快照
3. 恢复后按场景 A 第 3-4 步切换连接串

### 场景 C：Neon 平台故障（极少见）
1. 联系 Neon 支持
2. 如无法恢复，接受数据丢失（RPO = 最近一次快照）

## 4. 恢复演练（建议每季度一次）

```bash
# 1. 用 Neon API 创建时间点分支（示例）
curl -X POST \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches" \
  -d '{"endpoints":[{"type":"read_write"}],"branch":{"parent_timestamp":"2026-08-01T00:00:00Z"}}'

# 2. 指向恢复分支跑迁移 + 冒烟测试
DATABASE_URL=<恢复分支连接串> npm run db:migrate:ci
DATABASE_URL=<恢复分支连接串> curl http://localhost:3000/api/health
```

> ✅ 演练标准：恢复出的分支能跑通 `db:migrate:ci` 且健康检查返回 `db:up`。

## 5. 备份责任清单

| 事项 | 频率 | 负责人 |
| ---- | ---- | ------ |
| 验证 Neon PITR 可用 | 每季度 | AI / 维护者 |
| 恢复演练 | 每季度 | AI / 维护者 |
| 更新本文档（如 schema 大改） | 随变更 | AI |

## 6. 关键账号

| 平台 | 账号 | 说明 |
| ---- | ---- | ---- |
| Neon | xxx@xxx.com | 生产数据库，勿删 |
| Vercel | xxx@xxx.com | 部署平台 |
| GitHub | q351941406 | 代码 + Actions secrets |
| Sentry | xxx@xxx.com (主) | 错误监控（见 sentry.md） |
