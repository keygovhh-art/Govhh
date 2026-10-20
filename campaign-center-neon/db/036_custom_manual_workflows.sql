-- 036: Custom-tier HUMAN workflow checklists. No outbound calls, payments,
-- provider triggers, autonomous decisions or privileges from JSON step contents.
CREATE TABLE public.cc_custom_workflow_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 step_titles jsonb NOT NULL CHECK (jsonb_typeof(step_titles)='array' AND jsonb_array_length(step_titles) BETWEEN 1 AND 12),
 created_by text NOT NULL,
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,campaign_id,id),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,created_by) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX cc_custom_templates_scope ON public.cc_custom_workflow_templates (organization_id,campaign_id,created_at DESC);
ALTER TABLE public.cc_custom_workflow_templates ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.cc_custom_workflow_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 template_id uuid NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 assigned_to text NOT NULL,
 created_by text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','blocked','completed','cancelled')),
 blocked_reason text NOT NULL DEFAULT '' CHECK(length(blocked_reason)<=600),
 next_step integer NOT NULL DEFAULT 0 CHECK(next_step>=0 AND next_step<=12),
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(organization_id,campaign_id,id),
 FOREIGN KEY(organization_id,campaign_id,template_id)
   REFERENCES public.cc_custom_workflow_templates(organization_id,campaign_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,assigned_to) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,created_by) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT,
 CHECK (status<>'blocked' OR length(btrim(blocked_reason))>0),
 CHECK ((status='completed')=(completed_at IS NOT NULL))
);
CREATE INDEX cc_custom_workflow_run_scope ON public.cc_custom_workflow_runs (organization_id,campaign_id,assigned_to,status,updated_at DESC);
ALTER TABLE public.cc_custom_workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.cc_custom_workflow_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 run_id uuid NOT NULL,
 actor_subject text NOT NULL,
 event_kind text NOT NULL CHECK(event_kind IN ('created','step_completed','blocked','resumed','cancelled')),
 step_index integer,
 note text NOT NULL DEFAULT '' CHECK(length(note)<=600),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id,run_id)
  REFERENCES public.cc_custom_workflow_runs(organization_id,campaign_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,actor_subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX cc_custom_workflow_events_scope ON public.cc_custom_workflow_events
 (organization_id,campaign_id,run_id,created_at DESC,id DESC);
ALTER TABLE public.cc_custom_workflow_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER cc_custom_workflow_events_immutable BEFORE UPDATE OR DELETE
 ON public.cc_custom_workflow_events FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_custom_workflow_runs IS
 'Custom tier step progress is manually reported by an authorized campaign member, never an automatic fundraising/call/payment action.';
