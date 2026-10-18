# קאמפיין סענטער — Askan Pro, פונקציע נאך פונקציע (18 אקטאבער 2026)

## וועלכע פראיעקט און פארוואס
- **Campaign Center only:** GitHub `keygovhh-art/Govhh`, Render `https://gavhah-campaign-center.onrender.com`, Neon `still-haze-11727622`.
- **Not Gavhah** (`keygovhh-art/Lcb`, separate hotline/member login).
- Production branch `prep/neon-render-campaign-center-20261014` with AutoDeploy OFF. Below additions are **separate stacked DRAFT PRs**, **not deployed**. No changes to production Neon or Render.
- Sequential dependency from source: PR #23 Chesed Quick → #24 Askan Plus alerts → #25 Askan Pro private files → #26 Askan Pro manually-run CRM automation → #27 Askan Pro privacy-safe manual call lists.
- Previous full six-tier entitlement work through migration 026 already deployed in a prior approved release; new pending migration numbers: 027 Quick, 028 Plus, 029 Pro Files, 030 Pro Automation.

## All 11 Askan Pro catalog functions — do not omit
| Code | Function | Exact scope in staged code, not marketing promise |
|---|---|---|
| `crm` | Advanced CRM | Pilot: owner/team/private CRM with stages, tags, followup dates. |
| `relationship_history` | Contact relationship history | Pilot: manually entered timeline, not carrier-verified activity. |
| `files` | Secure campaign documents | **New PR #25 pilot:** 1MiB PDF/JPG/PNG/TXT; up to 20 files/12MiB per campaign in Neon; private/team/campaign permissions; download as attachments. No malware scanner or object storage CDN. |
| `advanced_call_lists` | Advanced call lists | **New PR #27 pilot:** manual due/high/all CRM worklists. Excludes DNC, inaccessible teams, other users' private contacts, blank phones, closed stages and other-worker active claims; no autodial. |
| `csv_import` | CSV/Excel import/export | Existing pilot. Existing source handles CSV; XLSX native import is not independently verified. |
| `clarity` | Clarity Engine | Existing deterministic authorized tasks/followups scoring only; not AI prediction. |
| `next_action` | Next Best Action | Partial: on-screen Clarity suggestions, not tested decision fulfillment. |
| `automations` | Advanced Automations | **New PR #26 pilot:** individual explicitly enables + presses Run for up to 20 own overdue CRM contacts; creates own generic task with dedupe per contact/deadline; DNC filtered; no background cron, outbound phone, SMS, email, TTS or provider call. |
| `guidance` | Professional Guidance Requests | Existing private Guidance Inbox pilot; external professional SLA not verified. |
| `sprint_memory` | Seven-Day Sprints and Thirty-Day Memory | Existing pilot; longer-term scheduled automation not verified. |
| `blocker_intelligence` | Blocker identification | Existing manual blocker reasons and audits; no predictive model. |

## New privacy and data safety gates
- `029_pro_campaign_files.sql`: immutable files, deny-by-default RLS; no PII in shared audit.
- `030_pro_followup_automation.sql`: member-owned opt-in rules; append-only run ledger, idempotent task/source links; generic titles with zero private CRM text.
- Strict `server/plan-policy.js` entitlements for new APIs under `/api/pro`, including `files`, `automations` and `advanced_call_lists`.
- Manual worklists NEVER call providers, and require membership scope and Do-Not-Call exclusion.
- Exact code/QA: `tests/pro-files.test.mjs`, `tests/pro-automations.test.mjs`, `tests/pro-call-lists.test.mjs` under disposable localhost Postgres.

## Honest release blockers
1. Review ordered 027–030 schema migrations on a clean, isolated staging branch matching production. Prior staging Neon branch was missing some 013–026 baseline tables; do NOT run late migration out of order.
2. Establish migration tracking, backup/rollback, user-approved release scope, test two users and two orgs on real Android login.
3. Billing/Askan Pro entitlements active for real test workspace; operator must not fabricate subscriptions/verified payment.
4. Real provider-verified calls, phone permissions, advanced unattended notifications, antivirus scanning and full Excel XLSX import are NOT present. Do not advertise them as shipped.

## Next in sequence
- Improve **Next Best Action** beyond suggestions: safe member confirmation / audited manual action, separate from auto-calling.
- **Clarity / Next Best Action privacy hardening — PR #28:** Excludes DNC, blank-phone, closed-stage and contacts claimed by another member; unassigned/empty teams may not leak campaign shared contacts or related private timeline. Real multi-member acceptance tests are green. This is safer source-based recommendations, NOT autonomous AI. 
- Improve **Clarity** further with explicit human accepted/declined recommendation states and source link verification.
- Expand **Guidance** with manual human reply/acknowledgement/SLA tracking once backend supports it.
- Continue Gabbai Pro, Organization, Custom afterward, with separate releases.
