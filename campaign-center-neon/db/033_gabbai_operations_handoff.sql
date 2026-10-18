-- 033 Gabbai Pro: manager-to-manager campaign shift handoffs.
-- Additive after reviewed 001–032. No background push/SMS or activity claims.
CREATE TABLE IF NOT EXISTS public.cc_gabbai_shift_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 written_by text NOT NULL,
 headline text NOT NULL CHECK(length(headline) BETWEEN 1 AND 140),
 completed_summary text NOT NULL DEFAULT '' CHECK(length(completed_summary)<=1200),
 blockers_summary text NOT NULL DEFAULT '' CHECK(length(blockers_summary)<=1200),
 next_action text NOT NULL CHECK(length(next_action) BETWEEN 1 AND 1200),
 urgency text NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','high','critical')),
 target_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (organization_id,written_by) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_gabbai_handoffs_scope ON public.cc_gabbai_shift_handoffs
 (organization_id,campaign_id,created_at DESC);
ALTER TABLE public.cc_gabbai_shift_handoffs ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_gabbai_handoffs_immutable BEFORE UPDATE OR DELETE
 ON public.cc_gabbai_shift_handoffs FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
CREATE TABLE IF NOT EXISTS public.cc_gabbai_shift_handoff_acks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 handoff_id uuid NOT NULL REFERENCES public.cc_gabbai_shift_handoffs(id) ON DELETE RESTRICT,
 acknowledged_by text NOT NULL,
 acknowledged_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(handoff_id,acknowledged_by),
 FOREIGN KEY (organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (organization_id,acknowledged_by) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_gabbai_handoff_acks_campaign ON public.cc_gabbai_shift_handoff_acks
 (organization_id,campaign_id,handoff_id);
ALTER TABLE public.cc_gabbai_shift_handoff_acks ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_gabbai_handoff_acks_immutable BEFORE UPDATE OR DELETE
 ON public.cc_gabbai_shift_handoff_acks FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_gabbai_shift_handoffs IS 'Campaign manager shift updates, recorded work and next action. Not a timed job, proof of task completion, or an automatic communication.';

-- An explicit manager action can turn ONE handoff next step into a real task.
CREATE TABLE IF NOT EXISTS public.cc_gabbai_handoff_task_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 handoff_id uuid NOT NULL UNIQUE REFERENCES public.cc_gabbai_shift_handoffs(id) ON DELETE RESTRICT,
 task_id uuid NOT NULL UNIQUE REFERENCES public.cc_assignments(id) ON DELETE RESTRICT,
 assigned_by text NOT NULL,
 assigned_to text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,assigned_by) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,assigned_to) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
ALTER TABLE public.cc_gabbai_handoff_task_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS cc_gabbai_handoff_tasks_campaign
 ON public.cc_gabbai_handoff_task_links(organization_id,campaign_id);
CREATE OR REPLACE TRIGGER cc_gabbai_handoff_tasks_immutable BEFORE UPDATE OR DELETE
 ON public.cc_gabbai_handoff_task_links FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
