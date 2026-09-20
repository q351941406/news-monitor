# 抓取管道静默故障 — 复盘、遗留 TODO 与交接说明

> **交接文档**。记录 2026-09-18 排查「Product Hunt 断流 47 天、X 断流 57 天且零告警」的完整根因，
> 已完成项与剩余待办。**接手者只需读本文档即可开始工作，无需其他上下文。**
>
> - 更新日期：**2026-09-20**
> - 验证基线：`main @ 40f16a3`
> - 测试基线：单测 **209 passed** / 集成 **75 passed** / 合并覆盖率 **92.9%**（lines）
> - 状态：**P1-1 / P1-2 / P1-4 已解决**；剩 P1-3（待用户决策）、P1-6（Port 侧配置）

## 文档导航

| 章节 | 内容                                          | 什么时候读           |
| ---- | --------------------------------------------- | -------------------- |
| 0    | **根因复盘**（三段独立失效叠加）              | 想理解「为什么」时   |
| 1    | **已完成**（4 个 PR + 新增文件 + 设计约定）   | 动手前，避免重复劳动 |
| 2    | **遗留 TODO**（P1-3 / P1-6 / P2 / P3）        | 这就是你要做的活     |
| 3    | **环境与验证**（含踩坑警示）                  | 动手前必读           |
| 4    | **工作流约束**（分支保护、Semgrep、合并陷阱） | 提 PR 前必读         |
| 5    | **建议接手顺序**                              | 不知从哪开始时       |

---

## 0. 背景：事故的完整根因链

**症状**：生产环境 Product Hunt 断流 47 天、X/Twitter 断流 57 天，全程 workflow 绿色、零告警、无人察觉。

**根因不是「有人删错了东西」，而是三段独立失效叠加成完美静默故障：**

### 链路 1 — 跨文件契约断裂（代码依赖 vs CI 配置分置两处，无机器校验）

两次**看起来都极其合理**的重构，先后剪断了契约：

| 提交      | 表面意图                            | 实际副作用                                                                                                |
| --------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `a7795e9` | 建测试基础设施，"顺手清理" workflow | 删掉 `pip install twitter-cli`，但 `src/sources/twitter.ts` 仍 `execSync('twitter feed --max 50 --yaml')` |
| `2dce843` | P0 安全加固，收窄 secret 暴露面     | 删掉 `PRODUCTHUNT_TOKEN` / `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` 注入，但源码仍硬依赖                      |

契约两半分属 `.ts` 和 `.yml`，review 时在同一个 diff 里看不出矛盾——**矛盾在 diff 与"未被改动的源码"之间**。

### 链路 2 — 软失败把「不可用」伪装成「正常但没数据」

源码在凭据/CLI 缺失时 `console.log('⚠️ not configured, skipping')` + `return []`：

```
软失败 → withRunLog 记 status:'success', itemsCount:0 → scrape.ts exit 0
       → workflow 绿灯 → auto-retry 不触发 → Sentry 的 if: failure() 永不执行
```

### 链路 3 — 唯一的主动告警被删除（基于错误前提）

`0b59cec`（8/3）删除 Discord 失败通知，commit message 理由是 **"dashboard covers monitoring"**。
但那个 dashboard 告警**在数学上永不可能触发**（见下方附表）。
**基于错误前提移除了唯一的主动告警渠道**，此后 47 天彻底失明。

### 附：为什么旧 dashboard 告警永不触发（已用真实数据证明）

原 `detectSilentFailures` 用**次数**维度判据「连续 3 次同源同阶段 0 条」，但读取的是
`getRecentRuns(30)` 这个**全局**窗口——实测仅覆盖 **1.7 天**（PH 每天 4 次 + X 每天 1 次，
再乘 3 个 stage，30 条很快被稀释）。

```
窗口内 X:scrape 记录数 = 1     ← 需要连续 3 条
X 断流期间 dashboard 告警数 = 0
```

