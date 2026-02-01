-- 为 rooms 表增加 player_count，用于与 briefing_acks.length 对比判断“全员确认”
-- Supabase → SQL Editor → 新建查询 → 粘贴并执行

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS player_count integer DEFAULT 0;

-- 可选：已有数据时按 players 表回填
-- UPDATE public.rooms r SET player_count = (SELECT count(*) FROM public.players p WHERE p.room_id = r.id);
