-- 011: Preserve the staged sponsored-MAX entitlement structure in first-time
-- production migrations. Creating a row here does NOT activate billing.
CREATE TABLE IF NOT EXISTS public.cc_sponsored_max_seats (
 organization_id uuid NOT NULL,
 member_subject text NOT NULL,
 status text NOT NULL DEFAULT 'active'
   CHECK(status IN ('active','paused','revoked','expired')),
 starts_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,member_subject),
 FOREIGN KEY(organization_id,member_subject)
 REFERENCES public.cc_memberships(organization_id,subject) ON DELETE CASCADE
);
ALTER TABLE public.cc_sponsored_max_seats ENABLE ROW LEVEL SECURITY;
-- No direct public RLS policies; authenticated server access only.
