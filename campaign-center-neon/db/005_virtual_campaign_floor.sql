-- Virtual fundraising floor: separate operational support from general assembly conferences.
-- Private donor contact information stays in the contact APIs under squad permissions.
CREATE TABLE IF NOT EXISTS public.cc_floor_help_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 room_id uuid NOT NULL REFERENCES public.cc_live_rooms(id) ON DELETE RESTRICT,
 requested_by text NOT NULL,
 category text NOT NULL CHECK(category IN ('technical','donor_question','manager','motivation','other')),
 summary text NOT NULL CHECK(length(summary) BETWEEN 2 AND 500),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
 assigned_to text,
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,requested_by) REFERENCES public.cc_memberships(organization_id,subject),
 FOREIGN KEY(organization_id,assigned_to) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_floor_help_room_idx ON public.cc_floor_help_requests(room_id,status,created_at DESC);
ALTER TABLE public.cc_floor_help_requests ENABLE ROW LEVEL SECURITY;

-- Single-flight idempotency for a browser-reported call outcome. A retry of a
-- successful call does not duplicate the immutable ledger or the fundraiser KPI.
ALTER TABLE public.cc_call_events ADD COLUMN IF NOT EXISTS client_attempt_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS cc_call_event_attempt_unique
 ON public.cc_call_events(client_attempt_id) WHERE client_attempt_id IS NOT NULL;

-- Private two-way help desk messages: requester and authorized campaign
-- manager only; no global chat leakage of donor questions.
CREATE TABLE IF NOT EXISTS public.cc_floor_help_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.cc_floor_help_requests(id) ON DELETE RESTRICT,
 authored_by text NOT NULL,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_floor_help_message_idx ON public.cc_floor_help_messages(request_id,created_at ASC);
ALTER TABLE public.cc_floor_help_messages ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_floor_help_msg_append_only
 BEFORE UPDATE OR DELETE ON public.cc_floor_help_messages
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
