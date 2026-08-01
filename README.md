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

| 组件     | 技术                                       |
| -------- | ------------------------------------------ |
| 前端     | Next.js 15 + Tailwind CSS + React Markdown |
| 数据库   | Neon PostgreSQL (Serverless)               |
| AI       | Vercel AI SDK + DeepSeek API               |
| 部署     | Vercel                                     |
| 定时任务 | GitHub Actions                             |
| 容器化   | Docker (multi-stage, standalone, non-root) |
| 本地编排 | docker-compose                             |
| 依赖更新 | Dependabot (npm + actions + docker)        |
| CDN      | Cloudflare                                 |

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

| 层级   | 内容     | 说明                  |
| ------ | -------- | --------------------- |
| 第一层 | 原文     | 原始抓取数据          |
| 第二层 | AI 摘要  | 单条摘要 + 重点       |
| 第三层 | 主题聚合 | AI 动态生成的主题分组 |
| 第四层 | 整体洞察 | 可选，未来扩展        |

## 本地开发

### 方式 A：原生 Node.js

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
```

### 方式 B：Docker Compose（推荐，新人 onboarding）

```bash
# 1. 准备环境变量
cp .env.example .env.docker
# 编辑 .env.docker 填入真实密钥（DATABASE_URL 指向本地 db 即可）

# 2. 一键启动（app + Postgres 16）
docker compose up -d

# 3. 查看日志
docker compose logs -f app

# 4. 验证服务
curl http://localhost:3000/api/health
# → {"status":"ok","db":"up","uptime":12,"timestamp":"..."}

# 5. 初始化数据库（首次启动）
docker compose exec app npx tsx scripts/init-db.ts

# 停止
docker compose down
```

> **镜像特性**：Dockerfile 使用 Next.js 15 `standalone` 输出（开启 `NEXT_PRIVATE_STANDALONE=1` 标志），最终镜像仅 ~150MB；以非 root 用户运行；内置 `HEALTHCHECK` 指令调用 `/api/health`。

### 手动抓取（任一方式）

```bash
npm run scrape -- --source=github
npm run ai-process -- --source=github
npm run topic-aggregate -- --source=github
```

## 健康检查

应用暴露 `GET /api/health` 端点：

- **200 OK** — `{ status: 'ok', db: 'up', uptime, timestamp }`
- **503 Service Unavailable** — `{ status: 'degraded', db: 'down', error, ... }`

供 Docker / Kubernetes / Vercel / 外部探活使用。无缓存（`force-dynamic`），每次请求真实探测 DB 连接。

## 环境变量

| 变量                 | 说明                                 | 必需 |
| -------------------- | ------------------------------------ | ---- |
| `DATABASE_URL`       | PostgreSQL 连接字符串（Neon 或本地） | ✅   |
| `ANTHROPIC_API_KEY`  | DeepSeek API Key                     | ✅   |
| `ANTHROPIC_BASE_URL` | API 地址                             | ✅   |
| `ANTHROPIC_MODEL`    | 模型名称                             | ✅   |
| `PRODUCTHUNT_TOKEN`  | Product Hunt API Token               | ❌   |
| `TWITTER_AUTH_TOKEN` | Twitter 认证 Token                   | ❌   |
| `TWITTER_CT0`        | Twitter CT0 Cookie                   | ❌   |

## 添加新数据源

1. 在 `src/sources/` 创建新文件
2. 实现 `NewsSource` 接口
3. 在 `src/sources/index.ts` 注册
4. 更新 GitHub Actions workflow

## 项目结构

```
├── src/
│   ├── sources/              # 数据源插件
│   ├── lib/
│   │   ├── schema.ts         # 数据库 Schema
│   │   ├── db/               # 仓库模块（news/ai/topic/read/stats）
│   │   ├── ai-service.ts     # AI 抽象接口
│   │   ├── ai.ts             # AI 具体实现
│   │   └── og.ts             # OG 图片生成
│   └── app/
│       ├── api/
│       │   ├── health/       # 健康检查
│       │   ├── news/         # 新闻 CRUD
│       │   └── topics/       # 主题 API
│       ├── components/
│       └── page.tsx
├── scripts/
│   ├── scrape.ts             # 爬虫脚本
│   ├── ai-process.ts         # AI 处理脚本
│   ├── topic-aggregate.ts    # 主题聚合脚本
│   └── init-db.ts            # 数据库初始化
├── .github/workflows/
│   ├── scrape-github.yml
│   ├── scrape-twitter.yml
│   ├── scrape-producthunt.yml
│   ├── test.yml              # 单元 + 集成测试
│   └── sync-branch-protection.yml
├── Dockerfile                # 生产镜像（multi-stage, standalone）
├── docker-compose.yml        # 本地 app + Postgres
├── .dockerignore
└── legacy/                   # 旧版 Python 脚本
```

## 定时规则

| 数据源          | 频率                  | 说明     |
| --------------- | --------------------- | -------- |
| GitHub Trending | 每天 21:00 (北京时间) | 每天一次 |
| Twitter         | 每小时                | 高频更新 |
| Product Hunt    | 每小时                | 高频更新 |

## 运维

### 测试

```bash
npm test              # 单元测试
npm run test:integration  # 集成测试（需要本地 Postgres）
npm run test:all      # 全部
npm run test:coverage # 覆盖率
```

### Pre-commit

Husky + lint-staged + Prettier + TypeScript 在 commit 前自动运行。

### 依赖更新

GitHub Dependabot 每**周一**自动检查 `npm` / `GitHub Actions` / `Docker base image` 更新，并按分组提交 PR（自动指派 reviewer）。

### 分发大小

| 镜像层                  | 大小（估） |
| ----------------------- | ---------- |
| `node:22-alpine` 基础   | ~50MB      |
| standalone builder 输出 | ~10MB      |
| 仅必要 node_modules     | ~80MB      |
| **最终镜像**            | **~150MB** |

## License

MIT
