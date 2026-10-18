# קאמפיין סענטער — אפטיילונג נאך אפטיילונג | 18 אקטאבער 2026

## Source of truth
- GitHub: `keygovhh-art/Govhh`, live branch `prep/neon-render-campaign-center-20261014`.
- Render Campaign Center: `https://gavhah-campaign-center.onrender.com`, service `srv-db84angn74is73dnv0cg`, AutoDeploy OFF.
- Neon Campaign Center: project `still-haze-11727622`, production branch `br-gentle-pine-b5imf095`.
- Existing production code through 026. **Nothing in this note is a fresh production deployment.**
- **Gavhah is separate.** Latest male voice & Gavhah phone signup belong to `keygovhh-art/Lcb`; do not duplicate personal My Askanus in Campaign Center.

## Next section 1: Chesed Quick | Draft PR #23, migration 027
- 7-day private immutable daily review snapshots, one per day in New York time and per member/campaign.
- Database factual System Watch: overdue / due soon / critical assignments; at-risk goals; own completed task actions today.
- Real optional task deadline on initial task creation, so overdue Watch can actually see deadlines from Quick users.
- Daily Review private free-text reflection (max 500) and 7-day history: never globally shared; only author sees reflection.
- Frontend Android Today card; no made-up historical days; no outgoing messages or background automation.
- `tests/quick-daily.test.mjs` local disposable PG: multi-role tenant scope, private history and immutable trigger.
- Existing `br-sparkling-term-b5dqbtco` staging branch was read-only checked and is missing `cc_goals` and `cc_plan_entitlements`. **Do not run migration 027 there before bringing schema up through 026.**
- Current status: source + CI pilots; **not published**.

## Next section 2: Askan Plus | Draft follow-up PR, migration 028
- Each permitted Askan Plus member can explicitly acknowledge an overdue task alert; this does NOT complete the task.
- Read receipts private to member, never hidden from another member, keyed to specific deadline.
- If the deadline changes, warning appears anew, with append-only audit and no duplicate write on retries.
- Existing source-derived `GET /api/plus/campaigns/:cid/alerts` retained, with `acknowledged_at` scoped to viewer.
- New guarded `POST /api/plus/campaigns/:cid/alerts/:tid/ack` requiring paid tier and correct task visibility.
- No SMS/Email/push provider; honest in-app pilot.
- `tests/askan-plus.test.mjs` extended with two groups, another tenant, retry, deadline changes, immutable audit.
- Current status: source and CI candidate; **not published**.

## Release gate
1. Stacked source branch and all CI green, syntax & mobile Vite build.
2. Review migrations 027 & 028, immutable triggers, existing donor privacy and consent.
3. Refresh isolated staging with reviewed schema 001–028 (the old staging branch lacks 013–026).
4. Live authenticated Android with 2 members, 2 organizations, role revocation, and rollback backup.
5. ONLY if explicit publish requested: reviewed migrations, deploy current Campaign Center Render service. Never touch unrelated Gavhah source/deploy.

## Continue after these two
- Finish Askan Plus advanced team credits, handoffs, announcements and accurate follow-up workflows.
- Askan Pro missing files, automations and stronger human guidance.
- Gabbai Pro custom roles / operations memory and real provider accounting without false payment confirmations.
- Organization department-scoped CRM.
- Custom contracted integration/API/telephony with signed authorizations and rate/cost controls.
- Phone parity: the separate Campaign Center Neon Auth member system must not be confused with Gavhah phone registrations.
