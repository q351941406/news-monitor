# Uptime 监控（网站宕机告警）

## 服务
- **平台**: UptimeRobot（免费版，50 监控额度）
- **控制台**: https://dashboard.uptimerobot.com/
- **告警邮箱**: xxx@xxx.com（已验证）

## 监控项

| 监控名 | 目标 | 类型 | 间隔 | 状态 |
| ------ | ---- | ---- | ---- | ---- |
| news-monitor-health | https://news.myaicode.qzz.io/api/health | HTTP | 300s (5min) | STARTED |

## 告警联系人
- ID: `xxx`，类型: Email，值: `xxx@xxx.com`
- threshold=0 / recurrence=0（免费版固定）

## 工作原理
每 5 分钟访问健康接口 → 连续失败（超时 30s）→ 发邮件告警 → 恢复后发恢复通知。

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
