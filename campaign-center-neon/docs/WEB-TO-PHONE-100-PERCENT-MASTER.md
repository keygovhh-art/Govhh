# 100% website-to-hotline functionality: acceptance contract
**Scope:** Both Gavhah (Lcb) and Campaign Center (Govhh), current website options and ALL future website options.
**Language until custom Yiddish scripts arrive:** ENGLISH on ALL telephone and Campaign Center test surfaces. No Hebrew fallbacks.
**Truth:** Existing test token verified provider account access, not real phone menus or writes. Current phone menu is a STAGED read-only navigator, not 100% functionality.

## Product rule
Every user-facing website action must have an equivalent authenticated phone flow, including reads, searches, create/update, approvals, settings, messages, campaign/finance/team operations, MAX/Gavhah Connect, live rooms and administrative functions. Same permissions and same canonical database/API. Do not create a second competing telephone ledger.

## Coverage sources
- `docs/phone-parity-controls.json` contains **74 initial unique static UI controls** across 6 active Campaign Center view modules, each marked `not_implemented` until live proof.
- `node scripts/check-phone-parity.mjs` rejects new action/form controls not mapped in the registry. This is only an initial static scan; add scans for dynamic event data, data-change, backend routes, keyboard shortcuts, mobile controls, media, download/export, and Gavhah React UI.
- For Gavhah, reference Lcb staged PR #17 phoneTree and expand from route-level mapping to every web action and API operation.
- The old 6-tier plans remain Personal Askan, Chesed Quick, Askan Pro, Gabbai Pro, Organization and Custom. Each tier must be reachable on telephone; unavailable upgrades must be labelled planned, not sold as active. No unverified billing/limit promises.

## Phone equivalent rules
1. **Voice UX:** English spoken menus, DTMF numeric choices, paging for long records, search by voice only with explicit opt-in and transcription controls, repeat/back/home, silence/timeouts, TTS length limit, English-only until user replaces the scripts.
2. **Identity:** phone number/CID is an untrusted hint. Use explicit web-account linkage plus expiring OTP/PIN and telephone session binding, rate limits, retries and revocation. Never ask for web password, admin API token, or card number by phone. Permission checks are server-side on EVERY action across both product databases.
3. **Read:** authenticated user may hear precisely the same rows they can see on web; privacy, membership, campaign scope, Do Not Call and role gating match web API.
4. **Write:** explicit record selection, input capture, playback, confirm/cancel, idempotency key and audit. Repeat or network retry cannot add duplicate calls, pledges, payments or tasks.
5. **Financial:** pledges vs verified receipts are separate. Phone-entered amounts are manual reports, NOT bank-verified; real payments require a qualified payment processor, consent and confirmation. Reversals additive, never hard-delete finance history.
6. **Calling:** authorized caller ID cannot be assumed merely from a verified API token; require approved provider routing and owner rights. Provider call logs differ from manually entered notes. Respect recording consent, time zones and DNC.
7. **Live rooms:** separate web presence from actual concurrent phone calls. Conference audio, transfers, mute/speak authority, waiting rooms and recording must be supported by the provider and load-tested; no fake concurrency promises.
8. **Visual media:** provide accessible audio equivalent, spoken description/transcript, short-lived authenticated external link when suitable. A phone cannot display a spreadsheet or video frame; equivalent content/access must be supplied.
9. **Admin:** superadmin has a separate strong step-up factor and audited high-risk confirmations; least privilege for everyone else.
10. **English now:** UI strings, voice prompts and system fallback prompts in English where supported. The separate Gavhah site language has not yet been translated by this registry.

## Release gates
- Start with isolated test extension, never overwrite a live root or existing child without verified inventory + explicit approval.
- Full authenticated end-to-end test for each action: phone input -> API -> canonical DB -> website displays change -> phone rereads same change; also deny test for an unauthorized caller.
- Test active connection and all provider permissions, English audio, hang-up, error/back behavior, and Android web parity.
- Clear statuses: `not_implemented`, `staged`, `provider_tested`, `live_verified`. Display actual success/failure counts. **Do not present static menu coverage as working action parity.**
- Render/Neon/GitHub staging only until passing and owner-authorized publish; protect existing records and hotline extensions.
