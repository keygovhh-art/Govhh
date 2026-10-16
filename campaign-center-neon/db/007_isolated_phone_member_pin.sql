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

-- Separate Campaign Center hotline-origin account-opening requests.
-- Never create a Neon Auth identity without the provider's verification flow.
CREATE TABLE IF NOT EXISTS public.cc_phone_join_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 call_hash char(64) NOT NULL,
 contact_phone text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','contacted','closed')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by_subject text,
 UNIQUE(call_hash,contact_phone)
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_phone_one_pending_contact ON public.cc_phone_join_requests(contact_phone) WHERE status='pending';
ALTER TABLE public.cc_phone_join_requests ENABLE ROW LEVEL SECURITY;
