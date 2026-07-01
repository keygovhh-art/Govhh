-- The entire Kesher section begins at Chesed Quick.
-- Personal Askan remains focused on private focus, tasks, notes and follow-ups.

delete from public.plan_feature_entitlements
where plan_code = 'personal_askan'
  and feature_code in (
    'kesher_book',
    'basic_call_guides',
    'campaign_contact_sharing',
    'professional_playbooks',
    'contact_segments',
    'playbook_outcome_analytics'
  );

insert into public.plan_feature_entitlements(plan_code,feature_code,enabled)
values
  ('chesed_quick','kesher_book',true),
  ('chesed_quick','basic_call_guides',true),
  ('chesed_quick','campaign_contact_sharing',true),
  ('askan_pro','kesher_book',true),
  ('askan_pro','basic_call_guides',true),
  ('askan_pro','campaign_contact_sharing',true),
  ('askan_pro','professional_playbooks',true),
  ('askan_pro','contact_segments',true),
  ('gabbai_pro','kesher_book',true),
  ('gabbai_pro','basic_call_guides',true),
  ('gabbai_pro','campaign_contact_sharing',true),
  ('gabbai_pro','professional_playbooks',true),
  ('gabbai_pro','contact_segments',true),
  ('gabbai_pro','playbook_outcome_analytics',true),
  ('organization','kesher_book',true),
  ('organization','basic_call_guides',true),
  ('organization','campaign_contact_sharing',true),
  ('organization','professional_playbooks',true),
  ('organization','contact_segments',true),
  ('organization','playbook_outcome_analytics',true),
  ('custom','kesher_book',true),
  ('custom','basic_call_guides',true),
  ('custom','campaign_contact_sharing',true),
  ('custom','professional_playbooks',true),
  ('custom','contact_segments',true),
  ('custom','playbook_outcome_analytics',true)
on conflict (plan_code,feature_code)
do update set enabled = excluded.enabled;

create or replace function public.current_user_has_account_feature(target_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_accounts a
    join public.plan_feature_entitlements e
      on e.plan_code = a.current_plan_code
    where a.user_id = auth.uid()
      and a.account_status = 'active'
      and e.feature_code = target_feature
      and e.enabled = true
  );
$$;

grant execute on function public.current_user_has_account_feature(text) to authenticated;

-- Replace the original Kesher policies so a free Personal Askan account
-- cannot read or write Kesher records directly through the API.
drop policy if exists "owners read private or authorized shared contacts" on public.kesher_contacts;
drop policy if exists "owners create contacts" on public.kesher_contacts;
drop policy if exists "owners update own contacts" on public.kesher_contacts;
drop policy if exists "owners and authorized members read interactions" on public.kesher_interactions;
drop policy if exists "owners create own interactions" on public.kesher_interactions;
drop policy if exists "owners correct own interactions" on public.kesher_interactions;
drop policy if exists "authenticated read approved global playbooks" on public.kesher_playbooks;
drop policy if exists "campaign managers read campaign playbook drafts" on public.kesher_playbooks;
drop policy if exists "owners insert structured outcomes" on public.kesher_playbook_outcomes;
drop policy if exists "owners read own structured outcomes" on public.kesher_playbook_outcomes;

create policy "chesed quick users read own or authorized shared contacts"
on public.kesher_contacts
for select to authenticated
using (
  (
    owner_user_id = auth.uid()
    and public.current_user_has_account_feature('kesher_book')
  )
  or (
    visibility = 'campaign_shared'
    and campaign_id is not null
    and public.campaign_has_feature(campaign_id,'campaign_contact_sharing')
    and public.has_campaign_role(
      campaign_id,
      array['owner','admin','moderator','treasurer','askan','viewer']
    )
  )
);

create policy "chesed quick users create contacts"
on public.kesher_contacts
for insert to authenticated
with check (
  owner_user_id = auth.uid()
  and public.current_user_has_account_feature('kesher_book')
  and (
    visibility = 'private'
    or (
      visibility = 'campaign_shared'
      and campaign_id is not null
      and public.campaign_has_feature(campaign_id,'campaign_contact_sharing')
      and public.has_campaign_role(
        campaign_id,
        array['owner','admin','moderator','treasurer','askan']
      )
    )
  )
);

create policy "chesed quick users update own contacts"
on public.kesher_contacts
for update to authenticated
using (
  owner_user_id = auth.uid()
  and public.current_user_has_account_feature('kesher_book')
)
with check (
  owner_user_id = auth.uid()
  and public.current_user_has_account_feature('kesher_book')
  and (
    visibility = 'private'
    or (
      visibility = 'campaign_shared'
      and campaign_id is not null
      and public.campaign_has_feature(campaign_id,'campaign_contact_sharing')
      and public.has_campaign_role(
        campaign_id,
        array['owner','admin','moderator','treasurer','askan']
      )
    )
  )
);

create policy "chesed quick users read authorized interactions"
on public.kesher_interactions
for select to authenticated
using (
  (
    owner_user_id = auth.uid()
    and public.current_user_has_account_feature('kesher_book')
  )
  or (
    campaign_id is not null
    and public.campaign_has_feature(campaign_id,'campaign_contact_sharing')
    and public.has_campaign_role(
      campaign_id,
      array['owner','admin','moderator','treasurer','askan','viewer']
    )
    and exists (
      select 1
      from public.kesher_contacts c
      where c.id = contact_id
        and c.visibility = 'campaign_shared'
    )
  )
);

create policy "chesed quick users create own interactions"
on public.kesher_interactions
for insert to authenticated
with check (
  owner_user_id = auth.uid()
  and public.current_user_has_account_feature('kesher_book')
  and exists (
    select 1
    from public.kesher_contacts c
    where c.id = contact_id
      and c.owner_user_id = auth.uid()
  )
);

create policy "chesed quick users correct own interactions"
on public.kesher_interactions
for update to authenticated
using (
  owner_user_id = auth.uid()
  and public.current_user_has_account_feature('kesher_book')
)
with check (
  owner_user_id = auth.uid()
  and public.current_user_has_account_feature('kesher_book')
);

create policy "eligible users read approved global playbooks"
on public.kesher_playbooks
for select to authenticated
using (
  status = 'approved'
  and public.current_user_has_account_feature('basic_call_guides')
  and (
    campaign_id is null
    or (
      public.campaign_has_feature(campaign_id,'basic_call_guides')
      and public.has_campaign_role(
        campaign_id,
        array['owner','admin','moderator','treasurer','askan','viewer']
      )
    )
  )
);

create policy "campaign managers read professional playbook drafts"
on public.kesher_playbooks
for select to authenticated
using (
  campaign_id is not null
  and public.campaign_has_feature(campaign_id,'professional_playbooks')
  and public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
);

create policy "professional plans insert structured outcomes"
on public.kesher_playbook_outcomes
for insert to authenticated
with check (
  owner_user_id = auth.uid()
  and public.current_user_has_account_feature('playbook_outcome_analytics')
);

create policy "professional plans read permitted structured outcomes"
on public.kesher_playbook_outcomes
for select to authenticated
using (
  (
    owner_user_id = auth.uid()
    and public.current_user_has_account_feature('playbook_outcome_analytics')
  )
  or (
    campaign_id is not null
    and public.campaign_has_feature(campaign_id,'playbook_outcome_analytics')
    and public.has_campaign_role(campaign_id,array['owner','admin','moderator'])
  )
);

comment on function public.current_user_has_account_feature(text) is
'Checks account-level feature entitlement. Used to prevent Personal Askan accounts from directly accessing the Kesher API.';
