create extension if not exists pgcrypto;

create table if not exists public.kesher_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  display_name text not null,
  primary_phone text,
  secondary_phone text,
  email text,
  institution text,
  contact_role text not null default 'general'
    check (contact_role in ('donor','askan','nitzrach','professional','institution','general')),
  custom_title text,
  labels jsonb not null default '[]'::jsonb,
  relationship_status text not null default 'new'
    check (relationship_status in ('new','active','waiting','follow_up','dormant','completed')),
  time_outlook text not null default 'present'
    check (time_outlook in ('urgent','present','future')),
  importance text not null default 'normal'
    check (importance in ('normal','high','critical')),
  line_number text,
  private_note text,
  future_outlook_note text,
  next_action_at timestamptz,
  expected_amount numeric(14,2) not null default 0,
  last_gift_amount numeric(14,2) not null default 0,
  last_gift_date date,
  visibility text not null default 'private'
    check (visibility in ('private','campaign_shared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  check (jsonb_typeof(labels) = 'array'),
  check (visibility = 'private' or campaign_id is not null)
);

create index if not exists kesher_contacts_owner_idx
  on public.kesher_contacts(owner_user_id,updated_at desc)
  where deleted_at is null;
create index if not exists kesher_contacts_campaign_idx
  on public.kesher_contacts(campaign_id,updated_at desc)
  where deleted_at is null and campaign_id is not null;
create index if not exists kesher_contacts_next_action_idx
  on public.kesher_contacts(owner_user_id,next_action_at)
  where deleted_at is null and next_action_at is not null;

create table if not exists public.kesher_interactions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.kesher_contacts(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  interaction_type text not null default 'call'
    check (interaction_type in ('call','message','meeting','email','note','referral')),
  playbook_code text,
  outcome text not null default 'spoke'
    check (outcome in ('no_answer','spoke','callback','pledged','referred','needs_help','not_interested','resolved')),
  note text,
  amount numeric(14,2) not null default 0,
  callback_at timestamptz,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  corrected_at timestamptz,
  corrected_by uuid references auth.users(id),
  correction_reason text,
  deleted_at timestamptz,
  check (owner_user_id is not null)
);

create index if not exists kesher_interactions_contact_idx
  on public.kesher_interactions(contact_id,occurred_at desc)
  where deleted_at is null;
create index if not exists kesher_interactions_owner_idx
  on public.kesher_interactions(owner_user_id,occurred_at desc)
  where deleted_at is null;

create table if not exists public.kesher_playbooks (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  audience_role text not null
    check (audience_role in ('donor','askan','nitzrach','professional','institution','general')),
  title_yi text not null,
  title_en text,
  description_yi text,
  description_en text,
  version_number integer not null default 1,
  status text not null default 'draft'
    check (status in ('draft','professional_review','approved','retired')),
  steps jsonb not null default '[]'::jsonb,
  ethics_note_yi text,
  ethics_note_en text,
  created_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code,campaign_id,version_number),
  check (jsonb_typeof(steps) = 'array')
);

create table if not exists public.kesher_playbook_outcomes (
  id bigint generated always as identity primary key,
  playbook_id uuid references public.kesher_playbooks(id) on delete set null,
  playbook_code text not null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  structured_outcome text not null,
  converted boolean,
  followup_created boolean not null default false,
  amount numeric(14,2),
  occurred_at timestamptz not null default now()
);

comment on table public.kesher_contacts is
'Professional askanus phonebook. Private by default. Campaign sharing requires an explicit campaign and permission.';
comment on column public.kesher_contacts.private_note is
'Private relationship context. This field is not professional-review data unless the owner explicitly shares the contact.';
comment on table public.kesher_playbook_outcomes is
'Structured guide-performance facts only. It intentionally excludes private call notes and contact narrative.';

alter table public.kesher_contacts enable row level security;
alter table public.kesher_interactions enable row level security;
alter table public.kesher_playbooks enable row level security;
alter table public.kesher_playbook_outcomes enable row level security;

