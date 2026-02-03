-- Add host_client_id column to rooms table
-- Run this in Supabase SQL Editor to store host identity in database

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS host_client_id text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_rooms_host_client_id ON public.rooms(host_client_id);

COMMENT ON COLUMN public.rooms.host_client_id IS 'Client ID of the room host (creator). Used to determine who can initialize the game.';
