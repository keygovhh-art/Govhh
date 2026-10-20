# Campaign Center Askan Plus: full historic credit / finance facts

**GitHub Draft only. No Render deploy, Neon production, subscription or provider activation.**

## Fixed
The earlier `GET /api/plus/campaigns/:cid/credit-report` used inner joins on current campaign membership and active organization membership, silently dropping legitimate past credited receipts after the fundraiser left or was removed. It also silently truncated credit at 500 people, and added different `currency` amounts together.

The new authenticated endpoint:
- Begins directly from immutable `cc_finance_events`, scoped by campaign+organization and an actual authorized current user.
- Includes historical staff attribution even if their membership was revoked or they are no longer currently in the campaign. The `member_status` and `current_campaign_member` flags make that distinction explicit.
- Groups credit by **member and currency**; no accidental sum of USD and EUR.
- Offers full real total counts, 100-row server-side pages, and all-record currency totals. The 100 display limit is labelled and managers may continue to other pages, not silently assume 500 = whole campaign.
- Returns unattributed finance event counts **only to authorized leadership** in the by-currency ledger totals. Unattributed money is not invented as a person's fundraising credit.
- Shows `corrections` separately rather than treating a positive correction amount as a receipt or refund without direction evidence. Net = recorded receipt less recorded refund; this is explicitly **manual**, not bank-verified cash.
- Keeps ordinary workers' credit visibility to their own subject, with no other member data or uncredited totals.
- Offers Yiddish Android pagination, historical staff labels, currency labels and escaped server errors, with account/organization campaign-switch reset.

## Quality gates
Disposable local PostgreSQL acceptance seeds 503 worker attributions, with 504 subject-currency credit rows, six result pages, a revoked worker, non-campaign members, USD/EUR amounts, a refund, a correction, an unattributed receipt, and other-organization 404. Another regression tests the mobile content, safe escaping, and incomplete-report errors.

Potential future improvements: pagination/performance indexes after production-matched staging benchmarks, signed payment-processor integration before "verified received" claims, correction event direction/reconciliation metadata. Do not classify this as bank settlement.

This fixes a meaningful Askan Plus partial feature but **does not claim the entire 72-feature release is ready**. The Custom carrier/hotline and outbound integration is still not implemented; other partial features and the 027–037 Neon release readiness/UAT remain blocked.