X 每天只抓 1 次，窗口内**永远凑不齐 3 条**——告警在数学上不可能触发。
**高频源（PH）反而会误报**（窗口内能凑够）。该判据既漏报又误报，
已由时间维度的 `freshness.ts` 取代。

### 0.1 铁证：本次会话抓到的活体样本

修复 P1-1 时，从 GitHub Actions 历史日志中提取到 **X 源 9/9–9/18 连续 10 天**的输出：

```
⚠️ Twitter auth tokens not configured, skipping    ← 旧代码的软失败
✅ Fetched 0 items
📦 Stored 0 new items
→ conclusion: success                              ← 全绿
```

修复凭据注入（#24）后立刻恢复 `Fetched 19–20`。
**这 10 天就是「链路 2」的现场复现**——不是推演，是日志原文。

---

## 1. 已完成（无需重做，仅作背景）

| PR  | commit    | 内容                                                                                                         |
| --- | --------- | ------------------------------------------------------------------------------------------------------------ |
| #24 | `5ff579a` | 恢复凭据注入 + `twitter-cli` 安装；生产实跑验证 PH `Fetched 10`、X `Parsed 41→Stored 12`                     |
| #27 | `f0e0872` | ① 消灭软失败（凭据/CLI 缺失→抛错）② CI 接线契约测试 ③ 时间维度新鲜度告警                                     |
| #28 | `6c0b013` | 新鲜度告警接入 dashboard（双通道）                                                                           |
| #30 | `6b87ddb` | 消除三处「绿着断流」：① 抓取 0 条→报错 ② settings cron 改从 workflow 解析 ③ `twitter-cli` 输出改 `yaml` 解析 |
| #31 | `40f16a3` | 更新本文档（标记 #30 已完成项 + 新增 P1-6 告警疲劳）                                                         |

### 1.1 新增文件（后续工作会用到）

| 文件                                                                   | 作用                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/sources/credentials.ts`                                           | 凭据契约集中声明（`SOURCE_CREDENTIALS` / `assertSourceCredentials` / `requiredSecretsFor`） |
| `src/lib/freshness.ts`                                                 | 时间维度新鲜度检测（`detectStaleSources` / `FRESHNESS_TOLERANCE_MS`）                       |
| `src/lib/scrape-guard.ts`                                              | 抓取非空断言（`assertNonEmptyFetch` / `shouldFailOnEmptyFetch`）                            |
| `src/lib/schedules.ts`                                                 | cron 从 workflow 解析（构建期快照 `BUILD_TIME_SCHEDULES`）                                  |
| `src/lib/__tests__/ci-wiring-contract.test.ts`                         | 契约测试（已反向验证能拦住 `a7795e9` 与 `2dce843`）                                         |
| `src/lib/__tests__/scrape-guard.test.ts`                               | 抓取断言测试（6 个）                                                                        |
| `src/lib/__tests__/schedules.test.ts`                                  | cron 解析契约测试（16 个）                                                                  |
| `src/sources/__tests__/fixtures/twitter-cli-0.8.5-*.yaml`              | **真实 CLI 生成**的 0.8.5 输出 fixture（success + failure）                                 |
| `.github/workflows/freshness-check.yml` + `scripts/check-freshness.ts` | 每日 3 次主动巡检                                                                           |

### 1.2 关键设计约定（新增代码请遵循）

1. **凭据缺失 = 配置故障**，必须抛错让 run 红掉；确需跳过须显式设 `SKIP_SOURCE_<SOURCE>=1`
2. **新增数据源/凭据只改 `src/sources/credentials.ts`**，运行时与契约测试同时生效
3. **`stored === 0` 不是故障，`fetched === 0` 才是**（详见 P1-1 的实测校准，别搞反）

### 1.3 P1-1 的判据是怎么定下来的（重要，别推翻）

TODO 原文建议按「连续 N 次 0 条」判定，但**用生产日志实测校准后否决了**：

```
三源真实数据（2026-09-20 抽取）：
  github       Fetched 13–21 / Stored 0–10    ← Stored 可为 0（全是重复项，合法）
  producthunt  Fetched 10    / Stored 3–10
  twitter      Fetched 19–20 / Stored 12–20

