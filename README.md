# News Cron Monitor

基于 Docker 的定时监控系统，使用 Kimi API 进行 AI 处理。

## 功能

1. **X (Twitter) 监控** - 每小时检查推荐时间线，AI 翻译科技/AI/编程相关推文
2. **GitHub Trending 监控** - 每天 9 点 (UTC+8) 抓取热门仓库，AI 总结翻译

## 快速开始

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

## 手动构建

```bash
# 构建镜像
docker build -t news-monitor .

# 运行容器
docker run -d \
  --name news-cron \
  -v news-data:/app/data \
  -e KIMI_API_KEY=your-api-key \
  news-monitor
```

## 配置

环境变量在 `docker-compose.yml` 中配置：

| 变量 | 说明 |
|------|------|
| KIMI_API_KEY | Kimi API 密钥 |
| KIMI_BASE_URL | Kimi API 地址 |
| KIMI_MODEL | 使用的模型 |
| TWITTER_AUTH_TOKEN | Twitter 认证 token |
| TWITTER_CT0 | Twitter CT0 cookie |
| TZ | 时区 (默认 Asia/Shanghai) |

## 文件说明

- `x_monitor.sh` - X 监控脚本
- `x_processor.py` - X 内容处理 (AI 翻译过滤)
- `github_trending_monitor.sh` - GitHub Trending 监控脚本
- `github_trending_processor.py` - GitHub Trending 处理 (AI 总结)
- `Dockerfile` - Docker 镜像定义
- `docker-compose.yml` - Docker Compose 配置

## Cron 调度

| 任务 | 频率 | 说明 |
|------|------|------|
| X 监控 | 每小时 | 检查推荐时间线新推文 |
| GitHub Trending | 每天 9:00 | 抓取当日热门仓库 |

## 数据持久化

所有状态数据存储在 Docker volume `news-data` 中：
- `.x_sent_ids.txt` - 已发送推文记录
- `.github_sent_repos.txt` - 已发送仓库记录
- `.x_monitor.log` - X 监控日志
- `.github_trending.log` - GitHub Trending 日志
- `cron.log` - Cron 执行日志

## 目标

- Telegram 群组: `-1003734489320`
  - X 推文: 话题 13
  - GitHub Trending: 话题 206
- Discord Webhooks:
  - X 推文: 已配置
  - GitHub Trending: 已配置
