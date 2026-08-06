# Sentry 监控与告警 — 运维文档

> 本文档记录 news-monitor 的 Sentry 监控配置。**供 AI / 维护者查阅，无需登录平台日常查看**。
> 更新日期：2026-08-06

## 1. 项目信息

| 项目 | 值 |
| ---- | --- |
| Org slug | `<org-slug>` |
| Project | `news-monitor` |
| 控制台 | https://<org-slug>.sentry.io/projects/news-monitor/ |
| DSN | `https://<sentry-key>@<org>.ingest.us.sentry.io/<sentry-project-id>` |
| 账号邮箱（主） | `<email>` |
| 账号邮箱（备） | `<email>` |

> ⚠️ 主邮箱已切换为 iCloud。所有 Sentry 告警邮件发到主邮箱。

## 2. 环境变量（由各平台注入）

| 变量 | 值 / 说明 | 存放位置 |
| ---- | --------- | -------- |
| `SENTRY_DSN` | 上面 DSN | Vercel (prod+preview) + GitHub secrets |
| `NEXT_PUBLIC_SENTRY_DSN` | 上面 DSN | Vercel (prod+preview) |
| `SENTRY_ORG` | `<org-slug>` | Vercel (prod+preview) + GitHub secrets |
| `SENTRY_PROJECT` | `news-monitor` | Vercel (prod+preview) + GitHub secrets |
| `SENTRY_AUTH_TOKEN` | 用于 source maps 上传（权限大，勿外泄） | GitHub secrets + Vercel (production) |

留空 DSN = SDK 自动 noop，不影响本地开发。

## 3. 告警规则（已激活）

| 规则 | 触发条件 | 动作 |
| ---- | -------- | ---- |
| Notify on all new issues (email) | 任何**新 issue** 首次出现 | 发邮件通知活跃成员 |
| Send a notification for high priority issues | Sentry 判定为高优先级 | 发邮件通知活跃成员 |

### 抓取任务失败告警
三个 scrape workflow（github/twitter/producthunt）在**重试 2 次后仍失败**时，
用 `sentry-cli send-event` 上报 Sentry → 触发「新 issue」规则 → 发邮件。
指纹带日期，同一天同源重复失败合并为一条，不刷屏。

## 4. 邮件通知链路

| 通知来源 | 收件邮箱 |
| -------- | -------- |
| Sentry 错误 / 高优先级 / 抓取失败 | `<email>`（Sentry 主邮箱） |
| GitHub 平台通知（Action 失败等） | `<email>`（GitHub 主邮箱，用户选择保留） |

> 如需把 GitHub 通知也切到 iCloud：GitHub Settings → Notifications → 通知邮箱选已验证的 iCloud 地址（不改主邮箱）。

## 5. 健康检查相关过滤

SDK 已过滤以下噪音，不上报不告警：
- `/api/health` 探活事务
- `AbortError`（HMR 噪音）
- `ECONNRESET`

## 6. 常用运维操作（API 方式，供 AI 使用）

所有请求带 `Authorization: Bearer $SENTRY_AUTH_TOKEN`（存于 GitHub secrets，AI 需要时从 secrets 读取）。

```bash
# 查看未解决 issue
curl -H "Authorization: Bearer $TOKEN" \
  "https://sentry.io/api/0/projects/<org-slug>/news-monitor/issues/?query=is:unresolved&statsPeriod=24h"

# 查看告警规则
curl -H "Authorization: Bearer $TOKEN" \
  "https://sentry.io/api/0/projects/<org-slug>/news-monitor/rules/"

# 查看组织成员
curl -H "Authorization: Bearer $TOKEN" \
  "https://sentry.io/api/0/organizations/<org-slug>/members/"
```
