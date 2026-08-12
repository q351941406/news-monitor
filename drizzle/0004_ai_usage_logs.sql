-- AI 调用用量记录：token / 耗时 / 成败，供运维仪表盘聚合展示
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  attempts BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 按时间聚合（仪表盘今日/近7天趋势）
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs(created_at);
-- 按操作分布
CREATE INDEX IF NOT EXISTS idx_ai_usage_operation ON ai_usage_logs(operation);
