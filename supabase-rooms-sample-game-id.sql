-- 为 rooms 表增加 sample_game_id 列，用于 Sample Game 房间标识
-- 在 Supabase Dashboard → SQL Editor 中执行

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS sample_game_id text;
