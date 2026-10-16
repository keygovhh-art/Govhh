-- Organization 024: append-only institutional knowledge, leadership access only.
-- Staging only after ordered 001–023. No automatic AI classification/sending.
CREATE TABLE IF NOT EXISTS public.cc_org_memory_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.cc_organizations(id) ON DELETE RESTRICT,
 source_campaign_id uuid,
 author_subject text NOT NULL,
 category text NOT NULL CHECK(category IN ('policy','lesson','handoff','risk')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 summary text NOT NULL CHECK(length(summary) BETWEEN 1 AND 3000),
 review_due_at timestamptz,
 supersedes_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,source_campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,author_subject) REFERENCES public.cc_memberships(organization_id,subject),
 FOREIGN KEY(organization_id,supersedes_id) REFERENCES public.cc_org_memory_entries(organization_id,id) ON DELETE RESTRICT,
 CHECK(id IS DISTINCT FROM supersedes_id)
);
CREATE INDEX IF NOT EXISTS cc_org_memory_latest ON public.cc_org_memory_entries(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS cc_org_memory_review ON public.cc_org_memory_entries(organization_id,review_due_at) WHERE review_due_at IS NOT NULL;
ALTER TABLE public.cc_org_memory_entries ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_org_memory_immutable BEFORE UPDATE OR DELETE ON public.cc_org_memory_entries
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_org_memory_entries IS 'Private institutional knowledge only, not external AI-generated memory or public shared donor data. Corrections append another version.';
