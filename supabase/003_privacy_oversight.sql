create extension if not exists pgcrypto;

alter table public.campaigns
  add column if not exists visibility text not null default 'private'
  check (visibility in ('private','invite_only','public'));

alter table public.campaign_members
  add column if not exists public_profile boolean not null default false;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  admin_role text not null check (admin_role in ('founder','super_admin','compliance')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_oversight_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  system_watch_enabled boolean not null default true,
  human_review_enabled boolean not null default false,
  share_campaign_summary boolean not null default true,
  share_team_activity boolean not null default false,
  share_pledge_statuses boolean not null default false,
  share_contact_details boolean not null default false,
  share_financial_details boolean not null default false,
  share_shared_notes boolean not null default false,
  share_attachments boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_oversight_preferences (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  share_personal_tasks boolean not null default false,
  share_private_notes boolean not null default false,
  share_followups boolean not null default false,
  share_personal_contact_notes boolean not null default false,
  allow_direct_contact boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (campaign_id,user_id)
);

create table if not exists public.professional_review_assignments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  professional_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','active','paused','ended')),
  purpose text,
  access_starts_at timestamptz,
  access_ends_at timestamptz,
  last_review_at timestamptz,
  assigned_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.emergency_access_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  accessor_user_id uuid not null references auth.users(id),
  requested_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  reason text not null,
  scope jsonb not null default '["campaign_summary"]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','active','expired','revoked','denied')),
  activated_at timestamptz,
  expires_at timestamptz,
  user_notification_required boolean not null default true,
  user_notified_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.oversight_access_log (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  viewer_user_id uuid not null references auth.users(id),
  subject_user_id uuid references auth.users(id),
  access_source text not null check (access_source in ('professional_review','emergency_access','system_watch')),
  data_category text not null,
  entity_type text,
  entity_id uuid,
  reason text,
  professional_assignment_id uuid references public.professional_review_assignments(id),
  emergency_event_id uuid references public.emergency_access_events(id),
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.campaign_oversight_settings enable row level security;
alter table public.user_oversight_preferences enable row level security;
alter table public.professional_review_assignments enable row level security;
alter table public.emergency_access_events enable row level security;
alter table public.oversight_access_log enable row level security;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = auth.uid() and a.is_active = true
  );
$$;

create or replace function public.has_active_break_glass_access(
  target_campaign uuid,
  requested_category text
)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.emergency_access_events e
    where e.campaign_id = target_campaign
      and e.accessor_user_id = auth.uid()
      and e.status = 'active'
      and e.activated_at is not null
      and (e.expires_at is null or e.expires_at > now())
      and (
        e.scope ? 'all'
        or e.scope ? requested_category
      )
  );
$$;

create or replace function public.has_active_professional_access(
  target_campaign uuid,
  requested_category text,
  subject_user uuid default null
)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1
    from public.professional_review_assignments a
    join public.campaign_oversight_settings s on s.campaign_id = a.campaign_id
    left join public.user_oversight_preferences p
      on p.campaign_id = a.campaign_id and p.user_id = subject_user
    where a.campaign_id = target_campaign
      and a.professional_user_id = auth.uid()
      and a.status = 'active'
      and (a.access_starts_at is null or a.access_starts_at <= now())
      and (a.access_ends_at is null or a.access_ends_at > now())
      and s.human_review_enabled = true
      and case requested_category
        when 'campaign_summary' then s.share_campaign_summary
        when 'team_activity' then s.share_team_activity
        when 'pledge_statuses' then s.share_pledge_statuses
        when 'contact_details' then s.share_contact_details
        when 'financial_details' then s.share_financial_details
        when 'shared_notes' then s.share_shared_notes
        when 'attachments' then s.share_attachments
        when 'personal_tasks' then coalesce(p.share_personal_tasks,false)
        when 'private_notes' then coalesce(p.share_private_notes,false)
        when 'followups' then coalesce(p.share_followups,false)
        when 'personal_contact_notes' then coalesce(p.share_personal_contact_notes,false)
        else false
      end
  );
