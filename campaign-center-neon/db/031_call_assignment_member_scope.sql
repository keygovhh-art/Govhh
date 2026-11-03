-- Opt-in person-level calling assignment; existing team-level assignments remain.
-- This migration MUST be applied after staging verification, never during a blind redeploy.
ALTER TABLE public.cc_contacts
 ADD COLUMN IF NOT EXISTS assigned_member_subject text;
CREATE INDEX IF NOT EXISTS cc_contacts_member_call_queue_idx
 ON public.cc_contacts(campaign_id,assigned_member_subject,created_at);
-- Preserve per-campaign membership ownership: a contact cannot be given to
-- someone from another campaign.
DO $
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint WHERE conname='cc_contacts_assigned_member_fk' AND
    conrelid='public.cc_contacts'::regclass
 ) THEN
  ALTER TABLE public.cc_contacts
   ADD CONSTRAINT cc_contacts_assigned_member_fk
   FOREIGN KEY(campaign_id,assigned_member_subject)
   REFERENCES public.cc_campaign_members(campaign_id,subject)
   ON DELETE SET NULL (assigned_member_subject);
 END IF;
END $;
