// Shared, reviewable plan catalogue migrated from campaign-center-v2/app.js.
// This is NOT a billing engine. Limits are the old product-design targets,
// not measured provider capacity nor currently enforced subscriptions.
export const FEATURE_CATALOGUE = Object.freeze({
 personal_tasks:['פערזענליכע אויפגאבן','planned','פערזענליכע MAX־ארבעט, באזונדער פונעם קאמפיין'],
 private_notes:['פריוואטע נאטיצן','planned','שטרענג פריוואטע נאטיצן און פלאנירונג'],
 contacts:['קשרים','pilot','קאמפיין־קשרים מיט רשות־קאנטראלן'],
 campaign_core:['קאמפיין־דעשבאורד','pilot','נאמן, ציל, מצב און איבערבליק'],
 goals:['מערערע צילן','planned','באזונדערע צילן מיט טערמינען'],
 tasks:['קאמפיין־אויפגאבן','working','צוטיילן און פארענדיקן אויפגאבן'],
 pledges:['פארשפרעכונגען','pilot','מאנועלע פינאנציעלע פארשפרעכונגען'],
 manual_records:['נדבה־רעקארדס','pilot','מאנועל באשטעטיגטע קבלות, נישט באנק־איבערגעפרואווט'],
 external_link:['דרויסנדיקער נדבה־לינק','planned','דירעקט צום אייגענעם צאלונגס־פראוויידער'],
 basic_reports:['פשוטע באריכטן','pilot','סך־הכל און צילן'],
 team:['מאנשאפט און רעכטן','working','מעמבערס, אייגנטימער און פארוואלטער'],
 member_progress:['פארשריט פון מענטשן','pilot','אויפגאבן און מאנועלע רוף־באריכטן'],
 system_watch:['סיסטעם־איבערוואכונג','planned','אויטאמאטישע ווארענונגען און מצב־באריכטן'],
 crm:['פארגעשריטענע קשר־פארוואלטונג','planned','טיפערע פארבינדונג־געשיכטע'],
 files:['קאמפיין־פיילס','planned','דאקומענטן און בייגעלייגטע פיילס'],
 call_lists:['רוף־ליסטעס','pilot','צוטיילן קשרים; רופן געשען נאכנישט אויטאמאטיש'],
 csv_import:['CSV־אימפארט','working','קשרים־אימפארט ביז 500 אין איין באטש'],
 clarity:['קלארקייט־מנוע','planned','וואס שטעקט און וואס צו טון ווייטער'],
 automations:['אויטאמאציעס','planned','דערמאנונגען און אויטאמאטישע ארבעט'],
 guidance:['פראפעסיאנעלע אנווייזונגען','planned','מענטשלעכע עצה נאר לויטן אפמאך'],
 finance:['פארגעשריטענע פינאנצן','pilot','מאנועלע קבלות און קאנטראלן'],
 ledger:['פינאנציעלע ביכער','pilot','אפגעהיטענע געשעענישן; נישט פולע באנק־רעקאנסיליאציע'],
 approvals:['טאפלטע באשטעטיגונגען','planned','פארגעשריטענע באשטעטיגונגס־רייען'],
 audit:['טויש־היסטאריע','working','אודיט־געשעענישן ווערן אפגעהיטן'],
 refunds:['קארעקטורן און רעווערסאלס','pilot','באריכט־קארעקטורן, נישט אויטאמאטישע באנק־Refunds'],
 auto_sync:['אויטאמאטישע פארבינדונג','pilot','באגרעניצטע MAX־פארבינדונג, נישט פולער סינק'],
 priority_oversight:['פריאריטעט־איבערזיכט','planned','טיפערע איבערבליקן לויטן אפמאך'],
 custom_roles:['אייגענע רעכטן','planned','בויען באזונדערע ראלעס'],
 multi_campaign:['מערערע קאמפיינס','working','מערערע קאמפיינס אינעם זעלבן ארבעטס־פלאץ'],
 departments:['אפטיילונגען','pilot','גרופעס און מאנשאפטן'],
 shared_crm:['צוזאמענגעשטעלטער קשר־צענטער','planned','פארשידענע קאמפיינס אויף איין CRM'],
 portfolio:['אלגעמיינער פארשריט־באריכט','planned','איבערבליק איבער אלע קאמפיינס'],
 hotline:['ימות־המשיח האטליין','planned','גבהה־צענטראלער API; עכטע שלוחות נאך נישט געבויט'],
 api:['ספעציעלע API־פארבינדונגען','pilot','אינערליכע MAX־פארבינדונג; קיין פובליק API נאך נישט']
});
const personal=['personal_tasks','private_notes','contacts'];
const quick=[...personal,'campaign_core','goals','tasks','pledges','manual_records','external_link','basic_reports','team','member_progress','system_watch'];
const pro=[...quick,'crm','files','call_lists','csv_import','clarity','automations','guidance'];
const gabbai=[...pro,'finance','ledger','approvals','audit','refunds','auto_sync','priority_oversight','custom_roles'];
const org=[...gabbai,'multi_campaign','departments','shared_crm','portfolio'];
const all=[...org,'hotline','api'];
export const PLAN_DEFINITIONS = Object.freeze([
 {code:'personal-askan',name:'Personal Askan',yi:'פערזענליכע עסקנות',description:'פאר איינעם וואס וויל אנפאנגען אליין; פערזענליכע ארבעט איז דער ציל.',members:1,campaigns:0,goals:0,features:personal},
 {code:'chesed-quick',name:'Chesed Quick',yi:'שנעלער קאמפיין',description:'א קליינער קאמפיין מיט פשוטע מאנשאפט־ארבעט.',members:5,campaigns:1,goals:3,features:quick},
 {code:'askan-pro',name:'Askan Pro',yi:'עסקן פרא',description:'מער קשרים, פארגעשריטענע כלים און קלארקייט.',members:25,campaigns:1,goals:20,features:pro},
 {code:'gabbai-pro',name:'Gabbai Pro',yi:'גבאי פרא',description:'טיפערע פינאנצן, קאנטראלן און איבערבליק.',members:100,campaigns:3,goals:100,features:gabbai},
 {code:'organization',name:'Organization',yi:'גרויסע מאנשאפט',description:'פאר עטליכע קאמפיינס און אפטיילונגען אויף איין פלאץ.',members:500,campaigns:50,goals:500,features:org},
 {code:'custom',name:'Custom',yi:'ספעציעל צוגעפאסט',description:'אייגענע פארבינדונגען, האטליין און ספעציעלע ארבעט — נאר לויטן אפמאך.',members:null,campaigns:null,goals:null,features:all}
]);
export const PLAN_BY_CODE = Object.freeze(Object.fromEntries(PLAN_DEFINITIONS.map(p=>[p.code,p])));
export const statusYi = Object.freeze({working:'געבויט',pilot:'טיילווייז פאראן',planned:'אין פלאן'});
export function publicPlan(plan){
 return {
  ...plan,
  // Legacy target limits MUST NEVER masquerade as enforced or paid quotas.
  limitsStatus:'roadmap_only',
  price:null,
  billingActive:false,
  canSelfActivate:false,
  features:plan.features.map(key=>({key,title:FEATURE_CATALOGUE[key][0],status:FEATURE_CATALOGUE[key][1],note:FEATURE_CATALOGUE[key][2]}))
 };
}
export function publicPlans(){return PLAN_DEFINITIONS.map(publicPlan);}
