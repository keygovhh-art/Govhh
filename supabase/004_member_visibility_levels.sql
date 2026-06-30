create extension if not exists pgcrypto;

alter table public.personal_items
  add column if not exists privacy_level text not null default 'private'
  check (privacy_level in ('private','progress_only','selected_share','team_shared')),
  add column if not exists counts_toward_progress boolean not null default true;

create table if not exists public.member_privacy_settings (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  progress_visibility text not null default 'owner_admin'
    check (progress_visibility in ('self_only','owner_admin','campaign_managers')),
  official_action_visibility text not null default 'owner_assignee'
    check (official_action_visibility in ('self_only','owner_assignee','campaign_managers','team_shared')),
  personal_tasks_visibility text not null default 'private'
    check (personal_tasks_visibility in ('private','selected_share','team_shared')),
  planning_visibility text not null default 'private'
    check (planning_visibility in ('private','selected_share')),
  private_notes_visibility text not null default 'private'
    check (private_notes_visibility in ('private','selected_share')),
  updated_at timestamptz not null default now(),
  primary key (campaign_id,user_id)
);

create table if not exists public.private_plans (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  status text not null default 'active' check (status in ('active','completed','archived')),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.item_access_grants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  grantor_user_id uuid not null references auth.users(id) on delete cascade,
  grantee_user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('personal_item','private_plan')),
  entity_id uuid not null,
  permission text not null default 'read' check (permission in ('read','comment')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.member_progress_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'task_opened','task_completed','campaign_action_opened','campaign_action_completed',
    'call_logged','followup_completed','pledge_followed_up','donation_credited','custom'
  )),
  quantity integer not null default 1,
  amount numeric(12,2),
  source_type text,
  source_id uuid,
  occurred_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.member_privacy_settings enable row level security;
alter table public.private_plans enable row level security;
alter table public.item_access_grants enable row level security;
alter table public.member_progress_events enable row level security;

create or replace function public.has_active_item_grant(
  target_campaign uuid,
  target_entity_type text,
  target_entity_id uuid,
  target_permission text default 'read'
)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.item_access_grants g
    where g.campaign_id=target_campaign
      and g.entity_type=target_entity_type
      and g.entity_id=target_entity_id
      and g.grantee_user_id=auth.uid()
      and g.permission in (target_permission,'comment')
      and g.revoked_at is null
      and g.starts_at <= now()
      and (g.expires_at is null or g.expires_at > now())
  );
$$;

create or replace function public.get_campaign_member_progress(target_campaign uuid)
returns table (
  user_id uuid,
  display_name text,
  open_actions bigint,
  completed_actions bigint,
  calls_logged bigint,
  followups_completed bigint,
  amount_credited numeric,
  last_activity_at timestamptz
)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_campaign_role(target_campaign,array['owner','admin','moderator']) then
    raise exception 'not authorized';
  end if;

  return query
  select
    r.user_id,
    coalesce(p.display_name,'Campaign member') as display_name,
    count(*) filter (where e.event_type in ('task_opened','campaign_action_opened')) as open_actions,
    count(*) filter (where e.event_type in ('task_completed','campaign_action_completed')) as completed_actions,
    count(*) filter (where e.event_type='call_logged') as calls_logged,
    count(*) filter (where e.event_type in ('followup_completed','pledge_followed_up')) as followups_completed,
    coalesce(sum(e.amount) filter (where e.event_type='donation_credited'),0)::numeric as amount_credited,
    max(e.occurred_at) as last_activity_at
  from public.campaign_roles r
  left join public.profiles p on p.id=r.user_id
  left join public.member_progress_events e
    on e.campaign_id=r.campaign_id and e.member_user_id=r.user_id
  left join public.member_privacy_settings s
    on s.campaign_id=r.campaign_id and s.user_id=r.user_id
  where r.campaign_id=target_campaign
    and r.role in ('askan','moderator','treasurer','admin')
    and coalesce(s.progress_visibility,'owner_admin') in ('owner_admin','campaign_managers')
  group by r.user_id,p.display_name;
end;
$$;

create policy "member privacy settings read own and owner admin" on public.member_privacy_settings
for select to authenticated using (
  user_id=auth.uid() or public.has_campaign_role(campaign_id,array['owner','admin'])
);
create policy "member privacy settings insert own" on public.member_privacy_settings
for insert to authenticated with check (user_id=auth.uid());
create policy "member privacy settings update own" on public.member_privacy_settings
for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

create policy "private plans read owner or direct grant" on public.private_plans
for select to authenticated using (
  owner_user_id=auth.uid()
  or public.has_active_item_grant(campaign_id,'private_plan',id,'read')
  or public.has_active_break_glass_access(campaign_id,'private_notes')
);
create policy "private plans insert own" on public.private_plans
for insert to authenticated with check (owner_user_id=auth.uid());
create policy "private plans update own" on public.private_plans
for update to authenticated using (owner_user_id=auth.uid()) with check (owner_user_id=auth.uid());

create policy "item grants read parties" on public.item_access_grants
for select to authenticated using (
  grantor_user_id=auth.uid() or grantee_user_id=auth.uid()
);
create policy "item grants create grantor" on public.item_access_grants
for insert to authenticated with check (
  grantor_user_id=auth.uid()
);
create policy "item grants revoke grantor" on public.item_access_grants
for update to authenticated using (grantor_user_id=auth.uid()) with check (grantor_user_id=auth.uid());

create policy "progress events read member and managers" on public.member_progress_events
for select to authenticated using (
  member_user_id=auth.uid()
  or public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
);
create policy "progress events insert self or managers" on public.member_progress_events
for insert to authenticated with check (
  recorded_by=auth.uid()
  and (
    member_user_id=auth.uid()
    or public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
  )
);

-- Replace the broad personal-item read rule with graded privacy.
drop policy if exists "personal items read own or shared" on public.personal_items;
create policy "personal items graded read" on public.personal_items
for select to authenticated using (
  owner_user_id=auth.uid()
  or public.has_active_item_grant(campaign_id,'personal_item',id,'read')
  or (
    privacy_level='team_shared'
    and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
  )
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

-- Official campaign actions are campaign-owned work. Private planning must stay in private_plans/personal_items.
drop policy if exists "actions read members" on public.campaign_actions;
create policy "actions read participants and campaign managers" on public.campaign_actions
for select to authenticated using (
  created_by=auth.uid()
  or assigned_to=auth.uid()
  or public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
);

revoke delete on public.member_privacy_settings from authenticated;
revoke delete on public.private_plans from authenticated;
revoke delete on public.item_access_grants from authenticated;
revoke delete on public.member_progress_events from authenticated;
