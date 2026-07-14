create extension if not exists pgcrypto;

create table if not exists public.campaign_cockpit_preferences (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  default_view text not null default 'cockpit'
    check (default_view in ('cockpit','focus','calls','command','money','team')),
  collapsed_sections jsonb not null default '[]'::jsonb,
  pinned_metrics jsonb not null default '["raised","calls","command","risks"]'::jsonb,
  compact_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (campaign_id,user_id),
  check (jsonb_typeof(collapsed_sections)='array'),
  check (jsonb_typeof(pinned_metrics)='array')
);

create table if not exists public.campaign_pulse_snapshots (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  snapshot_date date not null default current_date,
  plan_code text not null,
  campaign_status text not null,
  goal_amount numeric(14,2) not null default 0,
  raised_amount numeric(14,2) not null default 0,
  donations_today numeric(14,2) not null default 0,
  open_pledges numeric(14,2) not null default 0,
  active_members integer not null default 0,
  calls_total integer not null default 0,
  available_calls integer not null default 0,
  followups_open integer not null default 0,
  command_open integer not null default 0,
  command_urgent integer not null default 0,
  messages_today integer not null default 0,
  at_risk_goals integer not null default 0,
  focus_total integer not null default 0,
  focus_completed integer not null default 0,
  focus_blocked integer not null default 0,
  shared_outcome text,
  main_blocker text,
  attention_score integer not null default 0 check (attention_score >= 0),
  pulse_payload jsonb not null default '{}'::jsonb,
  generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now(),
  unique (campaign_id,snapshot_date),
  check (jsonb_typeof(pulse_payload)='object')
);

create index if not exists campaign_pulse_snapshots_history_idx
  on public.campaign_pulse_snapshots(campaign_id,snapshot_date desc);

alter table public.campaign_cockpit_preferences enable row level security;
alter table public.campaign_pulse_snapshots enable row level security;

create policy "members read own cockpit preferences"
on public.campaign_cockpit_preferences for select to authenticated
using (
  user_id=auth.uid()
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan','viewer'])
);

create policy "members create own cockpit preferences"
on public.campaign_cockpit_preferences for insert to authenticated
with check (
  user_id=auth.uid()
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan','viewer'])
);

create policy "members update own cockpit preferences"
on public.campaign_cockpit_preferences for update to authenticated
using (user_id=auth.uid())
with check (
  user_id=auth.uid()
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan','viewer'])
);

create policy "active members read campaign pulse history"
on public.campaign_pulse_snapshots for select to authenticated
using (
  public.campaign_has_feature(campaign_id,'campaign_cockpit')
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan','viewer'])
);

revoke delete on public.campaign_cockpit_preferences from authenticated;
revoke insert,update,delete on public.campaign_pulse_snapshots from authenticated;

create or replace function public.refresh_campaign_pulse_snapshot(target_campaign uuid)
returns public.campaign_pulse_snapshots
language plpgsql
security definer
set search_path=public
as $$
declare
  c public.campaigns;
  focus_cycle public.campaign_focus_cycles;
  result public.campaign_pulse_snapshots;
  v_donations_today numeric(14,2):=0;
  v_open_pledges numeric(14,2):=0;
  v_active_members integer:=0;
  v_calls_total integer:=0;
  v_available_calls integer:=0;
  v_followups_open integer:=0;
  v_command_open integer:=0;
  v_command_urgent integer:=0;
  v_messages_today integer:=0;
  v_at_risk_goals integer:=0;
  v_focus_total integer:=0;
  v_focus_completed integer:=0;
  v_focus_blocked integer:=0;
  v_attention integer:=0;
