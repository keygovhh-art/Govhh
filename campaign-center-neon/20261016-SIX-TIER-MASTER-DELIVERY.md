# קאמפיין סענטער — דער נייער זעקס־פלאן מאסטער־פלאן
**16 אקטאבער 2026 · נאר Campaign Center — keygovhh-art/Govhh**
**מצב:** Staged code. Render production, Neon production and Gavhah MAX production זענען נישט געענדערט.

## אומפארהאנדליכע נייע אפמאך
**Personal Askan Free איז אינגאנצן ארויסגענומען פון Campaign Center.** פערזענליכע אויפגאבן, פריוואטע נאטיצן, Brain Dump, Follow-ups, Focus און פערזענליכע היסטאריע געהערן צו **גבהה — עולם החסד**, אין `/my` און `/communications`. קיין צוויי פערזענליכע דאטאבעיסן.

### די זעקס Campaign Center פלענער
| שטאפל | פלאן | עסקנים | צילן | קאמפיינס |
|---|---|---:|---:|---:|
| 1 | Chesed Quick | 5 | 3 | 1 |
| 2 | Askan Plus | **נאך נישט באשטימט** | **נאך נישט באשטימט** | **נאך נישט באשטימט** |
| 3 | Askan Pro | 25 | 20 | 1 |
| 4 | Gabbai Pro | 100 | 100 | 3 |
| 5 | Organization | 500 | 500 | 50 |
| 6 | Custom | לויט אפמאך | לויט אפמאך | לויט אפמאך |

א העכערע פלאן נעמט אריין די פונקציעס פונעם נידעריגערן. די באצאלטע פלענער זענען נאכנישט פארבונדן צו Verified Billing/Entitlements; א פלאן־באשרייבונג איז נישט קיין אקטיוויזאציע אדער צאלונג.

## 72 אויסגעשמועסטע פונקציעס
דער חובת־מייסטער איז פארשריבן אין `src/plan-catalog.js`, מיט 64 פלאן־פונקציעס און 8 פראיעקט־ברייטע צוגאב־פונקציעס וואס זייער פלאן־צוטיילונג איז **נאך נישט באשטימט**. אלע 72 האבן אמתע שטרענג אפגעטיילטע סטאטוס: `pilot`, `partial`, `missing`. דער באזונדערער `src/plan-view.js` ווייזט די פונקציעס אויף מאביל־אידיש.

### Chesed Quick
קאמפיין־דעשבאורד; קאמפיין־צילן; Focus־לוח און 7־טאגיקער זכרון; Kesher־קשרים מיט privacy/Do Not Call; טעסקס; 5 עסקנים; רוף־צענטער; פלעדזשעס; מאנועלע קבלות; דרויסנדיגער נדבה־לינק; באריכטן; member progress; System Watch; טעגלעכער איבערבליק.

### Askan Plus
אלעס Quick + גרופע־פירער, עסקן־דעשבאורד, שטארקערע קשר־ליסטעס, רוף־צוטיילונגען/נאכפאלגן, טיילווייזע התחייבויות, טשעק/קעש־איינצלהייטן, מאנשאפט־קרעדיט, נדבה־לעוועלן, אויפגאבע־איבערגעבן, פריוואטער טיעם־זאל, מנהל־אנווייזונגען, טיפערע באריכטן און פשוטע אויטאמאטישע ווארענונגען.

### Askan Pro
אלעס Plus + Advanced CRM, קשר־היסטאריע, דאקומענטן, Call Lists, CSV/Excel, Clarity, Next Best Action, Automations, Guidance, 7-Day Sprint, 30-Day Memory, Blocker Analysis.

### Gabbai Pro
אלעס Pro + Advanced Finance, Ledger, Approvals, Audit, Reversals, Sync, Priority Oversight, Custom Roles, Operations Memory, Team Workload.

### Organization
אלעס Gabbai + Multiple Campaigns, Departments, Shared CRM (פריוואטקייט), Portfolio Reports, Leadership Decisions, Resource Allocation, Organization Memory.

### Custom
אלעס Organization + Custom API, Hotline integration, authorized Caller ID outbound only with provider authorization, workflows, custom focus and contract-specific capacity. No invented unlimited capacity.

### 8 פראיעקט־ברייטע צוגאב־פונקציעס (נאך נישט צוגעטיילט)
Virtual Fundraising Floor; Live Attendance; Event/Lunch Schedule; Private Manager Help; Hitkabtzu; Optional Audio/Video; Gavhah Connect; one central Yemot API credential under Gavhah Super Admin. These are not automatically granted by catalogue tier.

## דאזיגע אפגעזונדערטע ארבעט
- **Remove** the now-obsolete personal route, UI, DB migration and CI tests from Campaign Center. No Personal Askan fee/plan.
- **Add** `Askan Plus` as a distinct intermediate plan.
- **Preserve** the secure Campaign Goals API/UI with audited edits and three-goal interim pilot limit until entitlement verification. Its additive Neon migration is `db/013_campaign_goals.sql` and requires staging review before any production use.
- **Show** every agreed planned feature without pretending it has shipped.
- **Keep** Guided Campaign and Managed Campaign as add-ons, not additional tiers.

## Release gates
1. Prove CI (syntax, Vite build, 2-member Postgres security, six-plan catalogue, goal schema).
2. Verify real login/signup/password reset on Android and two-organization privacy in deployed staging, including role changes and revoked membership.
3. Independently verify target Neon branch host and recoverable production backup before any migration; then require explicit permission for production DB changes and Render deploy.
4. Implement and test all missing/pilot 72-feature workflows one-by-one: task CRUD, finance, collaboration, Focus, CRM, portfolio, human services. Cannot sell 6 plans until server-side per-plan grants and billing exist.
5. Real telecom, payments, audio conference and push require provider agreements and verified real-world tests, not just UI buttons.

**NO MERGE, NO PRODUCTION DEPLOY, NO PRODUCTION DB MIGRATION** from this document. Render AutoDeploy stays OFF. Never publish unrelated changes from other chats automatically.
