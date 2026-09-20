# 抓取管道静默故障 — 复盘与遗留 TODO

> 本文档记录 2026-09-18 排查「Product Hunt 断流 47 天、X 断流 57 天且零告警」的完整根因，
> 以及已完成的修复与剩余待办。**供 AI / 维护者接手时查阅。**
>
> 更新日期：2026-09-18
> 验证基线：`main @ 6c0b013`（单测 173 passed / 集成 75 passed / tsc + eslint 干净）

## 文档导航

- 第 0 节：**根因复盘**（三段独立失效如何叠加成静默故障）— 先读这段
- 第 1 节：**已完成**（3 个 PR，含新增文件与设计约定）
- 第 2 节：**遗留 TODO**（P1 需尽快 / P2 清理 / P3 提醒用户）
- 第 3–4 节：验证方式与工作流约束（改完必读）
- 第 5–6 节：建议接手顺序与总结

---

## 0. 背景：本次事故的完整根因链（先读这段）

**症状**：生产环境 Product Hunt 断流 47 天、X/Twitter 断流 57 天，全程 workflow 绿色、零告警、无人察觉。

**根因不是「有人删错了东西」，而是三段独立失效叠加成一个完美的静默故障：**

### 链路 1 — 跨文件契约断裂（代码依赖 vs CI 配置分置两处，无机器校验）

两次**看起来都极其合理**的重构，先后剪断了契约：

| 提交      | 表面意图                            | 实际副作用                                                                                                    |
| --------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `a7795e9` | 建测试基础设施，"顺手清理" workflow | 删掉 `pip install twitter-cli`，但 `src/sources/twitter.ts:171` 仍 `execSync('twitter feed --max 50 --yaml')` |
| `2dce843` | P0 安全加固，收窄 secret 暴露面     | 删掉 `PRODUCTHUNT_TOKEN` / `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` 注入，但源码仍硬依赖                          |

契约两半分属 `.ts` 和 `.yml`，review 时在同一个 diff 里看不出矛盾——**矛盾在 diff 与"未被改动的源码"之间**。

### 链路 2 — 软失败把「不可用」伪装成「正常但没数据」

源码在凭据/CLI 缺失时 `console.log('⚠️ not configured, skipping')` + `return []`：

```
软失败 → withRunLog 记 status:'success', itemsCount:0 → scrape.ts exit 0
       → workflow 绿灯 → auto-retry 不触发 → Sentry 的 if: failure() 永不执行
```

### 链路 3 — 唯一的主动告警被删除（基于错误前提）

`0b59cec`（8/3）删除 Discord 失败通知，commit message 理由是 **"dashboard covers monitoring"**。
但下面的 TODO P1-1 会说明：那个 dashboard 告警**在数学上永不可能触发**。
**基于错误前提移除了唯一的主动告警渠道**，此后 47 天彻底失明。

### 附：为什么 dashboard 告警永不触发（已用真实数据证明）

原 `detectSilentFailures` 用**次数**维度判据「连续 3 次同源同阶段 0 条」，但读取的是
`getRecentRuns(30)` 这个**全局**窗口——实测仅覆盖 **1.7 天**（PH 每天 4 次 + X 每天 1 次，
再乘 3 个 stage，30 条很快被稀释）。

```
窗口内 X:scrape 记录数 = 1     ← 需要连续 3 条
X 断流期间 dashboard 告警数 = 0
```

X 每天只抓 1 次，窗口内**永远凑不齐 3 条**——告警在数学上不可能触发。
**高频源（PH）反而会误报**（窗口内能凑够），所以这个判据既漏报又误报。

---

## 1. 已完成（无需重做，仅作背景）

| PR  | commit    | 内容                                                                                                                               |
| --- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| #24 | `5ff579a` | 恢复凭据注入 + `twitter-cli` 安装；生产实跑验证 PH `Fetched 10`、X `Parsed 41→Stored 12`                                           |
| #27 | `f0e0872` | ① 消灭软失败（凭据/CLI 缺失→抛错）② CI 接线契约测试 ③ 时间维度新鲜度告警                                                           |
| #28 | `6c0b013` | 新鲜度告警接入 dashboard（双通道）                                                                                                 |
| #30 | `6b87ddb` | 消除三处「绿着断流」：① 抓取 0 条→报错（P1-1）② settings cron 改从 workflow 解析（P1-2）③ `twitter-cli` 输出改 `yaml` 解析（P1-4） |

