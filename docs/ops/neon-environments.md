# Neon 环境与分支（Preview 数据库隔离）

> 用于隔离 Vercel Preview 环境与生产数据库，防止预览版误操作生产数据。

## 结构

```
生产库 (<project-id>)
└── main 分支 (<prod-branch-id>)   ← production 环境使用
    └── preview 分支 (<preview-branch-id>) ← preview 环境使用（数据从 main 复制）
```

- **Neon 项目**: `<project-id>`（名: <project-name>，区域: aws-us-east-1）
- **生产库**: main 分支，`DATABASE_URL` → production/development 环境
- **Preview 库**: preview 分支（`<preview-branch-id>`），`DATABASE_URL` → 仅 preview 环境
- 应用代码只读取 `DATABASE_URL` 一个变量（运行时 + 迁移 + drizzle 均如此）

## 连接端点

| 环境 | Endpoint host |
|---|---|
| 生产 | `<endpoint-host>-pooler...neon.tech` |
| Preview | `<endpoint-host>-pooler...neon.tech` |

## 日常操作

### 刷新 Preview 分支数据（同步生产最新数据）

Neon 分支是**创建时快照**，不会自动跟随主分支更新。当生产库数据变化较大、希望 preview 同步时：

1. 删除旧分支：`DELETE /api/v2/projects/{project}/branches/{branch_id}`
2. 从 main 重建：`POST /api/v2/projects/{project}/branches` body: `{"branch":{"name":"preview","parent_id":"<prod-branch-id>"},"endpoints":[{"type":"read_write"}]}`
3. 用新分支的 connection_uri 更新 Vercel preview 环境的 `DATABASE_URL`（`upsert=true`，target=`["preview"]`）

### 切换 Preview 指向（临时对比数据）

只需在 Vercel 中把 preview 的 `DATABASE_URL` 改为目标分支的连接串即可，无需改动应用代码。

## 安全说明

- 分支库凭据只存于 Vercel（preview 环境加密变量），不提交 git
- preview 分支删除后数据不可恢复，操作前确认无在用部署
- 生产环境的 `DATABASE_URL` 与 preview 相互独立，互不影响

## 相关文档

- [`disaster-recovery.md`](disaster-recovery.md) — 主库备份与恢复
- [`uptime-monitoring.md`](uptime-monitoring.md) — 宕机监控