$$;

create or replace function public.get_my_oversight_status(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  result jsonb;
begin
  if not public.has_campaign_role(target_campaign,array['owner','admin','treasurer','moderator','askan','viewer']) then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'campaign_id',s.campaign_id,
    'system_watch_enabled',s.system_watch_enabled,
    'human_review_enabled',s.human_review_enabled,
    'professional_team_connected',exists(
      select 1 from public.professional_review_assignments a
      where a.campaign_id=s.campaign_id
        and a.status='active'
        and (a.access_ends_at is null or a.access_ends_at>now())
    ),
    'last_professional_review_at',(
      select max(a.last_review_at) from public.professional_review_assignments a
      where a.campaign_id=s.campaign_id and a.status='active'
    ),
    'campaign_scope',jsonb_build_object(
      'campaign_summary',s.share_campaign_summary,
      'team_activity',s.share_team_activity,
      'pledge_statuses',s.share_pledge_statuses,
      'contact_details',s.share_contact_details,
      'financial_details',s.share_financial_details,
      'shared_notes',s.share_shared_notes,
      'attachments',s.share_attachments
    ),
    'my_private_sharing',jsonb_build_object(
      'personal_tasks',coalesce(p.share_personal_tasks,false),
      'private_notes',coalesce(p.share_private_notes,false),
      'followups',coalesce(p.share_followups,false),
      'personal_contact_notes',coalesce(p.share_personal_contact_notes,false),
      'allow_direct_contact',coalesce(p.allow_direct_contact,false)
    )
  ) into result
  from public.campaign_oversight_settings s
  left join public.user_oversight_preferences p
    on p.campaign_id=s.campaign_id and p.user_id=auth.uid()
  where s.campaign_id=target_campaign;

  return coalesce(result,jsonb_build_object(
    'campaign_id',target_campaign,
    'system_watch_enabled',true,
    'human_review_enabled',false,
    'professional_team_connected',false,
    'campaign_scope','{}'::jsonb,
    'my_private_sharing','{}'::jsonb
  ));
end;
$$;

create policy "platform admins read own status" on public.platform_admins
for select to authenticated using (user_id = auth.uid());

create policy "oversight settings read campaign members" on public.campaign_oversight_settings
for select to authenticated using (
  public.has_campaign_role(campaign_id,array['owner','admin','treasurer','moderator','askan','viewer'])
);
create policy "oversight settings manage owner admin" on public.campaign_oversight_settings
for all to authenticated using (
  public.has_campaign_role(campaign_id,array['owner','admin'])
) with check (
  public.has_campaign_role(campaign_id,array['owner','admin'])
);

create policy "user oversight preferences read own or managers" on public.user_oversight_preferences
for select to authenticated using (
  user_id=auth.uid() or public.has_campaign_role(campaign_id,array['owner','admin'])
);
create policy "user oversight preferences insert own" on public.user_oversight_preferences
for insert to authenticated with check (user_id=auth.uid());
create policy "user oversight preferences update own" on public.user_oversight_preferences
for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

create policy "professional assignments read assigned or managers" on public.professional_review_assignments
for select to authenticated using (
  professional_user_id=auth.uid()
  or public.has_campaign_role(campaign_id,array['owner','admin'])
);
create policy "professional assignments manage owner admin" on public.professional_review_assignments
for all to authenticated using (
  public.has_campaign_role(campaign_id,array['owner','admin'])
) with check (
  public.has_campaign_role(campaign_id,array['owner','admin'])
);