生产实例：17:39 那次 run 是 Fetched 13 / Stored 0 → 合法的「无新内容」
```

**结论**：`stored === 0` 会误报（重复项），`fetched === 0` 才是「源不可用」。
判据做了三层分离：解析层（CLI 输出异常）/ 源层（执行失败）/ 兜底层（返回 0 条）。

---

## 2. 遗留 TODO

> P1-1 / P1-2 / P1-4 已在 #30 解决，不再列出（避免误导）。
> 下面只剩真正待办项。

### P1-3 【配置】`ADMIN_TOKEN` 在 GitHub 侧不存在 —— ⚠️ 需用户决策

**现状**：三个 scrape workflow 都写 `ADMIN_TOKEN: ${{ secrets.ADMIN_TOKEN }}`，
但 **GitHub secrets 里没有这个 secret**（`gh secret list` 可验证）→ 解析为空字符串 →
`revalidateCacheAfterRun` 判定"未配置"→ 静默跳过。

> ⚠️ **别混淆**：secrets 里有个名字很像的 `ADMIN_GITHUB_TOKEN`，
> 那是**另一个东西**（已属孤儿 secret，见 P2-2）。`ADMIN_TOKEN` 确实不存在。

**实际影响有限（不要夸大）**：缓存 TTL 只有 60 秒（`src/lib/cache.ts`），
即使失效失败最多延迟 1 分钟自愈，**无数据一致性风险**，只是用户可能多看到 1 分钟旧数据。

**但**：`ADMIN_TOKEN` 同时是以下功能的钥匙 ——

- `GET /api/admin/metrics`（运维仪表盘）
- `POST /api/admin/revalidate`
- 标记已读/删除等写操作（`POST /api/news`、`POST /api/archive`）

**用户明确表示"不知道 ADMIN_TOKEN 是什么"** → 意味着**他从没进过 dashboard**，
这本身就解释了为什么 57 天无人发现故障。

**它是怎么工作的**：存在**浏览器 localStorage**（`src/lib/admin-token.ts`，key
`news_monitor_admin_token`），在**首页**手动输入登录后，请求经 `x-admin-token` header 传递。
Vercel 侧已配置（`production,preview`，type=sensitive 读不到明文）。

**待用户决策**：

- (a) 生成新值并同时写入 GitHub secret + Vercel env（会**使现有浏览器登录失效**，须重新登录）
- (b) 用户提供现有值（他可能不知道）
- (c) 暂时不管（影响小，但确认文案要说清）

**注意**：轮换前先确认没有别处硬编码该 token。

---

### P1-6 【重要】现有 Port 告警通道「成功也推送」→ 告警疲劳 —— ⚠️ 改的是 Port 侧

**这一项取代了原 P1-5「接通知渠道」（该需求实际已完成）。**

**2026-09-20 实测发现的现有链路**（无需新建任何东西）：

```
githubWorkflowRun 实体更新
  → Port automation `notify_deploy_result`
  → POST https://notify.holomer.space/bark
  → Bark (iOS)
```

白名单已含 `news-monitor`（2026-09-02 建），且 `news-monitor` 在 Port 里有 **245 条 run 记录**。

**问题：触发条件不区分成功/失败。** 实测条件（`_workflow` 实体 `notify_deploy_result`）：

```jq
.diff.after.properties.conclusion != null
and ((.diff.after.identifier | startswith("q351941406/MultiAgentSystem"))
     or (.diff.after.identifier | startswith("q351941406/news-monitor")))
and (.diff.before.properties.conclusion != .diff.after.properties.conclusion
     or .diff.before.properties.status != .diff.after.properties.status)
