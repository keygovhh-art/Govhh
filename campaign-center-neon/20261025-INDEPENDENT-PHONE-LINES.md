# Campaign Center independent Yemot line — safe rollout

## Staged code, not live yet
The existing Gavhah telephone number, API key, Neon database, and provider menu remain untouched. Campaign Center has its own Neon credential table, AES-256-GCM encryption, and an authenticated, single-platform-admin API form. Its previous Gavhah status bridge has been removed from the proposed Campaign Center code.

## Render settings: Campaign Center service ONLY
1. CC_YEMOT_ADMIN_SUBJECT: exact Neon Auth subject of the chosen Campaign Center super-admin. The signed-in app shows your own subject under "מיין זיכערער אקאונט־ID". Never auto-grant access to all organization owners.
2. CC_YEMOT_ENCRYPTION_KEY: a fresh, independently generated random 32-byte key encoded as standard base64 (44 characters with trailing =). Never reuse Gavhah's encryption key.
3. GAVHAH_EXISTING_LINE_NUMBER: independently verify and enter the existing Gavhah phone number on the Campaign Center service. This blocks an accidental same-number connection.
Never place these secrets or the provider token in GitHub, chat, screenshots or URLs.

## Checklist before enabling the new number
- Confirm an approved Neon backup/branch and apply only db/027_campaign_center_dedicated_line.sql to Campaign Center Neon, not Gavhah.
- The old fresh-schema-only scripts/apply-reviewed-schema.mjs cannot be run against an existing production DB. This new migration is reviewed separately.
- Run npm run check from campaign-center-neon, including the new line isolation assertions.
- After explicit deployment approval, publish the Campaign Center service only; Render auto-deploy remains OFF.
- Sign in as the platform admin, save the distinct Campaign Center number and its own Yemot token in the new secured admin form. No token is returned to the browser.
- Use read-only provider GetTemplates test. Success checks the token, not phone-number ownership.
- Independently verify that the provider token belongs to the new number.
- Implement and separately verify the NEW Campaign Center provider callback / telephone IVR. No incoming routing or outbound calls are activated by this credentials-only stage.
- When the new line genuinely functions, approve the separate Gavhah branch that removes its Campaign Center submenu, retaining Gavhah 0 management, 8 sign-up, and all recordings.

## Explicit exclusions
No provider-side number transfer, extension overwrite, recording deletion, call origination, subscription change, caller ID change or Gavhah production modification. Never merge or deploy the independent Gavhah menu change before the new Campaign Center number has been verified.
