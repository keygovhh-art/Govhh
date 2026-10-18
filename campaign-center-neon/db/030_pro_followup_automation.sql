-- 030 Askan Pro: explicit opt-in, on-demand CRM due-followup -> personal tasks.
-- No cron, phone call, message, TTS, email or automatic external provider dispatch.
-- After reviewed 001–029 migration chain. Deny by default with RLS enabled.
CREATE TABLE IF NOT EXISTS public.cc_pro_automation_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 owner_subject text NOT NULL,
 kind text NOT NULL DEFAULT 'due_crm_to_task' CHECK(kind='due_crm_to_task'),
 enabled boolean NOT NULL DEFAULT false,
 max_tasks_per_run smallint NOT NULL DEFAULT 10 CHECK(max_tasks_per_run BETWEEN 1 AND 20),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,campaign_id,owner_subject),
 FOREIGN KEY (organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (organization_id,owner_subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_pro_automation_rules_campaign ON public.cc_pro_automation_rules(organization_id,campaign_id);
ALTER TABLE public.cc_pro_automation_rules ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.cc_pro_automation_task_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 owner_subject text NOT NULL,
 contact_id uuid NOT NULL REFERENCES public.cc_contacts(id) ON DELETE RESTRICT,
 due_snapshot timestamptz NOT NULL,
 task_id uuid NOT NULL UNIQUE REFERENCES public.cc_assignments(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,campaign_id,owner_subject,contact_id,due_snapshot),
 FOREIGN KEY (organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (organization_id,owner_subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_pro_automation_tasks_owner ON public.cc_pro_automation_task_links(organization_id,campaign_id,owner_subject,created_at DESC);
ALTER TABLE public.cc_pro_automation_task_links ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_pro_automation_links_immutable BEFORE UPDATE OR DELETE ON public.cc_pro_automation_task_links
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
CREATE TABLE IF NOT EXISTS public.cc_pro_automation_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 owner_subject text NOT NULL,
 rule_id uuid NOT NULL REFERENCES public.cc_pro_automation_rules(id) ON DELETE RESTRICT,
 created_tasks smallint NOT NULL CHECK(created_tasks BETWEEN 0 AND 20),
 triggered_by text NOT NULL DEFAULT 'manual' CHECK(triggered_by='manual'),
 ran_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (organization_id,owner_subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_pro_automation_runs_owner ON public.cc_pro_automation_runs(organization_id,campaign_id,owner_subject,ran_at DESC);
ALTER TABLE public.cc_pro_automation_runs ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_pro_automation_runs_immutable BEFORE UPDATE OR DELETE ON public.cc_pro_automation_runs
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_pro_automation_rules IS 'On-demand private campaign CRM follow-up conversion only. Turning on rule does not schedule background jobs.';
COMMENT ON TABLE public.cc_pro_automation_task_links IS 'Source mapping belongs exclusively to creator. No donor contact name or phone is included in generated task title or generic audit.';
