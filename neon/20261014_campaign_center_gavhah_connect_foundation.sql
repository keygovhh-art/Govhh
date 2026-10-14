-- Campaign Center x Gavhah MAX: staged Neon foundation (not wired to UI/auth yet)
-- Safe forward-only creation. NEVER deploy without verified app-level auth and permissions.
-- A member's private MAX contacts live elsewhere and must never be copied here implicitly.
CREATE TABLE IF NOT EXISTS cc_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cc_memberships (
  organization_id uuid NOT NULL REFERENCES cc_organizations(id) ON DELETE CASCADE,
  subject text NOT NULL,
  role text NOT NULL CHECK(role IN ('owner','manager','squad_leader','askan','finance','auditor')),
  membership_status text NOT NULL DEFAULT 'invited' CHECK (membership_status IN ('invited','active','suspended','revoked')),
  joined_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, subject)
);
CREATE TABLE IF NOT EXISTS cc_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES cc_organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  goal_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(goal_amount >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE TABLE IF NOT EXISTS cc_campaign_members (
  organization_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  subject text NOT NULL,
  team_name text NOT NULL DEFAULT '',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, subject),
  FOREIGN KEY (organization_id,campaign_id) REFERENCES cc_campaigns(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id,subject) REFERENCES cc_memberships(organization_id,subject) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS cc_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  assignee_subject text NOT NULL,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'task' CHECK(kind IN ('task','call_lead','followup','review')),
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','done','cancelled')),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,campaign_id) REFERENCES cc_campaigns(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id,assignee_subject) REFERENCES cc_campaign_members(campaign_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_assignments_person_queue_idx ON cc_assignments(assignee_subject,status,due_at);
CREATE TABLE IF NOT EXISTS cc_sponsored_max_seats (
  organization_id uuid NOT NULL,
  member_subject text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','revoked','expired')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,member_subject),
  FOREIGN KEY (organization_id,member_subject) REFERENCES cc_memberships(organization_id,subject) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS cc_shared_followup_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  member_subject text NOT NULL,
  max_followup_ref text NOT NULL,
  share_scope text NOT NULL DEFAULT 'campaign' CHECK(share_scope IN ('campaign','assigned_managers')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,campaign_id,max_followup_ref),
  FOREIGN KEY (organization_id,campaign_id) REFERENCES cc_campaigns(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id,member_subject) REFERENCES cc_memberships(organization_id,subject)
);
CREATE TABLE IF NOT EXISTS cc_finance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  credited_member_subject text,
  source_system text NOT NULL,
  source_event_key text NOT NULL,
  event_kind text NOT NULL CHECK(event_kind IN ('pledge','receipt','refund','correction')),
  amount numeric(14,2) NOT NULL CHECK(amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  related_pledge_id uuid REFERENCES cc_finance_events(id),
  verified_at timestamptz,
  verification_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,source_system,source_event_key),
  FOREIGN KEY (organization_id,campaign_id) REFERENCES cc_campaigns(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,credited_member_subject) REFERENCES cc_memberships(organization_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_finance_campaign_kind_idx ON cc_finance_events(campaign_id,event_kind,created_at);
CREATE TABLE IF NOT EXISTS cc_live_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  title text NOT NULL,
  room_status text NOT NULL DEFAULT 'planned' CHECK(room_status IN ('planned','open','paused','ended')),
  provider_room_ref text,
  scheduled_at timestamptz,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,campaign_id) REFERENCES cc_campaigns(organization_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS cc_live_room_participation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES cc_live_rooms(id) ON DELETE CASCADE,
  member_subject text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  provider_participation_ref text
);
CREATE INDEX IF NOT EXISTS cc_live_room_active_idx ON cc_live_room_participation(room_id,left_at);
-- Security requirement before connecting clients:
-- ALL organization-scoped reads/writes must go through a verified server auth layer
-- with transactionally checked membership, role, status, and campaign scope.
-- No browser-side access with admin/service credentials, and no raw PAN/card numbers.
