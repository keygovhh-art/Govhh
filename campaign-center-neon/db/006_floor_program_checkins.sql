-- 006: Schedule and check-in for the virtual fundraising event.
-- The hall continues to exist independently of any telephone carrier.
ALTER TABLE public.cc_live_rooms
 ADD COLUMN IF NOT EXISTS floor_mode text NOT NULL DEFAULT 'calling'
 CHECK(floor_mode IN ('calling','program','break','ended'));
CREATE TABLE IF NOT EXISTS public.cc_floor_checkins(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 room_id uuid NOT NULL REFERENCES public.cc_live_rooms(id) ON DELETE RESTRICT,
 member_subject text NOT NULL,
 checked_in_at timestamptz NOT NULL DEFAULT now(),
 checked_out_at timestamptz,
 UNIQUE(room_id,member_subject,checked_in_at),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,member_subject) REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_floor_one_active_checkin
 ON public.cc_floor_checkins(room_id,member_subject) WHERE checked_out_at IS NULL;
CREATE INDEX IF NOT EXISTS cc_floor_checkin_recent
 ON public.cc_floor_checkins(room_id,checked_in_at DESC);
CREATE TABLE IF NOT EXISTS public.cc_floor_programs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 room_id uuid NOT NULL REFERENCES public.cc_live_rooms(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK(length(title) BETWEEN 2 AND 180),
 segment_type text NOT NULL CHECK(segment_type IN ('opening','manager','inspiration','lunch','break','technical','closing','other')),
 speaker text NOT NULL DEFAULT '',
 description text NOT NULL DEFAULT '',
 scheduled_start timestamptz NOT NULL,
 scheduled_end timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','completed','cancelled')),
 media_url text,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 completed_at timestamptz,
 CHECK(scheduled_end > scheduled_start),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_floor_program_timeline
 ON public.cc_floor_programs(room_id,scheduled_start,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS cc_floor_one_live_program
 ON public.cc_floor_programs(room_id) WHERE status='live';
ALTER TABLE public.cc_floor_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_floor_programs ENABLE ROW LEVEL SECURITY;
