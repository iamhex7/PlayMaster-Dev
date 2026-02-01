-- Game events table: 记录每局游戏中的玩家动作与系统事件，供 GM 流水线、回放与审计使用。
-- 在 Supabase Dashboard → SQL Editor 中执行。

create table if not exists public.game_events (
  id uuid default gen_random_uuid() primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  event_type text not null default 'PLAYER_ACTION',
  payload jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_game_events_room_created
  on public.game_events (room_id, created_at desc);

comment on table public.game_events is 'Game events for GM pipeline and replay; insert triggers processGameTick via API.';
