-- Organization stage 022, requires staged 001-021 migrations.
-- Workspace leadership decisions: no donation records or private donor notes.
CREATE TABLE IF NOT EXISTS public.cc_org_leadership_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.cc_organizations(id) ON DELETE RESTRICT,
 campaign_id uuid,
 created_by text NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 context text NOT NULL CHECK(length(context)<=1500),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','decided')),
 resolution text NOT NULL DEFAULT '' CHECK(length(resolution)<=1500),
 decided_by text,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,created_by) REFERENCES public.cc_memberships(organization_id,subject),
 FOREIGN KEY(organization_id,decided_by) REFERENCES public.cc_memberships(organization_id,subject),
 CHECK ((status='open' AND decided_by IS NULL AND decided_at IS NULL AND resolution='') OR
        (status='decided' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND length(resolution)>0))
);
CREATE INDEX IF NOT EXISTS cc_org_decisions_scope ON public.cc_org_leadership_decisions(organization_id,status,created_at DESC);
ALTER TABLE public.cc_org_leadership_decisions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.cc_org_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $x$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Organization leadership decisions cannot be deleted'; END IF;
 IF OLD.status<>'open' OR NEW.status<>'decided'
    OR OLD.id IS DISTINCT FROM NEW.id
    OR OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR OLD.campaign_id IS DISTINCT FROM NEW.campaign_id
    OR OLD.created_by IS DISTINCT FROM NEW.created_by
    OR OLD.title IS DISTINCT FROM NEW.title
    OR OLD.context IS DISTINCT FROM NEW.context
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR NEW.decided_by IS NULL OR NEW.decided_at IS NULL OR NEW.resolution='' THEN
   RAISE EXCEPTION 'Leadership decision can only advance from open to decided';
 END IF;
 RETURN NEW;
END $x$;
CREATE OR REPLACE TRIGGER cc_org_decision_guard_trigger BEFORE UPDATE OR DELETE ON public.cc_org_leadership_decisions
 FOR EACH ROW EXECUTE FUNCTION public.cc_org_decision_guard();
