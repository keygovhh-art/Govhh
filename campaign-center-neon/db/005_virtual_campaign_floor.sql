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
