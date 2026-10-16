-- Campaign Center rollout 012: private Personal Askan workspace.
-- This migration is additive and MUST be reviewed on Neon staging before production.
-- It never touches historical Supabase/browser data or the separate Gavhah database.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.cc_personal_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_subject text NOT NULL CHECK(length(owner_subject) BETWEEN 1 AND 256),
 item_kind text NOT NULL CHECK(item_kind IN ('task','followup','note')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
 details text NOT NULL DEFAULT '' CHECK(length(details) <= 2000),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high','critical')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','archived')),
 due_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_personal_items_owner_idx
 ON public.cc_personal_items(owner_subject, status, created_at DESC);
-- All access must pass through the authenticated API, which requires JWT subject ownership.
-- Direct Neon Data API access remains deny-by-default, even to authenticated clients.
ALTER TABLE public.cc_personal_items ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.cc_personal_items IS
 'Private per-user tasks, followups and notes. NEVER copy into campaigns, MAX, team feeds or audit without explicit opt-in.';
