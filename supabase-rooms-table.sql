-- Run this in Supabase SQL Editor to enable rules sync for Host Console
-- Dashboard → SQL Editor → New query → Paste and Run

create table if not exists public.rooms (
  id uuid default gen_random_uuid() primary key,
  room_code text unique not null,
  rules_text text,
  rules_file_name text,
  updated_at timestamptz default now()
);

-- Enable RLS (optional, for security)
alter table public.rooms enable row level security;

-- Allow anonymous read/write for hackathon (adjust for production)
create policy "Allow anonymous access" on public.rooms
  for all using (true) with check (true);
