-- Askan Plus milestone: suggested donation amounts/labels only; never charges cards.
-- Migration 015, staging only after 013 and 014. No production execution by CI.
CREATE TABLE IF NOT EXISTS public.cc_donation_levels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 label text NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
 amount numeric(14,2) NOT NULL CHECK (amount>0 AND amount<=1000000000000),
 display_order integer NOT NULL CHECK(display_order BETWEEN 0 AND 7),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(campaign_id,label),
 UNIQUE(campaign_id,display_order),
 FOREIGN KEY (organization_id,campaign_id)
  REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (organization_id,created_by)
  REFERENCES public.cc_memberships(organization_id,subject)
);
CREATE INDEX IF NOT EXISTS cc_donation_levels_campaign_idx ON public.cc_donation_levels(campaign_id,display_order);
ALTER TABLE public.cc_donation_levels ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.cc_donation_levels IS 'Campaign suggested amount settings only. Not paid donations and not payment-provider verified.';
