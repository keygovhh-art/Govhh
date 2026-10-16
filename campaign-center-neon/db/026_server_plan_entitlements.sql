-- 026: Campaign Center plan enforcement (staging only after 001-025).
-- No self-service subscription activation. Grants are provisioned by trusted
-- platform operator through reviewed migration/operations, NOT customer API.
-- A missing, suspended, not-yet-valid or expired grant falls back to Chesed Quick.
CREATE TABLE IF NOT EXISTS public.cc_plan_entitlements (
 organization_id uuid PRIMARY KEY REFERENCES public.cc_organizations(id) ON DELETE RESTRICT,
 plan_code text NOT NULL CHECK(plan_code IN ('chesed_quick','askan_plus','askan_pro','gabbai_pro','organization','custom')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 valid_from timestamptz NOT NULL DEFAULT now(),
 valid_until timestamptz,
 max_members integer CHECK(max_members BETWEEN 1 AND 100000),
 max_goals integer CHECK(max_goals BETWEEN 1 AND 100000),
 max_campaigns integer CHECK(max_campaigns BETWEEN 1 AND 100000),
 provision_reference text NOT NULL CHECK(length(provision_reference) BETWEEN 8 AND 200),
 provisioned_by text NOT NULL CHECK(length(provisioned_by) BETWEEN 3 AND 200),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(valid_until IS NULL OR valid_until>valid_from)
);
ALTER TABLE public.cc_plan_entitlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cc_plan_entitlement_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.cc_organizations(id) ON DELETE RESTRICT,
 plan_code text NOT NULL CHECK(plan_code IN ('chesed_quick','askan_plus','askan_pro','gabbai_pro','organization','custom')),
 status text NOT NULL CHECK(status IN ('active','suspended')),
 valid_from timestamptz NOT NULL,
 valid_until timestamptz,
 max_members integer,
 max_goals integer,
 max_campaigns integer,
 provision_reference text NOT NULL,
 provisioned_by text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_entitlement_history_org_idx ON public.cc_plan_entitlement_history(organization_id,recorded_at DESC);
ALTER TABLE public.cc_plan_entitlement_history ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_entitlement_history_immutable
 BEFORE UPDATE OR DELETE ON public.cc_plan_entitlement_history
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();

-- Each approved operator mutation, even direct SQL maintenance, creates an
-- immutable snapshot. This is not a payment webhook or trusted billing source.
CREATE OR REPLACE FUNCTION public.cc_capture_plan_entitlement()
RETURNS trigger LANGUAGE plpgsql AS $capture$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Entitlement deletion is prohibited; suspend the grant instead';
 END IF;
 IF TG_OP='INSERT' OR (NEW IS DISTINCT FROM OLD) THEN
  INSERT INTO public.cc_plan_entitlement_history(
   organization_id,plan_code,status,valid_from,valid_until,max_members,max_goals,max_campaigns,
   provision_reference,provisioned_by
  ) VALUES(
   NEW.organization_id,NEW.plan_code,NEW.status,NEW.valid_from,NEW.valid_until,
   NEW.max_members,NEW.max_goals,NEW.max_campaigns,NEW.provision_reference,NEW.provisioned_by
  );
 END IF;
 RETURN NEW;
END $capture$;
CREATE OR REPLACE TRIGGER cc_plan_entitlement_snapshot
 AFTER INSERT OR UPDATE ON public.cc_plan_entitlements
 FOR EACH ROW EXECUTE FUNCTION public.cc_capture_plan_entitlement();
CREATE OR REPLACE TRIGGER cc_plan_entitlement_no_delete
 BEFORE DELETE ON public.cc_plan_entitlements
 FOR EACH ROW EXECUTE FUNCTION public.cc_capture_plan_entitlement();

COMMENT ON TABLE public.cc_plan_entitlements IS 'Only trusted operator SQL grants; never user-editable, billing-verified or a customer payment record. RLS denies direct API reads/writes.';
