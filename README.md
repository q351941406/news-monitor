# News Monitor - 热点新闻监控

每日热点新闻汇总与领域知识发现系统。

🔗 **在线访问**: https://news.myaicode.qzz.io

## 📚 文档导航

| 文档                                                             | 内容                                          |
| ---------------------------------------------------------------- | --------------------------------------------- |
| [`docs/ops/sentry.md`](docs/ops/sentry.md)                       | Sentry 监控配置、告警规则、邮箱通知、API 运维 |
| [`docs/ops/disaster-recovery.md`](docs/ops/disaster-recovery.md) | 备份与灾难恢复（Neon PITR、恢复演练）         |
| [`docs/ops/uptime-monitoring.md`](docs/ops/uptime-monitoring.md) | Uptime 宕机监控（UptimeRobot、告警邮箱）      |
| [`docs/ops/neon-environments.md`](docs/ops/neon-environments.md) | Neon 环境隔离（Preview 分支库）               |
| [`docs/ops/branch-protection.md`](docs/ops/branch-protection.md) | main 分支保护手动配置（required checks）      |
| [`docs/adr/`](docs/adr/)                                         | 架构决策记录（ADR）                           |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                             | 系统架构详解                                  |
| [`CONTEXT.md`](CONTEXT.md)                                       | 项目上下文 / 领域知识                         |
| [`CODING_STANDARDS.md`](CODING_STANDARDS.md)                     | 编码规范                                      |
| [`TESTING_STANDARDS.md`](TESTING_STANDARDS.md)                   | 测试规范                                      |
| [`UBIQUITOUS_LANGUAGE.md`](UBIQUITOUS_LANGUAGE.md)               | 领域术语表                                    |

## 功能

- **GitHub Trending** - 每天自动抓取热门仓库
- **Product Hunt** - 每小时监控新产品发布
- **X / Twitter** - 每小时追踪科技/AI 相关推文
- **AI 智能分析** - 自动生成摘要和重点
- **AI 主题聚合** - 队列式增量聚合（新数据优先+最旧补足），带历史主题上下文归并，同名主题稳定复用
- **AI 用量监控** - 每次模型调用的 token 数/耗时/成败自动埋点，运维仪表盘实时展示
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

## 🔐 管理员鉴权（读公开 / 写受控）

**设计**：网站内容对所有人公开可读（展示用），但**写操作仅管理员**可执行。

| 接口                                       | 权限                                  |
| ------------------------------------------ | ------------------------------------- |
| `GET /api/news`、`GET /api/topics`         | 公开（任何人都能看）                  |
| `POST /api/news`（标记已读/全部已读/重置） | 仅管理员（需 `x-admin-token` header） |
| `GET /api/admin/metrics`（运维仪表盘）     | 仅管理员                              |

**访客看到的**：完整新闻内容 + 无任何操作按钮（已读/全部已读/撤销全部隐藏）。
**管理员**：点页面右上角「🔒 管理员登录」→ 输入 token → 解锁操作按钮，token 存浏览器 localStorage，同一浏览器免重复登录。

**Token 存储位置**（三处，值一致）：

- Vercel 环境变量：`ADMIN_TOKEN`（production + preview）
- GitHub Actions secrets：`ADMIN_TOKEN`（供 CI 测试）
- 本地开发：`.env.local` 中 `ADMIN_TOKEN=xxx`

> ⚠️ **安全说明**：真实 token 不写入本仓库（gitleaks 会在 CI 拦截），由维护者通过 Vercel / GitHub 平台环境变量管理；需要重置时用 `openssl rand -hex 24` 重新生成并同步到两处即可。
> 实现代码：`src/lib/admin-auth.ts`（后端校验）、`src/lib/admin-token.ts`（前端管理）。

## 架构

```
GitHub Actions (定时，每轮按序执行)
    ↓
① 爬虫脚本 → 存入 raw_items（aggregated_at = NULL，进聚合队列）
    ↓
② AI 处理脚本 → 生成摘要/重点 → 存入 ai_analysis
    ↓
③ 主题聚合脚本 → 队列消费（新数据优先 + 最旧补足 100 条）
   → AI 带「已有主题」历史上下文聚合
   → 增量 upsert 到 topic_groups（同名主题复用，不重建）
   → 删除空主题 + 标记本批已聚合
    ↓
Vercel 展示 → news.myaicode.qzz.io（三级懒加载）
```

