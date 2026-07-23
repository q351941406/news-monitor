# 统一语言 (Ubiquitous Language)

## 核心术语

| 术语       | 定义                         | 别称（禁止）        |
| ---------- | ---------------------------- | ------------------- |
| RawItem    | 从外部源抓取的原始数据条目   | raw data, news item |
| AIAnalysis | AI 对 RawItem 的摘要和详情   | summary, analysis   |
| TopicGroup | 相关的 AI 分析结果按主题聚合 | topic, group        |
| NewsSource | 外部数据源的适配器           | source, scraper     |
| AIService  | LLM 调用的抽象接口           | AI client, LLM      |

## 动作

| 动作      | 含义                          |
| --------- | ----------------------------- |
| fetch     | 从外部源获取原始数据，不写 DB |
| scrape    | 从外部源抓取数据并写入 DB     |
| process   | 调用 AI 生成摘要              |
| aggregate | 将相关条目聚合成主题组        |
