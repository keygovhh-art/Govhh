# Gavhah ↔ Campaign Center connected workflow audit — 19 October 2026

## Architectural truth
- Gavhah main repo: `keygovhh-art/Lcb`, public site `https://gavhah.onrender.com`, **its own** Neon Postgres and cookie-based account.
- Campaign Center repo: `keygovhh-art/Govhh`, subapp `campaign-center-neon`, `https://gavhah-campaign-center.onrender.com`, its own Neon Postgres and Neon Auth JWT.
- **Never use a single guessed shared identity or join tables across Neon projects.** The human logs into both accounts, generates a 10-minute single-use code on CC, then redeems it from signed-in Gavhah MAX. One person can revoke the link.
- Real backend-to-backend authenticated HTTPS uses `GAVHAH_CONNECT_BASE_URL` on Gavhah server and the same independently generated `GAVHAH_CONNECT_SHARED_SECRET` on both servers. The secret must be 32+ bytes and must never reach the browser. Production Render environment updates are NOT done in this Draft.
- Main Gavhah may call only `/api/connect/service/*`. Campaign Center owner/team UI uses `/api/connect/code`, `/api/connect/status` and `/api/connect/unlink` with the user's Neon Auth access token.

## Connection map — verified in the currently staged source code
| Connection point | Gavhah side | Campaign Center side | Truth |
|---|---|---|---|
| Two-user account association | session-authenticated redeem/unlink | Neon Auth code/status/unlink + service redeem | Code implemented, **live pairing unverified** |
| Service protocol and database readiness | authenticated `GET /api/askanus/connect/diagnostics` | shared-secret `GET /api/connect/service/capabilities` runs `SELECT 1` | New Draft handshake; returns diagnostic NOT a substitute for login |
| Campaign membership | scoped `GET /askanus/connect/status` | `/service/campaigns` checks active organization and campaign membership | Implemented; only linked authorized users |
| Member tasks and status | own assignments, task status change | `/service/assignments` read/update same CC source | Implemented; does not copy task DB |
| Live campaign rooms | private member room overview + open browser link | `/service/rooms` returns schedule/room titles only | Implemented; second CC sign-in still required |
| Personal follow-ups | single record consent to link | `/service/followups` stores an ID reference only | Implemented at reference level; full manager-visible private follow-up detail sync NOT done |
| Pledges / reported receipts | explicit per-record consent | `/service/finance-events` with source idempotency key | Manual records; processor/treasurer verified actual payments NOT claimed |
| Manual corrections | user-selected receipt reversal with consent | `/service/finance-reversals` append-only correction | No real bank refund |
| Central Yemot IVR | Gavhah main is sole root of API key/phone routing | CC `/api/yemot/central-status` only; retired per-org Yemot credentials deny writes | Central status depends on separate paired env; caller-ID/real IVR transfer NOT proven |
| Sponsorship/billing | optional sponsoring is a planned feature | 011 seats etc, six-tier catalogue | Paid or verified activation NOT done; never promise active |
| MAX donor/contact 360 and private notes | personal MAX canonical | separate team/campaign records | No wholesale sync by design; explicit and separately authorized sharing only |
| AI / transcription / live telephone | personal app pilots and manually recorded calls | campaign team pilots | No shared automatic dialing/recording pipeline; NOT connected |

## Draft functionality added in this turn
- CC: private Yiddish phone panel reachable before creating a campaign, generates a one-time code, copy/open Gavhah, refresh account status, unlink. Token never persisted, and the UI carefully separates linked identity from healthy cross-server connectivity.
- CC: secret-protected live DB/protocol handshake exposes only supported feature flags and no personal data; disposable PostgreSQL tests check secret rejection and success.
- Gavhah: session-authenticated `/askanus/connect/diagnostics` calls remote handshake on backend, handles outages without disclosing the shared secret, and displays the actual protocol readiness next to account connection.
- Both sides are intentionally on **separate GitHub Draft branches** pending CI and staging. Production Neon and both Render services are unchanged.

## Blockers before claiming “fully connected live”
1. Create/set matching fresh shared secret as paired Render environment only after explicit user release permission (Render environment edits may trigger a deployment).
2. Deploy approved code from BOTH repositories as a reviewed coordinated single batch, with separate rollback.
3. Confirm origin/trusted hosts/JWT/sessions and staging user with one CC account and one Gavhah session, then test code → redeem → membership → assignment status → follow-up consent → exact-once manual financial share/reversal → room link → unlink/revoke. Test cross-org denial and wrong secret.
4. Verify current CC Neon 027–035 schema staging + backup and Gavhah production schema prerequisites. No production DB writes authorized by this request.
5. Verify public `GAVHAH_PUBLIC_URL` and only the central Yemot settings; do not create a second provider API account in Campaign Center.
6. Never call unimplemented live IVR, paid billing, donor sync, cross-site SSO or AI data lookups complete.
