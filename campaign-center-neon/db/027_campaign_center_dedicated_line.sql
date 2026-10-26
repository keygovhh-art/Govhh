-- 027: Campaign Center's own phone line. This is never linked to Gavhah's database or token.
-- Applying this migration does not provision, transfer, reroute or activate any phone number.
CREATE TABLE IF NOT EXISTS public.cc_platform_yemot_line (
  id text PRIMARY KEY CHECK (id = 'campaign-center'),
  line_number text NOT NULL CHECK (line_number ~ '^[0-9]{7,15}$'),
  token_nonce text NOT NULL,
  token_ciphertext text NOT NULL,
  token_tag text NOT NULL,
  callback_hash text CHECK(callback_hash ~ '^[a-f0-9]{64}
  last_test_attempt_at timestamptz,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cc_platform_yemot_line ENABLE ROW LEVEL SECURITY;

-- Platform-level audit avoids falsely attributing global phone settings to a customer.
CREATE TABLE IF NOT EXISTS public.cc_platform_yemot_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_subject text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('credential.saved','credential.removed','credential.read_only_test_passed','callback.installed')),
  line_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cc_platform_yemot_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS cc_platform_yemot_audit_created_at ON public.cc_platform_yemot_audit(created_at DESC);
),
  install_state text NOT NULL DEFAULT 'not_installed' CHECK(install_state IN ('not_installed','pending','live','blocked')),
  installed_at timestamptz,
  last_verified_at timestamptz,
  last_test_attempt_at timestamptz,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cc_platform_yemot_line ENABLE ROW LEVEL SECURITY;

-- Platform-level audit avoids falsely attributing global phone settings to a customer.
CREATE TABLE IF NOT EXISTS public.cc_platform_yemot_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_subject text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('credential.saved','credential.removed','credential.read_only_test_passed')),
  line_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cc_platform_yemot_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS cc_platform_yemot_audit_created_at ON public.cc_platform_yemot_audit(created_at DESC);

-- Call navigation belongs entirely to Campaign Center; no shared Gavhah call identities.
CREATE TABLE IF NOT EXISTS public.cc_platform_yemot_call_states (
 call_hash text PRIMARY KEY CHECK(call_hash ~ '^[a-f0-9]{64}$'),
 path text NOT NULL DEFAULT '' CHECK(length(path)<=5),
 step integer NOT NULL DEFAULT 0 CHECK(step>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cc_platform_yemot_call_states ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS cc_platform_yemot_call_states_updated_at ON public.cc_platform_yemot_call_states(updated_at);
