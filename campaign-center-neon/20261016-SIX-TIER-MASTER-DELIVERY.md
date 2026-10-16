# קאמפיין סענטער — נייע זעקס־פלאן מאסטער־דעליווערי
**16 אקטאבער 2026 — ספעציפיקאציע פארן נייעם Neon־סיסטעם**

**Status:** Development, NOT fully live. ONLY GitHub keygovhh-art/Govhh, Render gavhah-campaign-center.onrender.com, Neon still-haze-11727622. Separate Gavhah/MAX deployment is OUT of scope.

## די ששה שטאפלען

| פלאן | עסקנים | צילן | קאמפיינס | Focus |
|---|---:|---:|---:|---|
| Personal Askan Free | 1 | 0 | 0 | פריוואטע היינט, אויפגאבן, נאטיצן, נאכפאלגן |
| Chesed Quick | 5 | 3 | 1 | 1 גרופע, 3 שריט, 7 טעג היסטאריע |
| Askan Pro | 25 | 20 | 1 | 1–2 גרופעס, 3/5 שריט, 30 טעג, Clarity |
| Gabbai Pro | 100 | 100 | 3 | 3 גרופעס, 3/5/7 שריט, Operations |
| Organization | 500 | 500 | 50 | 4 גרופעס, Portfolio, הנהלה |
| Custom | לויטן אפמאך | לויטן אפמאך | לויטן אפמאך | 1–5 גרופעס, 1–20 priorities |

קיין פרייזן, אקטיווע באצאלטע Subscriptions אדער אומבאגרעניצטע קאפאציטעט זענען נישט באשטעטיגט. Guided Campaign און Managed Campaign זענען עקסטערע סערוויס־צוגאבן, נישט נאך צוויי פלענער.

## Tier 1 — Personal Askan
**מוז קענען:** פריוואטע אויפגאבן, נאטיצן, נאכפאלגן, טערמינען, Done/Reopen/Archive, טעגלעכער Focus, רימיינדערס, History/Memory, Login/Reset. מוז ארבעטן אויך אן א מוסד אדער קאמפיין. די גאנצע Kesher/Contacts אפטיילונג הייבט זיך אן נאר ביי Chesed Quick.
**איצט אויפן feature־ברענטש:** אן אמתער Neon־פערזענליכער Item־טאבעלע, JWT subject-scoped API, Write/Read/Done/Archive UI. **פעלט:** Focus־געשיכטע, Push, UAT, ווערסיע פון אמתן Login/Reset. Database migration 013 נאכנישט production.

## Tier 2 — Chesed Quick
**מוז קענען:** קאמפיין, ביז 3 צילן, פינף עסקנים, רופן־ליסטעס, קשרים מיט Do Not Call, 20־מינוט claim, מאנועלע התחייבויות און קבלות, קאמפיין־ציל, 3־שריט Focus, team progress, basic reports, System Watch, external donation link. א סאלאָ־עסקן קען צולייגן מאנשאפט אן פארלירן דאטן.
**איצט:** קאמפיין, טיעם־איינלאדונגען, scoped קשרים/Claims, Calls, Manual Finance, CSV און Virtual Floor Pilot.
**פעלט:** server-enforced quotas, באזונדערע Goal items, focus-memory, System Watch, external link settings, UAT.

## Tier 3 — Askan Pro
**מוז קענען:** אלע Quick + Advanced CRM, קאמפיין־פיילס, CSV, Call Office, Clarity Radar, 7-day sprint, 30-day history, carryover, repeated-blocker insights, Next Best Action, controlled automations, guidance requests.
**איצט:** Basic CRM און טעסטירטער CSV/Call Lists־Pilot. **פעלט:** נאכפאלג־מאשין, File Storage, Focus/Clarity און staffed guidance.

## Tier 4 — Gabbai Pro
**מוז קענען:** אלע Pro + full ledger, verified approvals, immutable correction/reversal/refund, treasurer role separation, priority oversight, custom roles, manager operational briefing and campaign load.
**איצט:** Manual event ledger, auditing, MAX explicit finance reversal pilot and manager productivity.
**פעלט:** approvals workflow, full ledger settlement, payout verification, custom roles, true financial reconciliation.

## Tier 5 — Organization
**מוז קענען:** אלע Gabbai + 50 Campaigns, 500 member seats, Departments, Shared CRM with explicit permissions, Portfolio, multi-campaign reports, cross-campaign finance, leadership decisions and resource allocations.
**איצט:** multiple campaigns foundation, squads, scoped shared contacts. **פעלט:** full portfolio, reporting, hard capacity checks, cross-campaign audited role access, large-scale load.

## Tier 6 — Custom
**מוז קענען:** אלע Organization + individually contracted quotas, custom permissions/workflows, certified API/webhooks, authorized caller-ID provider and hotline integration, agreement-defined reporting and custom focus.
**איצט:** limited internal API pilot and central read-only Yemot status. **פעלט:** live authorized phone calls, signed outbound caller ID, public API, contracts, provider approval and performance certification. Never represent 9999 as unlimited.

## איבערגרייכנדע פונקציעס
- Virtual Fundraising Floor: member check-in/out, manager program, lunch 1:30–2:00, claim, manual dialer and result, private manager help, immutable history. NOT automatic phone dialing.
- התקבצו: controlled joining, waiting room, hand raise, Q&A, text moderator, opt-in external streams. Microphone P2P experiment OFF by default; NOT large-scale audio hosting.
- MAX Connect: two independently authenticated identities, single-use pairing, opt-in single-event finance share; never copy donor names/phones or personal notes automatically.
- ONE centrally governed Yemot credential, located under Gavhah super admin. No per-institution API keys; menu and transfers are not live without proof.

## פונקציע־צו־פונקציע רעאליטעט
The complete 34-item catalogue and one of three states for each item (pilot, partial, missing) live in src/plan-catalog.js; src/plan-view.js renders all six plans on the actual app in Yiddish. Pilot does NOT mean production-certified. No pricing/billing/entitlement activation follows merely from a catalogue.

## Release gates / סדר העבודה
**A** Baseline: verify health/config, branch/Neon, login from Android and two org/two member isolation; backup and restore. Protect existing data.
**B** Personal: apply db/013_personal_askan.sql to disposable/staging only, test private ownership, 500 active-item limit under concurrency, notes, due dates, retries, session expiry, Android; separate approval required for production.
**C** Chesed Quick: build separate goals + focus snapshots + true campaign quotas + verified plan grant and downgrade behavior without losing past records.
**D** Askan Pro: CRM/files/automations/Clarity and defensible human review commitments.
**E** Gabbai/Organization: full account approvals, verified manual reconciliation, audit, portfolio, departments and large-team tests.
**F** Custom: third-party verified Caller ID, phone contract, direct API security, signed streaming and billing. Never promise unlimited calls.
**Final** Real session E2E, slow network/reload, concurrent donor claims, duplicate event tests, Do Not Call, ledger corrections, tenant privacy, member suspension, backup/rollback and owner Android acceptance.

**Never automatically deploy staged features.** Render AutoDeploy stays OFF. Publish only separately reviewed and tested release sets. No production DB or connected service changes are authorized by merely listing a feature; authorized releases should preserve the current production code and data.

## Delivered in current work branch, NOT all 34
- Read-only six-plan screen with exact quotas and honestly labeled feature states.
- Owner-only Personal Askan Neon task/note/followup API and mobile UI, additive schema migration 013.
- CI test for inherited plan feature catalogue and private two-user security.
- Draft PR for inspection, NOT 100% completion.
