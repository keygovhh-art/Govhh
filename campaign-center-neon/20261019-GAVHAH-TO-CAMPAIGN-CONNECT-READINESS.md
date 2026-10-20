# Gavhah ↔ Campaign Center: integration readiness

**Staged code only, not deployed. No production Neon writes, Render deploys or new paid services.**
Gavhah MAX counterpart: https://github.com/keygovhh-art/Lcb/pull/35
Campaign Center: https://github.com/keygovhh-art/Govhh/pull/46

## Working code contract
- Signed-in Campaign Center member creates a 32-character, server-generated, 10-minute code. Generating a replacement invalidates older unused codes. Existing linked accounts cannot mint surplus codes.
- Signed-in Gavhah MAX member redeems the code from its backend over a secret-authenticated server-to-server call. No link from email or phone number matching.
- Each member may revoke the link; CC invalidates all outstanding unused codes. Linked status alone is **not** proof of a healthy MAX backend.
- MAX authenticated diagnostics requests CC server /api/connect/service/capabilities with a shared secret and checks protocol gavhah-connect-v1; personal account linkage and backend readiness are separate statuses.
- MAX handles CC's own-assignment JSON array correctly, validates its shape, and only relays permitted task fields. Authorized room list and status update, manually shared follow-up reference, receipt, pledge and refund correction are supported only within the narrow reviewed scope.
- No donor/contact notes, automatic calls, payment processing, full finance reconciliation or guaranteed real-time cross-provider sync is implied.

## Remaining launch gates; each production action needs explicit approval
1. Select ONE tested release SHA for each repo. CC requires its stacked 027–035 migrations (not only 002 account link), and Gavhah MAX requires its independent reviewed migration path. Never start new server code on old live DB schemas.
2. Verify a fresh backup/recovery plan and current-production-matched staging clone; perform two-account permission/tenant, Android and migration rehearsals on staging first.
3. On **Gavhah API server** configure GAVHAH_CONNECT_BASE_URL=https://gavhah-campaign-center.onrender.com and GAVHAH_CONNECT_SHARED_SECRET=(same unique randomly generated 32+ byte secret).
4. On **Campaign Center API server** configure GAVHAH_CONNECT_SHARED_SECRET=(exact same secret). Optional public link: GAVHAH_PUBLIC_URL=https://gavhah.onrender.com.
5. Never commit, log or expose the actual secret in a browser, chat or documentation. Do not set Render environment variables (which may cause restart/deploy) until the user authorizes the coordinated release.
6. After BOTH approved deployments, Gavhah authenticated /api/askanus/connect/diagnostics must show configured:true, serverConnectionVerified:true, protocol gavhah-connect-v1.
7. Sign into different authenticated Android test accounts on both sites, issue/redeem a code, verify both link statuses, 10-minute expiry, old/reused-code rejection, unlink/relink. Try a forbidden user's campaign.
8. Check real assigned task array, assigned-only status update and campaign room event; verify forbidden another-member data access. Exercise explicit follow-up/finance/reversal share using non-real test data only. Manual reports must never appear as processor-verified payments.
9. Publish ONE user-approved Render batch, check both services and plan rollback. Keep autoDeploy OFF until approved.

## NOT VERIFIED
Current production service env presence/values, complete live two-backend handshake, and two-user Android end-to-end tests are not verified. GitHub CI success confirms tested code in Draft, NOT a completed production connection.