begin
  if not public.has_campaign_role(target_campaign,array['owner','admin','moderator','treasurer','askan','viewer']) then
    raise exception 'not_authorized';
  end if;

  if not public.campaign_has_feature(target_campaign,'campaign_cockpit') then
    raise exception 'campaign_cockpit_not_in_plan';
  end if;

  select * into c from public.campaigns where id=target_campaign;
  if c.id is null then raise exception 'campaign_not_found'; end if;

  select coalesce(sum(amount),0) into v_donations_today
  from public.protected_records
  where campaign_id=target_campaign
    and record_type in ('donation','payment','check','cash')
    and status='active'
    and created_at::date=current_date;

  select coalesce(sum(amount),0) into v_open_pledges
  from public.protected_records
  where campaign_id=target_campaign
    and record_type='pledge'
    and status='active';

  select count(*) into v_active_members
  from public.campaign_roles
  where campaign_id=target_campaign and membership_status='active';

  select
    coalesce(sum(call_count),0),
    count(*) filter (where status='available'),
    count(*) filter (where status='callback' or next_callback_at is not null)
  into v_calls_total,v_available_calls,v_followups_open
  from public.campaign_call_leads
  where campaign_id=target_campaign and deleted_at is null;

  select
    count(*) filter (where status='open'),
    count(*) filter (where status='open' and priority='urgent')
  into v_command_open,v_command_urgent
  from public.campaign_command_items
  where campaign_id=target_campaign and deleted_at is null;

  select count(*) into v_messages_today
  from public.campaign_room_messages
  where campaign_id=target_campaign
    and deleted_at is null
    and created_at::date=current_date;

  select count(*) into v_at_risk_goals
  from public.campaign_goals
  where campaign_id=target_campaign
    and archived_at is null
    and status='at_risk';

  select * into focus_cycle
  from public.campaign_focus_cycles
  where campaign_id=target_campaign and archived_at is null
  order by cycle_date desc,updated_at desc
  limit 1;

  if focus_cycle.id is not null then
    select
      count(*),
      count(*) filter (where status='done'),
      count(*) filter (where status='blocked')
    into v_focus_total,v_focus_completed,v_focus_blocked
    from public.campaign_focus_items
    where focus_cycle_id=focus_cycle.id and archived_at is null;
  end if;

  v_attention :=
    coalesce(v_command_urgent,0)*3
    + coalesce(v_focus_blocked,0)*3
    + coalesce(v_at_risk_goals,0)*2
    + case when focus_cycle.main_blocker is not null and btrim(focus_cycle.main_blocker)<>'' then 2 else 0 end
    + case when coalesce(v_followups_open,0)>0 then 1 else 0 end;

  insert into public.campaign_pulse_snapshots (
    campaign_id,snapshot_date,plan_code,campaign_status,goal_amount,raised_amount,
    donations_today,open_pledges,active_members,calls_total,available_calls,followups_open,
    command_open,command_urgent,messages_today,at_risk_goals,
    focus_total,focus_completed,focus_blocked,shared_outcome,main_blocker,
    attention_score,pulse_payload,generated_by,generated_at
  ) values (
    target_campaign,current_date,c.plan_code,c.campaign_status,c.goal_amount,c.raised_amount,
    v_donations_today,v_open_pledges,v_active_members,v_calls_total,v_available_calls,v_followups_open,
    v_command_open,v_command_urgent,v_messages_today,v_at_risk_goals,
    v_focus_total,v_focus_completed,v_focus_blocked,focus_cycle.shared_outcome,focus_cycle.main_blocker,
    v_attention,
    jsonb_build_object(
      'days_left',case when c.ends_on is null then null else c.ends_on-current_date end,
      'progress_percent',case when c.goal_amount=0 then 0 else round((c.raised_amount/c.goal_amount)*100,2) end,
      'focus_cycle_id',focus_cycle.id,
      'generated_for_role_view',true
    ),
    auth.uid(),now()
  )
  on conflict (campaign_id,snapshot_date) do update set
    plan_code=excluded.plan_code,
    campaign_status=excluded.campaign_status,
    goal_amount=excluded.goal_amount,
    raised_amount=excluded.raised_amount,
    donations_today=excluded.donations_today,
    open_pledges=excluded.open_pledges,
    active_members=excluded.active_members,
    calls_total=excluded.calls_total,
    available_calls=excluded.available_calls,
    followups_open=excluded.followups_open,
    command_open=excluded.command_open,
    command_urgent=excluded.command_urgent,
    messages_today=excluded.messages_today,
    at_risk_goals=excluded.at_risk_goals,
    focus_total=excluded.focus_total,
    focus_completed=excluded.focus_completed,
    focus_blocked=excluded.focus_blocked,
    shared_outcome=excluded.shared_outcome,
    main_blocker=excluded.main_blocker,
    attention_score=excluded.attention_score,
    pulse_payload=excluded.pulse_payload,
    generated_by=auth.uid(),
    generated_at=now()
  returning * into result;

  return result;
end;
$$;

grant execute on function public.refresh_campaign_pulse_snapshot(uuid) to authenticated;

insert into public.plan_feature_entitlements(plan_code,feature_code,enabled,configuration)
values
  ('chesed_quick','campaign_cockpit',true,'{"metrics":["raised","calls","command","risks"],"moves":3}'::jsonb),
  ('askan_pro','campaign_cockpit',true,'{"metrics":["raised","calls","command","risks","memory"],"moves":5,"next_best_action":true}'::jsonb),
  ('gabbai_pro','campaign_cockpit',true,'{"metrics":["raised","calls","command","risks","memory","operations"],"moves":7,"operations_lanes":true}'::jsonb),
  ('organization','campaign_cockpit',true,'{"metrics":["raised","calls","command","risks","memory","portfolio"],"moves":10,"portfolio":true}'::jsonb),
  ('custom','campaign_cockpit',true,'{"metrics":"custom","moves":20,"custom_layout":true}'::jsonb)
on conflict (plan_code,feature_code)
do update set enabled=excluded.enabled,configuration=excluded.configuration;

comment on table public.campaign_pulse_snapshots is
'Daily campaign cockpit memory: explicit campaign facts, counts, outcomes and risks. It excludes private brain dumps and private notes.';
comment on table public.campaign_cockpit_preferences is
'Per-member cockpit layout preferences. It does not grant additional campaign permissions.';
comment on function public.refresh_campaign_pulse_snapshot(uuid) is
'Builds one authorized daily cockpit snapshot from campaign focus, calls, command requests, members, goals and protected financial records.';