**新增文件（后续工作会用到）**：

- `src/sources/credentials.ts` — 凭据契约集中声明（`SOURCE_CREDENTIALS` / `assertSourceCredentials` / `requiredSecretsFor`）
- `src/lib/freshness.ts` — 时间维度新鲜度检测（`detectStaleSources` / `FRESHNESS_TOLERANCE_MS`）
- `src/lib/__tests__/ci-wiring-contract.test.ts` — 契约测试（已反向验证能拦住 `a7795e9` 与 `2dce843`）
- `.github/workflows/freshness-check.yml` + `scripts/check-freshness.ts` — 每日 3 次主动巡检
- `src/lib/scrape-guard.ts` — 抓取非空断言（`assertNonEmptyFetch` / `shouldFailOnEmptyFetch`）
- `src/lib/schedules.ts` — cron 从 workflow 解析（构建期快照 `BUILD_TIME_SCHEDULES`）
- `src/sources/__tests__/fixtures/twitter-cli-0.8.5-*.yaml` — **真实 CLI 生成**的 0.8.5 输出 fixture

**关键设计约定（新增代码请遵循）**：

- 凭据缺失 = **配置故障**，必须抛错让 run 红掉；确需跳过须显式设 `SKIP_SOURCE_<SOURCE>=1`
- 新增数据源/凭据**只改 `src/sources/credentials.ts`**，运行时与契约测试同时生效

---

## 2. 遗留 TODO

### P1-1 【重要】补上「凭据齐全却 0 条」断言（防线缺口）

> ✅ **已解决（#30）**。实现为 `src/lib/scrape-guard.ts::assertNonEmptyFetch`，
> 判据分层：解析层（CLI 输出异常）/ 源层（执行失败）/ 兜底层（返回 0 条）。
> 2026-09-20 生产实证：X 源 9/9–9/18 连续 10 天 `Fetched 0` 而 run 全绿，
> 修复后恢复 `Fetched 19-20`。

**问题**：已实现的 fail-fast 只覆盖「凭据缺失」。但**凭据齐全、API 正常返回 0 条**时，
`scripts/scrape.ts` 仍记 `success`：

```ts
const items = await source.fetch()
console.log(`  ✅ Fetched ${items.length} items`)
const stored = await storeRawItems(items) // stored 可能为 0
return { itemsCount: stored }
```

这不一定是故障（可能只是没有新内容），但**连续 0 条**就是。目前只能靠新鲜度巡检
（最长 48h 延迟）发现，反馈太慢。

**建议做法**：参考既有范式 `scripts/ai-process.ts` 的 `shouldFailRun`
（commit `ee8be4f`，注释里写着"线上曾发生 AI 全线失败近 20 天而 workflow 一直绿"）——
项目已有正确先例，**对齐它即可**。注意区分「首次抓取为空」与「连续 N 次为空」。

**验收**：构造连续 0 条场景 → run 必须失败 → 单测覆盖。

**文件**：`scripts/scrape.ts`

---

### P1-2 【Bug】settings 页 cron 文案与实际不符（会误导用户）

> ✅ **已解决（#30）**。cron 改为从 `.github/workflows/*.yml` 解析，
> 页面与契约测试共用 `getWorkflowSchedules()`（构建期快照），抄错即红。

`src/app/settings/page.tsx` 的 `schedules` 数组**硬编码了错误的 cron**：

| 源              | settings 页写的           | workflow 实际                   | 差异        |
| --------------- | ------------------------- | ------------------------------- | ----------- |
| GitHub Trending | `0 13 * * *`              | `0 13 * * *`                    | ✅ 一致     |
| X / Twitter     | `0 * * * *`（每小时整点） | `30 3 * * *`（**每天 1 次**）   | ❌ 差 24 倍 |
| Product Hunt    | `0 * * * *`（每小时整点） | `30 */6 * * *`（**每 6 小时**） | ❌ 差 6 倍  |

