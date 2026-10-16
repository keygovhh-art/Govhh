# קאמפיין סענטער — שבת־Checkpoint און לייוו־רעליס, 2026-10-16

## אמתער מצב ביי דער דאזיגער לעצטער דורכקוק
**Campaign Center איז לייוו.** דאס הייסט Render deployment/state און production Neon schema; נישט אז אלע 72 פיטשערס זענען 100% פראדוקציע־טעסטעד.
- Render URL: `https://gavhah-campaign-center.onrender.com`
- Render Workspace: `Campaign Center` / `tea-db848v5g1s2s738vqmdg`; Service `srv-db84angn74is73dnv0cg`.
- Render branch: `prep/neon-render-campaign-center-20261014`, AutoDeploy OFF.
- Render Live deployment: `dep-db99edm1egvs73cvkjhg`, commit `d2052fa5d4a63019853940a09bc36189438af985`, Render deploy finished `2026-10-16T21:30:05Z`.
- Render log at `21:30:04Z`: `Campaign Center Neon API listening on 10000`; Render log confirms service live. Direct external HTTP smoke check was UNAVAILABLE from this assistant tool environment; **logged-in Android UAT still required**.
- GitHub repository `keygovhh-art/Govhh` both `main` and `prep/neon-render-campaign-center-20261014` fast-forwarded to `d2052fa5d4a63019853940a09bc36189438af985` (no force; expected original SHA `2087fbaa870de0e60e59d78c0a76969cfa2439ff`).
- Neon project `still-haze-11727622` default/production branch `br-gentle-pine-b5imf095`. Exact schema count verified **55 `cc_*` tables and all 55 with RLS enabled**, after additive atomic migration files `013..026`.
- Verified Neon baseline BEFORE migration: 30 `cc_*` tables, 1 organization, 0 campaigns, 0 contacts. Existing app data intentionally preserved; migrations were CREATE/ADD/ENABLE RLS + audit triggers, not history cleanup.
- Production pre-release backup branch `br-late-pond-b5b4u64s` named `backup-before-six-tiers-20261016`; do NOT delete without user approval.
- Staging verification branch `br-super-field-b53tqnmn` named `staging-six-tier-release-20261016`; 103 SQL statements migrated atomically and verified 55 RLS-protected tables BEFORE production; do NOT delete without user approval.

## צוגעקומענע נייע פונקציעס
1. Chesed Quick: 6-plan catalogue with 72 features, campaign goals, source-grounded focus, external donation links, privacy fundamentals.
2. Askan Plus: scoped member dashboards, team reports, donation levels, handoffs, manual pledge partial receipts.
3. Askan Pro: private CRM, relationship history, 7-day sprints, guidance messages, blocker intelligence.
4. Gabbai Pro: 2-person approval, read-only source-split ledger, priority/team reports (no real banking transactions).
5. Organization: leadership-only multi-campaign portfolio, private leadership decision records, monthly budget/hour resource planning, immutable institutional memory.
6. Custom: transparent manager-editable Focus priorities with 10 grounded recommended tasks/followups; no AI automated calling.
7. Exact server-side `cc_plan_entitlements` / `cc_plan_entitlement_history` and `server/plan-policy.js`, with trusted-admin-only grant, membership and tenant-scoped premium API checks, per-route feature deny-by-default, finite caps on members, goals and campaigns, downgrade and expiry fallback, UI showing TRUE server-issued plan.

## באמערקונגען צום זיכערהייט / אמתע מצב
- No automatic paid subscription checkout or billing verification. New organizations WITHOUT explicit trusted operator grant receive Chesed Quick; unagreed Askan Plus/Custom capacity is finite starter fallback, NOT unlimited.
- The original 8 shared event/AV/MAX/Yemot feature allocations remain undecided. Existing authenticated Hall/Hitkabtzu/Floor/Conference/Video/RTC endpoints were PRESERVED as pilot routes pending that decision; they do not thereby confer a paid tier. Do not disable unilaterally.
- The master schema runner `scripts/apply-reviewed-schema.mjs` still covers ONLY `001..012`. Production got `013..026` by explicit reviewed atomic Neon connector SQL following staging and backup. **Update the persistent migration manifest and add drift checks before future migrations.**
- No verified REAL multi-member Android login/signup/team/privacy E2E on production as yet. No confirmed load performance; no carrier-approved caller ID/outbound telephony, real payment gateway, unlimited meetings, or full external provider connections.
- Production review of `GET /api/health` and `/api/plans` via direct external HTTP was blocked by external tool network access; Render logs, Live deployment and Neon schema check are independently verified.
- Front end account plan view now displays true entitlement vs browse-only catalogue; older pilot UI is not proof of feature completeness.
- Parent Gavhah is separate repo `keygovhh-art/Lcb`, production Render `https://gavhah.onrender.com`, Neon `falling-wildflower-17519958`. **No changes to Gavhah production were made in this release.**

## GitHub pull-request context
The deployed tree includes nested PRs `#12→#13→#14→#15→#16→#18→#19→#20→#21→#22` from this Campaign Center 6-plan build (code promoted via protected expected-SHA fast-forward, not by pressing Merge PR). The draft PR metadata may remain Open; code is already included in the deployed commit. Other parallel/chat PRs `#11` (phone parity), `#17` (PIN management), `#8/#7` and older #2 were not intentionally included. Never conflate them automatically.

## נאך שבת — נעקסטע ארבעטס־סדר
1. Check Render current Live SHA `d2052fa...`, app logs/errors/request logs, verify `/api/health`, `/api/plans`, `/api/config` and ideally authenticated Android login/signup with actual owner's consent.
2. Audit 55 live DB tables / migrations against GitHub and add `013..026` to a safe audited/idempotent migration manifest; no uncontrolled SQL replays.
3. Perform two real USER accounts / two ORGs privacy/UAT: campaigns, tasks, contacts, team claims, CSV scopes, pledge vs verified money, sprints/guidance, Gabbai maker-checker, Organization planning/Memory, Custom rule preview.
4. Find and fix any live gaps, verify agreed plan cap assignments and feature access without granting paid plans from client/UI, and separately agree the 8 shared pilot feature tiers.
5. Build a trusted operator-only plan provisioning/revocation workflow + real subscription receipts/webhook only after selecting a legitimate payment provider; keep an immutable audit, no client self-upgrade.
6. After that: fill incomplete planned features per the 6-plan catalog, then hotline/authorized caller-ID/recordings/IVR/web-phone parity separately with tested providers. No false claim of 100% completeness.
7. Keep Gavhah and Campaign Center strictly separate: no Replit, no Supabase, no hidden cross-org donor sharing.

## צייט און סיסטעם־באגרעניצונג
User said **publish all through here** and **remember where left off to continue after Shabbos**. This file is the durable checkpoint for next chat/automations. Tried to schedule new Saturday-night continuation task; automation creation failed because user has 5 active tasks limit. **No new scheduled task was created.** The user may reopen chat after Shabbos and ask to continue from this file.

Prepared by ChatGPT from current-turn GitHub, Neon and Render tool observations, as of Friday October 16 2026 NY time.