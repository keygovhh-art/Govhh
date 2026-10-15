# Campaign Center + Gavhah MAX — release plan 2026-10-15

STATUS: Code candidate. This document is NOT permission to migrate production, merge, or deploy.

## Isolation
- Campaign Center: keygovhh-art/Govhh draft PR #5, branch release-candidate/campaign-center-full-20261015.
- Gavhah/MAX: keygovhh-art/Lcb draft PR #13, branch release-candidate/max-on-published-main-20261015.
- Campaign Center Neon still-haze-11727622, staging br-sparkling-term-b5dqbtco, production br-gentle-pine-b5imf095, backup br-solitary-lake-b5wqpydi.
- Original Gavhah Neon falling-wildflower-17519958, staging br-patient-mode-b49ljoyr, production br-orange-water-b43bfcoj, backup br-tiny-snow-b4hrcm5x.
- Render Campaign service srv-db84angn74is73dnv0cg still watches older prep branch; original Gavhah service srv-db2a8erbc2fs73fsc5ng watches main. AutoDeploy OFF in both.

## Manual release gates
1. Verify exact target Neon branch host independently. Never migrate CC data into the original Gavhah project, or vice versa.
2. Verify backups, plus a read-only restore/read. Production schema changes require a separate explicit authorization.
3. Campaign Center migration script npm run release:migrate: set CC_MIGRATION_MODE=production, CC_EXPECTED_DB_HOST independently verified, CC_PRODUCTION_BACKUP_BRANCH_ID, CC_PRODUCTION_MIGRATION_APPROVED=yes-reviewed-and-backed-up and secret DATABASE_URL via secure environment only. Creates files 001–011 in one PostgreSQL transaction; refuses partial unexpected schemas; verifies 29 protected tables.
4. Run npm run release:preflight read-only with independently verified DB host and Neon Auth/JWKS HTTPS origin. Stage default experimental mic CC_EXPERIMENTAL_P2P_AUDIO=false.
5. MAX migration script lib/db/scripts/max-additive-migrate.mjs must pass its own owner approval, expected hostname, protected old-row counts and rollback checks.
6. Merge review: MAX PR #13 preserves the already-published group controls and date formatting; CC PR #5 has no conflict with its repo main. Render AutoDeploy stays OFF.
7. The SAME 32+ random GAVHAH_CONNECT_SHARED_SECRET belongs ONLY in both service environments; Gavhah backend needs GAVHAH_CONNECT_BASE_URL=https://gavhah-campaign-center.onrender.com. Setting environment variables can itself trigger a deploy, so this must be explicitly approved as part of the same manual release.
8. Manual Campaign Center deployment from reviewed main. Confirm healthy /api/health, configured /api/config, then npm run release:smoke. Test actual Neon Auth/signup/session expiry, access to correct org, team and donor permissions.
9. Manual Gavhah MAX deployment; test original already-live group features AND new MAX work. Check linked/unlinked accounts and denial of unauthorized service requests.
10. Real Android Chrome UAT with owner and two members: parallel event check-in, claim/release/contact notes, call results, automatic 1:30 lunch, private manager help, conference admission/ban/mute, optional video, mic pilot.
11. On failure, PAUSE. Manual rollback must preserve immutable finance/audit data; restore database only after data reconciliation.

## Explicitly NOT complete
- High-audience live microphone/video distribution needs scalable TURN/SFU or managed stream host. The optional peer-to-peer pilot is capped at eight people, OFF by default and cannot guarantee NAT traversal.
- Verified donated funds/card/ACH/bank settlement and refunds need an authorized payment processor.
- Outgoing telephony, authorized caller ID, call recordings and provider-verified calls are still external future integrations. These need not block the provider-independent web workflow.
- Live two-Render-server test with real accounts, large-concurrency load, push background delivery and full historical legacy parity are NOT yet accepted.

Do not mark the full system 100% production ready from a green CI job alone.
