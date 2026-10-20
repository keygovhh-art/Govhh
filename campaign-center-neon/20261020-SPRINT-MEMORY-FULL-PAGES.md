# 7-Day Sprint and Private 30-Day Memory — full paginated history

**Staged Draft only. No Render deployment or Neon production change.**

The Askan Pro private work memory formerly used `LIMIT 10` sprints and `LIMIT 200` 30-day activity events without a real count, pagination or any way to open older records. An active askan could wrongly think all older work disappeared.

Now each authenticated personal endpoint reports an accurate `total`, `page`, `pageCount`, `limit`, and only scoped self-owned records:
- `/api/pro/campaigns/:cid/sprints?page=N` shows 10 per page, with their day-by-day steps.
- `/api/pro/campaigns/:cid/focus-history?page=N` shows 50 per page within a rolling **30-day** window. Older sprint history is still accessible under the first endpoint; memory's 30-day time window is not silently extended.
- Yiddish Android pagination supports Next / Previous for both; user switching accounts/campaigns resets private history state. Failed reads cannot be mistaken for verified zero.
- No AI-predicted accomplishments, automatic calling, background tasks or fake activity.
- Existing append-only activity triggers and authorization checks remain in place, all HTTP responses `private,no-store`.

Disposable local PostgreSQL stress test creates 23 archived sprints and 230 immutable events within 30 days, exercises all 3 sprint and 5 memory pages, uniqueness, foreign organization, other member/owner privacy, invalid page, and revoked membership. UI regression tests escaping and server-unavailable status.

This is not a claim that the entire 72-feature Campaign Center product is production ready. Provider integrations, other partial categories, independent staging of 001–038, backup recovery and two-account Android UAT still block a release.
