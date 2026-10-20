# Campaign Goals — complete, accurately counted history for approved large plans

**Draft code only. No production Neon data or Render deployment modified.**

The old campaign-goal GET silently returned at most **200** non-archived records, while trusted Custom/Organization plan ceilings may exceed that. This could hide goal progress in the app and lead owners to assume records vanished.

## Fix
- `GET /api/goals/campaigns/:cid?page=N` returns an exact server-side campaign-scoped nonarchived `total`, stable deterministic `ORDER BY created_at DESC,id DESC`, `page`, `pageCount`, `limit=50`, real plan `goalLimit`, and up to 50 goal records.
- The app now uses Next/Previous controls. It shows **all-goal total, current page count, approved goal quota** rather than hardcoded **three**. The limit comes from authorized server entitlements; no customer-side self-upgrade exists.
- Pagination state clears on changing campaign or organization, and the server returns `Cache-Control: private,no-store`. Missing data is labelled as unverified, not zero.
- Creation still runs under per-campaign advisory lock and strict plan limit; employee writes remain owner/manager only. Goal archived state is not counted and old records/history are never removed.
- Disposable PostgreSQL test creates **230 valid goals** under an approved Custom plan with limit 250, verifies all 5 pages have unique IDs, archived and unrelated campaigns excluded, cross-organization 404, worker read-only, and real limit and aggregate totals. Phone view tests verify Yiddish totals/limits/navigation and text escaping.

### Next launch blockers
This addresses one significant **goals** partial-mode correctness gap but does NOT mark the full goal feature live/pilot yet: later improvements may include audit history UI, active edits across concurrent users, and real Android UAT. Other Campaign Center partial features, carrier integration, contracted outbound authorization, production-matched Neon staging and migration/rollback tests are open.

**Do not publish until user approves one verified release batch.**
