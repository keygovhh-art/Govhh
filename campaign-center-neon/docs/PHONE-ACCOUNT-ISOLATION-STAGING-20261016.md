# Campaign Center — Independent Hotline Accounts (STAGING ONLY)

**Do not merge to main. Do not deploy Render. Do not migrate production Neon until explicit permission and release checks.** This system is separate from Gavhah's public.users and telephone password database.

## Authenticated website members
- Real identity provider: Campaign Center's own Neon Auth (JWT sub); NOT Gavhah.
- Existing website signup/sign-in/refresh/logout remains Neon Auth. Website may accept secure mixed passwords or numeric-only passwords of 12+ digits, subject to Neon Auth provider policy.
- A logged-in active CC member may set a separate 12–16-digit numeric hotline PIN from the CC web UI. PIN lookup is keyed HMAC-SHA256 using Campaign Center's own CC_PHONE_PIN_PEPPER (must be stored ONLY in CC Render secrets) and each PIN is independently salted with scrypt verification.
- An organization owner/manager may provision an independent temporary PIN for an active member of their own organization, but the PIN remains activation_required and cannot authenticate anybody until the target member signs in through their own separate CC Neon Auth website session and activates. No administration impersonation.
- No password, PIN, session, subject, database, or account is shared with Gavhah.

## Telephone API
- Only the central Gavhah Yemot gateway holds the physical phone provider access.
- Central server forwards Campaign Center numeric member PIN login over PINNED HTTPS using existing YEMOT_CENTRAL_SHARED_SECRET, which must be installed in both services independently. Never send PIN to logs, URL query, browser or other product identities.
- POST /api/phone/service/login creates a CC-only short-lived call session keyed by an opaque HMAC-derived call hash with the CC subject stored ONLY in CC Neon.
- POST /api/phone/service/snapshot returns current **active cc_memberships** and organization roles without merging users.
- POST /api/phone/service/logout deletes the CC-only session.
- The central IVR checks CC snapshot before private CC menus and checks manager/finance roles as a first line of defense. EACH real CC feature must independently revalidate record ownership and tenant scope when called; menu checks alone never authorize data writes.

## Account opening
An unauthenticated caller can hear account creation instructions, but **new Campaign Center member activation requires verified Neon Auth account registration on the Campaign Center website and any organization invitation/approval**. Telephone-only auto-create of unverified Neon identities is intentionally NOT implemented. In contrast, Gavhah supports staged pending phone applications requiring independent administrator contact verification. Do not claim both products have complete telephone signup parity yet.

## Deployment prerequisites
1. Run Campaign Center migration db/007_isolated_phone_member_pin.sql on a dedicated STAGING Neon branch first.
2. Verify all web PIN endpoints with genuinely signed-in Neon Auth JWTs, same-origin input, scope isolation, and blocked manager impersonation.
3. Configure random 32+ byte CC_PHONE_PIN_PEPPER in CC Render only; set matching independently secured YEMOT_CENTRAL_SHARED_SECRET on both services and validated pinned CC_PHONE_API_URL on Gavhah. A Render environment change triggers a deploy; do not perform now.
4. Run two-user, two-organization auth and role tests and signed/missing/wrong-secret API tests. CC service session should not grant permissions in Gavhah.
5. Merge/release only after explicit owner approval and release gates. No current production tables, provider recordings or main-menu voice are changed by this draft.

## Telephone account opening request (does NOT bypass Neon)
A caller can use Campaign Center phone account access -> Open Account and enter a 10–15 digit contact number. The central telephone API submits the request over the authenticated shared-secret bridge to POST /api/phone/service/join-request; it creates a PENDING cc_phone_join_requests record in CC's own Neon database. The contact is unverified and does not receive any subject, role, JWT, membership, or access. The separately configured CC_PLATFORM_OWNER_SUBJECT (Neon Auth subject, set in CC Render secrets after permission) can review contact numbers and mark contacted only after independent verification. Full account opening then requires Neon Auth sign-up and any organization membership invitation. No Gavhah user or phone PIN is copied.
