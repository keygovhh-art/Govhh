import { Router } from 'express';

// Strongly scoped, transaction-audited campaign lifecycle controls.
export default function campaignAdminRouter({pool,authenticate,campaignAccess,need,bad,log,trim}) {
 const router=Router();
 router.use(authenticate);
 async function transaction(work){
   const db=await pool.connect();
   try{await db.query('BEGIN');const row=await work(db);await db.query('COMMIT');return row;}
   catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 // Campaign administration is a manager action. Closed campaigns remain in history;
// no DELETE and no silent loss of pledge/receipt/audit records.
router.patch('/:cid',async(req,res,next)=>{
 try {
  const changes=req.body??{};
  const hasGoal=Object.hasOwn(changes,'goalAmount');
  const hasStatus=Object.hasOwn(changes,'status');
  if(!hasGoal&&!hasStatus)throw bad(400,'No campaign change supplied');
  const nextGoal=hasGoal?String(changes.goalAmount):null;
  if(hasGoal&&(!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(nextGoal)||Number(nextGoal)>1000000000000))
   throw bad(400,'Invalid goal amount');
  const nextStatus=hasStatus?trim(changes.status,16):null;
  if(hasStatus&&!['draft','active','paused','closed'].includes(nextStatus))
   throw bad(400,'Invalid campaign status');
  const campaign=await transaction(async db=>{
   const c=await campaignAccess(db,req.params.cid,req.userId);
   need(c.role,['owner','manager']);
   const original=(await db.query('SELECT * FROM cc_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[c.id,c.organization_id])).rows[0];
   if(!original)throw bad(404,'Campaign not found');
   const row=(await db.query('UPDATE cc_campaigns SET goal_amount=COALESCE($1,goal_amount),status=COALESCE($2,status) WHERE id=$3 AND organization_id=$4 RETURNING id,title,goal_amount,status',
     [nextGoal,nextStatus,c.id,c.organization_id])).rows[0];
   await log(db,c.organization_id,c.id,req.userId,'campaign.settings_changed',c.id,
     {previous:{goalAmount:original.goal_amount,status:original.status},next:{goalAmount:row.goal_amount,status:row.status}});
   return row;
  });
  res.json(campaign);
 }catch(error){next(error);}
});

 return router;
}
