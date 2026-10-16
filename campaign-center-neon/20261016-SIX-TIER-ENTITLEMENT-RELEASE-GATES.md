# קאמפיין סענטער — 6־שטאפלדיקע אמתע API־רעכטן
**16 אקטאבער 2026 · Draft PR #22 · קיין פראדוקציע־ענדערונג**

## וואס די נייע זאך טוט
- דער **Plan Catalogue** איז בלויז אן אינפארמאטיווער פארגלייך. טוישן דעם אויסגעקליבענעם פלאן אויפן Screen טוישט נישט קיין Subscription.
- דער סערווער לייענט א Plan־צוטיילונג פון `cc_plan_entitlements` נאר נאכן באשטעטיגן א Neon Auth־JWT און אקטיווע Membership אינעם ריכטיגן מוסד.
- אן קיין אמתע, אקטיווע, נישט אויסגעלאפענע Trusted Grant ווערט בלויז `chesed_quick` אנגענומען.
- די העכערע `/api/plus`, `/api/pro`, `/api/gabbai`, `/api/organization`, `/api/custom` ווערן אפגעשאצט אויפן סערווער פאר יעדן פארלאנג. יעדער Route ווערט פארבונדן מיט א גענוי אנגעצייכנטן Feature־Code; נייע/אומבאשטימטע Routes ווערן אפגעווארפן.
- API־Aliases פון CSV Import און Export זענען אויסדריקליך געהיטן פאר Askan Pro; דער User קען נישט באקומען Pro דורך אן אלטן Team Endpoint.
- Features וואס לויטן מאסטער־פלאן פעלן, אדער וואס זייער Tier Allocation איז נאכנישט באשטימט, ווערן נישט סתם אויפגעשפארט — אויך נישט פאר Custom.
- קאמפיינס, Goals, אקטיווע איינגעשריבענע Members: סערווער־קאפאציטעט, מיט Transaction Locks קעגן גלייכצייטיגע איבערציילונג.
- אן אומבאשטימטער גרעניץ ביי Askan Plus אדער Custom איז **נישט Unlimited**; ביז א באשטעטיגטע Operator־צוטיילונג זענען עס די Starter־לימיטן.
- דער אייגנטימער אדער אנדערער Member קען זען דעם אקטיוון Plan / Limits / Feature־אויסוואל דורך `/api/organizations/:oid/entitlements`, אבער קען נישט דארט שיקן א Upgrade־Request וואס טוישט DB.

## די זעקס פלענער
| Tier | Plan | Catalog Members | Catalog Goals | Catalog Campaigns |
|---|---|---|---|---|
| 0 | Chesed Quick | 5 | 3 | 1 |
| 1 | Askan Plus | נאך נישט באשטעטיגט | נאך נישט באשטעטיגט | נאך נישט באשטעטיגט |
| 2 | Askan Pro | 25 | 20 | 1 |
| 3 | Gabbai Pro | 100 | 100 | 3 |
| 4 | Organization | 500 | 500 | 50 |
| 5 | Custom | לויט באזונדערן אפמאך | לויט באזונדערן אפמאך | לויט באזונדערן אפמאך |

פאר Unnegotiated Null־קאפס זענען אקטיווע Server־קאפס ביז א באשטעטיגטער Override: 5 Members / 3 Goals / 1 Campaign. א באשטעטיגטער Operator קען צוטיילן finite Caps אין DB.

## DB 026 — אפיציעלע באשטעטיגונגען
- `db/026_server_plan_entitlements.sql`: איין Current Grant פער Organization, מיט Plan, `status`, `valid_from`, `valid_until`, Finite Cap overrides, `provision_reference`, `provisioned_by`.
- `cc_plan_entitlement_history` היט אן אומפארענדערבארע Snapshot ביי יעדן Grant־ענדערונג; אויסמעקן דעם Grant ווערט פארבאטן. `RLS` איז Enable, אן קיין User Data API Policies.
- **קיין באנוצער־Upgrade API** ווערט נישט צוגעשטעלט. ביז באצאלונג/באנק־אינטעגראציע מיט א באזונדערן פארלעסליכן Billing־Source ווערט א Grant ערשט געגעבן דורך א באזונדער באשטעטיגטן Operator־שריט.
- די אפליקאציע אליין באשטעטיגט **נישט** אז א באצאלונג איז פארגעקומען; `billingVerified:false` און `providerActivated:false` זענען אויסדריקליך.

### א ביישפיל פאר אן אפיציעלן Operator־שריט — נישט אויטאמאטיש אויספירן
1. נאכקוקן דעם מוסד־UUID, בעטן עכטע דערלויבעניש און זיכערער מקור פון פלאן־רעכט. באקומען Recovery Backup.
2. אויף א אפגעטיילטער Staging־DB דורכפירן די סדר 001–026, אויספרובירן UUID, Plan, capacities, role/access.
3. נאכקוקן צו היסטארישע Higher-Tier דאטן ווערן נישט אויסגעמעקט ביי Downgrade; נייער Create זאל ווערן אפגעשטעלט אויב מען איז שוין איבערן קאפּ.
4. נאר מיט באזונדערער פראדוקציע־באשטעטיגונג מעג מען דורכפירן א געשריבענעם Grant SQL, מיט באשטעטיגטן `provision_reference` און `provisioned_by`; קיין DB־סודות אין UI.
5. אויף Live נאכקוקן `/api/organizations/:oid/entitlements` און אמתע Android Multi-user UAT. Rollback איז א נייע באשטעטיגטע Entitlement־צוטיילונג; **נישט אויסמעקן** History.

## ביז איצט נישט 100%
- דער איצטיגער מאסטער־Migration Runner איז נאכנישט באשטעטיגט פאר 013–026. אן אנוועזנדן Staging־טעסט איז נישט גענוג פאר א Render/Neon Production־Release.
- אמתע Paid Subscription/Payment Webhooks, Taxes, Plans/pricing, provider charges, limited external Caller ID, and API-key issuance זענען נאך נישט געבויט.
- די פריערדיגע Virtual Floor/Meeting/AV APIs זענען ביז א באשטעטיגטער Tier־צוטיילונג אויסדריקליך נישט Client־אקטיוו אין דעם נייעם Draft; דאס מוז מען באשליסן איידער Release כדי נישט צו פארלירן די געמיינזאמע Legacy־Pilot־ניצבארקייט.
- All plans must undergo a reviewed multi-tenant Android acceptance test, downgrade/upgrade/regression and release gates. Never market staged pilot as fully deployed.

## וויכטיגסטע טעקעס
- `server/plan-policy.js` — צענטראלער API־און־מיטגליד־Plan Guard.
- `db/026_server_plan_entitlements.sql` — operator grant schema + immutable audit.
- `tests/server-plan-entitlements.test.mjs` — six-tier / expired / suspended / cross-org / caps / audit regressions.
- `server/index.js` — API guards און Campaign creation cap; `server/team.js` — Member־Cap; `server/goals.js` — Goal־Cap.
- `src/plan-view.js` און `src/main.js` — אמתער אפיציעלער פלאן־סטאטוס אויפן Screen, נישט א Fake Upgrade.

**קיין פובליקאציע, DB־ענדערונגען אדער צוטיילונג אויף Production געטאן.**