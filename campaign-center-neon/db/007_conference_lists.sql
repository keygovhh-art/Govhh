-- 007: independently switchable conference subject allow/deny lists.
-- Browser identity is the verified Neon Auth subject (never an unverified phone number).
CREATE TABLE IF NOT EXISTS public.cc_conference_access_lists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES public.cc_conference_rooms(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK(length(title) BETWEEN 2 AND 120),
 list_type text NOT NULL CHECK(list_type IN('allow','deny')),
 enabled boolean NOT NULL DEFAULT false,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(room_id,title)
);
CREATE INDEX IF NOT EXISTS cc_conference_lists_enabled_idx ON public.cc_conference_access_lists(room_id,enabled,list_type);
CREATE TABLE IF NOT EXISTS public.cc_conference_list_entries (
 list_id uuid NOT NULL REFERENCES public.cc_conference_access_lists(id) ON DELETE RESTRICT,
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 255),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(list_id,subject)
);
ALTER TABLE public.cc_conference_access_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_conference_list_entries ENABLE ROW LEVEL SECURITY;
