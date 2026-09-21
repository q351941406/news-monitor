# 管理员鉴权与防暴力破解

> 本文档记录 `ADMIN_TOKEN` 的取值决策、分层防御设计与已验证行为。
> 起因：用户报告「任意输入值都能点解锁按钮并把新闻标记已读」。

## 一、原 bug 复盘（2026-09-21 修复）

用户观察到的现象**部分真实，但根因与表象不同**，值得记录以免误判。

### 后端一直是安全的

实测（对生产环境发错误 token）：

```bash
curl -X POST https://news.myaicode.qzz.io/api/news \
  -H 'x-admin-token: 随便输入的错误值' -d '{"action":"read","itemId":"x"}'
# → HTTP 403 {"error":"Forbidden: admin token required"}
```

逐个核对全部 10 个 API 路由，**没有任何写接口漏掉鉴权**：

| 路由                             | 方法   | 鉴权             |
| -------------------------------- | ------ | ---------------- |
| `/api/news`                      | POST   | ✅               |
| `/api/archive`                   | POST   | ✅               |
| `/api/admin/revalidate`          | POST   | ✅               |
| `/api/admin/metrics`             | GET    | ✅               |
| health / items / counts / topics | 纯 GET | 公开（设计如此） |

**结论：数据库里从未发生过未授权写入。**

### 真正的 bug 在前端「假成功」

三处缺陷叠加，制造出「操作成功」的假象：

1. **`HomeView.handleLogin` 无条件置位管理员态**

   ```js
   setAdminToken(token)
   setIsAdmin(true) // ← 先于校验执行
   adminFetch('/api/admin/metrics').catch(() => {}) // ← 结果被完全丢弃
   ```

   `fetch` 对 403 是 **resolve 而非 reject**，所以 `.catch()` 永不触发 —— 校验形同虚设。

2. **写操作不检查 `res.ok`，失败仍做乐观更新**
   `handleMarkRead` 等 5 处 `await adminFetch(...)` 后直接 `setGroupItems({ isRead: true })`，
   不看响应就改本地状态 → 条目变灰、未读数 `-1`，**刷新即还原**。

3. **`Header.tsx` 的错误提示是死代码**
   `const [error, setError] = useState(false)`，全文只有 `setError(false)`，
   **从未调用 `setError(true)`** → 「Token 错误，请重试」永远不会显示。

补充 bug：**`ArchiveView` 的登录校验用裸 `fetch`**，未携带 `x-admin-token` header
→ 后端必然 403 → 归档页**永远无法登录成功**。

### 危害

不是数据篡改（后端拦住了），而是**假成功掩盖了 token 配置错误**：
用户以为登录成功，从而永远不会发现 `ADMIN_TOKEN` 有问题 —— 这也解释了
P1-3「用户从没进过 dashboard」的谜团。

## 二、Token 取值决策（用户知情接受风险）

用户明确选择了一个**弱口令**（连续数字，属暴力破解字典首批条目），已知悉风险。
具体值**不记录在本文档**中 —— 本仓库是公开仓库，写入即等于公开管理员密码。

> ⚠️ **该值不写入本仓库任何被追踪的文件。** 仓库是公开的，写入即等于
> 向全世界公布管理员密码。运行时由 Vercel 环境变量提供，本地放 `.env.local`。

### 诚实记录：这个取值让限流价值大幅降低

| 组合                | 效果                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------- |
| 强 token + 限流     | ✅ 有效：猜不中 + 拖死穷举                                                               |
| **弱 token + 限流** | ⚠️ **限流几乎无用**：弱口令是暴力破解字典的第一条，**一次命中**，根本不会触发第 5 次锁定 |

限流在此配置下**只剩一个真实作用**：

- 阻止**持续穷举**（攻击者不知道值、只是盲试时，拖住高频尝试）

**它不限制已认证请求的速率** —— 鉴权成功即清零计数（刻意如此，避免误伤正常的
批量操作）。若将来需要限制已认证请求的频率，需另加一层配额，**不要指望本模块**。

## 三、分层防御设计

```
请求 → middleware.ts（Edge）          ① 限流短路  ② token 校验
                                    ↓ 失败尝试在此终止，不消耗函数与数据库
     → route handler（Node）          ③ 独立再校验一次（纵深防御）
```

### 为什么限流放 middleware

middleware 跑在 **Edge 运行时，不触碰数据库**。失败尝试在这里被挡掉，
Neon compute 完全不会被唤醒。

