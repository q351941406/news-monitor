# Uptime 监控（网站宕机告警）

## 服务

- **平台**: UptimeRobot（免费版，50 监控额度）
- **控制台**: https://dashboard.uptimerobot.com/
- **告警邮箱**: xxx@xxx.com（已验证）

## 监控项

| 监控名              | 目标                                    | 类型 | 间隔        | 状态    |
| ------------------- | --------------------------------------- | ---- | ----------- | ------- |
| news-monitor-health | https://news.myaicode.qzz.io/api/health | HTTP | 300s (5min) | STARTED |

## 告警联系人

- ID: `xxx`，类型: Email，值: `xxx@xxx.com`
- threshold=0 / recurrence=0（免费版固定）

## ⚠️ 探活默认不查数据库（重要）

`/api/health` **默认只做进程存活检查（liveness），不触碰数据库**。深度检查必须显式加 `?deep=1`：

| 请求                 | 语义      | 是否查库 | 响应                                                                                |
| -------------------- | --------- | -------- | ----------------------------------------------------------------------------------- |
| `/api/health`        | liveness  | ❌       | 200 `{ status:'ok', db:'unchecked', uptime, timestamp }`                            |
| `/api/health?deep=1` | readiness | ✅       | 200 `{ status:'ok', db:'up', ... }` / 503 `{ status:'degraded', db:'down', error }` |

**这不是洁癖，是成本问题。** Neon 的 scale-to-zero 要求 compute 连续 **5 分钟**无活动才挂起，而本监控间隔恰好是 **5 分钟**。历史实现里 `/api/health` 每次都执行 `SELECT 1`，等于在挂起计时器归零前不断把它重置——compute 因此近乎 7×24 常驻。

实测后果（2026-09，Neon 项目 `neon-pink-house`）：

| 指标                  | 数值               | Free 额度         |
| --------------------- | ------------------ | ----------------- |
| 9/1–9/13 compute 用量 | **67.1 CU-hours**  | 100 CU-hours/月   |
| 月化推算              | **≈ 162 CU-hours** | ❌ 超额约 62%     |
| 存储（对照）          | 44.6 MB            | 0.5 GB（仅 8.7%） |

额度在计费周期结束前就被耗尽。compute 之所以无法休眠，是因为探针每 5 分钟到访时，挂起计时器都还没走完那 5 分钟——Neon operations 日志里可见 `suspend_compute` 后 2–4 秒即被 `start_compute` 唤醒的循环。

改为 liveness 后探活彻底不唤醒 compute，用量预计降至 **5–20 CU-hours/月**（仅剩真实业务：抓取任务 + 用户访问）。

> **通用结论**：在 serverless + scale-to-zero 架构下，高频探活**绝不应该** ping 数据库。任何按「活跃时长」计费的数据库（Neon 等）都会因此持续计费。

## 工作原理

每 5 分钟访问 `/api/health`（liveness，不查库）→ 连续失败（超时 30s）→ 发邮件告警 → 恢复后发恢复通知。

## 告警覆盖与取舍

| 故障类型                     | 告警来源                                                                   |
| ---------------------------- | -------------------------------------------------------------------------- |
| 站点 / Serverless 函数不可用 | 本监控（`/api/health`，5 分钟）                                            |
| 数据库不可用                 | GitHub Actions 抓取任务失败通知（业务自身告警）；需要时手动 `?deep=1` 排查 |

如需**专门的** DB 宕机告警，可额外添加一个监控指向 `/api/health?deep=1`，但**间隔必须 ≥ 30 分钟**——间隔越短，Neon compute 被唤醒越频繁，额度消耗越高（30 分钟间隔约合 15–30 CU-hours/月）。默认不推荐：抓取任务失败本身就能暴露 DB 故障，且不消耗 compute 额度。

## API 运维（V3，Bearer token）

```bash
# 列出监控
curl -H "Authorization: Bearer <KEY>" https://api.uptimerobot.com/v3/monitors
# 查看监控详情
curl -H "Authorization: Bearer <KEY>" https://api.uptimerobot.com/v3/monitors/<ID>
# 暂停/启动
curl -X POST -H "Authorization: Bearer <KEY>" https://api.uptimerobot.com/v3/monitors/<ID>/pause
curl -X POST -H "Authorization: Bearer <KEY>" https://api.uptimerobot.com/v3/monitors/<ID>/start
```

## 注意

- 免费版 V2 API 的 newMonitor 不支持 keyword 等高级参数（access_denied）
- V2 创建监控时 `interval` 等参数受限，推荐直接用 **V3 API**（Bearer token 认证）
- 创建监控时**必须**在 `assignedAlertContacts` 里绑定联系人，否则宕机不会通知
