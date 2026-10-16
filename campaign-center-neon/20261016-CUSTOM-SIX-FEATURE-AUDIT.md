# Custom — 6 פונקציעס און דעם אמתן דעוועלאפמענט־מצב
**16 אקטאבער 2026 · GitHub Draft PR #21 · נישט אויף Render/Neon production**

## אריינגעבויט אינעם נייעם קאוד
- אייגענע **Custom Focus**־כללים מיט 4 באשטימטע חשיבות־וואגנס (0–100): overdue, due within 48 hours, high priority, followups.
- 10 ערלויבטע קומענדיגע אויפגאבן־פארשלאגן אויפן מאבילן RTL־טאב, גענומען פון עכטע task/CRM רעקארדס.
- מנהל־אייגענע רעדאגירונג פון campaign settings; פשוטער עסקן קען נאר זען זיין ערלויבטן איבערבליק.
- פריוואטע קשרים נאר פאר אייגנטימער, אנדערע גרופעס אפגעזונדערט און Do-Not-Call ארויסגעפילטערט.
- `025_custom_focus_rules.sql`: אן אייגענע campaign-scoped config טאבעלע מיט immutable settings history. Changed settings save a new history event; exact retry does not.

## 6 Custom־פונקציעס לויטן מאסטער־פלאן
| # | פונקציע | מצב |
|---|---|---|
| 1 | Custom API | Partial: Existing authenticated JSON APIs / service Connect, נישט קיין זעלבסטשטענדיגע API key/quotas/SDK פאר קאמפיין־קונים |
| 2 | ימות / Hotline Integration | Missing: token/safe read-only GetTemplates foundations exist, but no real outgoing/incoming hotline commands or full-provider QA |
| 3 | ערלויבטער Caller ID + Outbound Calls | Missing: actual carrier-approved CLI, verified number permission, outbound routing, per-minute prices, provider controls and real call acceptance |
| 4 | אייגענע Workflows | Missing: no full automated background run/send engine with durable retries, opt-in, schedule, anti-spam and cost ceilings |
| 5 | Custom Focus Rules | **New Pilot**: transparent rules and source-backed personalized preview; NOT autonomous or paid-entitled yet |
| 6 | Contracted Capacity | Missing: approved per-organization SLA/line channels/concurrency and verified provider contract |

**באנוצער־רעליס־באלקירונגען:** קיין סיסטעם־ווייט Paid Tier Entitlement Enforcement; קיין production approved migration 013–025; קיין verified Render/Neon prod release; קיין mobile real-user end-to-end QA; קיין באמת פארבונדענעם Provider פאר Caller ID, IVR אדער Payments.

**טעסטן:** `tests/custom-focus.test.mjs` אויף אן אפגעזונדערטן localhost PostgreSQL (קיין סודות פון פראדוקציע): צוויי גרופעס, א פרעמדער מוסד, מנהל־עדיטאר־רעכטן, calculated scores, DNC, פריוואטע CRM, revoked members, immutable audit, no-op duplicate.

די גאנצע Deployment סדר ביז אהער:
1. Draft PR #12 — master six-tier baseline;
2. #13 — Askan Plus;
3. #14 — Askan Pro;
4. #15 — Askan Pro task blockers;
5. #16 — Gabbai Pro;
6. #18 — Organization Portfolio/Leadership;
7. #19 — Organization resource caps;
8. #20 — Organization Memory;
9. #21 — Custom Focus;

**נישט קיין Merge, נישט קיין פובליקאציע, נישט קיין production DB־מיגראציע אָן באזונדערע דערלויבעניש.**