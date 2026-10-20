# Campaign Center: capacity release gate / honest readiness (October 20, 2026)

**Staged Draft only. No production Neon, Render, billing or carrier changes.**

## Completed in this stage
- Read-only `GET /api/capacity/organizations/:oid/capacity` returns organization-wide **active staff**, **total campaigns**, and **all active goals** (with exact per-campaign goal-limit comparisons).
- Only authenticated active owner/manager of the same organization can request it; returns `Cache-Control: private,no-store`. Workers and foreign organizations cannot inspect company-wide capacities.
- Counts cover the WHOLE organization, not a 40/200/500-item sample. The optional ten-campaign display is explicitly only a subset; aggregate totals are global.
- The effective numerical limits come from `planPolicy.forMember`: the reviewed operator provision table, else the bounded Chesed Quick fallback. An over-quota existing organization still sees its records; adds are blocked by the existing plan capacity guards.
- The six-tier `די 6 פלענער` view shows those facts on Android. Limits are displayed separately from **contract signatures** and **provider** claims.
- `contracted_capacity` has moved from `missing` to `partial`: the *measurement/provisioned numerical limit* subsystem works, **not** externally contracted phone channels, paid subscriptions or agreed SLA. This feature is intentionally excluded from automatic plan capability grants until a separately approved contract is verified.
- Disposable PostgreSQL tests cover cross-organization privacy, owner/manager-only access, approved vs suspended plan grants, over-limit historical staff/campaigns/goals, top-ten vs full aggregation, absent payments/provider confirmations, and no self-upgrade. Mobile regression checks truthful Yiddish labels and escaped errors.

## Remaining blockers before calling the whole software publish-ready
1. `hotline` and `outbound_calls`: real 3rd-party operator/provider decision, credentials, authorization/Caller ID verification, contract costs, anti-abuse and consent, IVR and telephony event tests. No live call is initiated by this stage.
2. Remaining 18 partially built features require real behavior UAT and provider/tier allocation decisions (including floor/conference rights, Yemmot super-admin key and MAX linked account handshake).
3. Consolidate the stacked Campaign Center Draft branches to **one release SHA**. Validate no conflicting 033 migrations and review every schema 001–037 and server policy. Never deploy an arbitrary PR in isolation.
4. Verify production-matched fresh Neon staging clone and backup/restoration rehearsal, release gate and two-account Android end-to-end testing.
5. Confirm explicit user approval before each production write or paid-service activation. Keep Render autoDeploy OFF and perform only one reviewed production deployment batch.

Status: progress on **release truthfulness and safe contracted capacity measurement**, not a green light for actual launch. Signed agreements, provider capacity, billing and phone calls remain unconfirmed.
