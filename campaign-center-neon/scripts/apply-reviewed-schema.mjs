import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

// Safe opt-in Campaign Center schema migration. NEVER auto-run at app startup.
// No migration is executed without an independently checked DB hostname and
// staging or explicit production approval. Every file is inside ONE transaction.
const mode=process.env.CC_MIGRATION_MODE;
const expectedHost=process.env.CC_EXPECTED_DB_HOST;
const conn=process.env.DATABASE_URL;
if(!['staging','production'].includes(mode))throw Error('Set CC_MIGRATION_MODE=staging|production');
if(!conn||!expectedHost)throw Error('DATABASE_URL and CC_EXPECTED_DB_HOST required');
const url=new URL(conn);
if(url.hostname!==expectedHost)throw Error('Refusing wrong Neon database host');
if(mode==='production'){
 if(process.env.CC_PRODUCTION_MIGRATION_APPROVED!=='yes-reviewed-and-backed-up')
  throw Error('Production migration requires separate approval; refusing');
 if(!/^br-[a-z0-9-]{8,}$/.test(process.env.CC_PRODUCTION_BACKUP_BRANCH_ID||''))
  throw Error('Independently verified production backup branch ID required');
}
const sqlNames=[
 '001_core.sql','002_team_connect.sql','003_web_hall.sql',
 '004_conference_center.sql','005_virtual_campaign_floor.sql',
 '006_floor_program_checkins.sql','007_conference_policy_lists.sql',
 '008_opt_in_video.sql','009_experimental_browser_audio.sql',
 '010_automatic_event_schedule.sql','011_sponsored_max_seats.sql'
];
const root=join(dirname(fileURLToPath(import.meta.url)),'..','db');
const client=new pg.Client({connectionString:conn,connectionTimeoutMillis:10000});
try{
 await client.connect();await client.query('BEGIN');
 await client.query("SET LOCAL lock_timeout='8s'");
 await client.query("SET LOCAL statement_timeout='60s'");
 await client.query("SELECT pg_advisory_xact_lock(19735155)");
 const old=(await client.query("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'cc_%'")).rows;
 if(old.length>0){
  // Migration is allowed only on a wholly fresh production schema; a
  // partially migrated DB needs human reconciliation, never blind replay.
  if(old.length!==29||old.some(x=>!x.relrowsecurity))
   throw Error('Partial/unknown Campaign Center schema; manual review required');
  console.log('Already migrated: 29 CC tables, all RLS enabled; no changes');
  await client.query('COMMIT');
  process.exitCode=0;
 }else{
  for(const file of sqlNames){
   const sql=readFileSync(join(root,file),'utf8');
   // Passing whole raw file preserves $$ bodies, unlike semicolon splitting.
   await client.query(sql);
   console.log('Applied '+file);
  }
  const result=(await client.query("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'cc_%'")).rows;
  if(result.length!==29||result.some(x=>!x.relrowsecurity))
   throw Error('Postmigration table/RLS verification failed: '+result.length+' tables');
  await client.query('COMMIT');
  console.log('PASS '+mode+': 29 protected tables created in one transaction, no existing application tables modified.');
 }
}catch(error){
 try{await client.query('ROLLBACK');}catch{}
 console.error('MIGRATION BLOCKED / ROLLED BACK: '+String(error?.message||error));
 process.exitCode=1;
}finally{await client.end().catch(()=>{});}
