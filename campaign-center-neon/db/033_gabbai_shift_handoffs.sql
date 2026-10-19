-- Gabbai Pro stage 033: practical leadership shift handoffs and immutable status journal.
-- Reviewed staging migrations 001-032 required before this stage.
CREATE TABLE IF NOT EXISTS public.cc_gabbai_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 created_by text NOT NULL,
 assigned_to text NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=1500),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high','critical')),
 due_at timestamptz,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','acknowledged','done')),
 acknowledged_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='pending' AND acknowledged_at IS NULL AND completed_at IS NULL) OR
        (status='acknowledged' AND acknowledged_at IS NOT NULL AND completed_at IS NULL) OR
        (status='done' AND completed_at IS NOT NULL)),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,created_by) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,assigned_to) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_gabbai_handoffs_queue
 ON public.cc_gabbai_handoffs(organization_id,campaign_id,status,due_at,created_at DESC);
CREATE INDEX IF NOT EXISTS cc_gabbai_handoffs_assignee
 ON public.cc_gabbai_handoffs(organization_id,campaign_id,assigned_to,status);
ALTER TABLE public.cc_gabbai_handoffs ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.cc_gabbai_handoff_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 handoff_id uuid NOT NULL REFERENCES public.cc_gabbai_handoffs(id) ON DELETE RESTRICT,
 actor_subject text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('created','acknowledged','completed')),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,actor_subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_gabbai_handoff_history_handoff ON public.cc_gabbai_handoff_history(handoff_id,recorded_at);
ALTER TABLE public.cc_gabbai_handoff_history ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_gabbai_handoff_history_immutable BEFORE UPDATE OR DELETE
 ON public.cc_gabbai_handoff_history FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_gabbai_handoffs IS 'Gabbai Pro manual manager-to-member shift handoffs, on-screen acknowledgement and completion. No carrier calls, automatic reminders or employee productivity scores.';
