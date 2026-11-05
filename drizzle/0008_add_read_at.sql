ALTER TABLE raw_items ADD COLUMN IF NOT EXISTS read_at BIGINT;--> statement-breakpoint
-- 存量已读条目没有「读完时间」，用抓取时间兜底：
-- 它们本来就超过保留期的话，下一次清理就会被删掉，符合「已读 30 天后无用」的语义。
UPDATE raw_items SET read_at = fetched_at WHERE is_read = TRUE AND read_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_raw_items_read_at ON raw_items (read_at) WHERE read_at IS NOT NULL;
