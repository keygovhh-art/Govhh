-- Campaign Center stage 028: Askan Plus per-member explicit overdue-alert acknowledgement.
-- Dependency: reviewed 001-027, separate paid plan authorization. No SMS/email.
CREATE TABLE IF NOT EXISTS public.cc_plus_alert_acknowledgements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 author_subject text NOT NULL,
 task_id uuid NOT NULL REFERENCES public.cc_assignments(id) ON DELETE RESTRICT,
 trigger_due_at timestamptz NOT NULL,
 acknowledged_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,campaign_id,author_subject,task_id,trigger_due_at),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,author_subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_plus_alert_ack_private ON public.cc_plus_alert_acknowledgements(organization_id,campaign_id,author_subject,acknowledged_at DESC);
ALTER TABLE public.cc_plus_alert_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_plus_alert_ack_immutable BEFORE UPDATE OR DELETE ON public.cc_plus_alert_acknowledgements
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_plus_alert_acknowledgements IS 'Immutable in-app acknowledgement of a specific overdue task deadline by a verified member. Does not complete tasks, notify externally or hide warnings for colleagues.';
