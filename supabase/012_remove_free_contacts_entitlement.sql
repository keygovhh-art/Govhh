-- Final clarification: no part of the Kesher/Contacts system belongs to Personal Askan.
-- The complete section starts with Chesed Quick.

delete from public.plan_feature_entitlements
where plan_code = 'personal_askan'
  and feature_code in (
    'contacts',
    'kesher_book',
    'basic_call_guides',
    'campaign_contact_sharing',
    'professional_playbooks',
    'contact_segments',
    'playbook_outcome_analytics'
  );

comment on function public.current_user_has_account_feature(text) is
'Account feature check. Personal Askan has no Contacts/Kesher access; the full section starts at Chesed Quick.';
