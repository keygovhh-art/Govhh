-- Optional video viewing. OFF by default; independent of the campaign dialer and conference audio.
ALTER TABLE public.cc_conference_rooms
 ADD COLUMN IF NOT EXISTS video_url text,
 ADD COLUMN IF NOT EXISTS video_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS video_access_mode text NOT NULL DEFAULT 'approved_only'
 CHECK(video_access_mode IN ('approved_only','admitted'));
ALTER TABLE public.cc_live_rooms
 ADD COLUMN IF NOT EXISTS video_url text,
 ADD COLUMN IF NOT EXISTS video_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS video_access_mode text NOT NULL DEFAULT 'approved_only'
 CHECK(video_access_mode IN ('approved_only','checked_in'));
CREATE TABLE IF NOT EXISTS public.cc_conference_video_grants(
 room_id uuid NOT NULL REFERENCES public.cc_conference_rooms(id) ON DELETE RESTRICT,
 subject text NOT NULL,
 granted boolean NOT NULL DEFAULT true,
 changed_by text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,subject)
);
CREATE TABLE IF NOT EXISTS public.cc_floor_video_grants(
 room_id uuid NOT NULL REFERENCES public.cc_live_rooms(id) ON DELETE RESTRICT,
 subject text NOT NULL,
 granted boolean NOT NULL DEFAULT true,
 changed_by text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,subject)
);
ALTER TABLE public.cc_conference_video_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_floor_video_grants ENABLE ROW LEVEL SECURITY;
