-- Web-only campaign hall foundation. NO telephony, audio, SIP or provider attendance claims.
CREATE TABLE IF NOT EXISTS public.cc_live_rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 title text NOT NULL,
 room_status text NOT NULL DEFAULT 'planned' CHECK(room_status IN('planned','open','paused','ended')),
 provider_room_ref text,
 scheduled_at timestamptz,
 opened_at timestamptz,
 closed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public.cc_live_room_participation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES public.cc_live_rooms(id) ON DELETE RESTRICT,
 member_subject text NOT NULL,
 joined_at timestamptz NOT NULL DEFAULT now(),
 left_at timestamptz,
 provider_participation_ref text,
 last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cc_live_room_participation ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS cc_room_active_member_idx ON public.cc_live_room_participation(room_id,member_subject) WHERE left_at IS NULL;
CREATE TABLE IF NOT EXISTS public.cc_room_announcements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 room_id uuid NOT NULL REFERENCES public.cc_live_rooms(id) ON DELETE RESTRICT,
 authored_by text NOT NULL,
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 800),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_room_announcements_idx ON public.cc_room_announcements(room_id,created_at DESC);
ALTER TABLE public.cc_live_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_live_room_participation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_room_announcements ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_room_announcements_no_mutate BEFORE UPDATE OR DELETE ON public.cc_room_announcements
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
