# Goal correctness and manager activity: audited concurrent updates

**No live Render/Neon changes, no paid resource or carrier dependency.**

## What changed
- A campaign goal GET now returns a **version derived from append-only `cc_goal_history`**. No schema migration is required; historical goals with zero recorded events begin at version 0.
- Every PATCH, including archive, is checked under the existing PostgreSQL goal-row lock against an expected immutable-history version. When two managers submit updates based on the same old card, only one can succeed; the other receives HTTP **409** and must refresh. No blind overwrite.
- Each successful change writes its immutable old/new snapshot, increments returned version and records the actor in existing activity events.
- A leadership-accessible goal-history endpoint pages 30 events with true `total`, `pageCount`, actor, event, time, goal status and progress reported. Only authorized organization owner/manager/finance/auditor can view. All responses are private/no-store.
- Mobile RTL Yiddish view includes versioned edit forms, protected archive, explicit history button, history page navigation, and clear privacy state reset when changing campaign or organization. Failed writes reload and show the error instead of claiming saved.
- Enhanced disposable PostgreSQL acceptance: concurrent owner/manager race (one 200, one 409), non-versioned request rejection, worker and tenant privacy, 33 immutable history events in two pages, and old data remaining unchanged.
- Android view regression tests HTML escaping, manager history and worker controls.

## Still outstanding
This is a significant code-hardening step for the **goals** partial feature, not a claim that the whole 72-feature product is live. Another planned step is fully automated Android multi-account end-to-end, production-matched staging branch schema 027–037 checks, reconciliation of stacked Drafts and the provider-dependent carrier / approved Caller ID work. Nothing should be merged or deployed until a reviewed, user-approved one-batch production release.
