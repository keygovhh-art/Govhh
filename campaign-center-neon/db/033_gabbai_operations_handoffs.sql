-- 033 Gabbai Pro: actionable campaign-to-campaign-member operational handoffs.
-- Separate from Organization policy memory. No background phone calls or emails.
CREATE TABLE IF NOT EXISTS public.cc_gabbai_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 created_by text NOT NULL,
 assigned_to text NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=2000),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high','critical')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','done')),
 due_at timestamptz,
 completed_at timestamptz,
 completed_by text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,campaign_id,id),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,created_by) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,assigned_to) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT,
 CHECK((status='done' AND completed_at IS NOT NULL AND completed_by IS NOT NULL) OR
       (status<>'done' AND completed_at IS NULL AND completed_by IS NULL))
);
CREATE INDEX IF NOT EXISTS cc_gabbai_handoffs_queue ON public.cc_gabbai_handoffs
 (organization_id,campaign_id,status,due_at,created_at DESC);
CREATE INDEX IF NOT EXISTS cc_gabbai_handoffs_personal ON public.cc_gabbai_handoffs
 (organization_id,campaign_id,assigned_to,status);
ALTER TABLE public.cc_gabbai_handoffs ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.cc_gabbai_handoff_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 handoff_id uuid NOT NULL,
 actor_subject text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('created','comment','status')),
 body text NOT NULL DEFAULT '' CHECK(length(body)<=1500),
 status_to text CHECK(status_to IN ('open','in_progress','done')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id,handoff_id)
  REFERENCES public.cc_gabbai_handoffs(organization_id,campaign_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,actor_subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_gabbai_handoff_events_order ON public.cc_gabbai_handoff_events(handoff_id,created_at,id);
ALTER TABLE public.cc_gabbai_handoff_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_gabbai_handoff_events_immutable BEFORE UPDATE OR DELETE
 ON public.cc_gabbai_handoff_events FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_gabbai_handoffs IS 'Gabbai Pro operational ownership, due-date and resolution; only authenticated app writes. No claim of automated worker notifications.';
