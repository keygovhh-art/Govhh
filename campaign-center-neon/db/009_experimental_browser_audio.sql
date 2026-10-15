-- 009: Optional experimental browser-to-browser audio, independent of telephone carriers.
-- At most 8 people per room; no SFU, TURN relay, call recording or provider guarantee.
CREATE TABLE IF NOT EXISTS public.cc_conference_rtc_peers (
  room_id uuid NOT NULL REFERENCES public.cc_conference_rooms(id) ON DELETE RESTRICT,
  subject text NOT NULL,
  mode text NOT NULL CHECK(mode IN ('speaker','listener')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(room_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_conference_rtc_presence_idx ON public.cc_conference_rtc_peers(room_id,last_seen_at);
CREATE TABLE IF NOT EXISTS public.cc_conference_rtc_signals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.cc_conference_rooms(id) ON DELETE RESTRICT,
  sender_subject text NOT NULL,
  recipient_subject text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('offer','answer','ice','bye')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_conference_rtc_inbox_idx
  ON public.cc_conference_rtc_signals(room_id,recipient_subject,id);
CREATE INDEX IF NOT EXISTS cc_conference_rtc_expiry_idx
  ON public.cc_conference_rtc_signals(created_at);
ALTER TABLE public.cc_conference_rtc_peers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_conference_rtc_signals ENABLE ROW LEVEL SECURITY;
-- No direct public policies. All access is through verified conference participants.
