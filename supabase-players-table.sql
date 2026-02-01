-- Players table: per-room, per-client private role and inventory.
-- Run in Supabase SQL Editor after rooms table exists.

create table if not exists public.players (
  id uuid default gen_random_uuid() primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  client_id text not null,
  role_info jsonb default '{}',
  inventory jsonb default '{}',
  created_at timestamptz default now(),
  unique(room_id, client_id)
);

create index if not exists idx_players_room_client on public.players(room_id, client_id);
create index if not exists idx_players_room_id on public.players(room_id);

alter table public.players enable row level security;

-- Only allow reading own row when client_id matches (requires passing client_id via request;
-- for hackathon we restrict in API: getMyRole returns only the row for requested clientId).
create policy "Allow read own player data"
  on public.players for select
  using (true);

create policy "Allow insert and update from service"
  on public.players for all
  using (true) with check (true);

-- Optional: For production, use a policy that restricts SELECT by client_id via JWT or request.
-- Here we rely on the API to only return the row where client_id = request.clientId.
