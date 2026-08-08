-- 主题聚合队列字段：记录每条数据是否已被主题聚合消费（NULL = 未聚合）
ALTER TABLE raw_items ADD COLUMN IF NOT EXISTS aggregated_at TIMESTAMPTZ;
-- 队列消费查询索引（按 source 找未聚合数据）
CREATE INDEX IF NOT EXISTS idx_raw_items_aggregated ON raw_items(source, aggregated_at);
