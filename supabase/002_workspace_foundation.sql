create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  language text not null default 'yi' check (language in ('yi','en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_roles (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','treasurer','moderator','askan','viewer')),
  created_at timestamptz not null default now(),
  unique (campaign_id,user_id)
);

create table if not exists public.personal_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('task','private_note','follow_up','draft')),
  title text not null,
  details text,
  status text not null default 'open' check (status in ('open','waiting','done','archived')),
  visibility text not null default 'private' check (visibility in ('private','shared','campaign')),
  due_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_actions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  assigned_to uuid references auth.users(id),
  title text not null,
  details text,
  status text not null default 'open' check (status in ('open','waiting','done','archived')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.protected_records (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  record_type text not null check (record_type in ('donation','pledge','payment','check','cash','receipt','refund','ledger_entry')),
  amount numeric(12,2),
  status text not null default 'active' check (status in ('active','corrected','voided','refunded','archived')),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.record_corrections (
  id uuid primary key default gen_random_uuid(),
  protected_record_id uuid not null references public.protected_records(id) on delete cascade,
  action text not null check (action in ('correct','void','refund','reverse','archive','mark_duplicate')),
  reason text not null,
  before_data jsonb,
  after_data jsonb,
  performed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.campaign_roles enable row level security;
alter table public.personal_items enable row level security;
alter table public.campaign_actions enable row level security;
alter table public.protected_records enable row level security;
alter table public.record_corrections enable row level security;
alter table public.audit_events enable row level security;

create or replace function public.has_campaign_role(target_campaign uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.campaign_roles r
    where r.campaign_id = target_campaign
      and r.user_id = auth.uid()
      and r.role = any(allowed_roles)
  );
$$;

create policy "profiles read own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "roles read campaign" on public.campaign_roles for select to authenticated
using (user_id = auth.uid() or public.has_campaign_role(campaign_id,array['owner','admin']));

create policy "personal items read own or shared" on public.personal_items for select to authenticated
using (
  owner_user_id = auth.uid()
  or (visibility <> 'private' and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan','viewer']))
);
create policy "personal items insert own" on public.personal_items for insert to authenticated
with check (owner_user_id = auth.uid());
create policy "personal items update own" on public.personal_items for update to authenticated
using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "actions read members" on public.campaign_actions for select to authenticated
using (public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan','viewer']));
create policy "actions create members" on public.campaign_actions for insert to authenticated
with check (created_by = auth.uid() and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan']));
create policy "actions update owner assignee managers" on public.campaign_actions for update to authenticated
using (
  created_by = auth.uid() or assigned_to = auth.uid()
  or public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
);

create policy "protected read authorized" on public.protected_records for select to authenticated
using (public.has_campaign_role(campaign_id,array['owner','admin','treasurer','askan','viewer']));
create policy "protected insert finance" on public.protected_records for insert to authenticated
with check (public.has_campaign_role(campaign_id,array['owner','admin','treasurer']));
create policy "protected update finance" on public.protected_records for update to authenticated
using (public.has_campaign_role(campaign_id,array['owner','admin','treasurer']));

create policy "corrections read authorized" on public.record_corrections for select to authenticated
using (exists (
  select 1 from public.protected_records p
  where p.id = protected_record_id
    and public.has_campaign_role(p.campaign_id,array['owner','admin','treasurer','viewer'])
));
create policy "corrections insert finance" on public.record_corrections for insert to authenticated
with check (performed_by = auth.uid());

create policy "audit read managers" on public.audit_events for select to authenticated
using (public.has_campaign_role(campaign_id,array['owner','admin','treasurer','viewer']));

revoke delete on public.protected_records from authenticated;
revoke delete on public.record_corrections from authenticated;
revoke delete on public.audit_events from authenticated;
