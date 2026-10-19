import {readFileSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

// This is exclusively a throwaway GitHub Actions / local PostgreSQL rehearsal.
// It deliberately cannot connect to Neon, Render, or production.
// It does NOT replace the separately approved production migration process.
const ORDER=[
 "001_core.sql",
 "002_team_connect.sql",
 "003_web_hall.sql",
 "004_conference_center.sql",
 "005_virtual_campaign_floor.sql",
 "006_floor_program_checkins.sql",
 "007_conference_policy_lists.sql",
 "008_opt_in_video.sql",
 "009_experimental_browser_audio.sql",
 "010_automatic_event_schedule.sql",
 "011_sponsored_max_seats.sql",
 "012_yemot_encrypted_connections.sql",
 "013_campaign_goals.sql",
 "014_campaign_external_donation_link.sql",
 "015_donation_levels.sql",
 "016_partial_pledge_receipts.sql",
 "017_askan_pro_crm.sql",
 "018_askan_pro_focus_sprints.sql",
 "019_askan_pro_guidance.sql",
 "020_askan_pro_task_blockers.sql",
 "021_gabbai_pro_finance_approvals.sql",
 "022_organization_leadership_decisions.sql",
 "023_organization_resource_allocation.sql",
 "024_organization_memory.sql",
 "025_custom_focus_rules.sql",
 "026_server_plan_entitlements.sql",
 "027_quick_daily_watch_memory.sql",
 "028_plus_alert_acknowledgements.sql",
 "029_pro_campaign_files.sql",
 "030_pro_followup_automation.sql",
 "031_pro_next_action_workflow.sql",
 "032_guidance_work_ownership.sql",
 "033_gabbai_operations_handoffs.sql",
 "034_gabbai_blocker_status.sql",
 "035_organization_management_progress.sql"
];
const marker='CC_DISPOSABLE_MIGRATION_REHEARSAL';
if(process.env[marker]!=='yes-local-ci-only')throw Error('Only an explicitly authorized disposable local rehearsal is allowed');
if(!process.env.TEST_DATABASE_URL)throw Error('TEST_DATABASE_URL required (local disposable Postgres only)');
const url=new URL(process.env.TEST_DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(url.hostname)||
  url.pathname!=='/campaign_qa'||!['postgresql:','postgres:'].includes(url.protocol))
 throw Error('Refusing non-local or non-campaign_qa database');
const dbname='campaign_migration_qa';
const dir=join(dirname(fileURLToPath(import.meta.url)),'..','db');
const actual=readdirSync(dir).filter(name=>/^\d{3}_.+\.sql$/.test(name));
for(const name of ORDER)if(!actual.includes(name))throw Error('Missing migration: '+name);
for(let i=0;i<ORDER.length;i++){
 if(!ORDER[i].startsWith(String(i+1).padStart(3,'0')+'_'))
  throw Error('Migration gap or number mismatch: '+ORDER[i]);
}
const skipped=actual.filter(x=>!ORDER.includes(x));
if(skipped.length)console.log('Intentionally excluded alternative/legacy SQL files: '+skipped.join(', '));
if(skipped.some(x=>!x.startsWith('007_')))throw Error('Unexpected alternative migration; update reviewed manifest');
const setup=new pg.Client({connectionString:process.env.TEST_DATABASE_URL,connectionTimeoutMillis:10000});
await setup.connect();
try{
 const existing=await setup.query('SELECT 1 FROM pg_database WHERE datname=$1',[dbname]);
 if(existing.rowCount)throw Error('Refusing to reuse existing rehearsal database');
 await setup.query('CREATE DATABASE '+dbname);
}finally{await setup.end();}
const clean=new URL(process.env.TEST_DATABASE_URL);
clean.pathname='/'+dbname;
const db=new pg.Client({connectionString:clean.toString(),connectionTimeoutMillis:10000});
let transaction=false;
try{
 await db.connect();
 const current=await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'cc_%' AND c.relkind IN ('r','p')");
 if(current.rows[0].n!==0)throw Error('Refusing to rehearse over an existing CC schema');
 await db.query('BEGIN');transaction=true;
 await db.query("SET LOCAL lock_timeout='8s'");
 await db.query("SET LOCAL statement_timeout='90s'");
 for(const name of ORDER){
  await db.query(readFileSync(join(dir,name),'utf8'));
  console.log('PASS '+name);
 }
 const tables=await db.query("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'cc_%'");
 const noRls=tables.rows.filter(r=>!r.relrowsecurity).map(r=>r.relname);
 if(noRls.length)throw Error('RLS not enabled: '+noRls.join(','));
 const essential=['cc_gabbai_handoffs','cc_gabbai_handoff_events','cc_plan_entitlements',
  'cc_pro_guidance_requests','cc_pro_campaign_files','cc_organizations',
  'cc_management_plan_items','cc_management_plan_history'];
 for(const table of essential)if(!tables.rows.some(r=>r.relname===table))throw Error('Missing late-stage table '+table);
 const blocked=await db.query("SELECT pg_get_constraintdef(oid) AS sql FROM pg_constraint WHERE conrelid='public.cc_gabbai_handoffs'::regclass AND conname='cc_gabbai_handoffs_status_check'");
 if(!blocked.rows[0]?.sql?.includes('blocked'))throw Error('034 blocker constraint not active');
 const conflict=actual.filter(name=>name.startsWith('033_'));
 if(conflict.length!==1||conflict[0]!=='033_gabbai_operations_handoffs.sql')
  throw Error('Multiple incompatible 033 handoff SQL files in reviewed manifest');
 await db.query('COMMIT');transaction=false;
 console.log('SUCCESS: '+ORDER.length+' sequential migrations, '+tables.rows.length+' RLS tables; disposable rehearsal ONLY');
}catch(error){
 if(transaction)await db.query('ROLLBACK').catch(()=>{});
 console.error('FULL SCHEMA REHEARSAL FAILED: '+String(error?.message||error));
 process.exitCode=1;
}finally{await db.end().catch(()=>{});}
