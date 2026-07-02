# News Monitor - 热点新闻监控

每日热点新闻汇总与领域知识发现系统。

🔗 **在线访问**: https://news.myaicode.qzz.io

## 功能

- **GitHub Trending** - 每 4 小时自动抓取热门仓库，AI 翻译总结
- **Product Hunt** - 监控新产品发布（需配置 token）
- **X / Twitter** - 追踪科技/AI/编程相关推文

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | Next.js 15 + Tailwind CSS |
| 数据库 | Neon PostgreSQL (Serverless) |
| 部署 | Vercel |
| 定时任务 | GitHub Actions |
| CDN | Cloudflare |
| AI | DeepSeek API |

## 架构

```
GitHub Actions (每 4 小时)
    ↓ 抓取数据
Neon PostgreSQL ← Vercel 展示 → news.myaicode.qzz.io
    ↑
Cloudflare CDN (加速 + SSL)
```

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
```

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `DATABASE_URL` | Neon PostgreSQL 连接字符串 | ✅ |
| `ANTHROPIC_API_KEY` | DeepSeek API Key | ✅ |
| `ANTHROPIC_BASE_URL` | API 地址 | ✅ |
| `ANTHROPIC_MODEL` | 模型名称 | ✅ |
| `PRODUCTHUNT_TOKEN` | Product Hunt API Token | ❌ |
| `RSSHUB_URL` | RSSHub 实例地址 | ❌ |

## 添加新数据源

1. 在 `src/sources/` 创建新文件
2. 实现 `NewsSource` 接口
3. 在 `src/sources/index.ts` 注册

```typescript
// src/sources/custom.ts
import { NewsSource, NewsItem } from './types'

export const customSource: NewsSource = {
  name: '自定义源',
  slug: 'custom',
  async fetch(): Promise<NewsItem[]> {
    // 抓取逻辑
    return []
  }
}
```

## 项目结构

```
├── src/
│   ├── sources/          # 数据源插件
│   ├── lib/db.ts         # 数据库操作
│   └── app/              # Next.js 页面
├── scripts/
│   ├── scrape.ts         # 抓取脚本
│   └── init-db.ts        # 数据库初始化
├── .github/workflows/
│   └── scrape.yml        # GitHub Actions 配置
└── legacy/               # 旧版 Python 脚本
```

## License

MIT
