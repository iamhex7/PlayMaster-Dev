-- Run this in Supabase SQL Editor to enable rules sync for Host Console
-- Dashboard → SQL Editor → New query → Paste and Run

create table if not exists public.rooms (
  id uuid default gen_random_uuid() primary key,
  room_code text unique not null,
  rules_text text,
  rules_file_name text,
  status text default 'LOBBY',
  game_config jsonb,
  game_state jsonb,
  briefing_acks jsonb default '[]',
  sample_game_id text,
  updated_at timestamptz default now()
);

-- 若表已存在，补齐字段（与代码引用一致：room_code, game_config, status, rules_text 等）
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS room_code text;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS rules_text text;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS rules_file_name text;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS status text DEFAULT 'LOBBY';
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS game_config jsonb;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS game_state jsonb;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS briefing_acks jsonb DEFAULT '[]';
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS sample_game_id text;

-- Enable RLS (optional, for security)
alter table public.rooms enable row level security;

-- Allow anonymous read/write for hackathon (adjust for production)
create policy "Allow anonymous access" on public.rooms
  for all using (true) with check (true);
