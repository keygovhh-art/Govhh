# גבהה קאמפיין סענטער — פולער מאסטער מצב, 15 אקטאבער 2026

## רעליס־כלל
**STAGING ONLY — NO MERGE TO MAIN, NO RENDER DEPLOY, NO PRODUCTION DATABASE MIGRATION without a separate explicit user command and completed release gates. Render Auto Deploy OFF.** Existing GitHub branches and Gavhah production must not be touched by experimental work.

## Four distinct parts
1. **Campaign Center:** organizations and campaigns, members, budgets, shared tasks, team-approved contacts, manager cockpit, coordination room. Only Neon \`still-haze-11727622\`, never Supabase.
2. **Gavhah My Askanus:** existing personal cases/tasks/pledges/notes and history on \`keygovhh-art/Lcb\` and its separate production Neon.
3. **MAX:** private personal 360/contact/call/pledge/followup workflow on Lcb's staged MAX branch. Real outbound phone provider NOT connected.
4. **Gavhah Connect:** explicit dual authenticated account link + authenticated server-to-server scoped data bridge. Personal contacts and notes DO NOT transfer automatically.

## GitHub branches / source
- CC base \`prep/neon-render-campaign-center-20261014\` (draft PR #3)
- CC manager team & Connect branch \`feature/campaign-team-connect-20261015\`, draft PR #4, targeting CC base
- MAX base \`feature/gavhah-max-integration-20261014\` (Lcb draft PR #10), not published
- MAX Connect branch \`feature/max-campaign-connect-20261015\` (Lcb draft PR #11), targeting MAX base
- CC Render existing \`gavhah-campaign-center.onrender.com\`: running older staged CC base, NOT THIS branch.
- Gavhah Render existing \`gavhah.onrender.com\`: running main, NOT MAX or Connect.
- No Render automatic deployments; Github CI runs don't affect Render.

## Already implemented in isolated CC branch with working code
- Neon-managed Auth UI (live signup/SSO not yet end-to-end verified), Express API verifying JWT against Neon JWKS, server-side org membership and campaign checks
- Multi-campaign schema / organization owner on creation
- Team invitation codes hashed server-side, 48h expiry, single redemption, elevated roles owner-only, no accidental organization-wide role via campaign-scoped invite
- Active/suspended/revoked membership, owner protection, no self-escalation or automatic reactivation of suspended members
- Squad/team scoping for campaign members, contact queues, contact records, call histories and tasks; manager/owner assign teams and leads
- Time-bound 20-minute exclusive donor lead claims with atomic row locks, Release and Do Not Call protection
- Campaign tasks and assignee-scoped work, manager overview with pledged, manually reported receipts NET of reversals, and treasurer-confirmed manual receipts shown as separate group
- Immutable finance and call activity (Postgres trigger); MAX imported finance events use idempotency keys unique across organizations
- Explicit MAX Connect pairing: CC Neon Auth owner generates single-use 10-minute code, owner logs in to personal MAX separately and redeems via server-side shared-secret route; unlink revokes cross-system permission but retains historical audit.
- Personal MAX can see own scoped campaign assignments and opt-in share ONE manually reported receipt or pledge event by source ID and amount only. No private contact name/phone/note exported. No processor verification falsely claimed.
- Opt-in link to canonical MAX follow-up ID (no duplicate follow-up, no private content). This is only a reference. Full status/due-date sync not yet built.
- Opt-in share accounting reversal tied to original shared receipt, repeat-safe and cannot exceed original; manager net total updated, original immutable.
- WEB-ONLY campaign hall: manager schedules/opens/pauses/ends; members join/leave/heartbeat; recent presence from last 45 sec, manager-only append-only textual announcements. No audio, SIP, phone, mic, voice chat, auto calls, or 1,000-person assurance.
- Yiddish mobile-first UI for team management, permissions, Connect token, room management and manual finance.

## Database staging
Neon project \`still-haze-11727622\`, \`br-sparkling-term-b5dqbtco\` staging ONLY:
- \`db/001_core.sql\` prior baseline tables, 13 original cc_* including future placeholders.
- \`db/002_team_connect.sql\` new invite, identity-link, team-claim and dedup features.
- \`db/003_web_hall.sql\` web hall, heartbeat, manager announcements.
- Additive schema only; no production Neon writes. RLS enabled deny-by-default in cc_* with privileged server-only access. Restrict database credential to minimum role before production.
- Full team and Connect HTTP/Postgres test runs on disposable CI Postgres. This is not two live Render services connected end-to-end.

## Still required before launch
### Hard release gates
- Verified external staging on BOTH Render services and both Neon branches with actual Neon Auth sessions and verified login/logout/refresh.
- Private shared secret (\`GAVHAH_CONNECT_SHARED_SECRET\`) must be configured on BOTH Render services. \`GAVHAH_CONNECT_BASE_URL\` on Gavhah should point to new Campaign Center domain. Never commit secrets or paste into chat. Changing Render environment **triggers deployment**, so requires separate user permission.
- Reviewer-confirmed exact application authorizations, two-org/two-member real session isolation, 20-minute claims under concurrency, duplicate correction tests and disabled-origin attacks.
- Database production backup from moment of release, reviewed 001/002/003 additive migrations then explicit production approval.
- Explicit user permission to merge staged PRs. Sequence: MAX staged release, CC production migration & branch merge, environment integration, final connect and QA.
- Source event link permissions and revocation testing; robust handling of MAX refunds after sharing; no double counting.
- Human Android device test, slow network and offline, mobile UX, race conditions and rollback.

### Full planned Campaign Center catalogue, NOT yet feature complete
1. Personal tasks (base tasks ready); 2. Private notes (pending); 3. Contacts (pilot); 4. Campaign core (pilot); 5. Goals (basic target only); 6. Campaign tasks (pilot); 7. Pledges (manual pilot); 8. Manual receipts (pilot); 9. External donation link (old browser UI); 10. Basic reports (pilot); 11. Team (pilot); 12. Member progress (pilot); 13. System watch (planned); 14. Advanced CRM (partial); 15. Campaign files (pending); 16. Call lists (squad pilot); 17. CSV import (pending CC); 18. Clarity engine (old local UI); 19. Automations (pending); 20. Guidance (pending); 21. Advanced finance (partial); 22. Ledger (append-only events pilot, full reconciliation pending); 23. Approvals (pending); 24. Audit (basic append-only, admin audit UI pending); 25. Refund/void/reverse (MAX shared manual reversal pilot; others pending); 26. Auto sync (only explicit Connect events, not general); 27. Priority oversight (pending); 28. Custom roles (fixed roles only); 29. Multi campaign (basic schema, full switching and quotas pending); 30. Departments (squad team names only); 31. Shared CRM (privacy-scoped shared team contacts only, deep CRM pending); 32. Portfolio (pending); 33. Hotline (NOT CONNECTED); 34. Custom API (internal scoped API pilot, public integrations pending).
Additional: no active billing/prices, sponsored MAX seats must NOT grant paid features without verified billing; Guided/Managed services just plans; Custom 9999 is not measured capacity.
Financial minimum controls, privacy and audit are required on all plans, not premium-only.

## MAX / My Askanus dependencies
MAX PR #10 has 360 CRM, import/export, manual call log, pledge/partial settlement/reversal, 7/30/90/365 reports, true linked My Askanus followups, timezone recurrence and in-app reminders, immutable history with export, and source-grounded fixed-intent helper in staging. NO real phone provider, background notification, transcription, real processor, advanced family CRM/merge, unlimited free-form agent.
Connect PR #11 adds the bridges described. Do not count either as LIVE.

## Release rules for collaborative room
Users join a text-only room (no donor phone number/note ever shown to others). Managers write text announcements. Presence heartbeat indicates recently connected web clients, not verified calls or call participants. Caller ID, private calls and microphone need a separately authorized and tested telecom provider.

## Fundamental data privacy and accounting
No auto-join by name/email/phone. No private donor notes shared by manager default. A pledge is NOT received cash. A manual receipt is NOT payment-provider confirmed. Every MAX source money ID appears at most once across Campaign Center; a reversal is an additive signed/auditable linked finance event, not a deletion. Never silently purge historical records. Do Not Call opt-out must be preserved and legal obligations respected. Telephony requires authorized caller-ID proof and user consent in applicable places.

## Exact test method
Run GitHub Actions workflow \`Campaign Center Neon preflight\` on this branch. It verifies syntax, Vite production build, three SQL migrations against disposable Postgres, two members/two campaigns, invitation redemption and permission blocks, squad lead claims, web hall lifecycle and messages, explicit account linking and deduped finance/refunds. One green CI run does NOT substitute for real Render/Neon smoke tests.