页面底部还有一句 `<code>0 * * * *</code> = 每小时整点` 的示例说明。

**风险**：用户以为每小时都在抓，实际每天/每 6 小时一次；排查时会被严重误导。

**建议**：从 workflow 文件解析 cron（单一事实来源），或至少改为正确值 + 加测试断言与
workflow 一致（可复用 `ci-wiring-contract.test.ts` 的思路）。

**文件**：`src/app/settings/page.tsx`

---

### P1-3 【配置】`ADMIN_TOKEN` 在 GitHub 侧不存在

**现状**：三个 scrape workflow 都写 `ADMIN_TOKEN: ${{ secrets.ADMIN_TOKEN }}`，
但 **GitHub secrets 里没有这个 secret**（`gh secret list` 可验证）→ 解析为空字符串 →
`revalidateCacheAfterRun` 判定"未配置"→ 静默跳过。

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

**待决策（需问用户）**：

- (a) 生成新值并同时写入 GitHub secret + Vercel env（会**使现有浏览器登录失效**，须重新登录）
- (b) 用户提供现有值（他可能不知道）
- (c) 暂时不管（影响小，但确认文案要说清）

**注意**：轮换前先确认没有别处硬编码该 token。

---

### P1-4 【隐患】`parseYamlTweets` 是手写行解析器（定时炸弹）

> ✅ **已解决（#30）**。改用 `yaml` 库 + 显式识别 `ok: false` 失败包装；
> fixture 由真实 `twitter-cli` 0.8.5 生成（非手抄），并保留旧扁平格式兼容。

**位置**：`src/sources/twitter.ts:53` `function parseYamlTweets()`

**问题**：手写逐行解析，对齐的是 twitter-cli 的**旧扁平格式**（单测 fixture 也是旧格式）。
但 twitter-cli 0.8.5 的结构化输出是 `ok:` / `schema_version:` / `data:` 包装，字段也变成了
`author.name` / `metrics.likes`。

**实测结果**（已在本机跑过）：

```
旧格式(单测fixture)  → 解析 1 条 ✅
0.8.5 真实成功格式   → 解析 1 条（靠字段名巧合，侥幸）
0.8.5 失败格式       → 解析 0 条（静默）
```

CLI 下次改缩进或字段名 → **静默变 0**，又是一次"绿着断"。当前 `twitter-cli==0.8.5`
已锁版本（`action.yml`），但这只是把风险推后。

**建议**：改用 `yaml` 库正经解析 + 解析结果为空时抛错。
**注意**：仓库当前**没有** yaml 依赖（`dependencies` 和 `devDependencies` 均无），需新增。

**验收**：用 0.8.5 真实格式（含 `ok`/`data` 包装）的单测覆盖；空结果必须抛错。

**文件**：`src/sources/twitter.ts`、`package.json`

---

### P1-5 【功能】接通知渠道 —— ✅ 实际已存在，见下方说明

**现状**：全仓**已无任何通知渠道代码**（Discord/Telegram 均被 `0b59cec` 移除）。
当前唯一告警出口是 **workflow 变红 + Sentry**（`if: failure()` → `@sentry/cli send-event`）。

**缺口**：这依赖用户会看 GitHub 通知邮件/Sentry。用户希望接到**通知 API**（他说"你先搞完其他的，到时候我再给你"）。

**待用户提供**：webhook URL 或 接口 + 鉴权方式。

**接入点**（都已有 `if: failure()` 步骤，加一步即可）：

- `.github/actions/scrape-pipeline/action.yml`
- `.github/workflows/freshness-check.yml`（巡检失败 = 断流，最该推送）
- `.github/workflows/scrape-{github,producthunt,twitter}.yml`
- `.github/workflows/reaggregate.yml`

**历史实现可参考**（`git show 0b59cec^:.github/actions/scrape-pipeline/action.yml`）：

