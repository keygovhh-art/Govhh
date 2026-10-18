-- Campaign Center stage 027: Chesed Quick truthful daily review and 7-day memory.
-- Purely additive, after reviewed 001-026 migrations; no automated notifications.
CREATE TABLE IF NOT EXISTS public.cc_quick_daily_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 author_subject text NOT NULL,
 review_date date NOT NULL,
 open_tasks integer NOT NULL CHECK (open_tasks >= 0),
 overdue_tasks integer NOT NULL CHECK (overdue_tasks >= 0),
 due_soon_tasks integer NOT NULL CHECK (due_soon_tasks >= 0),
 critical_tasks integer NOT NULL CHECK (critical_tasks >= 0),
 completed_today integer NOT NULL CHECK (completed_today >= 0),
 goal_warnings integer NOT NULL CHECK (goal_warnings >= 0),
 reflection text NOT NULL DEFAULT '' CHECK (length(reflection) <= 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,campaign_id,author_subject,review_date),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,author_subject) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cc_quick_reviews_private_history
 ON public.cc_quick_daily_reviews(organization_id,campaign_id,author_subject,review_date DESC);
ALTER TABLE public.cc_quick_daily_reviews ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_quick_reviews_immutable
 BEFORE UPDATE OR DELETE ON public.cc_quick_daily_reviews
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_quick_daily_reviews IS 'Only the author may read their server-calculated daily campaign snapshot. Append-only and one per New York day. No contacts, phone, donor details or background notifications.';
