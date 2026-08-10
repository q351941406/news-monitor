# News Monitor · SEO 与「让更多人看到」方案

> 目标：**不接广告**，通过搜索引擎自然收录 + 低成本渠道让产品被更多人发现。
> 定位：个人向的 AI 热点新闻聚合工具，非商业化产品。

---

## 一、SEO 技术改造（已完成 · commit bbd7b7e）

改造前：首页纯客户端渲染，Googlebot 抓到的正文只有「加载中...」，内容 0 收录。

| 事项               | 状态 | 说明                                                                              |
| ------------------ | ---- | --------------------------------------------------------------------------------- |
| 首页 SSR           | ✅   | `page.tsx` 改为 Server Component，服务端预取主题组 + 计数，爬虫无需 JS 即可见内容 |
| 动态 sitemap       | ✅   | `/sitemap.xml` 包含首页 + 全部主题详情页 URL                                      |
| robots.txt         | ✅   | `/robots.txt` 允许全部爬虫，声明 sitemap 位置                                     |
| 独立主题详情页     | ✅   | `/topic/[id]` ISR 页面（每小时重建），每主题一个可收录 URL                        |
| JSON-LD 结构化数据 | ✅   | 主题页内嵌 `BreadcrumbList` + `ItemList` schema                                   |
| OG / Twitter Card  | ✅   | `layout.tsx` 补全 metadataBase、OG、Twitter、keywords                             |
| 站内链接           | ✅   | 首页主题标题链到详情页，形成内链结构                                              |

验证命令（部署后）：

```bash
# 爬虫视角检查首页正文是否含真实内容
curl -s -A "Googlebot" https://news.myaicode.qzz.io/ | grep -o "主题名或实际新闻标题"
# sitemap 可访问
curl -s https://news.myaicode.qzz.io/sitemap.xml
```

---

## 二、SEO 上线待办（必须做，一次性 30 分钟）

1. **Google Search Console**
   - 打开 https://search.google.com/search-console → 添加资源（域名方式 `myaicode.qzz.io`）
   - DNS 验证（Cloudflare 添加 TXT 记录）→ 提交 `sitemap.xml`
   - 首页 →「网址检查」→ 请求编入索引
2. **Bing Webmaster Tools**（免费，覆盖 Bing 并顺带 Yahoo）
   - 打开 https://www.bing.com/webmasters → 可直接从 GSC 导入
   - 提交同一 sitemap
3. **验证结构化数据**：https://search.google.com/test/rich-results 粘贴主题页 URL
4. **检查 robots.txt 未被 Cloudflare 覆盖**（当前线上 robots.txt 是 Cloudflare 的默认内容信号模板，部署后确认返回的是 Next.js 生成的版本）

---

## 三、产品定位（positioning-ideas 框架）

### 竞品格局

| 竞品             | 定位角度            | 留下的缺口                         |
| ---------------- | ------------------- | ---------------------------------- |
| Hacker News      | 开发者 UGC 链接聚合 | 无 AI 摘要、无跨源主题聚合、纯英文 |
| 即刻/今日热榜类  | 泛资讯榜单          | 无深度聚合、无「领域知识」视角     |
| Feedly / RSS     | 订阅制阅读器        | 需自建订阅源，冷启动成本高         |
| Google News      | 海量新闻聚合        | 无 GitHub/Product Hunt 开发者信号  |
| Z.ai / AI 日报号 | 人工精选            | 无自动化、无多源交叉               |

### 推荐定位（3 选 1 主推）

**A. 面向中文开发者的 AI 每日热点**（主推）

> 定位句：News Monitor 是**唯一面向中文开发者的 AI 自动聚合工具**，把 GitHub 趋势、Product Hunt 新品、X/Twitter 热点**每天自动提炼成主题**，让你 5 分钟掌握行业脉搏。
> 依据：竞品要么英文、要么无 AI 摘要、要么无跨源聚合。中文开发者 + 多源 AI 聚合 = 空位。
> 支撑信息：多源采集、AI 摘要、每日更新、免费无广告。