```yaml
- name: Notify on failure
  if: failure()
  run: |
    curl -sf -X POST "$WEBHOOK" -H "Content-Type: application/json" \
      -d "{\"content\": \"🚨 ${WORKFLOW_NAME} scrape failed\n${SERVER_URL}/${REPO}/actions/runs/${RUN_ID}\"}" \
      || echo "webhook failed (non-fatal)"   # 注意：非致命，避免告警本身拖垮流程
```

---

### P1-6 【重要·本轮新发现】现有 Port 告警通道「成功也推送」→ 告警疲劳

**2026-09-20 实测发现**：用户已有可用的通知链路（无需新建）：

```
githubWorkflowRun 实体更新
  → Port automation `notify_deploy_result`
  → POST https://notify.holomer.space/bark
  → Bark (iOS)
```

白名单已含 `news-monitor`（2026-09-02 建），**所以 P1-5 的「接通知渠道」实际上已完成**。

**但它的触发条件有问题**（`_workflow` 实体 `notify_deploy_result` 实测条件）：

```jq
.diff.after.properties.conclusion != null
and ((.diff.after.identifier | startswith("q351941406/MultiAgentSystem"))
     or (.diff.after.identifier | startswith("q351941406/news-monitor")))
and (.diff.before.properties.conclusion != .diff.after.properties.conclusion
     or .diff.before.properties.status != .diff.after.properties.status)
```

**只过滤「conclusion 是否变化」，不区分成功/失败** → 每成功一次也推一条。

**实测推送量**（`githubWorkflowRun` 实体按日聚合）：

| 日期      | news-monitor runs |
| --------- | ----------------- |
| 9/09–9/12 | 6/天              |
| 9/13      | 31                |
| 9/18      | 33                |
| 9/19      | 15                |
| 9/20      | 17                |

→ **每天 6–17 条推送，绝大部分是「成功」**。

**为什么这是真问题（而非「忍一忍」）**：告警疲劳会把用户推回原始事故 ——
**用户 mute 通知 → 真故障再次静默**。这与本次复盘的核心教训（唯一告警渠道被删）同源。

**建议改法**（需用户决策，改的是 Port 侧而非本仓库）：

1. 只推失败：条件加 `and .diff.after.properties.conclusion == "failure"`
2. 或维持全推但降噪：成功静默、失败推送、**恢复时推一条 ✅**（需 Port 侧存状态）
3. 或分级：`failure` 立即推；`cancelled` / `success` 不推

**注意**：该项在 Port 侧配置，本仓库 CI 无法校验 → 若采纳，应考虑把条件纳入文档或契约测试的观察范围。

---

### P2-1 【文档】`docs/ops/uptime-monitoring.md` 未反映新增巡检

该文档的「告警覆盖与取舍」表格**未提及** `freshness-check.yml`。同时它的核心结论仍值得保留
（`/api/health` 默认不查库是为了 Neon scale-to-zero 省额度，**不要**改成每次查库！）。

**建议**：补一节说明新鲜度巡检覆盖「管道级故障」（站点活着但数据断流），
与现有 liveness 监控形成互补。可顺带参考 `docs/ops/` 下其它文档的风格。

---

### P2-2 【清理】孤儿 secrets

以下 GitHub secrets **存在但代码/workflow 零引用**（已逐个 grep 验证）：

- `RSSHUB_URL`、`ADMIN_GITHUB_TOKEN`
- `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL`（AI 已迁移到 OpenAI 兼容协议的 `AI_*`）

**建议**：确认无历史用途后清理。清理前务必再 grep 一次（含 git 历史）。

---

### P2-3 【清理】陈旧分支

5 个未合并分支，最后 push 时间 8/16–8/24，需判断去留：

```
feat/e2e-playwright       2026-08-16
feat/favicon              2026-08-16
fix/csp-inline-scripts    2026-08-16
fix/sentry-errors         2026-08-16
fix/readme-truncate       2026-08-24
```

**建议**：逐个确认是否已被 main 以其它形式包含；无用则删除。

---

### P2-4 【说明】单测自己喂凭据（易误解，建议加注释）

