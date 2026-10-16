-- 018 Askan Pro private 7-day Sprint and 30-day action history.
-- Staging-only additive; migration 017 must exist before this.
CREATE TABLE IF NOT EXISTS public.cc_pro_sprints (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 owner_subject text NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 starts_on date NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,owner_subject) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_pro_one_open_sprint
 ON public.cc_pro_sprints(campaign_id,owner_subject) WHERE status='open';
CREATE INDEX IF NOT EXISTS cc_pro_sprints_member_idx
 ON public.cc_pro_sprints(organization_id,campaign_id,owner_subject,created_at DESC);
ALTER TABLE public.cc_pro_sprints ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cc_pro_sprint_steps(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sprint_id uuid NOT NULL REFERENCES public.cc_pro_sprints(id) ON DELETE RESTRICT,
 day_number integer NOT NULL CHECK(day_number BETWEEN 1 AND 7),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_pro_sprint_steps_group ON public.cc_pro_sprint_steps(sprint_id,day_number);
ALTER TABLE public.cc_pro_sprint_steps ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cc_pro_sprint_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sprint_id uuid NOT NULL REFERENCES public.cc_pro_sprints(id) ON DELETE RESTRICT,
 step_id uuid REFERENCES public.cc_pro_sprint_steps(id) ON DELETE RESTRICT,
 owner_subject text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('created','step_done','step_reopened','completed','archived')),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_pro_sprint_activity_member_idx
 ON public.cc_pro_sprint_activity(owner_subject,recorded_at DESC);
ALTER TABLE public.cc_pro_sprint_activity ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_pro_sprint_activity_append_only
 BEFORE UPDATE OR DELETE ON public.cc_pro_sprint_activity
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
