-- Independent, reversible policy lists for authenticated organization users.
-- These are WEBSITE account rules, not unverified telephone-number blacklists.
CREATE TABLE IF NOT EXISTS public.cc_conference_access_rules (
 room_id uuid NOT NULL REFERENCES public.cc_conference_rooms(id) ON DELETE RESTRICT,
 subject text NOT NULL,
 rule text NOT NULL CHECK(rule IN ('deny_entry','skip_waiting','deny_messages')),
 enabled boolean NOT NULL DEFAULT true,
 changed_by text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,subject,rule)
);
CREATE INDEX IF NOT EXISTS cc_conference_rules_subject_idx
 ON public.cc_conference_access_rules(subject,room_id) WHERE enabled=true;
ALTER TABLE public.cc_conference_access_rules ENABLE ROW LEVEL SECURITY;
