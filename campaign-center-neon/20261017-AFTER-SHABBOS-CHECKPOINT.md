# קאמפיין סענטער — שבת־נאכפאלג / Release Handoff — 2026-10-17

## דער באשטעטיגטער איצטיגער LIVE־מצב
- **Product:** Campaign Center ONLY; separate Gavhah / Global Kindness Network is NOT to be touched.
- **Production URL:** https://gavhah-campaign-center.onrender.com
- **GitHub repo:** `keygovhh-art/Govhh`
- **Live Render service:** `srv-db84angn74is73dnv0cg` (workspace `tea-db848v5g1s2s738vqmdg`).
- **Render deployed branch:** `prep/neon-render-campaign-center-20261014`; AutoDeploy OFF.
- **Live commit:** `d2052fa5d4a63019853940a09bc36189438af985`.
- **Render deploy:** `dep-db99edm1egvs73cvkjhg`, status **live**, 2026-10-16 21:30:05Z (5:30 PM New York).
- **GitHub PR #22 current head:** same live SHA as Render branch; parent draft chain #12→#13→#14→#15→#16→#18→#19→#20→#21→#22. The PRs are STILL OPEN DRAFT even though a live deployment branch contains these commits; do NOT infer unmerged drafts mean production not deployed.
- **GitHub Actions:** head `d2052fa...` preflight and Neon Auth route check both successfully completed.
- **Neon production:** `still-haze-11727622`, branch `br-gentle-pine-b5imf095`.
- **Verified public `cc_*` table count:** **55**; verified `cc_plan_entitlements`, `cc_org_resource_pools`, `cc_custom_focus_profiles` exist.
- **Actual DB counts from read-only query:** **1 organization; 0 campaigns; 0 approved plan grants**. Thus only Chesed Quick effective by default; higher functions require an explicit, scoped, legitimate operator grant. Do NOT silently grant all users Custom.
- **Available backup:** Neon `br-late-pond-b5b4u64s` named `backup-before-six-tiers-20261016`; do not delete.
- Render calls and Neon read-only SQL verify deployed status and schema; **authenticated real-browser Android smoke test was NOT proven**. The public URL was not accessible to the web fetch tool, so DO NOT claim end-to-end user success.

## Feature development delivered as code and staged/deployed
1. Starter **Chesed Quick**, existing core.
2. **Askan Plus** member desk, pledge installments, team operations pilot.
3. **Askan Pro** private CRM/interactions, Clarity rule-based suggestions, 7-day Focus Sprints, 30-day factual history, guidance inbox and blocker reports pilots.
4. **Gabbai Pro** two-person finance approvals, manual ledger review, priorities/team workload.
5. **Organization** portfolio, leadership decisions, monthly resource pool caps/volunteer-hour planning, immutable Organization Memory.
6. **Custom** self-defined deterministic Focus priority weights and ten next steps (NOT autonomous agents).
7. **Server-side Plan Entitlements** with grant status, finite limits and 403 on unauthorized API access; downgraded records preserved, plan change history.
8. Existing Yemmot bridge / hall / Hitkabtzu and MAX foundation should be independently checked. Current live commit message specifically mentions maintaining Hall/Hitkabtzu pilot tabs available pending tier assignment. Do not independently publish unrelated phone-member PIN PR #17 or full phone-parity PR #11.

## What NOT to claim finished
- **0 paid-plan grants currently in production**. No subscription payment checkout/webhook or signed verified billing provisioning.
- Askan Plus exact capacity not approved; Custom per-customer capacity only by separate agreement.
- Not all planned ~72 master catalog features are full-fledged or end-to-end Android tested; some remain pilot, partial or missing.
- No production-verified payments, actual refunds/bank clearing, verified outbound Caller ID, confirmed Yemot/TelTech outgoing and API channel capacity, no fully automated scheduled SMS/email workflows or professional staff SLA.
- Do not alter the separate Gavhah repo `keygovhh-art/Lcb` nor its separate Render/Neon projects.

## Next work, after Shabbos, in THIS order
1. Run Android **real login/signup/owner** + first campaign CRUD through production; verify no runtime errors. If automated public browsing unavailable, report test as unverified and seek real tester details.
2. Check owner organization membership and secure entitlement provisioning process. Only legitimate scoped override, no fabricated payment. Decide Askan Plus numeric member/goal/campaign limits and Custom contracted values.
3. Scope and allocate exact tier entitlement for **Hall/Hitkabtzu/phone parity** without breaking existing pilot, and review PR #11 / #17 separately before any release.
4. Finish missing product areas: secure campaign files, background automations, custom role/dept ACL, real provider integrations and limits, actual compliance and finance/chargeback reconciliation.
5. Add lasting DB migration/version tracking (001–026 applied record), independent smoke/regression tests, backups and rollback plan.
6. Re-review PR drafts vs published branch, consolidate only vetted work without deploying unrelated other-chat changes.
7. Keep publishing behind explicit release scope and ensure rollback backup.

## Secure operating rules
- Do not leak JWTs, DB URLs, provider API keys, invite tokens or subscriber details.
- Do NOT reset/deactivate/delete existing data, branches or services.
- Show real verification before saying “100%”. Treat `live` Render status as a deploy state, not proof every UI workflow succeeds.
- This checkpoint is saved on **handoff branch** `handoff/campaign-center-after-shabbos-20261017`, NOT the live branch; no additional redeploy is required.
