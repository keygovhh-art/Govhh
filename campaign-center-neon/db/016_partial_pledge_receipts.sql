-- Staging migration 016: provenance of manually reported partial pledge receipts.
-- Facts are append-only. A check number/reference is NOT a bank verification.
CREATE TABLE IF NOT EXISTS public.cc_plus_manual_receipts (
 finance_event_id uuid PRIMARY KEY REFERENCES public.cc_finance_events(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 pledge_event_id uuid NOT NULL REFERENCES public.cc_finance_events(id) ON DELETE RESTRICT,
 method text NOT NULL CHECK(method IN ('cash','check','bank','external')),
 reference text NOT NULL DEFAULT '' CHECK(length(reference)<=120),
 reported_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (organization_id,reported_by) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_plus_receipts_pledge_idx ON public.cc_plus_manual_receipts(organization_id,campaign_id,pledge_event_id);
ALTER TABLE public.cc_plus_manual_receipts ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_plus_receipts_no_mutate BEFORE UPDATE OR DELETE ON public.cc_plus_manual_receipts
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_plus_manual_receipts IS 'Owner/treasurer-entered report only; no verified processor charge or bank settlement.';
