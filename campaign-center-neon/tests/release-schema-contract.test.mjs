import test from 'node:test';
import assert from 'node:assert/strict';
import {assessReleaseSchema,REQUIRED_RELEASE_TABLES,REQUIRED_RELEASE_COLUMNS}
 from '../scripts/release-schema-contract.mjs';
const tables=()=>REQUIRED_RELEASE_TABLES.map(name=>({name,rls:true}));
const columns=()=>Object.entries(REQUIRED_RELEASE_COLUMNS).flatMap(([table_name,fields])=>
 fields.map(column_name=>({table_name,column_name})));
const constraints=()=>[
 {table_name:'cc_gabbai_handoffs',conname:'cc_gabbai_handoffs_status_check',
  definition:"CHECK(status IN ('open','in_progress','blocked','done'))"},
 {table_name:'cc_gabbai_handoff_events',conname:'cc_gabbai_handoff_events_status_to_check',
  definition:"CHECK(status_to IN ('open','in_progress','blocked','done'))"}
];
test('all new staged release requirements present means a preflight may proceed',()=>{
 assert.deepEqual(assessReleaseSchema({tables:tables(),columns:columns(),
  constraints:constraints()}),{ready:true,errors:[]});
});
test('refuses release on missing 027-034 tables, wrong permissions and 032 fields',()=>{
 const t=tables().filter(x=>x.name!=='cc_pro_campaign_files');
 t.find(x=>x.name==='cc_quick_daily_reviews').rls=false;
 const c=columns().filter(x=>x.column_name!=='response_due_at');
 const result=assessReleaseSchema({tables:t,columns:c,constraints:constraints()});
 assert.equal(result.ready,false);
 assert.match(result.errors.join('|'),/cc_pro_campaign_files/);
 assert.match(result.errors.join('|'),/RLS disabled.*cc_quick_daily_reviews/);
 assert.match(result.errors.join('|'),/cc_pro_guidance_requests.response_due_at/);
});
test('refuses old 033 handoff status even with a correctly named constraint',()=>{
 const k=constraints();
 k[0].definition="CHECK(status IN ('open','in_progress','done'))";
 let result=assessReleaseSchema({tables:tables(),columns:columns(),constraints:k});
 assert.equal(result.ready,false);
 assert.match(result.errors.join('|'),/cc_gabbai_handoffs_status_check/);
 k[0].definition="CHECK(status IN ('open','blocked','done'))";
 k.pop();
 result=assessReleaseSchema({tables:tables(),columns:columns(),constraints:k});
 assert.equal(result.ready,false);
 assert.match(result.errors.join('|'),/cc_gabbai_handoff_events_status_to_check/);
});
test('rejects unprotected unrelated Campaign Center table too',()=>{
 const result=assessReleaseSchema({tables:[...tables(),{name:'cc_extra_finance',rls:false}],
  columns:columns(),constraints:constraints()});
 assert.equal(result.ready,false);
 assert.match(result.errors.join('|'),/cc_extra_finance/);
});