```

**实测推送量**（`githubWorkflowRun` 实体按日聚合）：

| 日期      | news-monitor runs |
| --------- | ----------------- |
| 9/09–9/12 | 6 / 天            |
| 9/13      | 31                |
| 9/18      | 33                |
| 9/19      | 15                |
| 9/20      | 17                |

→ **每天 6–17 条推送，绝大部分是「成功」**。

**为什么这是真问题（而非「忍一忍」）**：告警疲劳会把用户推回原始事故 ——
**用户 mute 通知 → 真故障再次静默**。这与本次复盘的核心教训（唯一告警渠道被删）同源。

**建议改法**（三选一，需用户决策）：

1. **只推失败**：条件加 `and .diff.after.properties.conclusion == "failure"`
2. **降噪 + 恢复通知**：成功静默、失败推送、**恢复时推一条 ✅**（需 Port 侧存状态）
3. **分级**：`failure` 立即推；`cancelled` / `success` 不推

**注意**：该项在 Port 侧配置，**本仓库 CI 无法校验**。若采纳，建议把条件抄一份进本文档以备追溯。

**如何操作**（需要用 Port API 或 UI）：

```bash
# 取 token（client credentials，US region）
curl -s -X POST "https://api.us.port.io/v1/auth/access_token" \
  -H 'Content-Type: application/json' \
  -d '{"clientId":"<CLIENT_ID>","clientSecret":"<CLIENT_SECRET>"}' | jq -r .accessToken

# 读现有条件
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.us.port.io/v1/blueprints/_workflow/entities/notify_deploy_result" \
  | jq '.entity.properties'
```

> **区域注意**：该 org 在 **US region**（`api.us.port.io`）。用 EU（`api.port.io`）会返回 404
> `user not found`。JWT 里的 `iss`/`aud` 可确认。
>
> **分页陷阱**：`?per_page=100` 会返回空数组（静默失败）。**不要带 per_page**，
> 用 `/v1/blueprints/<id>/entities` 直接取全量。

---

### P2-1 【文档】`docs/ops/uptime-monitoring.md` 未反映新增巡检

该文档的「告警覆盖与取舍」表格**未提及** `freshness-check.yml`。同时它的核心结论仍值得保留
（`/api/health` 默认不查库是为了 Neon scale-to-zero 省额度，**不要**改成每次查库！）。

**建议**：补一节说明新鲜度巡检覆盖「管道级故障」（站点活着但数据断流），
与现有 liveness 监控形成互补。

---

### P2-2 【清理】孤儿 secrets

以下 GitHub secrets **存在但代码/workflow 零引用**（已逐个 grep 验证）：

- `RSSHUB_URL`、`ADMIN_GITHUB_TOKEN`
- `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL`（AI 已迁移到 OpenAI 兼容协议的 `AI_*`）

**建议**：确认无历史用途后清理。清理前务必再 grep 一次（含 git 历史）。

---

### P2-3 【清理】陈旧分支 + 挂了 5 周的 PR

**已实测确认**（`git rev-list --count`），4 个分支相对 main 是 **0 ahead**，内容早已进 main：

| 分支                     | ahead | behind | 处置         |
| ------------------------ | ----- | ------ | ------------ |
| `feat/favicon`           | 0     | 19     | **可直接删** |
| `fix/csp-inline-scripts` | 0     | 21     | **可直接删** |
| `fix/readme-truncate`    | 0     | 15     | **可直接删** |
| `fix/sentry-errors`      | 0     | 23     | **可直接删** |
| `feat/e2e-playwright`    | **2** | —      | 见下         |

**`feat/e2e-playwright` 对应 PR #17（OPEN，2026-08-16 开，已挂 5 周）**。
其 commit 是 `fix(ci): pin upload-artifact 到完整 commit SHA（修复 Semgrep 阻断）`。

**注意**：#17 的 E2E 测试**不在 required checks 里**，所以它红/绿都不影响合并。
需决策：(a) 修复并合并 (b) 关闭 (c) 保留观察。

```bash
gh pr view 17          # 看它当前到底卡在哪
```

---

### P2-4 【说明】单测自己喂凭据（易误解，建议加注释）

`src/sources/__tests__/twitter.test.ts`、`src/sources/__tests__/producthunt.test.ts`、
`src/lib/db/__tests__/e2e-pipeline-twitter.test.ts`、`src/lib/db/__tests__/e2e-pipeline.test.ts` 等，
都在 `beforeEach` 里写死 `process.env.XXX_TOKEN = 'test-token'`。

**这不是 bug**（它们测解析逻辑，需要凭据才能跑到那段代码），但**必须理解其局限**：
这些测试永远在"凭据齐全"的假设下运行，**测不出接线断裂**——
这正是事故潜伏的原因之一：CI 全绿 + 生产零数据，测试通过反而制造了"已覆盖"的假象。

**建议**：加注释说明「接线一致性由 `ci-wiring-contract.test.ts` 把关」，避免后人误以为已覆盖。

---

### P3-1 【提醒用户】X cookie 时效

当前 `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` 已使用 **79 天**（7/3 创建），仍有效。
现在失效会**正确抛错报警**（不再是静默），但建议在管道健康时提前重新登录 x.com 更新，
比突然红了再处理从容。

**此项需用户操作，agent 无法代劳。**

---

### P3-2 【可选·本轮发现】Port 是否纳入多项目运维平面

用户已有 Port，且**已经在里面跑着一个更大的系统**（MultiAgentSystem：4 个 service、
4 个 workload、k8s 集群、112 个 deployment、14 个 scorecard、8 个 workflow、4 个 AI agent）。

用户的定位是：**「Port 只当观察平面，GitHub 仍是唯一事实源」**（已明确表态，不要推翻）。

**当前 Port 里 `githubRepository` 只有 4 个仓库**（`news-monitor` / `MultiAgentSystem` /
`Telegram` / `test11111`），已通过 **GitHub Ocean 集成**自动同步（含 DORA 类指标）。

**若要扩展**，注意两条铁律：

1. **告警链路绝不能经过 Port**。反例：靠「Port 里数据不新鲜」触发告警 —— 一旦抓取全挂，
   Port 实体不更新，automation 不触发，**告警恰好在你最需要它时失效**。
   正确做法：freshness-check 这类**基于 cron 主动检查**的 workflow 直接报警。
2. **Port 的配置本身也要进 Git**（IaC / Terraform provider / `port.yml`），
   否则又是一份漂移的配置 —— 正是本事故链路 1 的病根。

**优先级低，用户没让做，别自作主张动。**

---

## 3. 环境与验证（动手前必读）

### 3.1 命令

```bash
# 类型 + lint
npx tsc --noEmit
npx eslint .            # 注意是 . 不是 src/ scripts/（eslint 9 flat config）

