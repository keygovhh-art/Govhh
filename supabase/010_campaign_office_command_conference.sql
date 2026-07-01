create extension if not exists pgcrypto;

-- An assigned role is considered active only while membership_status='active'.
alter table public.campaign_roles
  add column if not exists membership_status text not null default 'active'
    check (membership_status in ('active','paused','removed')),
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.has_campaign_role(target_campaign uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1
    from public.campaign_roles r
    where r.campaign_id = target_campaign
      and r.user_id = auth.uid()
      and r.role = any(allowed_roles)
      and r.membership_status = 'active'
  );
$$;

create table if not exists public.campaign_call_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  display_name text not null,
  phone text,
  source_label text,
  target_amount numeric(14,2) not null default 0,
  priority text not null default 'normal'
    check (priority in ('normal','high','urgent')),
  status text not null default 'available'
    check (status in ('available','claimed','contacted','callback','donated','no_answer','not_interested','closed')),
  claimed_by uuid references auth.users(id),
  claimed_name text,
  claimed_at timestamptz,
  call_count integer not null default 0 check (call_count >= 0),
  last_outcome text,
  donation_amount numeric(14,2) not null default 0,
  next_callback_at timestamptz,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  check (
    (status='available' and claimed_by is null)
    or status <> 'available'
  )
);

create index if not exists campaign_call_leads_campaign_status_idx
  on public.campaign_call_leads(campaign_id,status,updated_at desc)
  where deleted_at is null;
create index if not exists campaign_call_leads_claimed_idx
  on public.campaign_call_leads(campaign_id,claimed_by)
  where deleted_at is null and claimed_by is not null;
create index if not exists campaign_call_leads_callback_idx
  on public.campaign_call_leads(campaign_id,next_callback_at)
  where deleted_at is null and next_callback_at is not null;

create table if not exists public.campaign_command_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  details text,
  category text not null default 'other'
    check (category in ('pickup','delivery','ride','call','printing','event','boxes','speaker','other')),
  priority text not null default 'normal'
    check (priority in ('normal','high','urgent')),
  status text not null default 'open'
    check (status in ('open','claimed','in_progress','completed','cancelled')),
  created_by uuid not null references auth.users(id),
  created_name text,
  claimed_by uuid references auth.users(id),
  claimed_name text,
  claimed_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  check (
    (status='open' and claimed_by is null)
    or status <> 'open'
  )
);

create index if not exists campaign_command_status_idx
  on public.campaign_command_items(campaign_id,status,priority,created_at desc)
  where deleted_at is null;
create index if not exists campaign_command_claimed_idx
  on public.campaign_command_items(campaign_id,claimed_by)
  where deleted_at is null and claimed_by is not null;

create table if not exists public.campaign_room_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  channel text not null default 'updates'
    check (channel in ('updates','chizuk','guidance','ideas','coffee')),
  body text not null check (char_length(body) between 1 and 3000),
  reply_to uuid references public.campaign_room_messages(id) on delete set null,
  reaction_count integer not null default 0 check (reaction_count >= 0),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create index if not exists campaign_room_messages_idx
  on public.campaign_room_messages(campaign_id,created_at desc)
  where deleted_at is null;

create table if not exists public.campaign_room_reactions (
  message_id uuid not null references public.campaign_room_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'chazak'
    check (reaction in ('chazak','thanks','idea','amen')),
  created_at timestamptz not null default now(),
  primary key (message_id,user_id,reaction)
);

create or replace function public.claim_campaign_call_lead(target_lead uuid, claimant_name text default null)
returns public.campaign_call_leads
language plpgsql
security definer
set search_path=public
as $$
declare
  claimed public.campaign_call_leads;
begin
  update public.campaign_call_leads l
  set status='claimed',
      claimed_by=auth.uid(),
      claimed_name=coalesce(nullif(claimant_name,''),(select display_name from public.profiles where id=auth.uid()),'Campaign member'),
      claimed_at=now(),
      updated_at=now()
  where l.id=target_lead
    and l.deleted_at is null
    and l.status='available'
    and l.claimed_by is null
    and public.has_campaign_role(l.campaign_id,array['owner','admin','moderator','treasurer','askan'])
  returning * into claimed;

  if claimed.id is null then
    raise exception 'lead_unavailable';
  end if;
  return claimed;
end;
$$;

