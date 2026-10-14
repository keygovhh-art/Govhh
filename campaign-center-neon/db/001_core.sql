-- Campaign Center Neon-only database foundation.
-- Run on staging first. Every application table is RLS-deny-by-default to direct API clients.
-- A separately secured application server checks signed JWT, organization and roles on EACH request.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.cc_organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 owner_subject text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cc_memberships (
 organization_id uuid NOT NULL REFERENCES public.cc_organizations(id) ON DELETE CASCADE,
 subject text NOT NULL,
 role text NOT NULL CHECK (role IN ('owner','manager','squad_leader','askan','finance','auditor')),
 membership_status text NOT NULL DEFAULT 'invited' CHECK (membership_status IN ('invited','active','suspended','revoked')),
 joined_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,subject)
);
CREATE TABLE IF NOT EXISTS public.cc_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.cc_organizations(id) ON DELETE CASCADE,
 title text NOT NULL,
 currency text NOT NULL DEFAULT 'USD',
 goal_amount numeric NOT NULL DEFAULT 0 CHECK (goal_amount >= 0),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE TABLE IF NOT EXISTS public.cc_campaign_members (
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 subject text NOT NULL,
 team_name text NOT NULL DEFAULT '',
 assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign_id,subject),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.cc_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 assignee_subject text NOT NULL,
 title text NOT NULL,
 kind text NOT NULL DEFAULT 'task' CHECK(kind IN('task','call_lead','followup','review')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','critical')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','in_progress','done','cancelled')),
 due_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(campaign_id,assignee_subject) REFERENCES public.cc_campaign_members(campaign_id,subject)
);
CREATE TABLE IF NOT EXISTS public.cc_finance_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 credited_member_subject text,
 source_system text NOT NULL,
 source_event_key text NOT NULL,
 event_kind text NOT NULL CHECK(event_kind IN ('pledge','receipt','refund','correction')),
 amount numeric NOT NULL CHECK(amount > 0),
 currency text NOT NULL DEFAULT 'USD',
 related_pledge_id uuid REFERENCES public.cc_finance_events(id),
 verified_at timestamptz,
 verification_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,source_system,source_event_key),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,credited_member_subject) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE TABLE IF NOT EXISTS public.cc_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 created_by text NOT NULL,
 display_name text NOT NULL,
 phone text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT '',
 privacy text NOT NULL DEFAULT 'campaign' CHECK(privacy IN ('private','campaign')),
 do_not_call boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'new',
 next_followup_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,created_by) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_contacts_campaign_idx ON public.cc_contacts(campaign_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.cc_call_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 contact_id uuid NOT NULL REFERENCES public.cc_contacts(id) ON DELETE RESTRICT,
 member_subject text NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('no_answer','spoke','callback','pledged','paid','not_interested','do_not_call')),
 note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,member_subject) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_calls_contact_idx ON public.cc_call_events(contact_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.cc_activity_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.cc_organizations(id) ON DELETE RESTRICT,
 campaign_id uuid,
 actor_subject text NOT NULL,
 event_type text NOT NULL,
 target_id uuid,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_activity_org_idx ON public.cc_activity_events(organization_id,created_at DESC);
-- No direct anonymous or authenticated role policies: deny by default through Neon Data API.
ALTER TABLE public.cc_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_finance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_activity_events ENABLE ROW LEVEL SECURITY;
-- The additional pilot tables are present in current Neon staging; lock direct access down too.
DO $block$
DECLARE rec record;
BEGIN
 FOR rec IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'cc_%'
 LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',rec.tablename);
 END LOOP;
END $block$;
-- Server APIs expose no update/delete for the append-only records.
-- Database triggers prevent accidental history loss, even from privileged maintenance scripts.
CREATE OR REPLACE FUNCTION public.cc_prevent_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $block$
BEGIN RAISE EXCEPTION 'Campaign Center history is append-only; create a correction event instead';
END $block$;
DROP TRIGGER IF EXISTS cc_finance_no_mutate ON public.cc_finance_events;
CREATE TRIGGER cc_finance_no_mutate BEFORE UPDATE OR DELETE ON public.cc_finance_events
FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
DROP TRIGGER IF EXISTS cc_call_no_mutate ON public.cc_call_events;
CREATE TRIGGER cc_call_no_mutate BEFORE UPDATE OR DELETE ON public.cc_call_events
FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
DROP TRIGGER IF EXISTS cc_audit_no_mutate ON public.cc_activity_events;
CREATE TRIGGER cc_audit_no_mutate BEFORE UPDATE OR DELETE ON public.cc_activity_events
FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
