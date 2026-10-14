# GAVHAH Campaign Center — Neon / Render preflight

New **isolated implementation** alongside `campaign-center-v2`; it does not alter existing browsers, Supabase data, or production Neon.

## Architecture
- GitHub: `keygovhh-art/Govhh` (this subdirectory)
- Render: Node.js **Web Service**, root directory `campaign-center-neon`
- Neon: dedicated `Campaign center` Postgres **only**, Managed Neon Auth
- Direct server-side PostgreSQL via `pg`; bearer JWT verified against Neon's HTTPS JWKS, with role + organization checks on *every* API route.
- No Supabase package/credentials/runtime connection in this new implementation.

## Before first deployment
1. Review changes in the draft PR; merge after testing.
2. Apply `db/001_core.sql` to **a staging Neon branch first**, verify the tables and isolation tests, then run it on production only after explicit migration review. Existing data is untouched by the SQL.
3. In the new Render Workspace create a **Web Service** from this GitHub repo. Set root directory to `campaign-center-neon`, build command `npm ci && npm run build` (or `npm install && npm run build` until a reviewed lockfile exists), start `npm start`, health check `/api/health`; instance can be Free during early testing.
4. Set `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL` **in Render Secrets/Environment, never in GitHub**. Obtain auth + JWKS URLs from the **same Neon branch** as the database.
5. Allowlist the new Render site URL in Neon Auth trusted origins. Confirm email sign-up, sign-in, JWT issuance, refresh and CORS from an Android browser.
6. Initial signup does not grant access to any other organization's data. Creating a new organization grants ownership **only to the authenticated creator**.
7. Do not claim payments are processed: `pledge` and `receipt` are manual records; no gateway, invoices, or automatic charge exists.
8. Keep `campaign-center-v2` as legacy and do not disable its Supabase until historical export and opt-in import are reviewed.

## API scope included in this groundwork
- `GET /api/health`, `GET /api/config`, authenticated `/api/me`
- Organizations, campaigns, tasks, contacts, append-only call history and finance records
- Role-checked endpoints; manual pledges and treasury-verified receipts counted separately.
- No deletes exposed. Corrections, refunds, team invites, telephony, SMS, import and full MAX UI **remain pending**.

## Known limitations — do not launch to donors yet
- The UI is an operational starter, **not** the entire old `campaign-center-v2` functionality.
- Migration of old browser localStorage is intentionally deferred. Nothing will be deleted automatically.
- RLS is deny-by-default on application tables. The server database role is privileged, so application middleware and tenant predicates are mandatory. For production, also configure a dedicated minimal-privilege DB role; don't reuse the owner credential indefinitely.
- Authentication end-to-end, database migrations, simultaneous members, finance edge cases and browser workflow require testing against the eventual Render domain.