create policy "owners read private or authorized shared contacts"
on public.kesher_contacts for select to authenticated
using (
  owner_user_id = auth.uid()
  or (
    visibility = 'campaign_shared'
    and campaign_id is not null
    and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan','viewer'])
  )
);

create policy "owners create contacts"
on public.kesher_contacts for insert to authenticated
with check (
  owner_user_id = auth.uid()
  and (
    visibility = 'private'
    or (
      visibility = 'campaign_shared'
      and campaign_id is not null
      and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
    )
  )
);

create policy "owners update own contacts"
on public.kesher_contacts for update to authenticated
using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and (
    visibility = 'private'
    or (
      visibility = 'campaign_shared'
      and campaign_id is not null
      and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
    )
  )
);

create policy "owners and authorized members read interactions"
on public.kesher_interactions for select to authenticated
using (
  owner_user_id = auth.uid()
  or (
    campaign_id is not null
    and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan','viewer'])
    and exists (
      select 1 from public.kesher_contacts c
      where c.id = contact_id and c.visibility = 'campaign_shared'
    )
  )
);

create policy "owners create own interactions"
on public.kesher_interactions for insert to authenticated
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1 from public.kesher_contacts c
    where c.id = contact_id and c.owner_user_id = auth.uid()
  )
);

create policy "owners correct own interactions"
on public.kesher_interactions for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "authenticated read approved global playbooks"
on public.kesher_playbooks for select to authenticated
using (
  status = 'approved'
  and (
    campaign_id is null
    or public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan','viewer'])
  )
);

create policy "campaign managers read campaign playbook drafts"
on public.kesher_playbooks for select to authenticated
using (
  campaign_id is not null
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
);

create policy "owners insert structured outcomes"
on public.kesher_playbook_outcomes for insert to authenticated
with check (owner_user_id = auth.uid());

create policy "owners read own structured outcomes"
on public.kesher_playbook_outcomes for select to authenticated
using (
  owner_user_id = auth.uid()
  or (
    campaign_id is not null
    and public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
  )
);

revoke delete on public.kesher_contacts from authenticated;
revoke delete on public.kesher_interactions from authenticated;
revoke insert,update,delete on public.kesher_playbooks from authenticated;
revoke update,delete on public.kesher_playbook_outcomes from authenticated;

insert into public.plan_feature_entitlements(plan_code,feature_code,enabled)
values
  ('personal_askan','kesher_book',true),
  ('personal_askan','basic_call_guides',true),
  ('chesed_quick','kesher_book',true),
  ('chesed_quick','basic_call_guides',true),
  ('chesed_quick','campaign_contact_sharing',true),
  ('askan_pro','kesher_book',true),
  ('askan_pro','basic_call_guides',true),
  ('askan_pro','campaign_contact_sharing',true),
  ('askan_pro','professional_playbooks',true),
  ('askan_pro','contact_segments',true),
  ('gabbai_pro','kesher_book',true),
  ('gabbai_pro','basic_call_guides',true),
  ('gabbai_pro','campaign_contact_sharing',true),
  ('gabbai_pro','professional_playbooks',true),
  ('gabbai_pro','contact_segments',true),
  ('gabbai_pro','playbook_outcome_analytics',true),
  ('organization','kesher_book',true),
  ('organization','basic_call_guides',true),
  ('organization','campaign_contact_sharing',true),
  ('organization','professional_playbooks',true),
  ('organization','contact_segments',true),
  ('organization','playbook_outcome_analytics',true),
  ('custom','kesher_book',true),
  ('custom','basic_call_guides',true),
  ('custom','campaign_contact_sharing',true),
  ('custom','professional_playbooks',true),
  ('custom','contact_segments',true),
  ('custom','playbook_outcome_analytics',true)
on conflict (plan_code,feature_code) do update set enabled = excluded.enabled;
