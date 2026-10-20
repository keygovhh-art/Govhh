import test from 'node:test';
import assert from 'node:assert/strict';
import {plansView} from '../src/plan-view.js';
const starter={planTierIndex:5,entitlements:{
 plan:{planCode:'custom',planName:'Custom',source:'trusted_operator_grant',
  tierIndex:5,limits:{members:2,goals:1,campaigns:1},validUntil:null},
 usableFeatures:[]
},capacityAudit:{
 planCode:'custom',customCapacityGranted:true,
 breakdown:{members:{used:3,limit:2,remaining:0,overLimit:true},
  campaigns:{used:2,limit:1,remaining:0,overLimit:true},
  goalsPerCampaign:{limit:1,totalAcrossCampaigns:3,campaignsOverLimit:1}},
 contractVerified:false,billingVerified:false
}};
test('Custom plan shows real cross-campaign usage, shortage, and verified-limits disclaimer',()=>{
 const html=plansView(starter);
 assert.match(html,/אמתע נומערן/);
 assert.match(html,/אקטיווע עסקנים/);
 assert.match(html,/3 \/ 2/);
 assert.match(html,/2 \/ 1/);
 assert.match(html,/קאמפיינס איבער זייער ציל־גרעניץ: 1/);
 assert.match(html,/איבער דער גרעניץ/);
 assert.match(html,/נישט קיין באשטעטיגטע באצאלונג/);
 assert.match(html,/אינהאלט|קאפאציטעט|צילן/);
});
test('Absent or failed backend capacity never appears as verified',()=>{
 let html=plansView({planTierIndex:0,entitlements:null,entitlementError:'not verified'});
 assert.doesNotMatch(html,/קאפאציטעט — אמתע נומערן/);
 assert.match(html,/נישט באשטעטיגט|not verified/);
 html=plansView({planTierIndex:0,entitlements:null,entitlementError:'error',
  capacityError:'<img src=x onerror=alert(1)>'});
 assert.doesNotMatch(html,/<img/);
 assert.match(html,/&lt;img/);
});
