// Six-plan product contract and honest availability map.
// Source: legacy six-tier plan, 34-function master, 2026-10-15 audit.
// Catalog visibility is NOT a payment, entitlement or provider activation.
export const PLAN_FEATURES = [
  {
    "code": "personal_tasks",
    "yi": "פערזענליכע אויפגאבן",
    "minTier": 0,
    "status": "partial"
  },
  {
    "code": "private_notes",
    "yi": "פריוואטע נאטיצן",
    "minTier": 0,
    "status": "missing"
  },
  {
    "code": "contacts",
    "yi": "קשרים",
    "minTier": 1,
    "status": "pilot"
  },
  {
    "code": "campaign_core",
    "yi": "קאמפיין־צענטער",
    "minTier": 1,
    "status": "pilot"
  },
  {
    "code": "goals",
    "yi": "באזונדערע צילן",
    "minTier": 1,
    "status": "partial"
  },
  {
    "code": "tasks",
    "yi": "קאמפיין־אויפגאבן",
    "minTier": 1,
    "status": "pilot"
  },
  {
    "code": "pledges",
    "yi": "התחייבויות",
    "minTier": 1,
    "status": "pilot"
  },
  {
    "code": "manual_records",
    "yi": "מאנועלע קבלות",
    "minTier": 1,
    "status": "pilot"
  },
  {
    "code": "external_link",
    "yi": "דרויסנדיגער נדבה־לינק",
    "minTier": 1,
    "status": "missing"
  },
  {
    "code": "basic_reports",
    "yi": "יסודותדיקע באריכטן",
    "minTier": 1,
    "status": "pilot"
  },
  {
    "code": "team",
    "yi": "מאנשאפט און איינלאדונגען",
    "minTier": 1,
    "status": "pilot"
  },
  {
    "code": "member_progress",
    "yi": "עסקן־פארשריט",
    "minTier": 1,
    "status": "pilot"
  },
  {
    "code": "system_watch",
    "yi": "סיסטעם־איבערזיכט",
    "minTier": 1,
    "status": "missing"
  },
  {
    "code": "crm",
    "yi": "פארגעשריטענע קשרים־פארוואלטונג",
    "minTier": 2,
    "status": "partial"
  },
  {
    "code": "files",
    "yi": "קאמפיין־דאקומענטן",
    "minTier": 2,
    "status": "missing"
  },
  {
    "code": "call_lists",
    "yi": "רופן־ליסטעס",
    "minTier": 2,
    "status": "pilot"
  },
  {
    "code": "csv_import",
    "yi": "CSV אימפארט און עקספארט",
    "minTier": 2,
    "status": "pilot"
  },
  {
    "code": "clarity",
    "yi": "Clarity און טעגלעכע Focus",
    "minTier": 2,
    "status": "missing"
  },
  {
    "code": "automations",
    "yi": "אויטאמאטישע אויפגאבן",
    "minTier": 2,
    "status": "missing"
  },
  {
    "code": "guidance",
    "yi": "פראפעסיאנעלע אנווייזונגען",
    "minTier": 2,
    "status": "missing"
  },
  {
    "code": "finance",
    "yi": "פארגעשריטענע פינאנצן",
    "minTier": 3,
    "status": "partial"
  },
  {
    "code": "ledger",
    "yi": "אודיטירבארער געלט־חשבון",
    "minTier": 3,
    "status": "pilot"
  },
  {
    "code": "approvals",
    "yi": "באשטעטיגונג־סיסטעם",
    "minTier": 3,
    "status": "missing"
  },
  {
    "code": "audit",
    "yi": "אקטיוויטעטן־אודיט",
    "minTier": 3,
    "status": "pilot"
  },
  {
    "code": "refunds",
    "yi": "קארעקטורן און צוריקצאלונגען",
    "minTier": 3,
    "status": "partial"
  },
  {
    "code": "auto_sync",
    "yi": "אויטאמאטישער Sync",
    "minTier": 3,
    "status": "partial"
  },
  {
    "code": "priority_oversight",
    "yi": "וויכטיגע הנהלה־איבערזיכט",
    "minTier": 3,
    "status": "missing"
  },
  {
    "code": "custom_roles",
    "yi": "אייגענע ראלעס און רעכטן",
    "minTier": 3,
    "status": "missing"
  },
  {
    "code": "multi_campaign",
    "yi": "מערערע קאמפיינס",
    "minTier": 4,
    "status": "pilot"
  },
  {
    "code": "departments",
    "yi": "אפטיילונגען",
    "minTier": 4,
    "status": "partial"
  },
  {
    "code": "shared_crm",
    "yi": "געטיילטע CRM־קשרים",
    "minTier": 4,
    "status": "pilot"
  },
  {
    "code": "portfolio",
    "yi": "מוסדישע Portfolio־באריכטן",
    "minTier": 4,
    "status": "missing"
  },
  {
    "code": "hotline",
    "yi": "אמתער האטליין און רופן",
    "minTier": 5,
    "status": "missing"
  },
  {
    "code": "api",
    "yi": "אייגענע דרויסנדיגע API",
    "minTier": 5,
    "status": "partial"
  }
];
export const CAMPAIGN_PLANS = [
  {
    "code": "personal_askan",
    "name": "Personal Askan",
    "yi": "פערזענליכער עסקן",
    "members": 1,
    "goals": 0,
    "campaigns": 0,
    "focus": "מיין היינט, פריוואטע אויפגאבן און נאכפאלגן",
    "index": 0,
    "features": [
      "personal_tasks",
      "private_notes"
    ]
  },
  {
    "code": "chesed_quick",
    "name": "Chesed Quick",
    "yi": "שנעלער חסד־קאמפיין",
    "members": 5,
    "goals": 3,
    "campaigns": 1,
    "focus": "1 Focus־גרופע · 3 הויפט־שריט · 7 טעג געשיכטע",
    "index": 1,
    "features": [
      "personal_tasks",
      "private_notes",
      "contacts",
      "campaign_core",
      "goals",
      "tasks",
      "pledges",
      "manual_records",
      "external_link",
      "basic_reports",
      "team",
      "member_progress",
      "system_watch"
    ]
  },
  {
    "code": "askan_pro",
    "name": "Askan Pro",
    "yi": "פראפעסיאנעלער עסקן",
    "members": 25,
    "goals": 20,
    "campaigns": 1,
    "focus": "1–2 גרופעס · 3 אדער 5 שריט · 30 טעג · Clarity",
    "index": 2,
    "features": [
      "personal_tasks",
      "private_notes",
      "contacts",
      "campaign_core",
      "goals",
      "tasks",
      "pledges",
      "manual_records",
      "external_link",
      "basic_reports",
      "team",
      "member_progress",
      "system_watch",
      "crm",
      "files",
      "call_lists",
      "csv_import",
      "clarity",
      "automations",
      "guidance"
    ]
  },
  {
    "code": "gabbai_pro",
    "name": "Gabbai Pro",
    "yi": "גבאי און אפעראציעס",
    "members": 100,
    "goals": 100,
    "campaigns": 3,
    "focus": "ביז 3 גרופעס · 3/5/7 שריט · פינאנץ און אודיט",
    "index": 3,
    "features": [
      "personal_tasks",
      "private_notes",
      "contacts",
      "campaign_core",
      "goals",
      "tasks",
      "pledges",
      "manual_records",
      "external_link",
      "basic_reports",
      "team",
      "member_progress",
      "system_watch",
      "crm",
      "files",
      "call_lists",
      "csv_import",
      "clarity",
      "automations",
      "guidance",
      "finance",
      "ledger",
      "approvals",
      "audit",
      "refunds",
      "auto_sync",
      "priority_oversight",
      "custom_roles"
    ]
  },
  {
    "code": "organization",
    "name": "Organization",
    "yi": "א גאנצער מוסד",
    "members": 500,
    "goals": 500,
    "campaigns": 50,
    "focus": "ביז 4 גרופעס · Portfolio · הנהלה־החלטות",
    "index": 4,
    "features": [
      "personal_tasks",
      "private_notes",
      "contacts",
      "campaign_core",
      "goals",
      "tasks",
      "pledges",
      "manual_records",
      "external_link",
      "basic_reports",
      "team",
      "member_progress",
      "system_watch",
      "crm",
      "files",
      "call_lists",
      "csv_import",
      "clarity",
      "automations",
      "guidance",
      "finance",
      "ledger",
      "approvals",
      "audit",
      "refunds",
      "auto_sync",
      "priority_oversight",
      "custom_roles",
      "multi_campaign",
      "departments",
      "shared_crm",
      "portfolio"
    ]
  },
  {
    "code": "custom",
    "name": "Custom",
    "yi": "צוגעפאסט לויט אפמאך",
    "members": null,
    "goals": null,
    "campaigns": null,
    "focus": "1–5 גרופעס · 1–20 Priorities · Custom אינטעגראציעס",
    "index": 5,
    "features": [
      "personal_tasks",
      "private_notes",
      "contacts",
      "campaign_core",
      "goals",
      "tasks",
      "pledges",
      "manual_records",
      "external_link",
      "basic_reports",
      "team",
      "member_progress",
      "system_watch",
      "crm",
      "files",
      "call_lists",
      "csv_import",
      "clarity",
      "automations",
      "guidance",
      "finance",
      "ledger",
      "approvals",
      "audit",
      "refunds",
      "auto_sync",
      "priority_oversight",
      "custom_roles",
      "multi_campaign",
      "departments",
      "shared_crm",
      "portfolio",
      "hotline",
      "api"
    ]
  }
];
export const PLAN_STATUS_LABELS = {pilot:'בנימצא — נאך נויטיג אמתע באנוצער־טעסטן',partial:'טיילווייז געבויט',missing:'נאכנישט פארטיג'};
export const GUIDED_MANAGED_ADDONS = ['Guided Campaign','Managed Campaign'];
