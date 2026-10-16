-- A shared campaign external donation URL is a LINK ONLY, not a payment gateway.
-- Optional additive migration 014, after verified 001-013, on staging first.
CREATE TABLE IF NOT EXISTS public.cc_campaign_donation_links (
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 provider_name text NOT NULL DEFAULT '' CHECK(length(provider_name)<=80),
 donation_url text NOT NULL CHECK(length(donation_url)<=2048),
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign_id),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,updated_by) REFERENCES public.cc_memberships(organization_id,subject)
);
ALTER TABLE public.cc_campaign_donation_links ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.cc_campaign_donation_links IS 'External HTTPS donation page link only. No card data, settlement, processor verification or campaign proceeds are handled.';
