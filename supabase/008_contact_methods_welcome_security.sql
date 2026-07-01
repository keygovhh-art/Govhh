create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists phone text,
  add column if not exists primary_contact_method text
    check (primary_contact_method in ('email','phone'));

create table if not exists public.account_security_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  report_token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending','sent','reported','resolved')),
  sent_at timestamptz,
  reported_not_mine_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_security_notices enable row level security;

create policy "users read own security notice status"
on public.account_security_notices
for select to authenticated
using (user_id = auth.uid());

revoke insert, update, delete on public.account_security_notices from authenticated;
revoke all on public.account_security_notices from anon;

grant select on public.account_security_notices to authenticated;

create or replace function public.set_my_primary_contact_method(method text, phone_value text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if method not in ('email','phone') then
    raise exception 'invalid contact method';
  end if;

  update public.profiles
  set primary_contact_method = method,
      phone = case when method = 'phone' then phone_value else phone end,
      updated_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.set_my_primary_contact_method(text,text) to authenticated;

comment on table public.account_security_notices is
'One welcome/security notice per email account. The report token is stored only as a SHA-256 hash. Service-role Edge Functions send and process notices.';
