-- 012: Organization-scoped Yemot API token, encrypted with a server-only 32-byte key.
-- Never store the token as plaintext or expose it in REST responses.
CREATE TABLE IF NOT EXISTS public.cc_yemot_connections(
 organization_id uuid PRIMARY KEY REFERENCES public.cc_organizations(id) ON DELETE RESTRICT,
 token_nonce text NOT NULL,
 token_ciphertext text NOT NULL,
 token_tag text NOT NULL,
 provider text NOT NULL DEFAULT 'yemot' CHECK(provider='yemot'),
 enabled boolean NOT NULL DEFAULT false,
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cc_yemot_connections ENABLE ROW LEVEL SECURITY;
