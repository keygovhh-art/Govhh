-- Campaign Center: isolate existing Gavhah /4444 telephone traffic in CC Neon.
-- Only additive state; never copy Gavhah members, media or provider tokens.
-- Executed before activating the signed server-to-server bridge.
CREATE TABLE IF NOT EXISTS public.cc_phone_pairing_codes (
  code_hash text PRIMARY KEY CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  subject text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_phone_pairing_subject_idx
 ON public.cc_phone_pairing_codes (subject,expires_at DESC);
CREATE TABLE IF NOT EXISTS public.cc_phone_bridge_states (
  call_hash text PRIMARY KEY CHECK (call_hash ~ '^[a-f0-9]{64}$'),
  path text NOT NULL DEFAULT '',
  step integer NOT NULL DEFAULT 0,
  page integer NOT NULL DEFAULT 0,
  subject text,
  linked_until timestamptz,
  failures integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_phone_bridge_updated_idx
 ON public.cc_phone_bridge_states (updated_at);
