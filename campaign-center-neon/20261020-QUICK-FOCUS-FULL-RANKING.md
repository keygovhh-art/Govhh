# Chesed Quick Focus: complete server-ranked task view (2026-10-20)

**Staged GitHub Draft only. No production Neon changes or Render deploy.**

## Fixed release defect
The previous daily `campaignFocusBoard` chose 3 priorities from `state.tasks` which was the *newest 200 tasks only* returned by the legacy campaign task endpoint. An older overdue critical task could disappear from the top three even when it needed immediate attention. The fallback also confused what a worker could see versus all organizational tasks.

The new `GET /api/quick/campaigns/:cid/focus` goes through the authenticated existing `campaignAccess` and server plan `daily_review` permission:
- Counts **all** outstanding tasks that the current user may see, never only the first 200.
- Prefers the user's own tasks when they have any; otherwise uses only tasks they may see through their own campaign/team roles.
- Owners/managers see campaign-authorized tasks; captains see only peers of their **nonempty** team; ordinary workers see only their own tasks. All SQL is scoped to organization and campaign.
- Orders first by overdue, then priority, then earliest due date and created date. Returns exactly up to three.
- Returns true accessible and personally assigned task counts, selection scope and explicit status that no AI ranking, scheduled notifications or background auto-actions occurred.
- The Yiddish phone view draws ONLY from this complete server result and shows a clear error instead of misrepresenting truncated client data as a complete Focus.
- Full dummy-data PostgreSQL acceptance covers 263 tasks, a 45-day-old overdue item buried outside the latest 200, separate teams, zero-team captain, managers, disabled membership, completed task update, cross-org privacy and no-store HTTP caching.
- Existing daily private 7-day review stays unchanged.

## Not yet the entire 72-feature release
The catalogue item `shared_focus` remains **partial**. A proper persisted shared team-wide board / owner-curated top 3, permissioned cross-member updates, manual leadership approvals and broader 7/30-day team memory still require verification/implementation. Nothing claims the carrier/authorized caller ID or real payments are live.

Full 027–037 schema migration and production-matched staging + Android acceptance must still pass before the user may authorize one combined Render deployment batch.