> 这是本项目的历史教训：`/api/health` 曾因每次探活都 `SELECT 1`，
> 导致 Neon compute 额度**超额 62%**。限流若每次失败都写库，等于
> 给攻击者一个「烧你数据库账单」的按钮。因此限流器**纯内存、零 I/O**。

### 校验算法只有一份实现

`src/lib/admin-token-verify.ts` 被 Node（`admin-auth.ts`）与
Edge（`middleware.ts`）共用。本仓库曾因「同一契约分置两处却无机器校验」
导致 Product Hunt 断流 47 天，因此刻意杜绝两侧算法漂移。

安全细节：

- SHA-256 归一化为等长摘要 → 不泄露 token 长度
- 逐字节 XOR 累加、**无提前返回** → 不泄露「前几位猜对了」
- `expected` 为空 → fail-closed（未配置 = 拒绝一切写操作）

## 四、限流参数

| 参数             | 值      | 说明                       |
| ---------------- | ------- | -------------------------- |
| `maxFailures`    | 5       | 窗口内失败次数上限         |
| `windowMs`       | 15 分钟 | 滑动窗口长度               |
| `blockMs`        | 15 分钟 | 触发后封禁时长             |
| `maxTrackedKeys` | 10 000  | Map 上限，防止内存无限增长 |

- 判定顺序：**先查限流 → 再验 token**。顺序反了会让已封禁的请求仍执行一次昂贵的摘要计算。
- 鉴权**成功即清零**该 IP 的失败记录（偶发输错不会累积成封禁）。
- 封禁按 IP 隔离，不误伤他人。

### IP 来源与防伪造

提取顺序（可信度从高到低）：

1. `x-vercel-forwarded-for` —— Vercel 自己设置，**上游代理无法覆盖**
2. `x-real-ip` / `x-forwarded-for` —— Vercel 文档明确说明会**覆盖**这两个头
   以防 IP 伪造（[Request headers](https://vercel.com/docs/headers/request-headers)），
   因此客户端无法自造 IP 绕过限流。但在 Vercel 前面另挂代理时可能被改写。
3. `unknown` —— 兜底，所有来源不明的请求共用一个桶（宁可误伤也不放空）

### 已知局限（诚实记录）

serverless 多实例之间**不共享**计数。攻击者若被轮转到不同实例，实际尝试次数会
高于 5 次。对个人站点足够；若需全局精确限流，应换成边缘 KV / Redis（需评估成本）。

## 五、真实运行时验证（2026-09-21）

`next dev` + `.env.local`，Chromium 无关，纯 HTTP：

```bash
B=http://localhost:3111
# 限流：单请求连续错误 token（阈值 5）
for i in 1 2 3 4 5 6; do
  curl -s -D /tmp/h.txt -o /dev/null -X POST $B/api/news \
    -H 'Content-Type: application/json' -H 'x-real-ip: 3.3.3.3' \
    -H "x-admin-token: bad$i" -d '{}'
  head -1 /tmp/h.txt | awk '{print $2}'      # 403 403 403 403 429 429
done
```

实测结果：

| 场景                                    | 结果                            |
| --------------------------------------- | ------------------------------- |
| 错误 token × 4                          | 403（未封禁）                   |
| 第 5 次错误                             | **429** + `Retry-After: 900`    |
| 封禁后再提交**正确** token              | **429**（防暴力破解核心行为）✅ |
| 另一 IP + 正确 token                    | 放行（未误伤）✅                |
| 错误 4 次 → 正确 → 再错 4 次            | 仍 403（成功已清零计数）✅      |
| 公开 `GET /api/news`、`GET /api/health` | 不受影响 ✅                     |
| `GET /api/admin/metrics` 无 token       | 403 ✅                          |

> 本地无数据库，故通过鉴权后返回 500 `ECONNREFUSED` ——
> 「500 而非 403」本身就是「鉴权已通过」的证据。

## 六、运维：如何轮换 token

1. Vercel → Project `news` → Settings → Environment Variables → 编辑 `ADMIN_TOKEN`
   （production + preview。注意 type=`sensitive`，**保存后读不到明文**，轮换即覆盖）
2. GitHub → repo → Settings → Secrets → `ADMIN_TOKEN`（供 scrape workflow 调
   `/api/admin/revalidate`，见 P1-3）
3. 本地 `.env.local` 同步一份
4. 页面重新登录（旧 token 立即失效，前端写操作收到 403 会自动回退访客态）

> 生成强 token：`openssl rand -hex 24`
