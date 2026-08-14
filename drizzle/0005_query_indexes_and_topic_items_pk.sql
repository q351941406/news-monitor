-- 查询性能索引 + topic_items 主键约束
-- 对齐测试环境 schema（db-test-helper），消除生产/测试漂移
-- 首页高频查询：WHERE source=? AND is_read=false ORDER BY fetched_at DESC LIMIT 50
CREATE INDEX IF NOT EXISTS idx_raw_items_source_read_fetched
  ON raw_items(source, is_read, fetched_at DESC);
--> statement-breakpoint
-- 归档页查询：WHERE is_read=true [AND source=?] ORDER BY fetched_at DESC
CREATE INDEX IF NOT EXISTS idx_raw_items_read_fetched
  ON raw_items(is_read, fetched_at DESC);
--> statement-breakpoint
-- run_logs 仪表盘查询（测试环境已有，补齐生产）
CREATE INDEX IF NOT EXISTS idx_run_logs_started_at
  ON run_logs(started_at DESC);
--> statement-breakpoint
-- topic_items 加主键前先清理：删除完全重复的行（保留每组 ctid 最小的那行）
DELETE FROM topic_items a
USING topic_items b
WHERE a.topic_id = b.topic_id
  AND a.item_id = b.item_id
  AND a.ctid < b.ctid;
--> statement-breakpoint
-- 删除 NULL 关联行（主键隐含 NOT NULL，避免约束失败）
DELETE FROM topic_items WHERE topic_id IS NULL OR item_id IS NULL;
--> statement-breakpoint
-- 幂等加主键：仅当表尚无主键时才添加（兼容早期 db:push 已建主键的库）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'topic_items'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE topic_items ADD PRIMARY KEY (topic_id, item_id);
  END IF;
END $$;
