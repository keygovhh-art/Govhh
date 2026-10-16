-- Additive Campaign Center goals and immutable change history, Neon only.
-- APPLY TO STAGING ONLY until backup, reviewed change control and explicit production release.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.cc_goals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
 description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
 category text NOT NULL DEFAULT 'custom'
   CHECK (category IN ('money','members','calls','pledges','tasks','custom')),
 target_value numeric(14,2) NOT NULL CHECK (target_value>0 AND target_value<=1000000000000),
 current_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (current_value>=0 AND current_value<=1000000000000),
 due_on date,
 status text NOT NULL DEFAULT 'active'
   CHECK(status IN ('active','at_risk','completed','paused','archived')),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id)
  REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,created_by)
  REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_goals_campaign_idx ON public.cc_goals(organization_id,campaign_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.cc_goal_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 goal_id uuid NOT NULL REFERENCES public.cc_goals(id) ON DELETE RESTRICT,
 actor_subject text NOT NULL,
 event_kind text NOT NULL CHECK (event_kind IN ('created','updated','archived')),
 snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id)
  REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_goal_history_goal_idx ON public.cc_goal_history(goal_id,created_at DESC);
ALTER TABLE public.cc_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_goal_history ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_goal_history_no_mutate
 BEFORE UPDATE OR DELETE ON public.cc_goal_history
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_goals IS 'Explicit campaign-shared facts only, not personal notes. Pilot hard limit is 3 active goals per campaign before paid entitlements launch.';
