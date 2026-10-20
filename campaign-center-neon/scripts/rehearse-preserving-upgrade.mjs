import {readFileSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {spawnSync} from 'node:child_process';

// Simulate the specific production upgrade path: preserve 001–026 records,
// then apply 027–038, on a fresh throwaway LOCAL CI database only.
if(process.env.CC_DISPOSABLE_MIGRATION_REHEARSAL!=='yes-local-ci-only')
 throw Error('Refusing without disposable local-only consent');
const connection=process.env.TEST_DATABASE_URL;
if(!connection)throw Error('Local TEST_DATABASE_URL required');
const url=new URL(connection);
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/campaign_qa')
 throw Error('Refusing to access any non-disposable/remote database');
const database='campaign_upgrade_qa';
const dir=join(dirname(fileURLToPath(import.meta.url)),'..','db');
const candidates=readdirSync(dir).filter(x=>/^\d{3}_.*\.sql$/.test(x));
const files=Array.from({length:38},(_,i)=>{
 const number=String(i+1).padStart(3,'0');
 const matches=candidates.filter(x=>x.startsWith(number+'_'));
 if(number==='007'){
  const chosen='007_conference_policy_lists.sql';
  if(!matches.includes(chosen))throw Error('Missing reviewed 007 SQL');
  return chosen;
 }
 if(matches.length!==1)throw Error('Missing or conflicting migration '+number+': '+matches.join(','));
 return matches[0];
});
const setup=new pg.Client({connectionString:connection});
await setup.connect();
try{
 if((await setup.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount)
  throw Error('Refusing to reuse populated upgrade rehearsal database');
 await setup.query('CREATE DATABASE '+database);
}finally{await setup.end();}
const target=new URL(connection);
target.pathname='/'+database;
const db=new pg.Client({connectionString:target.toString(),connectionTimeoutMillis:10000});
let tx=false;
try{
 await db.connect();
 await db.query('BEGIN');tx=true;
 await db.query("SET LOCAL statement_timeout='90s'");
 for(const name of files.slice(0,26))await db.query(readFileSync(join(dir,name),'utf8'));
 await db.query('COMMIT');tx=false;
 // Seed recognizable OLD records before the upgrade, not after it.
 const org=(await db.query("INSERT INTO cc_organizations(name,owner_subject) VALUES('Existing charity campaign','original-owner') RETURNING id")).rows[0].id;
 await db.query("INSERT INTO cc_memberships(organization_id,subject,role,membership_status,joined_at) VALUES($1,'original-owner','owner','active',now())",[org]);
 const campaign=(await db.query("INSERT INTO cc_campaigns(organization_id,title,status) VALUES($1,'Preserved fundraiser','active') RETURNING id",[org])).rows[0].id;
 // The real proposed operator-run script must be proved on this existing
 // local 026 database. It must refuse without flags and be single-use.
 const command=join(dir,'..','scripts','apply-additive-027-038.mjs');
 const env={...process.env,DATABASE_URL:target.toString(),
  CC_EXPECTED_DB_HOST:target.hostname,CC_MIGRATION_MODE:'staging',
  CC_STAGING_MIGRATION_APPROVED:'yes-reviewed-staging'};
 const check=(extra)=>spawnSync(process.execPath,[command],{
  env:{...env,...extra},encoding:'utf8',timeout:120000});
 const refused=check({CC_APPLY_ADDENDUM:''});
 if(refused.status===0)throw Error('Unsafe addendum runner ran without explicit approval');
 const applied=check({CC_APPLY_ADDENDUM:'yes-apply-reviewed-schema'});
 if(applied.status!==0)throw Error('Addendum runner failed: '+applied.stderr.slice(-2500));
 console.log(applied.stdout.slice(-700));
 // Repeat attempts are blocked because new tables already exist.
 const repeated=check({CC_APPLY_ADDENDUM:'yes-apply-reviewed-schema'});
 if(repeated.status===0)throw Error('Unsafe addendum runner reapplied migration');
 await db.query('BEGIN');tx=true;
 const old=await db.query("SELECT o.name,c.title,m.subject FROM cc_organizations o JOIN cc_campaigns c ON c.organization_id=o.id JOIN cc_memberships m ON m.organization_id=o.id WHERE o.id=$1 AND c.id=$2",[org,campaign]);
 if(old.rows.length!==1||old.rows[0].name!=='Existing charity campaign'||
  old.rows[0].title!=='Preserved fundraiser'||
  old.rows[0].subject!=='original-owner')
   throw Error('Old fundraiser data not preserved across staging migration');
 const newSchema=await db.query("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'cc_%'");
 if(newSchema.rows.some(x=>!x.relrowsecurity))throw Error('Unprotected post-upgrade table');
 if(!newSchema.rows.some(x=>x.relname==='cc_gabbai_handoffs'))
  throw Error('Gabbai Pro 033–034 migration was not installed');
 await db.query('COMMIT');tx=false;
 console.log('PASS: reviewed 001–026 existing data preserved through 027–034; '+newSchema.rows.length+' protected tables');
}catch(err){
 if(tx)await db.query('ROLLBACK').catch(()=>{});
 console.error('LOCAL UPGRADE REHEARSAL FAILED: '+(err.message||err));
 process.exitCode=1;
}finally{await db.end().catch(()=>{});}
