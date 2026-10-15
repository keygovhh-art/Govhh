import { Router } from 'express';

// Managed batch import, only for campaign owner/manager. No spreadsheet may write
// authority, notes of an existing donor, do-not-call state, or finance records.
export default function contactsImportRouter({pool,authenticate,campaignAccess,need,bad,log}){
 const router=Router();
 router.use(authenticate);
 const numericPhone=x=>String(x??'').replace(/[^0-9]/g,'');
 const maxRows=500;
 const clean=(row,index)=>{
  if(!row||typeof row!=='object'||Array.isArray(row))return {index:index+1,error:'Invalid row'};
  if(typeof row.name!=='string'||typeof row.phone!=='string'||(row.notes!==undefined&&typeof row.notes!=='string'))
    return {index:index+1,error:'Name and phone must be strings'};
  const name=row.name.trim(),phone=row.phone.trim(),notes=(row.notes||'').trim();
  const digits=numericPhone(phone);
  if(name.length<2||name.length>160||phone.length>40||digits.length<7||digits.length>15||notes.length>2000)
    return {index:index+1,error:'Invalid name, phone or note length'};
  return {index:index+1,name,phone,notes,digits};
 };
 const handler=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 router.post('/campaigns/:cid/contacts/import',handler(async(req,res)=>{
  if(!Array.isArray(req.body?.rows)||!req.body.rows.length||req.body.rows.length>maxRows||
    typeof req.body?.dryRun!=='boolean')throw bad(400,'CSV import requires 1–500 rows and dryRun flag');
  const prepared=req.body.rows.map(clean);
  const invalid=prepared.filter(x=>x.error);
  if(invalid.length)return res.status(422).json({error:'Invalid CSV rows',invalid:invalid.slice(0,30),totalInvalid:invalid.length});
  // Input duplicate phone numbers are skipped in preview and commit, first wins.
  const distinct=[],seen=new Set(),inFile=[];
  for(const row of prepared){
   if(seen.has(row.digits)){inFile.push(row.index);continue;}
   seen.add(row.digits);distinct.push(row);
  }
  const work=async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);
   need(c.role,['owner','manager']);
   if(c.status==='closed')throw bad(409,'Closed campaign cannot accept imports');
   // A per-campaign advisory lock makes concurrent imports serialize. The unique
   // index on shared normalized phone is the final race-resistant safeguard.
   if(!req.body.dryRun)await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[c.id]);
   const found=await db.query("SELECT DISTINCT regexp_replace(phone,'[^0-9]','','g') AS digits FROM cc_contacts WHERE campaign_id=$1 AND privacy='campaign' AND regexp_replace(phone,'[^0-9]','','g') = ANY($2::text[])",[c.id,distinct.map(x=>x.digits)]);
   const existing=new Set(found.rows.map(x=>x.digits));
   const eligible=distinct.filter(x=>!existing.has(x.digits));
   if(req.body.dryRun)return {
    dryRun:true,received:prepared.length,importable:eligible.length,duplicates:inFile.length+distinct.length-eligible.length,
    alreadyInCampaign:distinct.length-eligible.length,inFileDuplicates:inFile.length,
    preview:eligible.slice(0,12).map(x=>({name:x.name,phone:x.phone}))
   };
   let created=0;
   for(const row of eligible){
    const inserted=await db.query("INSERT INTO cc_contacts(organization_id,campaign_id,created_by,display_name,phone,notes,privacy,assigned_team) VALUES ($1,$2,$3,$4,$5,$6,'campaign','') ON CONFLICT DO NOTHING RETURNING id",
     [c.organization_id,c.id,req.userId,row.name,row.phone,row.notes]);
    created+=inserted.rowCount||0;
   }
   await log(db,c.organization_id,c.id,req.userId,'contacts.csv_import',null,
    {received:prepared.length,created,duplicates:prepared.length-created,source:'manager_uploaded_csv'});
   return {dryRun:false,received:prepared.length,created,duplicates:prepared.length-created};
  };
  if(req.body.dryRun)return res.json(await work(pool));
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const result=await work(db);
   await db.query('COMMIT');
   res.status(201).json(result);
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }));
 return router;
}
