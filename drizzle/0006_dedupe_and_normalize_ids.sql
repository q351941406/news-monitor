-- ============================================================================
-- 去重加固：让「同一条内容」在库里只存在一条
--
-- 背景（2026-09 生产库实测）：
--   1) GitHub：id 由 trending 页 href 原样拼接（`github:Owner/Repo`），而
--      GitHub 仓库名大小写不敏感。生产 293 条 github 记录中 116 条含大写，
--      仓库改名/改大小写即会产生第二条 id 不同的同一仓库记录 ——
--      之后会被 AI 当成新内容重复聚合、重复展示。
--   2) Product Hunt：PH 允许同一产品多次 launch，每次都生成新的 post id，
--      因此主键去重挡不住 relaunch。实测同一主题组内出现两条同名同标语
--      内容（ThreadLine）。
--
-- 本迁移把「内容身份」补齐为两级：
--   L1  主键 id              —— GitHub 部分归一化为小写（GitHub 语义本就大小写不敏感）
--   L2  内容指纹唯一索引     —— PH 的 (标题, 标语) 归一化，配合应用层
--                               `ON CONFLICT DO NOTHING` 自动拦下 relaunch
--
-- 幂等：可重复执行；空库上执行同样通过。
-- ============================================================================


-- ============================================================================
-- Part 1 / GitHub id 归一化为小写
-- ============================================================================

-- 1a. 为每个含大写的 id 建出规范行（小写 id）。
--     若规范行已存在（说明历史上真的重复入库过），则合并阅读状态与聚合标记，
--     保留规范行自身的数据，避免覆盖。
INSERT INTO raw_items (id, source, title, url, raw_data, is_read, fetched_at, created_at, aggregated_at)
SELECT lower(r.id), r.source, r.title, r.url, r.raw_data, r.is_read, r.fetched_at, r.created_at, r.aggregated_at
FROM raw_items r
WHERE r.source = 'github'
  AND r.id <> lower(r.id)
ON CONFLICT (id) DO UPDATE SET
  is_read       = raw_items.is_read OR EXCLUDED.is_read,
  aggregated_at = COALESCE(raw_items.aggregated_at, EXCLUDED.aggregated_at);
--> statement-breakpoint

-- 1b. 主题关联转移到规范 id（规范行已在该主题组时跳过）
INSERT INTO topic_items (topic_id, item_id)
SELECT ti.topic_id, lower(ti.item_id)
FROM topic_items ti
JOIN raw_items r ON r.id = ti.item_id
WHERE r.source = 'github'
  AND r.id <> lower(r.id)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 1c. AI 分析转移到规范 id（规范行已有分析时沿用规范行的）
UPDATE ai_analysis a
SET item_id = lower(a.item_id)
FROM raw_items r
WHERE a.item_id = r.id
  AND r.source = 'github'
  AND r.id <> lower(r.id)
  AND NOT EXISTS (SELECT 1 FROM ai_analysis x WHERE x.item_id = lower(r.id));
--> statement-breakpoint

-- 1d. 删除非规范行（残留关联由外键 ON DELETE CASCADE 清理）
DELETE FROM raw_items r
WHERE r.source = 'github'
  AND r.id <> lower(r.id);
--> statement-breakpoint


-- ============================================================================
-- Part 2 / Product Hunt 同一产品 relaunch 去重
-- 指纹 = (source, 标题, 标语) 归一化。仅当标题与标语均非空时参与判定，
-- 避免把字段缺失的记录误判为同一内容。
-- ============================================================================

-- 2a. 冲突条目的主题关联转移到保留条目（保留条目已在该组时跳过）
WITH fp AS (
  SELECT id, fetched_at,
         first_value(id) OVER (
           PARTITION BY lower(btrim(title)), lower(btrim(raw_data->>'tagline'))
           ORDER BY fetched_at, id
         ) AS keep_id
  FROM raw_items
  WHERE source = 'producthunt'
    AND btrim(coalesce(title, '')) <> ''
    AND btrim(coalesce(raw_data->>'tagline', '')) <> ''
)
INSERT INTO topic_items (topic_id, item_id)
SELECT ti.topic_id, fp.keep_id
FROM topic_items ti
JOIN fp ON fp.id = ti.item_id
WHERE fp.id <> fp.keep_id
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 2b. AI 分析转移：每个保留条目最多接收一条，避免同语句内主键自冲突
WITH fp AS (
  SELECT id, keep_id, row_number() OVER (PARTITION BY keep_id ORDER BY fetched_at, id) AS rn
  FROM (
    SELECT id, fetched_at,
           first_value(id) OVER (
             PARTITION BY lower(btrim(title)), lower(btrim(raw_data->>'tagline'))
             ORDER BY fetched_at, id
           ) AS keep_id
    FROM raw_items
    WHERE source = 'producthunt'
      AND btrim(coalesce(title, '')) <> ''
      AND btrim(coalesce(raw_data->>'tagline', '')) <> ''
  ) t
  WHERE keep_id <> id
)
UPDATE ai_analysis a
SET item_id = fp.keep_id
FROM fp
WHERE a.item_id = fp.id
  AND fp.rn = 1
  AND NOT EXISTS (SELECT 1 FROM ai_analysis x WHERE x.item_id = fp.keep_id);
--> statement-breakpoint

-- 2c. 删除重复条目（同指纹保留最早入库的一条）
WITH fp AS (
  SELECT id, fetched_at,
         first_value(id) OVER (
           PARTITION BY lower(btrim(title)), lower(btrim(raw_data->>'tagline'))
           ORDER BY fetched_at, id
         ) AS keep_id
  FROM raw_items
  WHERE source = 'producthunt'
    AND btrim(coalesce(title, '')) <> ''
    AND btrim(coalesce(raw_data->>'tagline', '')) <> ''
)
DELETE FROM raw_items r
USING fp
WHERE r.id = fp.id
  AND fp.id <> fp.keep_id;
--> statement-breakpoint

-- 2d. 指纹唯一索引 —— 后续抓取的 relaunch 会被 storeRawItems 的
--     `ON CONFLICT DO NOTHING` 自动丢弃（不带 conflict target 时覆盖全部唯一索引）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_raw_items_ph_content_fingerprint
  ON raw_items (source, lower(btrim(title)), lower(btrim(raw_data->>'tagline')))
  WHERE source = 'producthunt'
    AND btrim(coalesce(title, '')) <> ''
    AND btrim(coalesce(raw_data->>'tagline', '')) <> '';
