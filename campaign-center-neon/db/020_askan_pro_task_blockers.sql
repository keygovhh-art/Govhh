-- Askan Pro staging-only 020. Real task blockers with immutable change history.
-- No automated risk prediction; only reported reasons on authorized tasks.
CREATE TABLE IF NOT EXISTS public.cc_pro_task_blockers(
 task_id uuid PRIMARY KEY REFERENCES public.cc_assignments(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 reason text NOT NULL CHECK(reason IN ('no_response','missing_information','approval_needed','payment_pending','other')),
 details text NOT NULL DEFAULT '' CHECK(length(details)<=500),
 is_active boolean NOT NULL DEFAULT true,
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,updated_by) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_pro_blockers_campaign_active_idx
 ON public.cc_pro_task_blockers(organization_id,campaign_id,is_active,reason);
ALTER TABLE public.cc_pro_task_blockers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cc_pro_blocker_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id uuid NOT NULL REFERENCES public.cc_assignments(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 actor_subject text NOT NULL,
 reason text NOT NULL CHECK(reason IN ('no_response','missing_information','approval_needed','payment_pending','other')),
 action text NOT NULL CHECK(action IN ('raised','changed','resolved','reopened')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_pro_blocker_history_task_idx ON public.cc_pro_blocker_history(task_id,created_at DESC);
ALTER TABLE public.cc_pro_blocker_history ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_pro_blocker_history_immutable
 BEFORE UPDATE OR DELETE ON public.cc_pro_blocker_history
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
