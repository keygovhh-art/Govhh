-- 035: Organization management command center: human-owned plan register + immutable
-- history. Not AI guesses, employee performance scoring or automatic financial activity.
CREATE TABLE public.cc_management_plan_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.cc_organizations(id) ON DELETE RESTRICT,
 campaign_id uuid,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 details text NOT NULL DEFAULT '' CHECK(length(details)<=1800),
 status text NOT NULL DEFAULT 'planned' CHECK(status IN
  ('planned','ready','in_progress','waiting','blocked','failed','successful','completed','cancelled')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high','critical')),
 progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
 assigned_to text,
 next_action text NOT NULL DEFAULT '' CHECK(length(next_action)<=500),
 waiting_on text NOT NULL DEFAULT '' CHECK(length(waiting_on)<=200),
 issue_reason text NOT NULL DEFAULT '' CHECK(length(issue_reason)<=500),
 due_at timestamptz,
 completed_at timestamptz,
 created_by text NOT NULL,
 updated_by text NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,created_by) REFERENCES public.cc_memberships(organization_id,subject),
 FOREIGN KEY(organization_id,updated_by) REFERENCES public.cc_memberships(organization_id,subject),
 FOREIGN KEY(organization_id,assigned_to) REFERENCES public.cc_memberships(organization_id,subject),
 CHECK(status NOT IN ('waiting','blocked','failed') OR length(issue_reason)>0),
 CHECK(status<>'waiting' OR length(waiting_on)>0),
 CHECK(status NOT IN ('successful','completed') OR progress=100),
 CHECK((status IN ('successful','completed') AND completed_at IS NOT NULL)
  OR (status NOT IN ('successful','completed') AND completed_at IS NULL))
);
CREATE INDEX cc_mgmt_items_scope ON public.cc_management_plan_items
 (organization_id,status,updated_at DESC,id DESC);
CREATE INDEX cc_mgmt_items_due ON public.cc_management_plan_items
 (organization_id,due_at) WHERE status NOT IN ('successful','completed','cancelled');
ALTER TABLE public.cc_management_plan_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cc_management_plan_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 item_id uuid NOT NULL,
 actor_subject text NOT NULL,
 event_kind text NOT NULL CHECK(event_kind IN ('created','updated')),
 before_state jsonb,
 after_state jsonb NOT NULL,
 note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,item_id) REFERENCES public.cc_management_plan_items(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,actor_subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX cc_mgmt_history_item ON public.cc_management_plan_history
 (organization_id,item_id,recorded_at DESC,id DESC);
ALTER TABLE public.cc_management_plan_history ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER cc_mgmt_history_immutable BEFORE UPDATE OR DELETE ON public.cc_management_plan_history
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_management_plan_items IS
 'Private leader-entered planning statuses; progress values are human reports and NOT performance or verified financial results.';
COMMENT ON TABLE public.cc_management_plan_history IS
 'Append-only manager-entered update history; no donor information or external notifications.';
