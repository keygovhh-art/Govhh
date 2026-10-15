-- STAGING-ONLY, additive. No production migration or old data changes.
-- There is deliberately no cascade-delete history endpoint.
CREATE TABLE IF NOT EXISTS cc_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES cc_organizations(id) ON DELETE RESTRICT,
  campaign_id uuid,
  actor_subject text NOT NULL,
  event_type text NOT NULL,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_activity_org_idx ON cc_activity_events(organization_id, created_at DESC);
ALTER TABLE cc_assignments ADD COLUMN IF NOT EXISTS request_key text;
CREATE UNIQUE INDEX IF NOT EXISTS cc_assignments_campaign_request_unique
  ON cc_assignments(campaign_id,request_key) WHERE request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS cc_campaign_members_subject_idx ON cc_campaign_members(subject,campaign_id);
