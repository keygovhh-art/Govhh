import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMPAIGN_PLANS,PLAN_FEATURES,GUIDED_MANAGED_ADDONS} from '../src/plan-catalog.js';

test('Campaign Center has precisely six operationally separate plans beginning with Chesed Quick',()=>{
 assert.deepEqual(CAMPAIGN_PLANS.map(p=>p.code),[
  'chesed_quick','askan_plus','askan_pro','gabbai_pro','organization','custom'
 ]);
 assert.equal(CAMPAIGN_PLANS.length,6);
 assert.equal(PLAN_FEATURES.length,72,'Do not lose an agreed 2026-10-16 feature');
 assert.equal(new Set(PLAN_FEATURES.map(f=>f.code)).size,72,'Feature IDs must be unique');
 for(const f of PLAN_FEATURES)assert.ok(['pilot','partial','missing'].includes(f.status));
 for(let i=1;i<CAMPAIGN_PLANS.length;i++){
  const inherited=new Set(CAMPAIGN_PLANS[i].features);
  for(const code of CAMPAIGN_PLANS[i-1].features)
   assert.ok(inherited.has(code),'Higher tier dropped '+code);
 }
 for(const item of PLAN_FEATURES){
  if(item.minTier===null){
   assert.equal(item.allocation,'needs-tier-decision','Do not silently grant shared event features');
   for(const plan of CAMPAIGN_PLANS)assert.ok(!plan.features.includes(item.code));
  }else{
   for(let i=0;i<CAMPAIGN_PLANS.length;i++)
    assert.equal(CAMPAIGN_PLANS[i].features.includes(item.code),i>=item.minTier);
  }
 }
 assert.equal(PLAN_FEATURES.filter(x=>x.minTier===null).length,8);
 assert.deepEqual(CAMPAIGN_PLANS.map(p=>p.members),[5,null,25,100,500,null]);
 assert.deepEqual(CAMPAIGN_PLANS.map(p=>p.goals),[3,null,20,100,500,null]);
 assert.deepEqual(CAMPAIGN_PLANS.map(p=>p.campaigns),[1,null,1,3,50,null]);
 assert.ok(CAMPAIGN_PLANS[1].features.includes('teams_captains'));
 assert.ok(!CAMPAIGN_PLANS[0].features.includes('teams_captains'));
 assert.ok(!CAMPAIGN_PLANS[1].features.includes('clarity'));
 assert.ok(CAMPAIGN_PLANS[2].features.includes('clarity'));
 assert.ok(!PLAN_FEATURES.some(x=>/personal_tasks|private_notes|brain_dump|personal_workspace/.test(x.code)));
 assert.deepEqual(GUIDED_MANAGED_ADDONS,['Guided Campaign','Managed Campaign']);
});
