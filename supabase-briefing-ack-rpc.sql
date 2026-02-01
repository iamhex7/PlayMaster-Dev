-- Atomic append to rooms.briefing_acks (JSONB array).
-- Run in Supabase SQL Editor. Call from API as: rpc('append_briefing_ack', { p_room_code, p_client_id, p_name })

create or replace function public.append_briefing_ack(
  p_room_code text,
  p_client_id text,
  p_name text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rooms
  set
    briefing_acks = briefing_acks || jsonb_build_array(
      jsonb_build_object(
        'playerId', p_client_id,
        'clientId', p_client_id,
        'name', coalesce(nullif(trim(p_name), ''), 'Player-' || left(p_client_id, 8)),
        'at', (now() at time zone 'utc')::text
      )
    ),
    updated_at = now()
  where room_code = p_room_code
    and not exists (
      select 1
      from jsonb_array_elements(briefing_acks) as e
      where e->>'clientId' = p_client_id or e->>'playerId' = p_client_id
    );
end;
$$;