## 四层信息架构

| 层级   | 内容     | 说明                                                      |
| ------ | -------- | --------------------------------------------------------- |
| 第一层 | 原文     | 原始抓取数据（README 全文存储，不再截断 5000 字符）       |
| 第二层 | AI 摘要  | 单条摘要 + 重点                                           |
| 第三层 | 主题聚合 | 队列式增量聚合：AI 带历史主题上下文归并，同名主题稳定复用 |
| 第四层 | 整体洞察 | 可选，未来扩展                                            |

## 本地开发

### 方式 A：原生 Node.js

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入配置

# 初始化数据库（幂等迁移，与 CI/生产同款）
npm run db:migrate:ci
# 可选：灌入开发种子数据（300 条 + 12 个主题）
npx tsx scripts/seed-dev.ts

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
docker compose exec app npm run db:migrate:ci

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
| `AI_API_KEY`         | DeepSeek API Key                     | ✅   |
| `AI_BASE_URL`        | API 地址                             | ✅   |
| `AI_MODEL`           | 模型名称                             | ✅   |
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
│   ├── migrate-ci.ts         # 幂等数据库迁移（CI/生产部署用）
│   └── seed-dev.ts           # 开发种子数据
├── .github/workflows/
│   ├── scrape-github.yml     # GitHub Trending 定时抓取
│   ├── scrape-twitter.yml    # Twitter 定时抓取
│   ├── scrape-producthunt.yml# Product Hunt 定时抓取
│   ├── reaggregate.yml       # 主题手动重聚合
│   ├── test.yml              # 单元 + 集成测试 + 覆盖率门槛
│   ├── security.yml          # Semgrep SAST + npm audit
│   └── gitleaks.yml          # 密钥扫描
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

## 📦 数据库迁移

