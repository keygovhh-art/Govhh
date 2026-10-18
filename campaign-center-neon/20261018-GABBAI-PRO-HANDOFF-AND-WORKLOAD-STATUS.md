# Gabbai Pro — נייע ארבעטס־פונקציעס (18 אקטאבער 2026)

## דער פונקטליכע מצב
**נישט אויף פראדוקציע פובלישירט.** דאס איז א GitHub Draft־קייט נאך Askan Pro PR #30.

- **PR #34** https://github.com/keygovhh-art/Govhh/pull/34 — Gabbai Pro Operations Handoffs
  - אמתע מנהל־צוטיילונגען מיט א פאראנטווארטליכן עסקן, טערמין, חשיבות און אנווייזונגען
  - דער עסקן קען צייכענען ״אין ארבעט״ אדער ״פארטיג״, און צולייגן א פארשריט־באריכט
  - דער מנהל קען צוריקעפענען אן איבערגאב
  - אויף Android: פילטערן מיין ארבעט, פארשפעטיגט, פארטיג, אלע
  - Append-only היסטאריע פון פארשריט און באריכטן; קיין SMS/קאל/אימעיל נישט אויטאמאטיש געשיקט
  - נייער Neon־מיגראציע: `033_gabbai_operations_handoffs.sql`
  - Code and disposable PostgreSQL preflight passed; not a real user live test
- **PR #35** https://github.com/keygovhh-art/Govhh/pull/35 — Per-member workload and delegate shortcut
  - אמתע ציפערן פער אקטיוון מעמבער פון `cc_assignments` און `cc_gabbai_handoffs`
  - אפענע/פארשפעטיגטע/נאענטע טערמינען; דרוק ״איבערגעבן ארבעט״ און דער פערזאן ווערט שוין אויסגעקליבן
  - קיין אנגעבליכע Employee Performance Score, Caller ID, באצאלונג אדער אויטאמאטישע צוטיילונג
  - קיין נייע מיגראציע (נוצט `033`)
  - Preflight CI checks on PR head; ensure latest commit has completed successfully before release

## Gabbai Pro 10-funktion master catalogue
| Code | איצטיגער סטאטוס | נעקסטע ארבעט |
|---|---|---|
| finance | חלקווייז | טיף פער-קאמפיין פארגלייכן און פינאנץ־קארעקטור־היסטאריע |
| ledger | Pilot | ביז Pay Provider קאנפירמעישן בלויז אינערליכע רעקארדס |
| approvals | Pilot | Manual two-person approval, finance operations |
| audit | Pilot | מער פראקטישער פארש־און־פילטער־אויסשטעל |
| refunds | חלקווייז | אמתע processor refund איז נישט געבויט |
| auto_sync | חלקווייז | עכטע provider/webhook sync נישט באשטעטיגט |
| priority_oversight | חלקווייז | פער גרופע וויכטיגע אויפגאבן, איצט אויך פער מעמבער |
| custom_roles | פעלט | קומענדיג: באגרעניצטע Delegation / Operations Coordinator ראלע, אן דורכברעכן finance permissions |
| operations_memory | נייע Pilot (#34) | Saved human progress/handoffs |
| team_workload | Expanded Pilot (#35) | פער מעמבער אמתע task/handoff counts |

## Release gates
- Do not confuse Gavhah `keygovhh-art/Lcb` phone system with Campaign Center `keygovhh-art/Govhh`.
- Production Render https://gavhah-campaign-center.onrender.com has AutoDeploy OFF; PRs #31–#35 are staged only.
- Production Neon project `still-haze-11727622`, branch `br-gentle-pine-b5imf095`.
- Migrations 027–033 must be reviewed/applied IN ORDER on staging, then prod only with scoped approval and backup.
- Real Android multi-member acceptance, permissions, app login and off-site backup required before publish.
- No automatic phone calls or unauthorized Caller ID; no payment verification without a provider.
