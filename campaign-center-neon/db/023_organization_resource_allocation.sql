-- Organization stage 023: planned cross-campaign resources, not real payments.
-- Staging only; requires ordered Campaign Center baseline + 013–022.
CREATE TABLE IF NOT EXISTS public.cc_org_resource_pools (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.cc_organizations(id) ON DELETE RESTRICT,
 period_start date NOT NULL CHECK(EXTRACT(DAY FROM period_start)=1),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 budget_total numeric(14,2) NOT NULL DEFAULT 0 CHECK(budget_total>=0 AND budget_total<=1000000000000),
 volunteer_hours_total integer NOT NULL DEFAULT 0 CHECK(volunteer_hours_total>=0 AND volunteer_hours_total<=10000000),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,period_start,currency),
 UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,created_by) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE TABLE IF NOT EXISTS public.cc_org_resource_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 pool_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 budget_allocated numeric(14,2) NOT NULL DEFAULT 0 CHECK(budget_allocated>=0 AND budget_allocated<=1000000000000),
 volunteer_hours_allocated integer NOT NULL DEFAULT 0 CHECK(volunteer_hours_allocated>=0 AND volunteer_hours_allocated<=10000000),
 updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(pool_id,campaign_id),
 FOREIGN KEY(organization_id,pool_id) REFERENCES public.cc_org_resource_pools(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,updated_by) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE TABLE IF NOT EXISTS public.cc_org_resource_allocation_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 pool_id uuid NOT NULL,
 campaign_id uuid,
 actor_subject text NOT NULL,
 action text NOT NULL CHECK(action IN ('pool_created','pool_capacity_changed','allocation_created','allocation_changed')),
 budget_before numeric(14,2) CHECK(budget_before>=0),
 budget_after numeric(14,2) NOT NULL CHECK(budget_after>=0),
 hours_before integer CHECK(hours_before>=0),
 hours_after integer NOT NULL CHECK(hours_after>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,pool_id) REFERENCES public.cc_org_resource_pools(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_org_resource_pool_idx ON public.cc_org_resource_pools(organization_id,period_start DESC);
CREATE INDEX IF NOT EXISTS cc_org_resource_allocations_idx ON public.cc_org_resource_allocations(organization_id,pool_id);
CREATE INDEX IF NOT EXISTS cc_org_resource_history_idx ON public.cc_org_resource_allocation_history(organization_id,pool_id,created_at DESC);
ALTER TABLE public.cc_org_resource_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_org_resource_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_org_resource_allocation_history ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_org_resource_history_immutable BEFORE UPDATE OR DELETE ON public.cc_org_resource_allocation_history
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_org_resource_pools IS 'Approved planning capacity only, NOT cash on hand, paid revenue, bank settlement or labor time tracked.';
COMMENT ON TABLE public.cc_org_resource_allocations IS 'Planned allocations across campaigns with capped budgets and volunteer hours. No actual transfer takes place.';
