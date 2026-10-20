# Askan Pro blocker intelligence: whole-campaign, source-verified dashboard

**GitHub Draft only. Nothing moved into Render or production Neon; no new paid services.**

## Corrected
Earlier `GET /api/pro/campaigns/:cid/blockers` returned **up to 200** rows and incorrectly calculated `activeByReason` only from those 200. A real fundraising campaign with hundreds or thousands of obstacles could incorrectly report many serious blockers as missing.

The current backend:
- Calculates exact visible total, active, inactive, reason-by-reason current counts, and recorded changes in the **last 30 days** across ALL authorized rows. Done/cancelled tasks are no longer counted as currently active blockers.
- Returns up to 50 rows per page with `page`, `pageCount`, `filteredTotal`, search-independent summaries, and an active/inactive/all filter. Pagination never silently truncates underlying totals.
- Retains strict SQL scope for organization, campaign, current worker vs same named team captain vs leadership. Captains cannot inherit an empty/unassigned group; workers cannot read another employee's report.
- Adds server-side authorized task title search for submitting a new blocker, rather than relying on a 200-row client task list.
- Shows Yiddish Android whole-database metrics, thirty-day event counts (raised, resolved, reopened, changed), search, filters, pagination, disabled task exclusion, and real failure/unavailable status instead of assuming zero.
- Results are historical **reported** obstacles, NOT AI judgments, external provider alerts or autonomously resolved financial problems.

### Tests and remaining tasks
Disposable PostgreSQL QA with 258 blockers (including restricted team B), completed tasks, immutable history events, 6 pages and two report filters, team/worker/org access, a member revoked mid-session, and mobile HTML escaping. All earlier tests remain.

This moves the incomplete **blocker_intelligence** toward a genuine tested system; do not call it bank/telephony integrated or claim the whole 72-feature campaign product is production ready.

Before a combined production release: run all schema 001–038 on production-matched staging, back up/restore live state, run two-account Android tests, finish third-party telecom and other remaining partial features, obtain explicit user approval for Neon and one Render deployment batch.
