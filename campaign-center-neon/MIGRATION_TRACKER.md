# Campaign Center — no-loss migration tracker (October 14, 2026)

## Non-negotiable architecture
- App code: GitHub `keygovhh-art/Govhh`.
- Hosting: a NEW Render Workspace owned by the user; do not choose either existing Workspace.
- New Campaign Center data + identity: Neon project `still-haze-11727622` only.
- No Supabase SDK, project URL, credentials, RPC calls, realtime dependency or auth paths in the new runtime.
- Existing legacy `campaign-center-v2` preserved as read-only reference until migration is proven; no silent deletion of Supabase or browser data.
- Three user experiences can remain separate: public GAVHAH website, Campaign Center manager/treasurer operations, and MAX Askan daily work. One source of truth per campaign/financial event.

## Current verified implementation (not yet released)
- GitHub `campaign-center-neon/`: Node/Express API, managed Neon Auth, role + tenant gating, mobile Yiddish starter.
- Neon staging `br-sparkling-term-b5dqbtco`: 13 `cc_*` public tables, RLS enabled with no direct policies, 3 append-only triggers.
- Neon production `br-gentle-pine-b5imf095`: untouched, only Neon Auth tables verified.
- Draft PR: `https://github.com/keygovhh-art/Govhh/pull/3`; do not merge until CI and runtime tests pass.

## Legacy connections discovered
- `campaign-center-v2/auth-focus.js`: old Supabase auth, `get_my_account_plan`, `daily_focus_sessions`, `profiles`, `send-welcome-notice`.
- `campaign-center/supabase-public.js`: old project URL and public key.
- `campaign-center-v2/campaign-network.js`: Supabase-style syncing/Realtime for call leads, commands, room.
- `campaign-center-v2/contacts.js`: local-first contact book and old sync paths.
- `campaign-center-v2/app.js`: localStorage state.
- `supabase/*.sql`: historical schema and RLS work; source for migration design, not current production runtime.
- `campaign-center-v2/index.html`: duplicate scripts and broken contact script loading; leave old page unchanged until parity test.

## Functional deliverables checklist
- [x] New repo branch, starter app, Render config, authenticated API, manual tasks and contacts.
- [x] Neon staging schema, deny-by-default RLS, append-only money/call/audit event guards.
- [ ] GitHub CI build check and live app test after Render connection.
- [ ] Migrate signup/signin/forgot-password flows; test email and optional phone verification on Android.
- [ ] Explicit archival/export of legacy localStorage/Supabase data; map historical identities and IDs without destructive writes.
- [ ] Tenant isolation tests, no horizontal permission escalation; secure DB role with minimal privileges.
- [ ] Manager + Treasurer + Askan roles, invites, removable and protected members; separate private notes from shared campaign facts.
- [ ] Full 360-degree contacts, do-not-call with authorized override and clear audit trail, ownership/claim of leads, dedupe safeguards.
- [ ] Tasks, blockers, focus ladder, manager cockpit, 7/30 day memory and immutable completed history.
- [ ] Every pledge, partially paid pledge, confirmed payment, receipt, reverse, refund and manual adjustment tied to one ledger source.
- [ ] Per-event idempotency, currency precision and duplicate prevention; proper finance reconciliation and approval.
- [ ] Real multi-campaign navigation and campaign goal/department/portfolio reporting.
- [ ] CSV/Excel import/export with dry-run, validation and provenance.
- [ ] Template-driven public campaign pages and external donations; verified payment processor integration only with approved credentials.
- [ ] Phone/API/provider contracts, call permissions, auto logs and optional audio only with required consent.
- [ ] Secure user notifications and scheduling, high-priority work queues and help requests.
- [ ] Hebrew-vs-Yiddish language review and full Yiddish/English language variants.
- [ ] All changes tested on Android, multiple simultaneous users, weak connections, retries, page reload, and offline recovery.
- [ ] Production Neon migration review, validated backup/rollback plan, deploy only after user's new Render Workspace exists.
- [ ] Deactivate old Supabase only after clean data export, verified replacement and explicit cutover decision.

## Deployment activation details after new Render Workspace
1. Render: new Node Web Service, repo `keygovhh-art/Govhh`, root `campaign-center-neon`, branch only after tested merge.
2. Build: `npm install && npm run build`; start: `npm start`; health `/api/health`.
3. Set private `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL`; all from same Neon production branch.
4. Add exact Render domain in Neon Auth trusted domains list.
5. Test Neon migration in production **only after review** and confirm staged queries have tenant checks.
6. After launch, revisit Free-plan cold starts and security/capacity limits.

Never store secrets or sensitive donor data in public GitHub. Never claim manual finance records are gateway-confirmed charges.
