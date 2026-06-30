alter table public.campaigns
  add column if not exists donation_mode text not null default 'external_link'
    check (donation_mode in ('external_link','manual_offline','native_coming_soon')),
  add column if not exists external_donation_url text,
  add column if not exists external_donation_provider text,
  add column if not exists donation_button_label_yi text not null default 'געבן א נדבה',
  add column if not exists donation_button_label_en text not null default 'Donate now',
  add column if not exists donation_disclaimer_yi text not null default 'די צאלונג ווערט פראצעסירט דורך דעם קאמפיין׳ס אייגענעם באצאלונג־סערוויס.',
  add column if not exists donation_disclaimer_en text not null default 'Payment is processed by the campaign’s own payment provider.',
  add column if not exists external_link_verified_at timestamptz,
  add column if not exists external_link_verified_by uuid references auth.users(id),
  add column if not exists native_processing_status text not null default 'coming_soon'
    check (native_processing_status in ('coming_soon','private_beta','active','disabled'));

create table if not exists public.external_donation_link_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  old_url text,
  new_url text,
  provider_name text,
  changed_by uuid references auth.users(id),
  change_reason text,
  created_at timestamptz not null default now()
);

alter table public.external_donation_link_history enable row level security;

create policy "campaign members read donation link history" on public.external_donation_link_history
for select to authenticated using (
  public.has_campaign_role(campaign_id,array['owner','admin','treasurer','viewer'])
);

create policy "owner admin manage donation links" on public.external_donation_link_history
for insert to authenticated with check (
  changed_by=auth.uid()
  and public.has_campaign_role(campaign_id,array['owner','admin'])
);

revoke delete on public.external_donation_link_history from authenticated;

create or replace function public.get_campaign_donation_destination(target_campaign uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'donation_mode',c.donation_mode,
    'external_url',case
      when c.donation_mode='external_link' then c.external_donation_url
      else null
    end,
    'provider',c.external_donation_provider,
    'button_label_yi',c.donation_button_label_yi,
    'button_label_en',c.donation_button_label_en,
    'disclaimer_yi',c.donation_disclaimer_yi,
    'disclaimer_en',c.donation_disclaimer_en,
    'native_processing_status',c.native_processing_status,
    'native_processing_message_yi','קומט באלד אי״ה',
    'native_processing_message_en','Coming soon, God willing'
  )
  from public.campaigns c
  where c.id=target_campaign
    and (
      c.visibility='public'
      or public.has_campaign_role(c.id,array['owner','admin','treasurer','moderator','askan','viewer'])
    );
$$;

comment on column public.campaigns.donation_mode is
'Until native processing is activated, campaigns use their own external donation link or manual offline recording.';
comment on column public.campaigns.native_processing_status is
'Platform-native donation processing remains coming soon unless explicitly activated later.';
