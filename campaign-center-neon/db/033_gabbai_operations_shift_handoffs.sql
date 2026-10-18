-- 033 Gabbai Pro: operational shift handoff and truthful completion trail.
-- Additive, after prior reviewed Campaign Center migrations. Not a message sender.
CREATE TABLE IF NOT EXISTS public.cc_gabbai_shift_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 created_by text NOT NULL,
 assigned_to text NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=1200),
 due_at timestamptz,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','completed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,organization_id,campaign_id),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,created_by) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,assigned_to) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_gabbai_shift_handoffs_queue ON public.cc_gabbai_shift_handoffs(organization_id,campaign_id,status,due_at,created_at DESC);
ALTER TABLE public.cc_gabbai_shift_handoffs ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.cc_gabbai_shift_handoff_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 handoff_id uuid NOT NULL,
 actor_subject text NOT NULL,
 action text NOT NULL CHECK(action IN ('created','accepted','completed')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(handoff_id,organization_id,campaign_id) REFERENCES public.cc_gabbai_shift_handoffs(id,organization_id,campaign_id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,actor_subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_gabbai_shift_history_item ON public.cc_gabbai_shift_handoff_history(organization_id,campaign_id,handoff_id,recorded_at);
ALTER TABLE public.cc_gabbai_shift_handoff_history ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_gabbai_shift_history_immutable BEFORE UPDATE OR DELETE
 ON public.cc_gabbai_shift_handoff_history FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_gabbai_shift_handoffs IS 'Human campaign leader operational handoffs, no phone calls, messages or verified external delivery.';
