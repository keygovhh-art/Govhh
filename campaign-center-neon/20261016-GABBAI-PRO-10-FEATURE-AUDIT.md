# Gabbai Pro — 10 אפטיילונגען און פארטיגקייט, 16 אקטאבער 2026

**Campaign Center → Gabbai Pro איז פלאן 4 פון 6.**
באזע־סדר: PR #12 (Chesed Quick/6 plans) → #13 (Askan Plus) → #14 (Askan Pro CRM/Focus/Guidance) → #15 (Blocker Intelligence) → **PR #16 Gabbai Pro**.
דער איצטיגער GitHub־Draft איז **נישט** ארויפגעלייגט אויף Render אדער Neon production.

| # | Gabbai Pro פונקציע | מקור־מצב | נייע דאזיגע ארבעט / חסרון |
|---|---|---|---|
| 1 | Advanced Finance | Partial | עקזיסטירנדע pledge/receipt/refund immutable records און פריוואטער Ledger־איבערזיכט; נישט קיין באצאל־Gateway/Bank Sync |
| 2 | Ledger | Pilot | א נייע `/api/gabbai/campaigns/:cid/ledger-review` מיט טאג־פעריאד 7/30/90/365, מקור־צעטיילונג, נעטא מאנועל און קבלות אן Pledge; אן קיין דאבל־ציילן פון joins |
| 3 | Approvals | **New Pilot** | `/api/gabbai/.../approvals`: אן ערלויבטער Maker שיקט פינאנציעלע בקשה, אן אנדערער Owner/Manager באשליסט. Self-approval שטרענג פארבאטן דורך Server און SQL. א בקשה'ס סכום/סיבה קענען נישט געענדערט ווערן. |
| 4 | Audit | Pilot | `cc_activity_events`, נייע immutable `cc_gabbai_approval_decisions`; קיין פריוואטע הסברים אינעם אלגעמיינעם Activity Log |
| 5 | Refunds/Corrections | Partial | נאר א פארלאנג צו איבערקוקן א צוריקצאלונג אדער קארעקטור; **באשטעטיגונג מאכט קיין צוריקצאלונג און קיין Ledger־קארעקטור נישט** |
| 6 | Automatic Sync | Partial | Existing connector architecture; קיין באשטעטיגטע פראדוקציע־Sync מיט בנק/Payment־Processor |
| 7 | Priority Oversight | New Partial | א נייער `/api/gabbai/.../priority-oversight` ציילט צוגעטיילטע, אפענע, פארשפעטיגטע און באריכטעטע־פארשפארטע טעסקס פער גרופע, נאר Owner/Manager |
| 8 | Custom Roles | Missing | נאכנישט קיין אויסגעפרואווטער Policy/Entitlements־מאָטאָר פאר אייגענע ראלעס |
| 9 | Operations Memory | Missing | נאר עקסיסטירנדיגע Audit; נישט קיין פולער האנטאף־סיסטעם/Organizational Memory |
| 10 | Team Workload | New Pilot | צוזאמענגעשטעלטע גרופע־ציפערן, בלויז שטערונגען וואס מ'האט באמת באריכטעט; נישט קיין Employee Performance Judgement |

## נייער דאטאבעיס־יסוד
- `db/020_askan_pro_task_blockers.sql`: פאקטישע Task־שטערונגען און Append-only History, אויסגעבויט אינעם פריערדיקן PR #15.
- `db/021_gabbai_pro_finance_approvals.sql`: הומאנישע צוויי־מענטשן באשטעטיגונגען; SQL CHECK + Trigger לאזן נישט טוישן סכום/פרטים נאך Submission. באַשלוס ווערט איין immutable רעקארד, נישט קיין באצאל־פירמע אקציע.
- Production schema פון 013–021 איז **נישט** מיגרירט געוואָרן; Release־ראַננער פון פריער איז אויסגעשטעלט נאר ביז 012. מען דארף זיך באזונדער פארזיכערן אין Neon host/branch/backup, approved migrations, rollback.

## זיכערהייט און 100%-טעסטן
- `tests/gabbai-approvals.test.mjs`: באשטעטיגונג דורך אנדערן Manager, געלט־פארוואלטער־בקשה, read-only Auditor, פארבאטן Self-approve, אנדערע מוסד 404, נאכאמאל פארענטפערן 409, immutable decision, פינאנץ־Audit אן פריוואטע סיבה, קיין באצאלונגס־Ledger אקציע.
- Ledger QA: exact pledge/receipt/refund totals, unlinked receipts, provenance, no external bank verification, privacy, manager overview.
- Priority QA: count per team, active/overdue tasks, reported blockers only, Auditor access denied and cross-tenant denied.
- CI green איז נאר קאוד + disposable Postgres. אויסער דעם דארף עכטע Android multi-role UAT מיט production-like dataset פארן רעליס.
- **קיין Gabbai Pro paid entitlement אדער verified campaign billing**. דער פלאן־קאטאלאג אליין שטעלט נישט אפ/API permissions פון א באנוצער וואס האט נישט באצאלט; דאס מוז איינגעבויט ווערן איידער מען פארקויפט די פלענער.
- Render AutoDeploy OFF, מיז נישט Publish אן די באשטעטיגונג.

## נעקסטע אפטיילונגען
1. Gabbai Pro: אמתע Refund/Correction‐request → reviewer → append-only correction workflow מיט extra audit, אן צו טענה'ן אז געלט איז צוריקגעשיקט.
2. Manager roles און sub-team scopes; Operations Memory and handoffs, denied by default.
3. נאר נאך דעם Organization: cross-campaign visibility, permissioned department portfolios און מנהל־באשלוסן.
4. צום סוף Custom: verified third-party Yemot/TelTech/hotline support, authorized outgoing caller ID, API contracts and exact plan entitlements.

**נאר געבויטע Features וועלן באקומען Pilot; קיין 100% לייוו־באשטעטיגונג ביז פאַקטישע פראדוקציע־טעסטן.**