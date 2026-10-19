# קאמפיין סענטער — Gabbai Pro: נאכפאלג 18 אקטאבער 2026

## Source / release boundary
- Product: **Campaign Center** only, GitHub `keygovhh-art/Govhh`, Render `https://gavhah-campaign-center.onrender.com`, Neon project `still-haze-11727622`.
- Staged branch: `feature/gabbai-pro-operational-handoffs-20261018`.
- Draft PR: #37, based on the **Askan Pro Guidance** draft PR #30.
- Production Render autoDeploy is OFF. This new Gabbai work is **NOT merged, NOT deployed and NOT migrated into production**.
- Existing pending migration chain #23–#30, new schema number **033**. Do not skip or reorder migrations.
- Separate Gavhah hotline / MAX in repo `keygovhh-art/Lcb` is untouched.

## Delivered useful functionality
**Gabbai Pro: Operational Shift Handoffs and Continuity**
- A manager creates a handoff with task title, instructions, named active campaign member, importance and optional target date.
- The recipient personally acknowledges receipt, then can mark work complete; the manager can finish an acknowledged handoff.
- Live pending / acknowledged / completed statuses; individual or manager views; new searches and filters: active, assigned to me, waiting, acknowledged, finished, all.
- In-card append-only event history of creation/acknowledgement/completion. Duplicate button presses never create duplicate history. Operations not a finance payment, outgoing call or automated SMS.
- `db/033_gabbai_shift_handoffs.sql`: new tables `cc_gabbai_handoffs`, `cc_gabbai_handoff_history`.
- `server/gabbai-handoffs.js`: authenticated role-aware GET, POST, acknowledge, complete. Exact `operations_memory` tier grant checks and canonical ID-to-organization verification.
- `src/gabbai-handoffs-view.js`: RTL/Yiddish manager assignment, member acknowledgement, search/filter/history on phone.
- `tests/gabbai-handoffs.test.mjs`: local real PostgreSQL tests for two workers, manager, owner, other organization, transition sequence, replays, revocation, downgrade, immutable audit.
- `tests/gabbai-handoffs-view.test.mjs`: mobile control visibility, filters/search and safe text rendering.
- Master plan `operations_memory` moved from `missing` to **pilot** (correct: not full automation or production).

## CI / QA
Check GitHub Actions status for latest SHA before making a completion statement. An earlier accumulated Askan Plus assertion was flaky because it searched random UUID text for digits "200"; amended test to check its finance field, not whole object. Last successful baseline preflight was green; do not infer new latest run succeeded until verified.

## Next build queue
1. Gabbai Pro custom role/department permissions for managers, without giving out organization-owner authority.
2. Gabbai Pro human finance reconciliation review and refunds **review only** until real processor/bank data available.
3. Organization department-specific dispatch/CRM and leadership work queue.
4. Custom contract-grade provider integrations (only authorized Caller ID), cost ceilings, Yemot central API, safe provider lifecycle.
5. Staging Neon migrations 027–033 on restored/cloned reviewed branch; authenticated Android UAT, rollback, then explicit production authorization.

Do not claim all 72 master features are 100%, and do not fabricate carrier, bank or billing success.
