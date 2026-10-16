-- Gabbai Pro stage 021. Staff approval workflow, never a transfer or payment execution.
-- Requires approved baseline and subsequent staging migrations 013-020.
CREATE TABLE IF NOT EXISTS public.cc_gabbai_approval_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 requested_by text NOT NULL,
 category text NOT NULL CHECK(category IN ('planned_expense','manual_adjustment','refund_review','other')),
 amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount<=1000000000000),
 currency text NOT NULL DEFAULT 'USD',
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 180),
 explanation text NOT NULL DEFAULT '' CHECK(length(explanation)<=1500),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 decided_by text,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,requested_by) REFERENCES public.cc_memberships(organization_id,subject),
 FOREIGN KEY(organization_id,decided_by) REFERENCES public.cc_memberships(organization_id,subject),
 CHECK ((status='pending' AND decided_by IS NULL AND decided_at IS NULL) OR
        (status<>'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)),
 CHECK (requested_by IS DISTINCT FROM decided_by)
);
CREATE INDEX IF NOT EXISTS cc_gabbai_approval_campaign_idx
 ON public.cc_gabbai_approval_requests(organization_id,campaign_id,status,created_at DESC);
ALTER TABLE public.cc_gabbai_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cc_gabbai_approval_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE REFERENCES public.cc_gabbai_approval_requests(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 reviewer_subject text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('approved','rejected')),
 reason text NOT NULL DEFAULT '' CHECK(length(reason)<=500),
 decided_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,reviewer_subject) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_gabbai_approval_decisions_scope ON public.cc_gabbai_approval_decisions(organization_id,campaign_id);
ALTER TABLE public.cc_gabbai_approval_decisions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_gabbai_decisions_immutable
 BEFORE UPDATE OR DELETE ON public.cc_gabbai_approval_decisions
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_gabbai_approval_requests IS 'Two-person internal approval only; approval never executes bank payment, refund or ledger adjustment.';