**B. 开源情报 / 技术雷达**

> 定位句：不追热搜，只追**值得跟进的技术信号**。
> 适合长期内容 SEO：把每日主题沉淀为「本周值得关注」的技术雷达内容。

**C. 个人开发者作品集**

> 定位句：一个展示 AI 工程能力的**作品集**（Next.js + AI + 全自动流水线）。
> 适合个人品牌，SEO 关键词换成「AI 新闻聚合开源 / 自建」。

---

## 四、GTM 策略（gtm-strategy 框架 · 零预算）

### 核心原则

**SEO 是长线基本盘，社区是短线杠杆。** 不接广告，用「内容 × 社区 × 开源」三件套。

### 渠道与动作

| 渠道                   | 动作                                                            | 优先级 | 预期效果                                   |
| ---------------------- | --------------------------------------------------------------- | ------ | ------------------------------------------ |
| **搜索引擎（基本盘）** | 提交 sitemap、等待收录；持续产出主题页                          | 🔴 P0  | 3-6 个月后长尾词自然流量                   |
| **GitHub**             | 仓库开源化：README 加「在线体验」链接 + Star 引导；发布 Release | 🔴 P0  | 开发者 SEO：`news monitor github` 类关键词 |
| **Product Hunt**       | 发起产品（Launch），配一段定位句 A 的英文版                     | 🟡 P1  | 发布日流量 + 外链（提高域名权重）          |
| **Hacker News**        | Show HN 帖（英文，面向开发者）                                  | 🟡 P1  | 高权重外链 + 开发者关注                    |
| **即刻 / V2EX / 掘金** | 发帖介绍，附链接；每周在掘金发一篇「本周技术热点」引用自家页面  | 🟡 P1  | 中文开发者触达 + 外链                      |
| **SEO 内容联动**       | 每主题页都带「查看原文」外链，天然外链源                        | 🟢 P2  | 提升内容价值，降低跳出                     |
| **自动化外链**         | 数据源（GitHub 仓库 README 等）反链                             | 🟢 P2  | 权重积累                                   |

### 上线文案（可直接用）

- **一句话**：`AI 自动聚合 GitHub / Product Hunt / X 热点，每天帮你发现值得关注的技术信号。`
- **SEO 标题**：`News Monitor - AI 每日热点新闻聚合 | GitHub Trending · Product Hunt · X`
- **README 第一屏**：产品截图 + 在线链接 + 一行定位句 + Star 引导

### 指标（不接广告，只看增长漏斗）

| 阶段 | 指标          | 目标                 |
| ---- | ------------- | -------------------- |
| 收录 | GSC 收录页数  | 首月 ≥ 50 页         |
| 访问 | 自然搜索 UV   | 首月 1000；季度 5000 |
| 留存 | 回访用户 / 周 | ≥ 20%                |
| 传播 | 外链数 / 周   | ≥ 1                  |

### 90 天路线图

- **Day 1-3**：部署验证 SSR → 提交 GSC + Bing → 确认收录
- **Day 3-7**：README 完善 + GitHub Release v1.0 → 发布 Product Hunt / Show HN
- **Week 2-4**：中文社区（即刻/V2EX/掘金）发帖 × 3；观察 GSC 收录与 404
- **Week 5-12**：每周维护（检查抓取错误、补充主题页内容密度）；跟进收录增长

---

## 五、风险与注意

| 风险                   | 应对                                                   |
| ---------------------- | ------------------------------------------------------ |
| 内容重复/低质量被降权  | 主题摘要 AI 生成，保持每页有独立 summary；控制同义主题 |
| sitemap 过大           | 主题数增长后按 source 分片（当前规模无虞）             |
| 抓取频率过高           | robots 里已允许；Vercel + CDN 可扛                     |
| Cloudflare robots 覆盖 | 部署后必须验证 `/robots.txt` 返回内容                  |

---

_生成工具：pm-skills（positioning-ideas / gtm-strategy）+ 技术团队手工验证_
