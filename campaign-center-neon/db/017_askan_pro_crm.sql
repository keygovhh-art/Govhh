-- 017 Askan Pro CRM, additive staging only after 001–016 are reviewed.
-- Never ship on production without approved backup, schema owner review and UAT.
CREATE TABLE IF NOT EXISTS public.cc_pro_contact_profiles(
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 contact_id uuid PRIMARY KEY REFERENCES public.cc_contacts(id) ON DELETE RESTRICT,
 stage text NOT NULL DEFAULT 'new' CHECK(stage IN ('new','contacted','followup','pledged','donor','closed')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
 tags text[] NOT NULL DEFAULT '{}',
 next_followup_at timestamptz,
 last_updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,last_updated_by) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_pro_contact_followups ON public.cc_pro_contact_profiles(organization_id,campaign_id,next_followup_at);
ALTER TABLE public.cc_pro_contact_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cc_pro_contact_interactions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 contact_id uuid NOT NULL REFERENCES public.cc_contacts(id) ON DELETE RESTRICT,
 author_subject text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('meeting','message','email','other')),
 note text NOT NULL CHECK(length(note) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,author_subject) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_pro_timeline_idx ON public.cc_pro_contact_interactions(contact_id,created_at DESC);
ALTER TABLE public.cc_pro_contact_interactions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_pro_interactions_append_only BEFORE UPDATE OR DELETE ON public.cc_pro_contact_interactions
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
