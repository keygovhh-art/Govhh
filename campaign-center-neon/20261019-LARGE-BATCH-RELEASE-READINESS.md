# Campaign Center — consolidated release readiness, 19 October 2026

## Live versus Draft: do not misstate
- Production Render service `srv-db84angn74is73dnv0cg`, branch `prep/neon-render-campaign-center-20261014`, last verified live SHA `d2052fa5d4a63019853940a09bc36189438af985` (16 October). Auto-deploy and preview deployments remain OFF.
- Production Neon `still-haze-11727622`, `br-gentle-pine-b5imf095` has 55 Campaign Center tables with RLS enabled. Read-only production inspection verifies `cc_plan_entitlements` exists but all seven sampled new 027–034 tables are absent; `cc_pro_guidance_requests` lacks new 032 triage fields. **Do not start new server code against this old schema.**
- Existing production migration runner `scripts/apply-reviewed-schema.mjs` manages 001–012 only and explicitly refuses partial/existing schemas; it is NOT the right tool to apply 027–034 to the 55-table live project.
- Candidate GitHub chain: Askan Pro #30 → Gabbai worker handoffs #34 → member workload #35 → global view #38 → server-side search #39 → blockers #40 → migration rehearsal #41 (all Draft). The separate PR #31 finance command board, #32 Organization attention, #33/#36/#37 alternate handoff drafts are **not** automatically included in this chain.
- **Never merge incompatible 033 variants** from #33, #36, or #37 into the selected `033_gabbai_operations_handoffs.sql` lineage.

## Release rehearsals (disposable CI only)
1. `scripts/rehearse-complete-schema.mjs`: explicit manifest 001–034, exclude legacy duplicate `007_conference_lists.sql`, local-only throwaway database, check RLS and new Gabbai status constraint.
2. `scripts/rehearse-preserving-upgrade.mjs`: build local 001–026, seed a charity workspace+member+fundraiser, apply only 027–034 in order, prove saved data still exists.
3. Both are run by GitHub PR CI and **cannot** connect to hosted Neon. Neither tool is approved for production migration. No automatic Render deploy.

## Outstanding mandatory release gates
- Review and reconcile complete intended feature scope: finance priority board PR #31, organization cross-campaign urgency PR #32, and competing Gabbai handoff designs. Fix missing custom roles and unverified external provider/payment automations before advertising them as complete.
- Produce a separately reviewed **existing-production baseline–aware 027–034 migration procedure**, without reapplying 001–026, recording a verified rollback plan and an independently checked Neon recovery branch.
- Rehearse on a staging branch cloned from production (not just fresh local databases). Check counts, row-level tenant access, data and plan grants.
- Android owner/member real UAT: sign-up/login, create campaign, invite worker, plan gates, guidance, handoff, blocker/resume, search across 500+, activity, finance and paywall. Verify Hall/Hitkabtzu/conference pilots are not regressed.
- Confirm no unapproved payment or telephony provider dispatch. Decide plan feature availability based on actual entitlements, not catalogue promises.
- **Deploy one approved batch, one time** to conserve Render credits; inspect success and have rollback readiness.

## Go/no-go
Code passing CI means **Draft test-ready**, not production-ready. Until the gates above are satisfied, keep Render autoDeploy OFF and Neon production unchanged.
