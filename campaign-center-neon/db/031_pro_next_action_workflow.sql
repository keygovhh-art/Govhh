-- 031 Askan Pro: human decision workflow for recommended Next Best Actions.
-- Appends history and stores latest choice; no calls/messages/tasks automatically sent.
CREATE TABLE IF NOT EXISTS public.cc_pro_next_action_choices (
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 author_subject text NOT NULL,
 source_type text NOT NULL CHECK(source_type IN ('task','crm_followup')),
 source_id uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('accepted','deferred','skipped','unmarked')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=300),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,campaign_id,author_subject,source_type,source_id),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,author_subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
ALTER TABLE public.cc_pro_next_action_choices ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.cc_pro_next_action_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 author_subject text NOT NULL,
 source_type text NOT NULL CHECK(source_type IN ('task','crm_followup')),
 source_id uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('accepted','deferred','skipped','unmarked')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=300),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,author_subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_next_action_history_member
 ON public.cc_pro_next_action_history(organization_id,campaign_id,author_subject,recorded_at DESC);
ALTER TABLE public.cc_pro_next_action_history ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_next_action_history_immutable BEFORE UPDATE OR DELETE
 ON public.cc_pro_next_action_history FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_pro_next_action_choices IS 'Per-user on-screen recommendation triage only; never implies a completed task or actual CRM contact.';
