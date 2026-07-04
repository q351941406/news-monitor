# News Monitor - 热点新闻监控

每日热点新闻汇总与领域知识发现系统。

🔗 **在线访问**: https://news.myaicode.qzz.io

## 功能

- **GitHub Trending** - 每天自动抓取热门仓库
- **Product Hunt** - 每小时监控新产品发布
- **X / Twitter** - 每小时追踪科技/AI 相关推文
- **AI 智能分析** - 自动生成摘要和重点
- **AI 主题聚合** - 动态识别相关主题并分组展示
- **已读管理** - 标记已读/未读，支持批量操作

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | Next.js 15 + Tailwind CSS + React Markdown |
| 数据库 | Neon PostgreSQL (Serverless) |
| AI | Vercel AI SDK + DeepSeek API |
| 部署 | Vercel |
| 定时任务 | GitHub Actions |
| CDN | Cloudflare |

## 架构

```
GitHub Actions (定时)
    ↓
爬虫脚本 → 存入 raw_items
    ↓
AI 处理脚本 → 生成摘要/重点 → 存入 ai_analysis
    ↓
主题聚合脚本 → 动态生成主题分组 → 存入 topic_groups
    ↓
Vercel 展示 → news.myaicode.qzz.io
```

## 四层信息架构

| 层级 | 内容 | 说明 |
|------|------|------|
| 第一层 | 原文 | 原始抓取数据 |
| 第二层 | AI 摘要 | 单条摘要 + 重点 |
| 第三层 | 主题聚合 | AI 动态生成的主题分组 |
| 第四层 | 整体洞察 | 可选，未来扩展 |

## 本地开发

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入配置

# 初始化数据库
npm run db:init

# 启动开发服务器
npm run dev

# 手动抓取
npm run scrape -- --source=github

# 手动 AI 处理
npm run ai-process -- --source=github

# 手动主题聚合
npm run topic-aggregate -- --source=github
```

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `DATABASE_URL` | Neon PostgreSQL 连接字符串 | ✅ |
| `ANTHROPIC_API_KEY` | DeepSeek API Key | ✅ |
| `ANTHROPIC_BASE_URL` | API 地址 | ✅ |
| `ANTHROPIC_MODEL` | 模型名称 | ✅ |
| `PRODUCTHUNT_TOKEN` | Product Hunt API Token | ❌ |
| `TWITTER_AUTH_TOKEN` | Twitter 认证 Token | ❌ |
| `TWITTER_CT0` | Twitter CT0 Cookie | ❌ |

## 添加新数据源

1. 在 `src/sources/` 创建新文件
2. 实现 `NewsSource` 接口
3. 在 `src/sources/index.ts` 注册
4. 更新 GitHub Actions workflow

## 项目结构

```
├── src/
│   ├── sources/          # 数据源插件
│   ├── lib/
│   │   ├── schema.ts     # 数据库 Schema
│   │   ├── db.ts         # 数据库操作
│   │   └── ai.ts         # AI 配置
│   └── app/              # Next.js 页面
├── scripts/
│   ├── scrape.ts         # 爬虫脚本
│   ├── ai-process.ts     # AI 处理脚本
│   ├── topic-aggregate.ts # 主题聚合脚本
│   └── init-db.ts        # 数据库初始化
├── .github/workflows/
│   ├── scrape-github.yml
│   ├── scrape-twitter.yml
│   └── scrape-producthunt.yml
└── legacy/               # 旧版 Python 脚本
```

## 定时规则

| 数据源 | 频率 | 说明 |
|---|---|---|
| GitHub Trending | 每天 21:00 (北京时间) | 每天一次 |
| Twitter | 每小时 | 高频更新 |
| Product Hunt | 每小时 | 高频更新 |

## License

MIT