create policy "emergency events read authorized" on public.emergency_access_events
for select to authenticated using (
  accessor_user_id=auth.uid()
  or requested_by=auth.uid()
  or approved_by=auth.uid()
  or public.has_campaign_role(campaign_id,array['owner','admin'])
  or public.is_platform_admin()
);
create policy "emergency events create platform admins" on public.emergency_access_events
for insert to authenticated with check (
  public.is_platform_admin() and requested_by=auth.uid()
);
create policy "emergency events update platform admins" on public.emergency_access_events
for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "oversight log read subject managers admins" on public.oversight_access_log
for select to authenticated using (
  subject_user_id=auth.uid()
  or public.has_campaign_role(campaign_id,array['owner','admin'])
  or public.is_platform_admin()
);
create policy "oversight log insert reviewers admins" on public.oversight_access_log
for insert to authenticated with check (
  viewer_user_id=auth.uid()
  and (
    public.is_platform_admin()
    or exists (
      select 1 from public.professional_review_assignments a
      where a.id=professional_assignment_id
        and a.professional_user_id=auth.uid()
        and a.status='active'
    )
  )
);

-- Public campaign visibility is opt-in only.
drop policy if exists "public read active campaigns" on public.campaigns;
create policy "public read public active campaigns" on public.campaigns
for select to anon using (status='active' and visibility='public');
create policy "members read private campaigns" on public.campaigns
for select to authenticated using (
  visibility='public'
  or public.has_campaign_role(id,array['owner','admin','treasurer','moderator','askan','viewer'])
  or public.has_active_professional_access(id,'campaign_summary',null)
  or public.has_active_break_glass_access(id,'campaign_summary')
);

drop policy if exists "public read dashboard metrics" on public.dashboard_metrics;
create policy "public read metrics for public campaigns" on public.dashboard_metrics
for select to anon using (exists (
  select 1 from public.campaigns c
  where c.id=campaign_id and c.status='active' and c.visibility='public'
));
create policy "authorized read dashboard metrics" on public.dashboard_metrics
for select to authenticated using (
  public.has_campaign_role(campaign_id,array['owner','admin','treasurer','moderator','askan','viewer'])
  or public.has_active_professional_access(campaign_id,'campaign_summary',null)
  or public.has_active_break_glass_access(campaign_id,'campaign_summary')
);

drop policy if exists "public read active members" on public.campaign_members;
create policy "public read opted in members" on public.campaign_members
for select to anon using (
  is_active=true and public_profile=true and exists (
    select 1 from public.campaigns c
    where c.id=campaign_id and c.status='active' and c.visibility='public'
  )
);
create policy "authorized read campaign members" on public.campaign_members
for select to authenticated using (
  public.has_campaign_role(campaign_id,array['owner','admin','treasurer','moderator','askan','viewer'])
  or public.has_active_professional_access(campaign_id,'team_activity',null)
  or public.has_active_break_glass_access(campaign_id,'team_activity')
);

create policy "professional read actions by scope" on public.campaign_actions
for select to authenticated using (
  public.has_active_professional_access(campaign_id,'team_activity',assigned_to)
  or public.has_active_break_glass_access(campaign_id,'team_activity')
);

create policy "professional read protected by scope" on public.protected_records
for select to authenticated using (
  public.has_active_professional_access(campaign_id,'financial_details',null)
  or public.has_active_break_glass_access(campaign_id,'financial_details')
);

create policy "professional read personal items by owner choice" on public.personal_items
for select to authenticated using (
  case item_type
    when 'task' then public.has_active_professional_access(campaign_id,'personal_tasks',owner_user_id)
    when 'private_note' then public.has_active_professional_access(campaign_id,'private_notes',owner_user_id)
    when 'follow_up' then public.has_active_professional_access(campaign_id,'followups',owner_user_id)
    else false
  end
  or public.has_active_break_glass_access(
    campaign_id,
    case item_type
      when 'task' then 'personal_tasks'
      when 'private_note' then 'private_notes'
      when 'follow_up' then 'followups'
      else 'personal_items'
    end
  )
);

revoke delete on public.platform_admins from authenticated;
revoke delete on public.campaign_oversight_settings from authenticated;
revoke delete on public.user_oversight_preferences from authenticated;
revoke delete on public.professional_review_assignments from authenticated;
revoke delete on public.emergency_access_events from authenticated;
revoke delete on public.oversight_access_log from authenticated;
