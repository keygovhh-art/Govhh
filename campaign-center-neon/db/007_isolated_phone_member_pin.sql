-- STAGING ONLY, separate Campaign Center Neon database (not Gavhah).
-- Only the campaign service database role can read these rows.
CREATE TABLE IF NOT EXISTS public.cc_phone_member_pins (
 subject text PRIMARY KEY,
 pin_index char(64) NOT NULL UNIQUE,
 pin_salt char(32) NOT NULL,
 pin_verifier char(128) NOT NULL,
 activation_required boolean NOT NULL DEFAULT false,
 failed_attempts integer NOT NULL DEFAULT 0,
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 assigned_by_subject text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.cc_phone_sessions (
 call_hash char(64) PRIMARY KEY,
 subject text NOT NULL REFERENCES public.cc_phone_member_pins(subject) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_phone_sessions_expire ON public.cc_phone_sessions(expires_at);
ALTER TABLE public.cc_phone_member_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_phone_sessions ENABLE ROW LEVEL SECURITY;
-- Zero RLS policies: the pinned server-side DB role handles access, and
-- service routes recheck cc_memberships active membership per request.