`src/sources/__tests__/twitter.test.ts:50`、`producthunt.test.ts:46`、
`e2e-pipeline-twitter.test.ts:52`、`e2e-pipeline.test.ts:152` 等，都在 `beforeEach`
里写死 `process.env.XXX_TOKEN = 'test-token'`。

**这不是 bug**（它们测解析逻辑，需要凭据才能跑到那段代码），但**必须理解其局限**：
这些测试永远在"凭据齐全"的假设下运行，**测不出接线断裂**——
这正是事故潜伏的原因之一：CI 全绿 + 生产零数据，测试通过反而制造了"已覆盖"的假象。

**建议**：加注释说明「接线一致性由 `ci-wiring-contract.test.ts` 把关」，避免后人误以为已覆盖。

---

### P3-1 【提醒用户】X cookie 时效

当前 `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` 已使用 **77 天**（7/3 创建），**仍有效**（本次实跑验证
`Parsed 41 → Stored 12`）。现在失效会**正确抛错报警**（不再是静默），但建议在管道健康时
提前重新登录 x.com 更新，比突然红了再处理从容。

**此项需用户操作，agent 无法代劳。**

---

## 3. 验证方式（改完必须跑）

```bash
# 类型 + lint
npx tsc --noEmit
npx eslint src/ scripts/

# 单元测试（约 173 个）
npx vitest run

# 集成测试（约 75 个）—— 需要 PostgreSQL
# 本地无 pg 时用沙盒: apt-get install -y postgresql-16
#   su postgres -c "initdb -D /tmp/pgdata -A trust"
#   su postgres -c "pg_ctl -D /tmp/pgdata -o '-p 5433' start"
#   psql -p 5433 -c "CREATE USER test WITH PASSWORD 'test' SUPERUSER; CREATE DATABASE news_monitor_test OWNER test;"
DATABASE_URL="postgresql://test:test@localhost:5433/news_monitor_test" \
  npx vitest run --config vitest.config.integration.mjs

# CI workflow 语法
actionlint                      # 需自行安装: rhysd/actionlint releases
```

**注意沙盒架构**：本环境是 `aarch64`，下载 actionlint 要选 `linux_arm64` 包。

---

## 4. 工作流约束（重要，避免踩坑）

- **分支保护**：`main` 要求 4 项 check 通过（`unit` / `integration` / `Semgrep SAST Scan` / `Secret Scanning`），
  且 `enforce_admins=true` —— **不能直接 push main**，必须走 PR。
- **合并方式**：`gh pr merge <N> --squash --delete-branch`
- **陷阱**：`--delete-branch` 会删除 base 分支；若有 stacked PR 以它为 base，那些 PR 会**被自动关闭**。
  建议**串行合并**，或确认无 stack 后再删分支。
- **Semgrep 会拦**：新增测试代码若含「动态 RegExp」或「路径拼接未校验」会被 blocking。
  **优先重构代码而非加 ignore 注释**（本次已用此原则处理过 2 个 finding）。
- **CodeQL / gitleaks / Dependency Review** 也在跑，注意别引入明文密钥。

---

## 5. 建议的接手顺序

1. **先问用户拿通知 API**（P1-5）→ 立刻接上，让后续所有工作都有告警兜底
2. **P1-2**（settings cron 文案）→ 改动小、纯 bug、用户可感知
3. **P1-4**（解析器加固）→ 拆掉最可能复发的定时炸弹
4. **P1-1**（0 条断言）→ 补齐防线最后一块
5. **P1-3**（ADMIN_TOKEN）→ 需用户决策，可并行
6. P2/P3 → 有空再清理

---

## 6. 一句话总结

> 本次事故的本质**不是"有人删错了东西"**，而是：
> **① 把"基础设施契约"与"业务代码"分置两处却无机器校验，
> ② 又把"不可用"伪装成"正常空结果"，③ 最后基于错误前提删掉了唯一的告警。**
>
> 三者缺一，事故都不会这么严重。已完成的修复针对 ①②，③ 需要通知渠道（P1-5）。
