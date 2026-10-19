# Campaign Center Gabbai Pro — all-member workload paging, 19 October 2026

## Purpose and scope
Practical improvement for worldwide charity campaign managers with hundreds/thousands of volunteers. No assumptions about volunteer performance, availability or financial transactions. A server-authorized, tenant-scoped workload search finds members beyond the former 500-card mobile limit.

## GitHub staged work
- Based on Gabbai Pro #38, which depends on #35/#34 and Askan Pro PR #30; separate from other conflicting 033 handoff drafts.
- `GET /api/gabbai/campaigns/:cid/member-workload` accepts validated and parameterized `search` (substring), `team` (exact), `filter` (all/overdue/soon/unassigned), `page` (1-based), and `limit` (1..500).
- Aggregates for **all** active campaign members are calculated before row pagination; returned cards are page-limited, but matching total and global totals stay accurate. Global filter counts are separately included. No new tables or migrations.
- Phone-first Yiddish RTL UI sends filters/query/page to server, shows global match counts, Next/Previous navigation, and keeps manual one-tap human delegation (no autodial or autoassign).
- Integration test inserts 505 extra campaign members: 507 total, 500-card legacy compatibility, 50-card page pagination, offscreen lookup, 11-page filter, team selection, 403/404 role/tenant scoping and invalid parameter rejection.
- UI regression covers page navigation and server-owned filtered results. All output HTML continues to escape strings.

## Release conditions
- Draft PR only: do not merge/deploy to Render or run Neon production writes.
- Do not use multiple incompatible Gabbai stage-033 migrations. Reconcile #33/#34/#36/#37 explicitly and choose a canonical reviewed version before publishing.
- Stage migrations 027–033 in order and test production-like backup and 2-user Android logins, role/plan gates and mobile pagination before production release.
- No changes to the separate parent Gavhah hotline repo `keygovhh-art/Lcb`.