# 单元测试（209 个）
npx vitest run --config vitest.config.mjs

# 集成测试（75 个）—— 需要 PostgreSQL
# 沙盒里用 dbctl（会自动 initdb + 后台起进程）：
dbctl pg start 17 5433
# 若提示 "lock file postmaster.pid already exists"，说明已在跑 —— 直接连即可。

# 已实测可用的连接串（迁移与 75 个测试全通过）：
DATABASE_URL="postgresql://postgres@127.0.0.1:5433/postgres" \
  npx vitest run --config vitest.config.integration.mjs
# 验证连通性：psql -h 127.0.0.1 -p 5433 -U postgres -c "SELECT 1"

# workflow 语法
actionlint
```

### 3.2 ⚠️ 踩坑警示（都是本次会话真实踩过的）

| 坑                           | 现象                                               | 解法                                                                                |
| ---------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **vitest 启动崩**            | `Cannot find module './rolldown-binding.wasi.cjs'` | `npm i -D --no-save @rolldown/binding-linux-x64-gnu@1.2.3`（npm optional deps bug） |
| **`npm i` 后 vitest 又崩**   | 同上                                               | 装任何依赖后都要重新补 binding                                                      |
| **`next build` 被 OOM kill** | `Killed` / exit 137                                | 沙盒只有 ~976MB 内存。**别在本地死磕，靠 CI 的 `build` job 验证**                   |
| **块注释里写 cron**          | 解析报错（`*/6` 提前闭合 `*/`）                    | 注释里别写含 `*/` 的 cron                                                           |
| **Semgrep 拦 path.join**     | `path-join-resolve-traversal` blocking             | **重构而非加 ignore**：去掉函数参数，用硬编码字面量                                 |
| **集成测试改 schema 冲突**   | 并发 worker 互踩                                   | 已有机制：每 worker 独立 schema + `PG_SEARCH_PATH`                                  |

### 3.3 ⚠️ 覆盖率：两个数字都对，但含义不同（别被误导）

| 场景                     | 数字               | 原因                                                                |
| ------------------------ | ------------------ | ------------------------------------------------------------------- |
| 单跑 `vitest --coverage` | `All files 59.72%` | **全量** `src/**`（含 `lib/db` 等低覆盖目录）                       |
| **CI 门槛（真实门槛）**  | **`lines 92.9%`**  | 只统计 `vitest.config.mjs` 的 include/exclude 后剩下的**约 800 行** |

CI 的 `integration` job 里有一步 `Coverage gate (unit ∪ integration ≥ 80%)`，
它合并 unit ∪ integration 后要求 **lines/statements/functions/branches 全 ≥80%**。

`vitest.config.mjs` 的排除项（所以分母小得多）：
`src/**/*.test.ts(x)`、`src/**/db/__tests__/**`、`src/app/components/**`、
`src/app/**/page.tsx`、`src/app/layout.tsx`、`src/app/global-error.tsx`

**结论**：加测试时以 **92.9% 那条线**为准。看到本地 60% 不要慌。

---

## 4. 工作流约束（提 PR 前必读）

- **分支保护**：`main` 要求 4 项 check（`unit` / `integration` / `Semgrep SAST Scan` / `Secret Scanning`），
  且 `enforce_admins=true` —— **不能直接 push main**，必须走 PR。
- **合并方式**：`gh pr merge <N> --squash --delete-branch`
- **陷阱**：`--delete-branch` 会删 base 分支；若有 stacked PR 以它为 base，那些 PR 会**被自动关闭**。
  建议**串行合并**。
- **本地 remote ref 残留**：合并后 `git remote prune origin` 清一下。
- **Semgrep 会拦**：新增代码若含「动态 RegExp」或「路径拼接未校验」会被 blocking。
  **优先重构代码而非加 ignore 注释**（本次已用此原则处理过 2 个 finding，见 3.2 表）。
- **`build` job 不是 required check**（本次发现的缺口）：
  意味着 **PR 可以构建失败却正常合并**。建议加上（但注意 required checks 变更需仓库设置权限）。

---

## 5. 建议的接手顺序

| 顺序 | 项                          | 理由                                                                                   |
| ---- | --------------------------- | -------------------------------------------------------------------------------------- |
| 1    | **P1-6**（Port 告警降噪）   | 唯一「让告警恢复可信」的动作；不改代码，改一个条件。**先做这个，后续工作才有告警兜底** |
| 2    | **P1-3**（ADMIN_TOKEN）     | 需用户决策，可并行发起                                                                 |
| 3    | **P2-3**（清分支 + PR #17） | 纯清理，零风险，摘掉挂 5 周的 PR                                                       |
| 4    | P2-1 / P2-2 / P2-4          | 有空再清理                                                                             |
| 5    | P3-2（Port 扩展）           | 用户没让做，**别自作主张**                                                             |

**当前 P1 代码项已全部完成** —— 剩下的 P1-3 要用户拍板，P1-6 要动 Port 侧配置。

---

## 6. 一句话总结

> 本次事故的本质**不是"有人删错了东西"**，而是：
> **① 把"基础设施契约"与"业务代码"分置两处却无机器校验，
> ② 又把"不可用"伪装成"正常空结果"，③ 最后基于错误前提删掉了唯一的告警。**
>
> 三者缺一，事故都不会这么严重。
> **①② 已修复（#27 / #30）；③ 的通道已存在，但需要降噪（P1-6），否则告警疲劳会重演同一结局。**
