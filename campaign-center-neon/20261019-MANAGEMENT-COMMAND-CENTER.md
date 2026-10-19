# Management Command Center: every plan and progress state — GitHub Draft

## For charity organizations, all subscription tiers
Authenticated **organization owners and managers** can open a dedicated "מענעדזשמענט — דער גאנצער מצב" tab, even when using lower priced tiers. Other organization roles and unrelated organizations are denied. Existing Campaign Center plans, pricing and payment/provider integrations are unaffected.

### Human-controlled complete plan register (stage 035)
Create/edit a titled task or plan; optional campaign and assignee; explain details, set normal/high/critical priority, deadline and **0–100% manually reported progress**. Make the **next action** clear. Nine statuses:
- planned — planned work not yet started
- ready — ready to start
- in_progress — in progress
- waiting — waiting (with required responsible external dependency and reason)
- blocked — explicitly blocked with required reason
- failed — unsuccessful attempt, required reason, can still be resumed/rewritten
- successful — human-confirmed success (100%)
- completed — human-confirmed completion (100%)
- cancelled — stopped

Use all-state counters, search and status filters and paginate 40 plans per page. Every change has a version guard to prevent concurrent overwriting and an **append-only history** including actor, timestamp, old/new state and optional explanatory note. No plan may be deleted from this workflow. Switching organizations or losing manager rights clears cached private plan detail/history in the browser.

### What the management cockpit really knows
Independent, read-only aggregates from existing organization/campaign records: actual open/completed/overdue tasks, open/completed/blocked Gabbai handoffs, pending/answered Askan Pro guidance, pending/approved/rejected approval requests, open leadership decisions and overdue manager-authored plans. These are precise counts only; detailed donor contacts, private guidance messages, bank secrets and finance reasons are not leaked here. Approval status is NOT verified payment success. Failed/successful manually reported plans are distinct from approved/rejected financial requests.

### Backend, test and planned deployment
- `db/035_organization_management_progress.sql`: RLS-enabled plan and immutable history tables with status/progress rules and scoped FKs.
- `server/management.js`: leader-only, authenticated `/api/management` read/write; no subscription tier gate, matching the requirement that managers can see work regardless of plan. No automatic external notifications or other money movement.
- `src/management-view.js`: phone-first RTL Yiddish status board, work items, responsible person, what remains, what went wrong and historical outcome.
- `tests/management.test.mjs`: disposable PostgreSQL tests for 403/404, cross-org campaign protection, waiting/failed/finished, optimistic conflict, historical audit, pagination, real signals and role revocation.
- `tests/management-view.test.mjs`: visible all statuses/next steps/history and escaped HTML strings.
- Schema/release manifest and guarded additive runner now include stage **035**. Old `apply-additive-027-034.mjs` was intentionally disabled to prevent accidental partial release; the new reviewed route is `apply-additive-027-035.mjs`.

## Remaining gates
- Green CI and disposable database migration rehearsals.
- Production-matched fresh Neon staging clone, preserving campaign/membership data and passing real Android two-role acceptance.
- Reconcile outstanding separate 033 alternatives, complete rollout plan, take a *new* production recovery snapshot.
- Approve and run one Neon production migration and one Render deployment **only when explicit user confirmation is received**.
- Do not call the new dashboard live until actually released. CI green is not an endorsement of real-world financial verification.
