# גבהה קאמפיין סענטער — Gabbai Pro אפטיילונג, פראקטישער אויפבוי

## איצט נאר GitHub Draft #36 — נישט אויף Render
- GitHub: `keygovhh-art/Govhh` PR #36 (branch `feature/gabbai-pro-operations-handoff-20261018`).
- Stacked after Askan Pro Guidance PR #30; prior drafts #23 through #30 contain the ordered dependencies.
- Planned `db/033_gabbai_operations_handoff.sql`, after the reviewed previous 001–032 migrations. **No Neon production migration has been run in this work.**
- Render Campaign Center `https://gavhah-campaign-center.onrender.com` remains unchanged. Gavhah `keygovhh-art/Lcb` hotline is separate and must never be changed by this branch.

## 2 connected real uses
**1. Management shift log / next-step handoff.** An owner or manager records a headline, completed work, blockers, the next action, urgency and optional target date. Other leaders see new/critical messages prioritized and confirm that they have taken over the update. Real time data is recorded with immutable acknowledgement history, 7/30/90-day period filter and relevant per-user unread counts; not an automatic push or guaranteed task completion.

**2. Convert handoff to a real assignment.** Owner/manager explicitly selects a current ACTIVE campaign member from the mobile selector, presses Create Task; the existing `cc_assignments` table receives ONE real open task whose title is taken from the handoff next action (up to 240 chars), with urgency mapped to priority and the handoff's due date. The immutable `cc_gabbai_handoff_task_links` mapping prevents duplicates even on retries/second-manager concurrent requests. No calls/messages or finance events are triggered.

## Function statuses (no inflated claims)
- `operations_memory`: **new pilot** with real two-person handoff plus tasks.
- `custom_roles`: **still missing**, intended next major Gabbai Pro initiative. Must be real server-side permissions and not decorative job titles.
- `priority_oversight`: partial (recorded task ordering, no external validation).
- `team_workload`: pilot (recorded task/team aggregates).
- `ledger` and `approvals`: existing internal-only pilot. Two-person human approvals **do not execute payments or refunds**.
- `refunds`, `auto_sync`, `finance`: partial; no real payment provider settlement, bank reconciliation or external sync confirmed.
- `audit`: internal recorded events, not external provider validation.

## Release gates
- Verify GitHub CI for `tests/gabbai-handoffs.test.mjs`, syntax, Vite build, other tiers regression and auth route check.
- Before live deploy: backup and independently review production Neon migration chain 027–033, role/plan entitlements and two-manager Android browser test.
- Do NOT merge or deploy to production without explicit release authorization; don't inadvertently publish other chats' changes.
- `cc_gabbai_shift_handoffs` + per-manager immutable ACK + `cc_gabbai_handoff_task_links`; no PII in general audit event details.

## Next step
Work down `custom_roles`: clarify minimum safe role templates, allow organization owner to assign scoped capabilities for **Gabbai Pro-only modules** with server-side verification, prevent bypass of campaign and paid-tier boundaries; then improve refunds/ledger workflow with clear separation between internal requests and real settlement.
