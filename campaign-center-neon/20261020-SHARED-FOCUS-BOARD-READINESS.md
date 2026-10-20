# Campaign Center — Persisted Shared Focus / stage 038

**Stage: Draft GitHub only. Nothing deployed or migrated on production Neon. No Render charge.**

## Delivered
- New `cc_shared_focus_boards` per organization/campaign/team, exactly 0–3 task identifiers, with monotonic optimistic versions.
- `cc_shared_focus_history` append-only audit: the actor, before/after task IDs, version, timestamp. Board version conflict gives HTTP 409 rather than overwriting another manager.
- Manager/owner can curate the leadership-only whole-campaign board or any named member team; captains can curate only their own nonempty team. Regular workers can only see their own tasks inside their own team board and **cannot** see a colleague's title, audit or leadership dashboard.
- Candidate search is server-scoped to current campaign and team; up to 50 results per query, filters completed/cancelled tasks, searches names for wider campaigns. This does not expose phone numbers, notes or donor finance information.
- GET board always validates current authenticated role and existing plan entitlement; it does not depend on stale browser or self-asserted role. Board/history reads no-store.
- Clear Yiddish phone UI: manager team selector, search, three dropdowns, saves with expected version, rejected write refresh, view audit; staff sees only permitted pinned work, without administrator controls.
- Disabled old partial 027–037 migration operator runner and prepared explicit `027–038` reviewed runner (still requires backup, staging and user authorization).
- Disposable local PostgreSQL acceptance: two orgs, two teams, manager/captain/worker, wrong-team rejection, stale-write 409, completed tasks denied, append-only audit, read after closure, and expired membership. New 038 schema is included in complete and 026-preserving 027–038 rehearsals and read-only release preflight.

## Not implied
- This is manually curated; no AI predictions, automatic calls, payments or messages.
- The original full-database personal Focus still exists separately and continues to show top three from all authorized assignments.
- Full Shared Focus now exists as a staged functional slice; this does NOT certify all 72 features or an accepted on-phone real-user production flow.
- Production release requires Neon prod-matched staging, explicit reviewed 038 upgrade, Android multi-account UAT and an approved one-batch Render rollout. Provider-dependent hotline/caller ID features still require real carrier approval.

No changes to Personal Askan Free: it remains entirely in Gavhah communication app.
