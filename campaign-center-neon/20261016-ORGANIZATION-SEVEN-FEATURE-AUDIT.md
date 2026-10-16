# Organization — 7 פונקציעס, געבויטע אפטיילונגען און זיכערער רעליס
**16 אקטאבער 2026 · GitHub Draft PR #18 · נישט לייוו**

די ריכטיגע דיפּענדענסי־קייט: Campaign Center master #12 → Askan Plus #13 → Askan Pro #14 → Blockers #15 → Gabbai Pro #16 → Organization #18. נישט צונויפמישן מיט אנדערע PRs אדער אומגעבויעטע פראדוקציע־ברענטשעס.

| # | Organization־פונקציע | דער איצטיגער געבויטער מצב |
|---|---|---|
| 1 | Multiple Campaigns | Existing Pilot: דער נייער Portfolio נעמט אַריין ביז 50 קאמפיינס און ווייזט די אמתע צאל; קיין אומבאשטעטיגטע Unlimited־פלאן נישט |
| 2 | Departments | Partial: Teams/role foundations; נישט קיין פולע זעלבסטשטענדיגע אפטיילונגס־ACLs אדער מנהל־הירארכיע |
| 3 | Permissioned Shared CRM | Existing Pilot: אויסערליכער Max־סינגק און געוויסע campaign/team/scoped קשרים; קיין אוטאמאטישע פארוואנדלונג פון פריוואטע נדבן־ליסטעס |
| 4 | Portfolio Reports | **New Pilot**: `/api/organization/organizations/:oid/portfolio` בלויז Owner/Manager; קאמפיינס, צילן, אקטיווע עסקנים, open/overdue Tasks, pledge/receipt/refund. אפגעזונדערטע כמות לויט מטבע, נישט קיין אויסגעטראכטע Bank Payment Verification |
| 5 | Leadership Decisions | **New Pilot**: א פריוואטער הנהלה־לוח; Proposal פאר מוסד אדער עקזיסטירנדיגן קאמפיין, מנהל־Final Decision, דער סך און טעקסט קענען נישט שטילערהייט איבערגעשריבן אדער אויסגעמעקט ווערן דורך SQL־טריגער |
| 6 | Resource Allocation | Missing: דערווייל נאר עקזיסטירנדיגע Task/team צוטיילונגען; אפיציעלע מוסדישע Budget/People/Calling quotas און ראלע־Control פעלן |
| 7 | Organization Memory | Missing: Cross-campaign leadership/history snapshots מיט Privacy/Retention/Consent און Backups דארפן נאך אויפבוי |

## טעסטן אין אפגעזונדערטן PostgreSQL
- Workspace member vs manager vs external organization: no cross-org payload access.
- Portfolio actual finance aggregate queries are separate from tasks and membership: קיין דאבל־ציילונג פון Joins.
- Separate USD/GBP totals (נישט צוזאמענמישן מטבעות), 50 result limit + truncation.
- Donor names/phones/notes are NOT part of portfolio response.
- Leadership decisions belong only to same Organization; a foreign campaign ID must fail even if it is valid UUID.
- A finalized decision cannot be updated or deleted; all actions append to audit without original private context.
- Revoked manager loses portfolio and decisions access.

## רעליס־געפאַרן
- Organization migration `022_organization_leadership_decisions.sql` depends on all unshipped 013–021; none of those are verified as live on Neon production.
- Existing schema runner handles 001–012 ONLY; do not execute migration 022 directly in production.
- No tier entitlement/payment enforcement, no verified production backup/rollback and no end-to-end Android login/UAT for real campaign data.
- **No merge, no Render deploy, no production Neon modifications**. Render AutoDeploy remains OFF.

נעקסטער זיכערער שריט: Resource Allocation, Organization Memory, then Custom API/workflows; real provider keys, authorized caller ID and bank payments require separate validated vendor integrations and approved release.