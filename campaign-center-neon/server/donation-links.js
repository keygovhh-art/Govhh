import { Router } from 'express';

// External donor payment URL only. Campaign Center never charges cards here,
// handles settlement, receives money, or marks a receipt processor-verified.
export default function donationLinksRouter({pool,campaignAccess,need,bad,trim,log}){
 const router=Router();
 const handle=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 function validated(raw){
  if(typeof raw!=='string'||raw.length>2048)throw bad(400,'Invalid donation URL');
  if(!raw.trim())return '';
  let target;
  try{target=new URL(raw.trim());}catch{throw bad(400,'Invalid donation URL');}
  if(target.protocol!=='https:'||target.username||target.password||target.hash||
     !target.hostname||target.hostname.length>253||
     /(?:^localhost$|\.localhost$|\.local$|\.invalid$|\.test$)/i.test(target.hostname)||
     /^(?:127\.|10\.|192\.168\.|0\.|169\.254\.)/.test(target.hostname)||
     /^(?:172\.(?:1[6-9]|2\d|3[01])\.)/.test(target.hostname)||
     /^\[?(?:\::1|fc|fd|fe80)/i.test(target.hostname))
    throw bad(400,'Please use a secure public HTTPS donation page');
  return target.toString();
 }
 router.get('/:cid',handle(async(req,res)=>{
  const campaign=await campaignAccess(pool,req.params.cid,req.userId);
  const data=await pool.query('SELECT provider_name,donation_url,updated_at FROM cc_campaign_donation_links WHERE campaign_id=$1 AND organization_id=$2',
    [campaign.id,campaign.organization_id]);
  res.set('Cache-Control','private,no-store');
  res.json({link:data.rows[0]||null,verifiedPayments:false});
 }));
 router.put('/:cid',handle(async(req,res)=>{
  const url=validated(req.body?.url);
  const provider=trim(req.body?.providerName,80);
  if(!provider&&url)throw bad(400,'Enter the donation provider name');
  const db=await pool.connect();
  let result;
  try{
   await db.query('BEGIN');
   const c=await campaignAccess(db,req.params.cid,req.userId);
   need(c.role,['owner','manager']);
   const previous=(await db.query('SELECT donation_url,provider_name FROM cc_campaign_donation_links WHERE organization_id=$1 AND campaign_id=$2 FOR UPDATE',
      [c.organization_id,c.id])).rows[0]||null;
   if(url){
    result=(await db.query('INSERT INTO cc_campaign_donation_links(organization_id,campaign_id,provider_name,donation_url,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(campaign_id) DO UPDATE SET provider_name=excluded.provider_name,donation_url=excluded.donation_url,updated_by=excluded.updated_by,updated_at=now() RETURNING provider_name,donation_url,updated_at',
      [c.organization_id,c.id,provider,url,req.userId])).rows[0];
   }else{
    await db.query('DELETE FROM cc_campaign_donation_links WHERE organization_id=$1 AND campaign_id=$2',[c.organization_id,c.id]);
    result=null;
   }
   await log(db,c.organization_id,c.id,req.userId,url?'donation_link.updated':'donation_link.cleared',c.id,{
     previousHost:previous?.donation_url?new URL(previous.donation_url).hostname:null,
     nextHost:url?new URL(url).hostname:null,
     // Do NOT record full URLs: merchant payment links can contain private tokens.
   });
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  res.json({link:result,verifiedPayments:false});
 }));
 return router;
}
