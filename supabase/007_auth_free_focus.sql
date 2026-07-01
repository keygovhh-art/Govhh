create extension if not exists pgcrypto;

-- Every new user receives a real free Personal Askan account.
create table if not exists public.user_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_plan_code text not null default 'personal_askan'
    references public.plan_catalog(code),
  account_status text not null default 'active'
    check (account_status in ('active','paused','suspended','closed')),
  founder_beta boolean not null default true,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The free concentration tool: one private daily focus record per user.
create table if not exists public.daily_focus_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  focus_date date not null default current_date,
  main_focus text,
  priorities jsonb not null default '[]'::jsonb,
  brain_dump text,
  blocker text,
  next_step text,
  completed boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,focus_date),
  check (jsonb_typeof(priorities)='array')
);

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

-- Make the free plan useful for focus and personal askanus, not merely an empty account.
insert into public.plan_feature_entitlements(plan_code,feature_code,enabled)
values
  ('personal_askan','focus_center',true),
  ('personal_askan','daily_focus',true),
  ('personal_askan','brain_dump',true),
  ('personal_askan','personal_followups',true),
  ('chesed_quick','focus_center',true),
  ('chesed_quick','daily_focus',true),
  ('chesed_quick','brain_dump',true),
  ('chesed_quick','personal_followups',true),
  ('askan_pro','focus_center',true),
  ('askan_pro','daily_focus',true),
  ('askan_pro','brain_dump',true),
  ('askan_pro','personal_followups',true),
  ('gabbai_pro','focus_center',true),
  ('gabbai_pro','daily_focus',true),
  ('gabbai_pro','brain_dump',true),
  ('gabbai_pro','personal_followups',true),
  ('organization','focus_center',true),
  ('organization','daily_focus',true),
  ('organization','brain_dump',true),
  ('organization','personal_followups',true),
  ('custom','focus_center',true),
  ('custom','daily_focus',true),
  ('custom','brain_dump',true),
  ('custom','personal_followups',true)
on conflict (plan_code,feature_code) do update set enabled=excluded.enabled;

create or replace function public.handle_new_campaign_center_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.profiles(id,display_name,language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name',''),
    case when new.raw_user_meta_data->>'preferred_language'='en' then 'en' else 'yi' end
  )
  on conflict (id) do nothing;

  insert into public.user_accounts(user_id,current_plan_code,account_status,founder_beta)
  values (new.id,'personal_askan','active',true)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_campaign_center on auth.users;
create trigger on_auth_user_created_campaign_center
after insert on auth.users
for each row execute procedure public.handle_new_campaign_center_user();

-- Backfill accounts for users who existed before this migration.
insert into public.profiles(id,display_name,language)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'display_name',''),
  case when u.raw_user_meta_data->>'preferred_language'='en' then 'en' else 'yi' end
from auth.users u
on conflict (id) do nothing;

insert into public.user_accounts(user_id,current_plan_code,account_status,founder_beta)
select u.id,'personal_askan','active',true
from auth.users u
on conflict (user_id) do nothing;

create or replace function public.get_my_account_plan()
returns table (
  plan_code text,
  plan_name text,
  account_status text,
  founder_beta boolean,
  onboarding_completed boolean
)
language sql
stable
security definer
set search_path=public
as $$
  select a.current_plan_code,p.name,a.account_status,a.founder_beta,a.onboarding_completed
  from public.user_accounts a
  join public.plan_catalog p on p.code=a.current_plan_code
  where a.user_id=auth.uid();
$$;

alter table public.user_accounts enable row level security;
alter table public.daily_focus_sessions enable row level security;

create policy "users read own account" on public.user_accounts
for select to authenticated using (user_id=auth.uid());

-- Plan changes are intentionally not available through direct client updates.
-- A future billing/admin RPC will be the only allowed upgrade path.

create policy "users read own focus" on public.daily_focus_sessions
for select to authenticated using (user_id=auth.uid() and deleted_at is null);

create policy "users create own focus" on public.daily_focus_sessions
for insert to authenticated with check (user_id=auth.uid());

create policy "users update own focus" on public.daily_focus_sessions
for update to authenticated
using (user_id=auth.uid())
with check (user_id=auth.uid());

revoke insert,update,delete on public.user_accounts from authenticated;
revoke delete on public.daily_focus_sessions from authenticated;

grant execute on function public.get_my_account_plan() to authenticated;

comment on table public.user_accounts is
'Every authenticated user receives Personal Askan free by default. Client users cannot self-upgrade this value.';
comment on table public.daily_focus_sessions is
'Private free-plan concentration tool: one main focus, up to three priorities, brain dump, blocker and next step.';
