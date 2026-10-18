-- 032: Askan Pro Guidance work ownership and review deadlines.
-- Optional workload triage, not a guaranteed professional service or SLA.
ALTER TABLE public.cc_pro_guidance_requests
 ADD COLUMN IF NOT EXISTS assigned_to text,
 ADD COLUMN IF NOT EXISTS response_due_at timestamptz,
 ADD COLUMN IF NOT EXISTS triaged_at timestamptz;
CREATE INDEX IF NOT EXISTS cc_pro_guidance_owned_queue
 ON public.cc_pro_guidance_requests(organization_id,campaign_id,status,assigned_to,response_due_at);
COMMENT ON COLUMN public.cc_pro_guidance_requests.assigned_to IS 'Manager-owned internal guidance work queue; NULL means unclaimed.';
COMMENT ON COLUMN public.cc_pro_guidance_requests.response_due_at IS 'Voluntary internal target, not externally guaranteed service level.';
