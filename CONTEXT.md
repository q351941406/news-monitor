# News Monitor — 项目上下文

## 项目定位

每日热点新闻监控与领域知识发现。从多个源抓取数据，经 AI 处理生成摘要和主题聚合，在 Web 端展示。

## 核心概念

### RawItem (原始内容)

从外部源抓取的原始数据。包含：标题、URL、来源、原始 JSON 数据。

### AIAnalysis (AI 分析)

对 RawItem 的 AI 摘要和详情。由 AIService 生成。

### TopicGroup (主题聚合)

将相关的 AI 分析结果按主题聚合。包含主题名称、概括、关联的 RawItem 列表。

### NewsSource (数据源)

外部数据源的适配器。实现 fetch() 方法返回 RawItem[]，不写数据库。

### AIService (AI 服务)

LLM 调用的抽象接口。提供 `generateBatchSummary` 和 `generateTopicAggregation` 方法。
