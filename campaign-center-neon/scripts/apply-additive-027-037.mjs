import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

// Explicit operator-run upgrade ONLY. Never run this during server startup,
// npm build, or automatic Render deploy. Default behavior is REFUSE.
// Never supply external donor details in logs.
const files=[
 '027_quick_daily_watch_memory.sql',
 '028_plus_alert_acknowledgements.sql',
 '029_pro_campaign_files.sql',
 '030_pro_followup_automation.sql',
 '031_pro_next_action_workflow.sql',
 '032_guidance_work_ownership.sql',
 '033_gabbai_operations_handoffs.sql',
 '034_gabbai_blocker_status.sql',
 '035_organization_management_progress.sql',
 '036_custom_manual_workflows.sql',
 '037_custom_team_role_restrictions.sql'
];
function refuse(message){throw Error('NO DATABASE CHANGES: '+message);}
const mode=process.env.CC_MIGRATION_MODE;
const conn=process.env.DATABASE_URL;
const expected=process.env.CC_EXPECTED_DB_HOST;
if(!['staging','production'].includes(mode)||!conn||!expected)
 refuse('Mode, DATABASE_URL and independently verified host required');
const url=new URL(conn);
if(url.hostname!==expected)refuse('Unexpected database host');
if(process.env.CC_APPLY_ADDENDUM!=='yes-apply-reviewed-schema')
 refuse('Explicit one-time operator apply flag required');
if(mode==='staging'){
 if(process.env.CC_STAGING_MIGRATION_APPROVED!=='yes-reviewed-staging')
  refuse('Staging review permission missing');
 const local=['localhost','127.0.0.1'].includes(url.hostname)&&
   url.pathname==='/campaign_upgrade_qa';
 if(!local){
  const id=process.env.CC_STAGING_BRANCH_ID||'';
  const prodHost=process.env.CC_PRODUCTION_DB_HOST||'';
  if(!/^br-[a-z0-9-]{8,}$/.test(id)||!prodHost||
      prodHost===url.hostname)
   refuse('Staging branch ID and distinct production host must be independently verified');
 }
}else{
 if(process.env.CC_PRODUCTION_MIGRATION_APPROVED!=='yes-reviewed-and-backed-up')
  refuse('Separate production change approval required');
 if(!/^br-[a-z0-9-]{8,}$/.test(process.env.CC_PRODUCTION_BACKUP_BRANCH_ID||''))
  refuse('Independently verified new backup branch required');
 if(process.env.CC_PRODUCTION_RESTORATION_CHECK!=='verified')
  refuse('A tested restoration and rollback plan required');
}
const db=new pg.Client({connectionString:conn,connectionTimeoutMillis:10000});
const base=join(dirname(fileURLToPath(import.meta.url)),'..','db');
let begun=false;
try{
 await db.connect();
 await db.query('BEGIN');begun=true;
 await db.query("SET LOCAL lock_timeout='8s'");
 await db.query("SET LOCAL statement_timeout='90s'");
 await db.query('SELECT pg_advisory_xact_lock($1)',[19735155]);
 const checked=await db.query(
  "SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace"+
  " WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'cc_%'");
 const names=new Set(checked.rows.map(r=>r.relname));
 const foundations=['cc_organizations','cc_memberships','cc_campaigns','cc_campaign_members',
  'cc_pro_guidance_requests','cc_plan_entitlements','cc_gabbai_approval_requests'];
 for(const table of foundations)if(!names.has(table))
  refuse('Baseline 001-026 incomplete: '+table);
 if(checked.rows.some(r=>!r.relrowsecurity))
  refuse('Existing Campaign Center table without RLS; investigate first');
 const created=[
  'cc_quick_daily_reviews','cc_plus_alert_acknowledgements','cc_pro_campaign_files',
  'cc_pro_automation_rules','cc_pro_automation_task_links','cc_pro_automation_runs',
  'cc_pro_next_action_choices','cc_pro_next_action_history',
  'cc_gabbai_handoffs','cc_gabbai_handoff_events',
  'cc_management_plan_items','cc_management_plan_history',
  'cc_custom_workflow_templates','cc_custom_workflow_runs','cc_custom_workflow_events',
  'cc_custom_team_permission_profiles','cc_custom_team_permission_bindings','cc_custom_team_permission_events'
 ];
 for(const table of created)if(names.has(table))
  refuse('Partial or already applied upgrade; manually reconcile: '+table);
 const fields=await db.query(
  "SELECT column_name FROM information_schema.columns WHERE table_schema='public'"+
  " AND table_name='cc_pro_guidance_requests' AND column_name=ANY($1::text[])",
  [['assigned_to','response_due_at','triaged_at']]);
 if(fields.rowCount)refuse('Partially applied 032 Guidance ownership columns detected');
 // Measure only existing records to ensure this release does not erase them.
 const before=await db.query(
  "SELECT (SELECT COUNT(*)::bigint FROM cc_organizations) orgs,"+
  " (SELECT COUNT(*)::bigint FROM cc_memberships) members,"+
  " (SELECT COUNT(*)::bigint FROM cc_campaigns) campaigns");
 for(const name of files){
  await db.query(readFileSync(join(base,name),'utf8'));
  console.log('Applied staged '+name);
 }
 const after=await db.query(
  "SELECT (SELECT COUNT(*)::bigint FROM cc_organizations) orgs,"+
  " (SELECT COUNT(*)::bigint FROM cc_memberships) members,"+
  " (SELECT COUNT(*)::bigint FROM cc_campaigns) campaigns");
 for(const k of ['orgs','members','campaigns'])
  if(before.rows[0][k]!==after.rows[0][k])refuse('Historical row-count changed: '+k);
 const rows=await db.query(
  "SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace"+
  " WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])",[created]);
 for(const table of created)
  if(!rows.rows.some(r=>r.relname===table&&r.relrowsecurity))
   refuse('New table missing or RLS disabled: '+table);
 const checks=await db.query(
  "SELECT pg_get_constraintdef(oid) AS body FROM pg_constraint"+
  " WHERE conrelid='public.cc_gabbai_handoffs'::regclass"+
  " AND conname='cc_gabbai_handoffs_status_check'");
 if(!checks.rows[0]?.body?.includes('blocked'))
  refuse('New blocked handoff state not enabled');
 await db.query('COMMIT');begun=false;
 console.log('PASS: existing Campaign Center records preserved; additive 027–037 installed on '+mode);
}catch(error){
 if(begun)await db.query('ROLLBACK').catch(()=>{});
 console.error('MIGRATION STOPPED / ROLLED BACK: '+String(error?.message||error));
 process.exitCode=1;
}finally{await db.end().catch(()=>{});}