项目使用 [Drizzle ORM](https://orm.drizzle.team/) 管理 schema 演进：

```bash
# 修改 src/lib/schema.ts 后生成 migration 文件
npm run db:generate
# 检查 schema 与 migration 文件是否一致（CI 必跑）
npm run db:check
# 应用 migration 到目标 DB
npm run db:migrate
# 开发期快速同步（跳过 migration 文件）
npm run db:push
# 可视化浏览数据库
npm run db:studio
```

### 自动迁移（生产部署）

Vercel 构建时自动执行幂等迁移（`buildCommand: "npm run build && npm run db:migrate:ci"`）。
顺序是**先构建、后迁移**：代码编译不过就不会触碰生产库，避免「构建失败但 schema 已变更」的
不可回滚窗口。schema 变更随代码发布自动应用，无需手动操作。`migrate-ci.ts` 用 `__ci_migrations`
表记录已应用项，重复/并发执行安全。

> ⚠️ **迁移必须向前兼容**（additive / expand-contract）：先加列、后删列，禁止在单次迁移中
> 破坏性地 drop 列或改类型，否则部署切换窗口内旧代码会读到不兼容的 schema。

CI 在每次 PR 中运行 `db:check` 防止 schema 漂移。

> **测试环境复用同一套迁移**：集成测试通过 `scripts/migrate-core.ts` 执行 `drizzle/*.sql`
> 全部迁移建表（测试 schema 内），保证测试环境 = 生产迁移后状态，杜绝 DDL 双源漂移。
> 该核心同时被生产/CI 的 `migrate-ci.ts` 复用。

## 🔁 网络重试与 Sentry 错误追踪

所有外部数据源都通过 `src/lib/retry.ts` 中的 `fetchWithRetry` / `execSyncWithRetry` 包装，
带指数退避 + 30% 抖动，防止网络抖动造成数据缺失。

### Sentry 监控（已启用）

错误上报到 Sentry，新 issue 出现会自动发邮件告警到主邮箱 `xxx@xxx.com`。

- **组织信息 / 环境变量 / 告警规则 / API 操作** → 详见 [`docs/ops/sentry.md`](docs/ops/sentry.md)
- **备份与灾难恢复**（Neon PITR / 恢复演练）→ 详见 [`docs/ops/disaster-recovery.md`](docs/ops/disaster-recovery.md)

**快速信息**：

- Org: `xxx` ｜ Project: `news-monitor` ｜ 控制台: https://xxx.sentry.io/projects/news-monitor/
- 告警规则：新 issue 出现 → 邮件；高优先级 issue → 邮件
- 健康检查 / AbortError / ECONNRESET 已在 SDK 中过滤，不上报

## 📊 测试覆盖率

**双层门槛机制**：

| 门槛          | 阈值            | 执行位置                                                   |
| ------------- | --------------- | ---------------------------------------------------------- |
| 本地快速门槛  | lines 30% 等    | `vitest.config.mjs`，`npm run test:coverage` 开发期自查用  |
| **CI 硬门槛** | **四指标 ≥80%** | `scripts/merge-coverage.ts` 合并 unit ∪ integration 后检查 |

> CI 红线：`merge-coverage.ts` 对 **lines/statements/functions/branches 全部要求 ≥80%**，不足则退出码非 0 阻断合并。当前实测：lines 92.6% / statements 92.3% / branches 82.6%（合并 unit ∪ integration）。
> 集成测试层（真实 PostgreSQL）当前 lines 60.7%，三大数据源 github 88.6% / producthunt 87.5% / twitter 79.8%，端到端链路用例已覆盖数据源→存储→聚合→展示。

跑覆盖率 + 门槛检查：

```bash
npm run test:coverage           # 生成 HTML 报告到 coverage/
npm run test:coverage:check     # unit + integration + merge，低于 80% 则退出码非 0
```

## 运维

### 测试

```bash
npm test                  # 单元测试（130 用例：含 NewsCard/SourceTabs 组件测试）
npm run test:integration  # 集成测试（73 用例，需要本地 Postgres）
npm run test:all          # 全部
npm run test:coverage     # 覆盖率
```

> 🔒 **LLM 防护**：所有测试（单元+集成）通过 `vitest.setup.ts` 全局 mock `ai` 模块，
> **永不真实调用 LLM API**。测试忘记显式 mock 而触发 AI 调用时，会收到哨兵错误并提示。
> 端到端链路测试（e2e-pipeline*.test.ts）覆盖「数据源抓取→存储→聚合→展示」主链路，
> 外部边界（fetch/CLI）mock，数据库层全真实。

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

### 定时任务可靠性

所有 scrape-* 工作流都带 **15 分钟超时**。运行结果统一记录在**内置运维仪表盘**（`/dashboard`），避免静默失败。
仪表盘包含：抓取任务状态/成功率/耗时、7 天趋势、静默失败告警、**AI 调用用量**（token 数/失败数/按操作分布/7 天趋势）。

| 数据源       | Cron (UTC)     | 错峰原因                                |
| ------------ | -------------- | --------------------------------------- |
| GitHub       | `0 13 * * *`   | 每日一次，无冲突                        |
| Twitter      | `5 */6 * * *`  | 每 6h 的 :05 分                         |
| Product Hunt | `30 */6 * * *` | 每 6h 的 :30 分（避开 PH 自身整点压力） |

### 端到端验证

```bash
curl http://localhost:3000/api/health
# → {"status":"ok","db":"up","uptime":12,"timestamp":"..."}
```

返回 200 = 健康，503 = 数据库连接异常（用于容器编排 / Vercel 探活）。

## License

MIT

## ⚠️ 已知风险与暂缓项

| 项                      | 风险                                                | 状态 | 处置计划                                                                                                 |
| ----------------------- | --------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| postcss (next 传递依赖) | XSS / 任意文件读取（仅构建期）                      | 暂缓 | 修复需 next@16 大升级；postcss 处理本地 CSS 非用户输入，实际可利用性极低。next 16 稳定后随大版本升级解决 |
| rolldown 覆盖率解析     | vitest 4 覆盖率收集对个别语法报 warning（非 error） | 已知 | Node 锁 22.23.2 后本地/CI 行为一致；不影响覆盖率统计结果                                                 |

> 这些是**主动评估后接受的权衡**，不是遗漏。处置窗口按上方计划跟进。
