-- ============================================================================
-- AI 提示词模板表：把提示词从代码硬编码搬到设置页可配
--
-- 背景：提示词曾写死在 src/lib/ai-service.ts 的 buildXxxPrompt 里，
-- 改一句提示词就要走一次代码发布。本表只存「被手动定制过」的模板：
--   - 有行 = 用户在设置页改过，用库里的模板
--   - 无行 = 未定制，用 src/lib/prompts.ts 的默认模板（与历史行为一致）
--
-- 安全性（expand-contract 门禁）：纯新增表（CREATE TABLE IF NOT EXISTS），
-- 不碰任何现有表/列/索引，旧代码在新 schema 上照常运行，向前兼容。
-- 幂等：可重复执行；空库上执行同样通过。
-- ============================================================================


CREATE TABLE IF NOT EXISTS ai_prompts (
  key TEXT PRIMARY KEY,
  template TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
