-- Add-only confirmed telephone actions on existing isolated Campaign Center
-- sessions. Never migrate caller data or telephone provider credentials.
ALTER TABLE public.cc_phone_bridge_states
  ADD COLUMN IF NOT EXISTS pending_id uuid;
ALTER TABLE public.cc_phone_bridge_states
  ADD COLUMN IF NOT EXISTS pending_kind text;
