import pg from 'pg';
import {assessReleaseSchema} from './release-schema-contract.mjs';

// Read-only preflight. Never writes or migrates a user database.
// Run explicitly with DATABASE_URL, NEON_AUTH_BASE_URL and
// NEON_AUTH_JWKS_URL already securely configured on the deployment machine.
// CC_EXPECTED_DB_HOST is mandatory and must match the reviewed Neon branch.
const fail=message=>{console.error('RELEASE BLOCKED: '+message);process.exitCode=1;};
const expected=process.env.CC_EXPECTED_DB_HOST;
const connection=process.env.DATABASE_URL;
if(!connection||!expected){fail('DATABASE_URL and independently verified CC_EXPECTED_DB_HOST are required');process.exit();}
let u;
try{u=new URL(connection);}catch{fail('Invalid database connection URL');process.exit();}
if(u.hostname!==expected){fail('Unexpected database host; wrong Neon branch');process.exit();}
for(const key of ['NEON_AUTH_BASE_URL','NEON_AUTH_JWKS_URL']){
 if(!process.env[key]){fail('Missing '+key);process.exit();}
}
const auth=new URL(process.env.NEON_AUTH_BASE_URL),jwks=new URL(process.env.NEON_AUTH_JWKS_URL);
if(auth.protocol!=='https:'||jwks.protocol!=='https:'||auth.origin!==jwks.origin){
 fail('Neon Auth and JWKS hosts must agree over HTTPS');process.exit();
}
if(process.env.CC_REQUIRE_CONNECT==='true'&&
 (process.env.GAVHAH_CONNECT_SHARED_SECRET||'').length<32){
 fail('Missing 32+ character cross-service secret');process.exit();
}
const requiredTables=[
 'cc_organizations','cc_memberships','cc_campaigns','cc_campaign_members',
 'cc_contacts','cc_assignments','cc_call_events','cc_finance_events',
 'cc_activity_events','cc_live_rooms','cc_live_room_participation',
 'cc_conference_rooms','cc_conference_participants','cc_conference_messages',
 'cc_conference_access_rules','cc_conference_video_grants','cc_floor_video_grants',
 'cc_floor_checkins','cc_floor_programs','cc_floor_help_requests',
 'cc_floor_help_messages','cc_sponsored_max_seats','cc_yemot_connections','cc_conference_rtc_peers','cc_conference_rtc_signals'
];
const db=new pg.Client({connectionString:connection,connectionTimeoutMillis:10000});
try{
 await db.connect();
 await db.query("SET default_transaction_read_only=on");
 const result=await db.query("SELECT c.relname AS name,c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'cc_%'");
 const all=new Map(result.rows.map(row=>[row.name,row]));
 const missing=requiredTables.filter(x=>!all.has(x));
 const noRls=result.rows.filter(x=>!x.rls).map(x=>x.name);
 if(missing.length)fail('Missing Campaign Center tables: '+missing.join(','));
 if(noRls.length)fail('RLS missing on: '+noRls.join(','));
 const cols=await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",
 ['cc_conference_rooms','cc_live_rooms','cc_call_events','cc_floor_programs',
  'cc_pro_guidance_requests','cc_gabbai_handoffs','cc_gabbai_handoff_events']);
 const byTable=new Map();
 for(const row of cols.rows){if(!byTable.has(row.table_name))byTable.set(row.table_name,new Set());byTable.get(row.table_name).add(row.column_name);}
 const needed={
  cc_conference_rooms:['media_url','video_url','video_enabled','video_access_mode'],
  cc_live_rooms:['floor_mode','video_url','video_enabled','video_access_mode'],
  cc_call_events:['client_attempt_id'],
  cc_floor_programs:['scheduled_start','scheduled_end','status','auto_start']
 };
 for(const [table,fields] of Object.entries(needed)){
  for(const field of fields)if(!byTable.get(table)?.has(field))fail('Missing required '+table+'.'+field);
 }
 // Stage 027–034 must be installed before starting the new API build.
 // Catalog inspection only; no write privileges are used for this check.
 const checks=await db.query(
  "SELECT t.relname AS table_name,k.conname,pg_get_constraintdef(k.oid) AS definition"+
  " FROM pg_constraint k JOIN pg_class t ON t.oid=k.conrelid"+
  " JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'"+
  " AND t.relname=ANY($1::text[]) AND k.contype='c'",
  [['cc_gabbai_handoffs','cc_gabbai_handoff_events']]);
 const release=assessReleaseSchema({
  tables:result.rows,columns:cols.rows,constraints:checks.rows
 });
 for(const error of release.errors)fail(error);
 if(!release.ready)fail('Release 027–034 schema incomplete; DO NOT deploy newer API code');
 const latest=await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'cc_%'");
 console.log('Read-only preflight: '+latest.rows[0].n+' Campaign Center tables inspected, '+requiredTables.length+' required tables cross-checked');
 if(!process.exitCode)console.log('PASS: schema, RLS, auth origin and database host ready for a separate authenticated release smoke test.');
}catch(err){fail('Schema preflight failed: '+(err.code||err.message||'database unavailable'));}
finally{await db.end().catch(()=>{});}