create or replace function public.release_campaign_call_lead(target_lead uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.campaign_call_leads l
  set status='available',claimed_by=null,claimed_name=null,claimed_at=null,updated_at=now()
  where l.id=target_lead
    and l.deleted_at is null
    and (
      l.claimed_by=auth.uid()
      or public.has_campaign_role(l.campaign_id,array['owner','admin','moderator'])
    );
end;
$$;

create or replace function public.claim_campaign_command_item(target_item uuid, claimant_name text default null)
returns public.campaign_command_items
language plpgsql
security definer
set search_path=public
as $$
declare
  claimed public.campaign_command_items;
begin
  update public.campaign_command_items i
  set status='claimed',
      claimed_by=auth.uid(),
      claimed_name=coalesce(nullif(claimant_name,''),(select display_name from public.profiles where id=auth.uid()),'Campaign member'),
      claimed_at=now(),
      updated_at=now()
  where i.id=target_item
    and i.deleted_at is null
    and i.status='open'
    and i.claimed_by is null
    and public.has_campaign_role(i.campaign_id,array['owner','admin','moderator','treasurer','askan'])
  returning * into claimed;

  if claimed.id is null then
    raise exception 'item_unavailable';
  end if;
  return claimed;
end;
$$;

create or replace function public.release_campaign_command_item(target_item uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.campaign_command_items i
  set status='open',claimed_by=null,claimed_name=null,claimed_at=null,updated_at=now()
  where i.id=target_item
    and i.deleted_at is null
    and i.status in ('claimed','in_progress')
    and (
      i.claimed_by=auth.uid()
      or public.has_campaign_role(i.campaign_id,array['owner','admin','moderator'])
    );
end;
$$;

create or replace function public.complete_campaign_command_item(target_item uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.campaign_command_items i
  set status='completed',completed_at=now(),completed_by=auth.uid(),updated_at=now()
  where i.id=target_item
    and i.deleted_at is null
    and i.status in ('claimed','in_progress')
    and (
      i.claimed_by=auth.uid()
      or public.has_campaign_role(i.campaign_id,array['owner','admin','moderator'])
    );
end;
$$;

alter table public.campaign_call_leads enable row level security;
alter table public.campaign_command_items enable row level security;
alter table public.campaign_room_messages enable row level security;
alter table public.campaign_room_reactions enable row level security;

create policy "active campaign workers read call office"
on public.campaign_call_leads for select to authenticated
using (
  public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
);
create policy "active campaign workers add call leads"
on public.campaign_call_leads for insert to authenticated
with check (
  created_by=auth.uid()
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
  and public.campaign_has_feature(campaign_id,'campaign_call_office')
);
create policy "claimants and managers update call leads"
on public.campaign_call_leads for update to authenticated
using (
  claimed_by=auth.uid()
  or created_by=auth.uid()
  or public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
)
with check (
  public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
);

create policy "active campaign workers read command center"
on public.campaign_command_items for select to authenticated
using (
  public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
);
create policy "active campaign workers create command items"
on public.campaign_command_items for insert to authenticated
with check (
  created_by=auth.uid()
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
  and public.campaign_has_feature(campaign_id,'command_center')
);
create policy "owners claimants and managers update command items"
on public.campaign_command_items for update to authenticated
using (
  created_by=auth.uid()
  or claimed_by=auth.uid()
  or public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
)
with check (
  public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
);

create policy "active campaign workers read conference room"
on public.campaign_room_messages for select to authenticated
using (
  public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
);
create policy "active campaign workers post conference messages"
on public.campaign_room_messages for insert to authenticated
with check (
  author_id=auth.uid()
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
  and public.campaign_has_feature(campaign_id,'conference_room')
);
create policy "authors and moderators edit messages"
on public.campaign_room_messages for update to authenticated
using (
  author_id=auth.uid()
  or public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
)
with check (
  public.has_campaign_role(campaign_id,array['owner','admin','moderator','treasurer','askan'])
);

create policy "active workers read reactions"
on public.campaign_room_reactions for select to authenticated
using (
  exists (
    select 1 from public.campaign_room_messages m
    where m.id=message_id
      and public.has_campaign_role(m.campaign_id,array['owner','admin','moderator','treasurer','askan'])
  )
);
create policy "active workers add own reactions"
on public.campaign_room_reactions for insert to authenticated
with check (
  user_id=auth.uid()
  and exists (
    select 1 from public.campaign_room_messages m
    where m.id=message_id
      and public.has_campaign_role(m.campaign_id,array['owner','admin','moderator','treasurer','askan'])
  )
);
create policy "users remove own reactions"
on public.campaign_room_reactions for delete to authenticated
using (user_id=auth.uid());

revoke delete on public.campaign_call_leads from authenticated;
revoke delete on public.campaign_command_items from authenticated;
revoke delete on public.campaign_room_messages from authenticated;

grant execute on function public.claim_campaign_call_lead(uuid,text) to authenticated;
grant execute on function public.release_campaign_call_lead(uuid) to authenticated;
grant execute on function public.claim_campaign_command_item(uuid,text) to authenticated;
grant execute on function public.release_campaign_command_item(uuid) to authenticated;
grant execute on function public.complete_campaign_command_item(uuid) to authenticated;

insert into public.plan_feature_entitlements(plan_code,feature_code,enabled)
values
  ('chesed_quick','campaign_call_office',true),
  ('chesed_quick','available_call_board',true),
  ('chesed_quick','command_center',true),
  ('chesed_quick','conference_room',true),
  ('askan_pro','campaign_call_office',true),
  ('askan_pro','available_call_board',true),
  ('askan_pro','command_center',true),
  ('askan_pro','conference_room',true),
  ('gabbai_pro','campaign_call_office',true),
  ('gabbai_pro','available_call_board',true),
  ('gabbai_pro','command_center',true),
  ('gabbai_pro','conference_room',true),
  ('organization','campaign_call_office',true),
  ('organization','available_call_board',true),
  ('organization','command_center',true),
  ('organization','conference_room',true),
  ('custom','campaign_call_office',true),
  ('custom','available_call_board',true),
  ('custom','command_center',true),
  ('custom','conference_room',true)
on conflict (plan_code,feature_code) do update set enabled=excluded.enabled;

-- Enable live updates. Ignore duplicate-publication errors on re-runs.
do $$
begin
  alter publication supabase_realtime add table public.campaign_call_leads;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.campaign_command_items;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.campaign_room_messages;
exception when duplicate_object then null;
end $$;

comment on table public.campaign_call_leads is
'Per-campaign shared call office. Active campaign workers can see campaign facts; private relationship notes remain in each user Kesher Book.';
comment on table public.campaign_command_items is
'Claimable campaign dispatch requests. Atomic claim functions prevent two members from accepting the same open item.';
comment on table public.campaign_room_messages is
'Active-member campaign conference room for updates, chizuk, guidance, ideas and general team conversation.';
