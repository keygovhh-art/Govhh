-- 004: Independent, browser-native conference center (separate from campaign calling halls).
-- No telephony/SIP dependency and no fabricated microphone or provider call status.
CREATE TABLE IF NOT EXISTS public.cc_conference_rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.cc_organizations(id) ON DELETE RESTRICT,
 campaign_id uuid,
 title text NOT NULL CHECK(length(title) BETWEEN 2 AND 180),
 category text NOT NULL DEFAULT 'assembly' CHECK(category IN ('assembly','inspiration','technical','advice','other')),
 agenda text NOT NULL DEFAULT '',
 room_status text NOT NULL DEFAULT 'planned' CHECK(room_status IN ('planned','open','paused','ended')),
 access_mode text NOT NULL DEFAULT 'members' CHECK(access_mode IN ('members','code')),
 access_code_hash text,
 speaking_mode text NOT NULL DEFAULT 'moderated' CHECK(speaking_mode IN ('listeners','moderated','open')),
 phase text NOT NULL DEFAULT 'lecture' CHECK(phase IN ('lecture','qna','discussion')),
 created_by text NOT NULL,
 scheduled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 opened_at timestamptz,
 closed_at timestamptz,
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 CHECK ((access_mode='code' AND access_code_hash IS NOT NULL) OR (access_mode='members' AND access_code_hash IS NULL))
);
CREATE INDEX IF NOT EXISTS cc_conferences_org_date_idx ON public.cc_conference_rooms(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.cc_conference_participants (
 room_id uuid NOT NULL REFERENCES public.cc_conference_rooms(id) ON DELETE RESTRICT,
 subject text NOT NULL,
 admitted boolean NOT NULL DEFAULT false,
 banned boolean NOT NULL DEFAULT false,
 moderator_muted boolean NOT NULL DEFAULT false,
 speaking_granted boolean NOT NULL DEFAULT false,
 hand_raised boolean NOT NULL DEFAULT false,
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 joined_at timestamptz,
 left_at timestamptz,
 PRIMARY KEY(room_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_conf_presence_idx ON public.cc_conference_participants(room_id,last_seen_at);
CREATE TABLE IF NOT EXISTS public.cc_conference_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.cc_organizations(id) ON DELETE RESTRICT,
 room_id uuid NOT NULL REFERENCES public.cc_conference_rooms(id) ON DELETE RESTRICT,
 authored_by text NOT NULL,
 message_kind text NOT NULL DEFAULT 'discussion' CHECK(message_kind IN ('discussion','announcement','question')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 1200),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_conference_messages_idx ON public.cc_conference_messages(room_id,created_at DESC,id DESC);
ALTER TABLE public.cc_conference_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_conference_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_conference_messages ENABLE ROW LEVEL SECURITY;
-- No direct public Data API policies. All writes go through the authenticated Node API.
CREATE OR REPLACE TRIGGER cc_conference_messages_append_only
 BEFORE UPDATE OR DELETE ON public.cc_conference_messages
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
