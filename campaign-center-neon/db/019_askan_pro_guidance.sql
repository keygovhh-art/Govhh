-- 019 Askan Pro: private guidance requests between campaign staff and manager.
-- Internal staffed service workflow only. No SLA or automatic professional response.
CREATE TABLE IF NOT EXISTS public.cc_pro_guidance_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 created_by text NOT NULL,
 category text NOT NULL CHECK(category IN ('strategy','calls','fundraising','technical','other')),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 160),
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 3000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,created_by) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_pro_guidance_campaign_idx ON public.cc_pro_guidance_requests(organization_id,campaign_id,status,created_at DESC);
ALTER TABLE public.cc_pro_guidance_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cc_pro_guidance_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.cc_pro_guidance_requests(id) ON DELETE RESTRICT,
 sender_subject text NOT NULL,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
 sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_pro_guidance_thread_idx ON public.cc_pro_guidance_messages(request_id,sent_at,id);
ALTER TABLE public.cc_pro_guidance_messages ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_pro_guidance_messages_immutable BEFORE UPDATE OR DELETE ON public.cc_pro_guidance_messages
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
