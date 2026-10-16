-- Custom plan stage 025. No predictive AI, no background auto-actions.
-- Requires staged 001–024 and a future paid-tier entitlement gate before launch.
CREATE TABLE IF NOT EXISTS public.cc_custom_focus_profiles (
 organization_id uuid NOT NULL,
 campaign_id uuid PRIMARY KEY,
 overdue_weight integer NOT NULL DEFAULT 40 CHECK(overdue_weight BETWEEN 0 AND 100),
 due_soon_weight integer NOT NULL DEFAULT 15 CHECK(due_soon_weight BETWEEN 0 AND 100),
 high_priority_weight integer NOT NULL DEFAULT 20 CHECK(high_priority_weight BETWEEN 0 AND 100),
 followup_weight integer NOT NULL DEFAULT 10 CHECK(followup_weight BETWEEN 0 AND 100),
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(overdue_weight+due_soon_weight+high_priority_weight+followup_weight>0),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,updated_by) REFERENCES public.cc_memberships(organization_id,subject)
);
ALTER TABLE public.cc_custom_focus_profiles ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.cc_custom_focus_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 actor_subject text NOT NULL,
 overdue_weight integer NOT NULL,
 due_soon_weight integer NOT NULL,
 high_priority_weight integer NOT NULL,
 followup_weight integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_custom_focus_history_idx ON public.cc_custom_focus_history(organization_id,campaign_id,created_at DESC);
ALTER TABLE public.cc_custom_focus_history ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_custom_focus_history_immutable BEFORE UPDATE OR DELETE ON public.cc_custom_focus_history
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_custom_focus_profiles IS 'Deterministic customizable on-screen task/follow-up priority weights. No background workflow, SMS, caller ID, AI prediction or billing grants.';
