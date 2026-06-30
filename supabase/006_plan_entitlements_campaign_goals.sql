create extension if not exists pgcrypto;

alter table public.campaigns
  add column if not exists plan_code text not null default 'chesed_quick',
  add column if not exists description text,
  add column if not exists category text,
  add column if not exists goal_amount numeric(14,2) not null default 0,
  add column if not exists raised_amount numeric(14,2) not null default 0,
  add column if not exists currency text not null default 'USD',
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists campaign_status text not null default 'draft'
    check (campaign_status in ('draft','active','paused','completed','archived'));

create table if not exists public.plan_catalog (
  code text primary key,
  name text not null,
  display_order integer not null,
  member_limit integer,
  goal_limit integer,
  campaign_limit integer,
  oversight_level text not null default 'none'
    check (oversight_level in ('none','system_watch','human_review','priority','portfolio','custom')),
  is_public boolean not null default true,
  is_beta boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_feature_entitlements (
  plan_code text not null references public.plan_catalog(code) on delete cascade,
  feature_code text not null,
  enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  primary key (plan_code,feature_code)
);

create table if not exists public.campaign_feature_overrides (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  feature_code text not null,
  enabled boolean not null,
  configuration jsonb not null default '{}'::jsonb,
  granted_by uuid references auth.users(id),
  reason text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (campaign_id,feature_code)
);

create table if not exists public.campaign_goals (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'custom'
    check (category in ('money','members','calls','pledges','tasks','custom')),
  target_value numeric(14,2) not null default 0,
  current_value numeric(14,2) not null default 0,
  due_on date,
  status text not null default 'active'
    check (status in ('active','at_risk','completed','paused','archived')),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

create table if not exists public.campaign_goal_history (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.campaign_goals(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  changed_by uuid references auth.users(id),
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  change_type text not null default 'update'
    check (change_type in ('create','update','archive','restore')),
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_member_targets (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  money_target numeric(14,2) not null default 0,
  money_raised numeric(14,2) not null default 0,
  calls_target integer not null default 0,
  calls_completed integer not null default 0,
  actions_target integer not null default 0,
  actions_completed integer not null default 0,
  member_status text not null default 'active'
    check (member_status in ('active','quiet','paused','archived')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (campaign_id,user_id)
);

insert into public.plan_catalog
  (code,name,display_order,member_limit,goal_limit,campaign_limit,oversight_level,is_public,is_beta)
values
  ('personal_askan','Personal Askan',1,1,0,0,'none',true,true),
  ('chesed_quick','Chesed Quick',2,5,3,1,'system_watch',true,true),
  ('askan_pro','Askan Pro',3,25,20,1,'human_review',true,true),
  ('gabbai_pro','Gabbai Pro',4,100,100,3,'priority',true,true),
  ('organization','Organization',5,500,500,50,'portfolio',true,true),
  ('custom','Custom',6,null,null,null,'custom',true,true)
on conflict (code) do update set
  name=excluded.name,
  display_order=excluded.display_order,
  member_limit=excluded.member_limit,
  goal_limit=excluded.goal_limit,
  campaign_limit=excluded.campaign_limit,
  oversight_level=excluded.oversight_level,
  is_public=excluded.is_public,
  is_beta=excluded.is_beta,
  updated_at=now();

with entitlements(plan_code,feature_code) as (
  values
  ('personal_askan','personal_tasks'),('personal_askan','private_notes'),('personal_askan','contacts'),
  ('chesed_quick','personal_tasks'),('chesed_quick','private_notes'),('chesed_quick','contacts'),
  ('chesed_quick','campaign_core'),('chesed_quick','goals'),('chesed_quick','tasks'),
  ('chesed_quick','pledges'),('chesed_quick','manual_records'),('chesed_quick','external_link'),
  ('chesed_quick','basic_reports'),('chesed_quick','team'),('chesed_quick','member_progress'),('chesed_quick','system_watch'),
  ('askan_pro','personal_tasks'),('askan_pro','private_notes'),('askan_pro','contacts'),
  ('askan_pro','campaign_core'),('askan_pro','goals'),('askan_pro','tasks'),('askan_pro','pledges'),
  ('askan_pro','manual_records'),('askan_pro','external_link'),('askan_pro','basic_reports'),
  ('askan_pro','team'),('askan_pro','member_progress'),('askan_pro','system_watch'),
  ('askan_pro','crm'),('askan_pro','files'),('askan_pro','call_lists'),('askan_pro','csv_import'),
  ('askan_pro','clarity'),('askan_pro','automations'),('askan_pro','guidance'),
  ('gabbai_pro','personal_tasks'),('gabbai_pro','private_notes'),('gabbai_pro','contacts'),
  ('gabbai_pro','campaign_core'),('gabbai_pro','goals'),('gabbai_pro','tasks'),('gabbai_pro','pledges'),
  ('gabbai_pro','manual_records'),('gabbai_pro','external_link'),('gabbai_pro','basic_reports'),
  ('gabbai_pro','team'),('gabbai_pro','member_progress'),('gabbai_pro','system_watch'),
  ('gabbai_pro','crm'),('gabbai_pro','files'),('gabbai_pro','call_lists'),('gabbai_pro','csv_import'),
  ('gabbai_pro','clarity'),('gabbai_pro','automations'),('gabbai_pro','guidance'),
  ('gabbai_pro','finance'),('gabbai_pro','ledger'),('gabbai_pro','approvals'),('gabbai_pro','audit'),
  ('gabbai_pro','refunds'),('gabbai_pro','auto_sync'),('gabbai_pro','priority_oversight'),('gabbai_pro','custom_roles'),
  ('organization','personal_tasks'),('organization','private_notes'),('organization','contacts'),
  ('organization','campaign_core'),('organization','goals'),('organization','tasks'),('organization','pledges'),
  ('organization','manual_records'),('organization','external_link'),('organization','basic_reports'),
  ('organization','team'),('organization','member_progress'),('organization','system_watch'),
  ('organization','crm'),('organization','files'),('organization','call_lists'),('organization','csv_import'),
  ('organization','clarity'),('organization','automations'),('organization','guidance'),
  ('organization','finance'),('organization','ledger'),('organization','approvals'),('organization','audit'),
  ('organization','refunds'),('organization','auto_sync'),('organization','priority_oversight'),('organization','custom_roles'),
  ('organization','multi_campaign'),('organization','departments'),('organization','shared_crm'),('organization','portfolio'),
  ('custom','personal_tasks'),('custom','private_notes'),('custom','contacts'),('custom','campaign_core'),
  ('custom','goals'),('custom','tasks'),('custom','pledges'),('custom','manual_records'),('custom','external_link'),
  ('custom','basic_reports'),('custom','team'),('custom','member_progress'),('custom','system_watch'),
  ('custom','crm'),('custom','files'),('custom','call_lists'),('custom','csv_import'),('custom','clarity'),
  ('custom','automations'),('custom','guidance'),('custom','finance'),('custom','ledger'),('custom','approvals'),
  ('custom','audit'),('custom','refunds'),('custom','auto_sync'),('custom','priority_oversight'),
  ('custom','custom_roles'),('custom','multi_campaign'),('custom','departments'),('custom','shared_crm'),
  ('custom','portfolio'),('custom','hotline'),('custom','api')
)
insert into public.plan_feature_entitlements(plan_code,feature_code,enabled)
select plan_code,feature_code,true from entitlements
on conflict (plan_code,feature_code) do update set enabled=excluded.enabled;

create or replace function public.campaign_has_feature(target_campaign uuid,target_feature text)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(
    (
      select o.enabled
      from public.campaign_feature_overrides o
      where o.campaign_id=target_campaign
        and o.feature_code=target_feature
        and o.starts_at <= now()
        and (o.ends_at is null or o.ends_at > now())
    ),
    (
      select e.enabled
      from public.campaigns c
      join public.plan_feature_entitlements e on e.plan_code=c.plan_code
      where c.id=target_campaign and e.feature_code=target_feature
    ),
    false
  );
$$;

alter table public.plan_catalog enable row level security;
alter table public.plan_feature_entitlements enable row level security;
alter table public.campaign_feature_overrides enable row level security;
alter table public.campaign_goals enable row level security;
alter table public.campaign_goal_history enable row level security;
alter table public.campaign_member_targets enable row level security;

create policy "public read plan catalog" on public.plan_catalog
for select using (is_public=true);
create policy "public read enabled plan features" on public.plan_feature_entitlements
for select using (enabled=true);

create policy "campaign members read feature overrides" on public.campaign_feature_overrides
for select to authenticated using (
  public.has_campaign_role(campaign_id,array['owner','admin','treasurer','moderator','askan','viewer'])
);
create policy "platform admins manage feature overrides" on public.campaign_feature_overrides
for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "campaign members read goals" on public.campaign_goals
for select to authenticated using (
  public.has_campaign_role(campaign_id,array['owner','admin','treasurer','moderator','askan','viewer'])
);
create policy "campaign managers create goals" on public.campaign_goals
for insert to authenticated with check (
  created_by=auth.uid()
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
  and public.campaign_has_feature(campaign_id,'goals')
);
create policy "campaign managers update goals" on public.campaign_goals
for update to authenticated using (
  public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
) with check (
  public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
);

create policy "campaign managers read goal history" on public.campaign_goal_history
for select to authenticated using (
  public.has_campaign_role(campaign_id,array['owner','admin','treasurer','moderator'])
);
create policy "campaign managers insert goal history" on public.campaign_goal_history
for insert to authenticated with check (
  changed_by=auth.uid()
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
);

create policy "members read targets" on public.campaign_member_targets
for select to authenticated using (
  user_id=auth.uid()
  or public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer'])
);
create policy "managers create member targets" on public.campaign_member_targets
for insert to authenticated with check (
  updated_by=auth.uid()
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
  and public.campaign_has_feature(campaign_id,'member_progress')
);
create policy "managers update member targets" on public.campaign_member_targets
for update to authenticated using (
  user_id=auth.uid()
  or public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
) with check (
  user_id=auth.uid()
  or public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
);

revoke insert,update,delete on public.plan_catalog from authenticated;
revoke insert,update,delete on public.plan_feature_entitlements from authenticated;
revoke delete on public.campaign_feature_overrides from authenticated;
revoke delete on public.campaign_goals from authenticated;
revoke delete on public.campaign_goal_history from authenticated;
revoke delete on public.campaign_member_targets from authenticated;

comment on table public.campaign_goals is
'Editable campaign goals with due dates, progress and soft archive. History should be recorded by the application or controlled RPC.';
comment on table public.campaign_member_targets is
'Campaign-visible member facts only. Private plans and private notes remain outside this table.';
comment on table public.plan_feature_entitlements is
'Authoritative feature differences between the six Campaign Center plans.';
