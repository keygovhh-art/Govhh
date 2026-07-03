create extension if not exists pgcrypto;

alter table public.campaign_focus_cycles
  add column if not exists lesson_learned text,
  add column if not exists completed_count integer not null default 0 check (completed_count >= 0),
  add column if not exists total_count integer not null default 0 check (total_count >= 0),
  add column if not exists carryover_count integer not null default 0 check (carryover_count >= 0),
  add column if not exists success_score numeric(5,2) not null default 0 check (success_score between 0 and 100),
  add column if not exists background_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists finalized_at timestamptz;

alter table public.campaign_focus_items
  add column if not exists focus_group_id uuid,
  add column if not exists weight integer not null default 1 check (weight between 1 and 5),
  add column if not exists carried_from_item_id uuid references public.campaign_focus_items(id) on delete set null,
  add column if not exists completed_at timestamptz;

create table if not exists public.campaign_focus_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  priority_count integer not null default 3 check (priority_count between 1 and 20),
  group_count integer not null default 1 check (group_count between 1 and 5),
  structure_mode text not null default 'standard'
    check (structure_mode in ('standard','grouped','three_by_three','custom')),
  history_horizon_days integer not null default 7
    check (history_horizon_days in (1,3,7,30,36500)),
  show_success_score boolean not null default true,
  show_carryovers boolean not null default true,
  show_repeat_blockers boolean not null default false,
  allow_member_group_names boolean not null default false,
  review_cadence text not null default 'daily'
    check (review_cadence in ('daily','twice_daily','weekly','custom')),
  custom_configuration jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_focus_groups (
  id uuid primary key default gen_random_uuid(),
  focus_cycle_id uuid not null references public.campaign_focus_cycles(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  display_order integer not null default 1,
  group_outcome text,
  group_status text not null default 'active'
    check (group_status in ('active','waiting','blocked','done','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.campaign_focus_items
  drop constraint if exists campaign_focus_items_focus_group_id_fkey;
alter table public.campaign_focus_items
  add constraint campaign_focus_items_focus_group_id_fkey
  foreign key (focus_group_id) references public.campaign_focus_groups(id) on delete set null;

create table if not exists public.campaign_focus_decisions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  focus_cycle_id uuid references public.campaign_focus_cycles(id) on delete set null,
  title text not null,
  decision_context text,
  decision_text text,
  decision_status text not null default 'open'
    check (decision_status in ('open','decided','deferred','cancelled')),
  impact_level text not null default 'campaign'
    check (impact_level in ('campaign','department','portfolio','organization')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists campaign_focus_cycles_history_idx
  on public.campaign_focus_cycles(campaign_id,cycle_date desc,status)
  where archived_at is null;
create index if not exists campaign_focus_groups_cycle_idx
  on public.campaign_focus_groups(focus_cycle_id,display_order)
  where archived_at is null;
create index if not exists campaign_focus_decisions_campaign_idx
  on public.campaign_focus_decisions(campaign_id,decision_status,created_at desc)
  where archived_at is null;

create or replace function public.focus_plan_limits(target_campaign uuid)
returns table (
  plan_code text,
  max_priorities integer,
  max_groups integer,
  max_history_days integer,
  can_customize boolean
)
language sql
stable
security definer
set search_path=public
as $$
  select
    c.plan_code,
    case c.plan_code
      when 'chesed_quick' then 3
      when 'askan_pro' then 5
      when 'gabbai_pro' then 7
      when 'organization' then 10
      when 'custom' then 20
      else 0
    end,
    case c.plan_code
      when 'chesed_quick' then 1
      when 'askan_pro' then 2
      when 'gabbai_pro' then 3
      when 'organization' then 4
      when 'custom' then 5
      else 0
    end,
    case c.plan_code
      when 'chesed_quick' then 7
      when 'askan_pro' then 30
      when 'gabbai_pro' then 36500
      when 'organization' then 36500
      when 'custom' then 36500
      else 0
    end,
    c.plan_code in ('askan_pro','gabbai_pro','organization','custom')
  from public.campaigns c
  where c.id=target_campaign;
$$;

create or replace function public.validate_campaign_focus_settings()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  limits record;
begin
  select * into limits from public.focus_plan_limits(new.campaign_id);
  if limits.plan_code is null or limits.max_priorities=0 then
    raise exception 'focus_settings_require_chesed_quick';
  end if;
  if new.priority_count > limits.max_priorities then
    raise exception 'priority_count_exceeds_plan_limit';
  end if;
  if new.group_count > limits.max_groups then
    raise exception 'group_count_exceeds_plan_limit';
  end if;
  if new.history_horizon_days > limits.max_history_days then
    raise exception 'history_horizon_exceeds_plan_limit';
  end if;
  if limits.plan_code='chesed_quick' and (new.priority_count<>3 or new.group_count<>1) then
    raise exception 'chesed_quick_uses_three_moves_one_group';
  end if;
  if new.structure_mode='three_by_three' and (new.priority_count<>9 or new.group_count<>3) then
    raise exception 'three_by_three_requires_nine_moves_three_groups';
  end if;
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists validate_campaign_focus_settings_trigger on public.campaign_focus_settings;
create trigger validate_campaign_focus_settings_trigger
before insert or update on public.campaign_focus_settings
for each row execute procedure public.validate_campaign_focus_settings();

create or replace function public.finalize_campaign_focus_day(target_cycle uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  target_campaign uuid;
  total_items integer;
  done_items integer;
  carry_items integer;
begin
  select campaign_id into target_campaign
  from public.campaign_focus_cycles
  where id=target_cycle and archived_at is null;

  if target_campaign is null then raise exception 'focus_cycle_not_found'; end if;
  if not public.has_campaign_role(target_campaign,array['owner','admin','moderator','treasurer','askan']) then
    raise exception 'not_authorized';
  end if;

  select
    count(*),
    count(*) filter (where status='done'),
    count(*) filter (where status not in ('done','cancelled'))
  into total_items,done_items,carry_items
  from public.campaign_focus_items
  where focus_cycle_id=target_cycle and archived_at is null;

  update public.campaign_focus_cycles
  set total_count=coalesce(total_items,0),
      completed_count=coalesce(done_items,0),
      carryover_count=coalesce(carry_items,0),
      success_score=case when coalesce(total_items,0)=0 then 0 else round((done_items::numeric/total_items::numeric)*100,2) end,
      status='completed',
      finalized_at=now(),
      updated_by=auth.uid(),
      updated_at=now()
  where id=target_cycle;
end;
$$;

alter table public.campaign_focus_settings enable row level security;
alter table public.campaign_focus_groups enable row level security;
alter table public.campaign_focus_decisions enable row level security;

create policy "active members read focus settings"
on public.campaign_focus_settings for select to authenticated
using (public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan','viewer']));
create policy "leaders create focus settings"
on public.campaign_focus_settings for insert to authenticated
with check (
  updated_by=auth.uid()
  and public.campaign_has_feature(campaign_id,'campaign_focus_board')
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
);
create policy "leaders update focus settings"
on public.campaign_focus_settings for update to authenticated
using (public.has_campaign_role(campaign_id,array['owner','admin','moderator']))
with check (public.has_campaign_role(campaign_id,array['owner','admin','moderator']));

create policy "active members read focus groups"
on public.campaign_focus_groups for select to authenticated
using (public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan','viewer']));
create policy "campaign workers create focus groups"
on public.campaign_focus_groups for insert to authenticated
with check (
  created_by=auth.uid()
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
);
create policy "campaign workers update focus groups"
on public.campaign_focus_groups for update to authenticated
using (public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan']))
with check (public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan']));

create policy "leaders read focus decisions"
on public.campaign_focus_decisions for select to authenticated
using (public.has_campaign_role(campaign_id,array['owner','admin','moderator']));
create policy "leaders create focus decisions"
on public.campaign_focus_decisions for insert to authenticated
with check (
  created_by=auth.uid()
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
);
create policy "leaders update focus decisions"
on public.campaign_focus_decisions for update to authenticated
using (public.has_campaign_role(campaign_id,array['owner','admin','moderator']))
with check (public.has_campaign_role(campaign_id,array['owner','admin','moderator']));

revoke delete on public.campaign_focus_settings from authenticated;
revoke delete on public.campaign_focus_groups from authenticated;
revoke delete on public.campaign_focus_decisions from authenticated;

grant execute on function public.focus_plan_limits(uuid) to authenticated;
grant execute on function public.finalize_campaign_focus_day(uuid) to authenticated;

insert into public.plan_feature_entitlements(plan_code,feature_code,enabled,configuration)
values
  ('chesed_quick','focus_history',true,'{"days":7,"priorities":3,"groups":1,"fixed":true}'::jsonb),
  ('chesed_quick','daily_focus_review',true,'{}'::jsonb),
  ('askan_pro','focus_history',true,'{"days":30,"priorities":5,"groups":2}'::jsonb),
  ('askan_pro','boosted_focus_controls',true,'{"priority_options":[3,5],"group_options":[1,2]}'::jsonb),
  ('askan_pro','carryover_memory',true,'{}'::jsonb),
  ('askan_pro','repeat_blocker_insights',true,'{}'::jsonb),
  ('gabbai_pro','focus_history',true,'{"days":"lifetime","priorities":7,"groups":3}'::jsonb),
  ('gabbai_pro','boosted_focus_controls',true,'{"priority_options":[3,5,7],"group_options":[1,2,3]}'::jsonb),
  ('gabbai_pro','operations_memory',true,'{}'::jsonb),
  ('gabbai_pro','handoff_memory',true,'{}'::jsonb),
  ('organization','focus_history',true,'{"days":"lifetime","priorities":10,"groups":4}'::jsonb),
  ('organization','boss_focus_controls',true,'{"priority_options":[3,4,5,10],"group_options":[1,2,3,4],"presets":["3","5","10","3x3"]}'::jsonb),
  ('organization','portfolio_memory',true,'{}'::jsonb),
  ('organization','leadership_decision_history',true,'{}'::jsonb),
  ('custom','focus_history',true,'{"days":"lifetime","priorities":20,"groups":5}'::jsonb),
  ('custom','boss_focus_controls',true,'{"priority_range":[1,20],"group_range":[1,5]}'::jsonb),
  ('custom','custom_focus_scoring',true,'{}'::jsonb),
  ('custom','managed_memory_review',true,'{}'::jsonb)
on conflict (plan_code,feature_code)
do update set enabled=excluded.enabled,configuration=excluded.configuration;

comment on table public.campaign_focus_settings is
'Plan-enforced focus structure. Chesed Quick is fixed at three moves; higher plans receive progressively more control.';
comment on table public.campaign_focus_groups is
'Named daily focus groups, including Organization presets such as three groups of three.';
comment on table public.campaign_focus_decisions is
'Leadership decisions preserved as organizational memory instead of disappearing in chat or private notes.';
comment on function public.finalize_campaign_focus_day(uuid) is
'Closes a focus day and stores completed, carryover and success metrics for historical dashboards.';
