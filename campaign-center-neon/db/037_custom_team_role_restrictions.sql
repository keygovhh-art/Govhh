-- 037: Restrictive Custom-team role templates, initially for contact operations.
-- These flags can ONLY remove access otherwise allowed by built-in roles.
-- They NEVER grant owner, manager, finance, donor, hotline or payment privileges.
CREATE TABLE public.cc_custom_team_permission_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.cc_organizations(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
 can_view_lead_queue boolean NOT NULL DEFAULT true,
 can_claim_leads boolean NOT NULL DEFAULT false,
 can_export_shared_contacts boolean NOT NULL DEFAULT false,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,title),
 FOREIGN KEY(organization_id,created_by) REFERENCES public.cc_memberships(organization_id,subject),
 CHECK(NOT can_claim_leads OR can_view_lead_queue),
 CHECK(NOT can_export_shared_contacts OR can_view_lead_queue)
);
ALTER TABLE public.cc_custom_team_permission_profiles ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.cc_custom_team_permission_bindings (
 organization_id uuid NOT NULL,
 subject text NOT NULL,
 profile_id uuid NOT NULL,
 assigned_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,subject),
 FOREIGN KEY(organization_id,subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,assigned_by) REFERENCES public.cc_memberships(organization_id,subject),
 FOREIGN KEY(organization_id,profile_id) REFERENCES public.cc_custom_team_permission_profiles(organization_id,id)
);
ALTER TABLE public.cc_custom_team_permission_bindings ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.cc_custom_team_permission_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 subject text NOT NULL,
 actor_subject text NOT NULL,
 previous_profile_id uuid,
 next_profile_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,subject) REFERENCES public.cc_memberships(organization_id,subject),
 FOREIGN KEY(organization_id,actor_subject) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE INDEX cc_custom_team_role_audit ON public.cc_custom_team_permission_events
 (organization_id,subject,created_at DESC,id DESC);
ALTER TABLE public.cc_custom_team_permission_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER cc_custom_team_permission_immutable BEFORE UPDATE OR DELETE
 ON public.cc_custom_team_permission_events FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_custom_team_permission_profiles IS
 'Custom-tier restrictive contact-operation sub-roles. Flags NEVER add privileges beyond original campaign roles.';
