-- Stage 2: Campaign Center teams, user-authenticated linking, and atomic donor claim locks.
-- Additive, no ALTER/DELETE of existing records; execute on staging before any production review.
CREATE TABLE IF NOT EXISTS public.cc_team_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.cc_organizations(id) ON DELETE RESTRICT,
 campaign_id uuid,
 code_hash text NOT NULL UNIQUE,
 invited_role text NOT NULL CHECK(invited_role IN ('manager','squad_leader','askan','finance','auditor')),
 issued_by text NOT NULL,
 expires_at timestamptz NOT NULL,
 claimed_by text,
 claimed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_invite_org_idx ON public.cc_team_invites(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.cc_connect_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code_hash text NOT NULL UNIQUE,
 subject text NOT NULL,
 expires_at timestamptz NOT NULL,
 redeemed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_connect_subject_idx ON public.cc_connect_codes(subject,created_at DESC);
CREATE TABLE IF NOT EXISTS public.cc_external_account_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subject text NOT NULL,
 external_system text NOT NULL CHECK(external_system IN ('gavhah_max')),
 external_user_id bigint NOT NULL CHECK(external_user_id > 0),
 linked_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 UNIQUE (subject,external_system,external_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_connect_unique_subject ON public.cc_external_account_links(subject,external_system) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cc_connect_unique_external ON public.cc_external_account_links(external_system,external_user_id) WHERE revoked_at IS NULL;
ALTER TABLE public.cc_contacts ADD COLUMN IF NOT EXISTS claimed_by text;
ALTER TABLE public.cc_contacts ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;
ALTER TABLE public.cc_contacts ADD CONSTRAINT cc_claim_consistent
 CHECK ((claimed_by IS NULL AND claim_expires_at IS NULL) OR (claimed_by IS NOT NULL AND claim_expires_at IS NOT NULL));
CREATE INDEX IF NOT EXISTS cc_contacts_claim_idx ON public.cc_contacts(campaign_id,claimed_by,claim_expires_at);
ALTER TABLE public.cc_team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_connect_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_external_account_links ENABLE ROW LEVEL SECURITY;
-- No policies intentionally: direct unprivileged Data API access remains denied.
