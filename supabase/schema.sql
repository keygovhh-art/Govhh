create extension if not exists pgcrypto;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  title_yi text not null,
  title_en text not null,
  goal numeric(12,2) not null default 0,
  current_raised numeric(12,2) not null default 0,
  active_askanim integer not null default 0,
  status text not null default 'draft' check (status in ('draft','active','closed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dashboard_metrics (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  needs_attention integer not null default 0,
  waiting_on_others integer not null default 0,
  completed_today integer not null default 0,
  new_donors integer not null default 0,
  new_donor_amount numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  display_name text not null,
  raised numeric(12,2) not null default 0,
  goal numeric(12,2) not null default 0,
  role text not null default 'askan',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.campaigns enable row level security;
alter table public.dashboard_metrics enable row level security;
alter table public.campaign_members enable row level security;

create policy "public read active campaigns" on public.campaigns
for select to anon, authenticated using (status = 'active');

create policy "public read dashboard metrics" on public.dashboard_metrics
for select to anon, authenticated using (true);

create policy "public read active members" on public.campaign_members
for select to anon, authenticated using (is_active = true);

create policy "authenticated manage campaigns" on public.campaigns
for all to authenticated using (true) with check (true);

create policy "authenticated manage dashboard metrics" on public.dashboard_metrics
for all to authenticated using (true) with check (true);

create policy "authenticated manage members" on public.campaign_members
for all to authenticated using (true) with check (true);

insert into public.campaigns (id,title_yi,title_en,goal,current_raised,active_askanim,status)
values ('11111111-1111-1111-1111-111111111111','חברים לדבר מצוה — הילף פאר א משפחה','Friends for a Mitzvah — Family Relief',100000,68240,24,'active')
on conflict (id) do update set
  title_yi=excluded.title_yi,
  title_en=excluded.title_en,
  goal=excluded.goal,
  current_raised=excluded.current_raised,
  active_askanim=excluded.active_askanim,
  status=excluded.status,
  updated_at=now();

insert into public.dashboard_metrics (campaign_id,needs_attention,waiting_on_others,completed_today,new_donors,new_donor_amount)
values ('11111111-1111-1111-1111-111111111111',7,12,29,41,8420)
on conflict (campaign_id) do update set
  needs_attention=excluded.needs_attention,
  waiting_on_others=excluded.waiting_on_others,
  completed_today=excluded.completed_today,
  new_donors=excluded.new_donors,
  new_donor_amount=excluded.new_donor_amount,
  updated_at=now();

insert into public.campaign_members (campaign_id,display_name,raised,goal,role)
select '11111111-1111-1111-1111-111111111111',v.name,v.raised,v.goal,'askan'
from (values
  ('ר׳ יואל בערגער',8200::numeric,10000::numeric),
  ('ר׳ מנחם קליין',5440::numeric,8000::numeric),
  ('ר׳ שמואל פריד',1150::numeric,6000::numeric)
) as v(name,raised,goal)
where not exists (
  select 1 from public.campaign_members m
  where m.campaign_id='11111111-1111-1111-1111-111111111111' and m.display_name=v.name
);
