# Campaign Center — one-batch release candidate checklist (19 October 2026)

## Scope actually staged
- Askan Pro Guidance PR #30
- Gabbai handoffs #34 + member workload #35 + mobile workload #38 + real campaign-wide search #39 + manually reported blocker queue #40
- Complete schema and existing-data CI rehearsals #41, read-only database release gate #42
- **This Draft PR #43** consolidates Gabbai Pro finance desk PR #31 and Organization cross-campaign urgency PR #32, keeping one canonical handoff schema 033
- No other conflicting handoff versions (#33/#36/#37) are imported

## Production reality
- Render service `srv-db84angn74is73dnv0cg` serves `gavhah-campaign-center.onrender.com`; autoDeploy remains OFF
- Existing primary Neon project `still-haze-11727622` / `br-gentle-pine-b5imf095` has 55 RLS-enabled CC tables with 026 entitlements, but stage-027–034 tables and Guidance ownership fields are absent
- CI fixtures and disposable PostgreSQL tests are **not** live Android user-acceptance or payment/telephony provider tests

## Proposed separate schema upgrade
File: `scripts/apply-additive-027-034.mjs`.

- Explicit operator-only; never called by production server, build or deploy steps
- Refuses without exact selected host, explicit apply flag and separate staging or production approval
- Remote staging requires verified Neon staging branch ID distinct from production hostname
- Production additionally requires reviewed-backup branch ID, tested restoration and separate explicit approval
- Blocks partially upgraded schemas and second application
- Runs only 027–034 in one transaction; monitors original organizations/members/campaigns before and after; checks RLS on each new table, and Gabbai blocked state before COMMIT
- CI `rehearse-preserving-upgrade.mjs` tests it against locally created 026 data, verifies authorization refusal, success, replay refusal and preserved old records

### STILL REQUIRED BEFORE FIRST REAL NEON WRITE
1. Make a **new** recovery branch from production as close to rollout as possible; do not claim old October 15/16 branches are up-to-date.
2. Clone exact CURRENT production to a fresh Neon staging branch. Independent operator must confirm its connection host is **not** the production endpoint. Tests on existing stale staging branches are not equivalent.
3. Review baseline table names, columns and old pilot behavior, and apply the script to that staging branch with authorized staging flags.
4. Test 2 real Android user roles end-to-end, pricing/entitlement gates, finance maker-checker, Organization urgency, campaign data isolation and all old Hall/Hitkabtzu pilots.
5. On separate approval, apply 027–034 to current production Neon while Render still serves old code. Verify the SELECT-only release preflight and data.
6. Only then perform **one** explicitly approved Render deployment from the reviewed release SHA. Confirm real sign-in, campaign workflows and rollback plan.

No actual Neon writes or Render deploys are requested/performed by this Draft. Do not advertise staged features as live or subscription payment/phone automation as implemented.
